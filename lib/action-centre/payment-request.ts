/**
 * Payment Request Service (INBOX UX-4.1B — Client Action Centre).
 *
 * The ONE server-side orchestrator for staff-initiated payment requests
 * from an Inbox conversation. It REUSES the existing payment stack:
 *   - identity:   resolveClientActionContext (UX-4.1A) — HARD INVARIANT:
 *                 commercial mutations require resolution VERIFIED or
 *                 LINKED. HEURISTIC/UNRESOLVED never authorize anything,
 *                 and heuristicCandidates are NEVER read here.
 *   - providers:  the same provider calls the admin payment-links routes
 *                 make (Stripe payment links; Flutterwave /v3/payments;
 *                 Paystack dedicated NUBAN), with the same fee handling
 *                 (lib/payment-fees) and currency gating (lib/payments/
 *                 processors account-level allowlists).
 *   - persistence: the existing "PaymentLink" model (+ UX-4.1B columns).
 *   - confirmation: NOTHING here ever writes status 'paid'. Settlement
 *                 honesty (security review M1): the Paystack webhook
 *                 settles VA transfers by exact minor-unit match, and the
 *                 Flutterwave webhook settles BANK-TRANSFER payments by
 *                 tx_ref. Flutterwave CARD payments and Stripe payment
 *                 links have NO automatic PaymentLink settlement today —
 *                 those rows stay 'pending' until staff use the existing
 *                 admin mark-paid/verify flow. A browser redirect is
 *                 never proof of anything.
 *
 * Idempotency: the caller supplies a client-generated idempotencyKey
 * (one per form-open, reused across retries). txRef is derived
 * deterministically from it, so a double-click / network retry finds the
 * existing row via the txRef unique constraint and returns it instead of
 * minting a second provider link.
 */

import { createHash } from 'crypto'
import Stripe from 'stripe'
import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { calculateFee, formatFeeLabel } from '@/lib/payment-fees'
import { isCurrencySupported } from '@/lib/payments/processors'
import { getFLWKey } from '@/lib/flutterwave-banks'

// ── Taxonomies (client-safe module shared with the UI) ──────────────────────

import {
  PAYMENT_PURPOSES, PURPOSE_LABELS,
  ACTION_CENTRE_PROVIDERS, type ActionCentreProvider, type PaymentPurpose,
  isValidAmountMajor,
} from '@/lib/action-centre/constants'

export { PAYMENT_PURPOSES, PURPOSE_LABELS, ACTION_CENTRE_PROVIDERS, isValidAmountMajor }
export type { ActionCentreProvider, PaymentPurpose }

/** processors.ts method key per provider (account-level currency gates). */
const PROVIDER_METHOD: Record<ActionCentreProvider, string> = {
  stripe: 'STRIPE', flutterwave: 'FLUTTERWAVE', paystack_va: 'PAYSTACK',
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface PaymentRequestDTO {
  id: string
  txRef: string
  provider: string
  amount: number            // total the client pays (fee-inclusive where applicable)
  baseAmount: number | null
  currency: string
  purpose: string | null
  description: string | null
  status: string
  paymentUrl: string | null
  accountNumber: string | null
  bankName: string | null
  feeLabel: string | null
  createdAt: string
}

export type CreatePaymentRequestResult =
  | { ok: true; request: PaymentRequestDTO; deduplicated: boolean }
  | { ok: false; code:
      | 'CLIENT_IDENTITY_REQUIRED' | 'CLIENT_CONTEXT_MISMATCH'
      | 'INVALID_AMOUNT' | 'UNSUPPORTED_CURRENCY' | 'UNSUPPORTED_PROVIDER'
      | 'INVALID_PURPOSE' | 'MISSING_CLIENT_CONTACT' | 'DUPLICATE_PENDING'
      | 'IDEMPOTENCY_CONFLICT'
      | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_NOT_CONFIGURED' | 'PERSIST_FAILED'
      error: string
      /** For DUPLICATE_PENDING: the existing request staff can reuse. */
      existing?: PaymentRequestDTO }

export interface CreatePaymentRequestInput {
  session: AdminSession
  conversationId: number
  amountMajor: number
  currency: string
  purpose: string
  provider: string
  description?: string | null
  /** Must equal the server-resolved linked application — never trusted alone. */
  relatedApplicationId?: string | null
  internalNote?: string | null
  idempotencyKey: string
  /** Explicit staff override for the duplicate-pending guard. */
  allowDuplicate?: boolean
  /** Stripe fee class, mirroring the existing admin route. */
  stripeCardType?: 'eu' | 'non_eu'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic txRef from the idempotency key — retries converge on one row. */
export function txRefFromIdempotencyKey(key: string): string {
  const h = createHash('sha256').update(`walz-action-centre:${key}`).digest('hex')
  return `WACR-${h.slice(0, 20).toUpperCase()}`
}

function maskEmail(e: string | null | undefined): string {
  if (!e) return '(none)'
  const [u, d] = e.split('@')
  return `${(u ?? '').slice(0, 2)}***@${d ?? '***'}`
}

function toDTO(row: {
  id: string; txRef: string; provider: string | null; type: string
  amount: unknown; currency: string; purpose: string | null
  description: string | null; status: string; paymentUrl: string | null
  accountNumber: string | null; bankName: string | null; createdAt: Date
}, extras?: { baseAmount?: number | null; feeLabel?: string | null }): PaymentRequestDTO {
  return {
    id: row.id, txRef: row.txRef,
    provider: row.provider ?? row.type,
    amount: Number(row.amount ?? 0),
    baseAmount: extras?.baseAmount ?? null,
    currency: row.currency,
    purpose: row.purpose, description: row.description,
    status: row.status,
    paymentUrl: row.paymentUrl,
    accountNumber: row.accountNumber, bankName: row.bankName,
    feeLabel: extras?.feeLabel ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<CreatePaymentRequestResult> {
  const {
    session, conversationId, currency: rawCurrency, purpose, provider,
    description, relatedApplicationId, idempotencyKey,
  } = input
  const currency = String(rawCurrency ?? '').toUpperCase()

  // (1) HARD IDENTITY INVARIANT — server-resolved identity only.
  //     VERIFIED or LINKED authorize; HEURISTIC and UNRESOLVED never do,
  //     and heuristic candidates are never consulted for anything.
  const resolved = await resolveClientActionContext(conversationId, session)
  if (!resolved.ok) {
    return { ok: false, code: 'CLIENT_IDENTITY_REQUIRED', error: resolved.error }
  }
  const ctx = resolved.context
  if (ctx.resolution !== 'VERIFIED' && ctx.resolution !== 'LINKED') {
    return {
      ok: false, code: 'CLIENT_IDENTITY_REQUIRED',
      error: 'Verify the client identity before requesting a payment.',
    }
  }

  // (2) Related-record binding: the browser may only CONFIRM the
  //     server-resolved application, never choose one.
  if (relatedApplicationId && relatedApplicationId !== ctx.application?.id) {
    return {
      ok: false, code: 'CLIENT_CONTEXT_MISMATCH',
      error: 'The selected application does not match this conversation’s verified client.',
    }
  }

  // (3) Input validation — fail closed before any provider call.
  if (!isValidAmountMajor(input.amountMajor)) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Enter a valid amount (max 2 decimal places).' }
  }
  const amountMajor = input.amountMajor
  if (!(PAYMENT_PURPOSES as readonly string[]).includes(purpose)) {
    return { ok: false, code: 'INVALID_PURPOSE', error: 'Choose a valid payment purpose.' }
  }
  if (!(ACTION_CENTRE_PROVIDERS as readonly string[]).includes(provider)) {
    return { ok: false, code: 'UNSUPPORTED_PROVIDER', error: 'This payment provider is not available.' }
  }
  const acProvider = provider as ActionCentreProvider
  if (acProvider === 'paystack_va' && currency !== 'NGN') {
    return { ok: false, code: 'UNSUPPORTED_CURRENCY', error: 'Paystack bank transfer supports NGN only.' }
  }
  if (!isCurrencySupported(PROVIDER_METHOD[acProvider], currency)) {
    return { ok: false, code: 'UNSUPPORTED_CURRENCY', error: `${currency} is not supported by this provider.` }
  }

  // (3b) Fee is computed ONCE, up front — all providers persist the
  //      fee-inclusive totalCharge (security review M2/M4), which is also
  //      the exact amount the settlement webhooks reconcile against.
  const fee =
    acProvider === 'stripe'
      ? calculateFee(amountMajor, currency, input.stripeCardType === 'non_eu' ? 'stripe_non_eu' : 'stripe_eu')
      : acProvider === 'flutterwave'
        ? calculateFee(amountMajor, currency, 'flutterwave')
        : calculateFee(amountMajor, 'NGN', 'paystack_va')

  // (4) Idempotency — deterministic txRef; a retry returns the existing row.
  //     SCOPED to this conversation + this feature (security review M3):
  //     the key is browser input, so a colliding key from another
  //     conversation/staffer must conflict, never leak the other request.
  const txRef = txRefFromIdempotencyKey(idempotencyKey)
  const sameScope = (row: { conversationId?: number | null; source?: string | null }) =>
    row.conversationId === conversationId && row.source === 'inbox_action_centre'
  try {
    const existing = await prisma.paymentLink.findUnique({ where: { txRef } })
    if (existing) {
      if (!sameScope(existing)) {
        return {
          ok: false, code: 'IDEMPOTENCY_CONFLICT',
          error: 'This request reference is already in use. Close and reopen the payment form.',
        }
      }
      return { ok: true, request: toDTO(existing), deduplicated: true }
    }
  } catch (e) {
    console.warn('[action-centre] idempotency pre-check failed:', (e as Error).message)
  }

  // (4b) Duplicate-pending guard: same conversation + charge + currency +
  //      provider already pending within 24h → surface it instead of
  //      silently minting a second live request. Compares the persisted
  //      fee-inclusive totalCharge like-for-like (M4).
  if (!input.allowDuplicate) {
    try {
      const dup = await prisma.paymentLink.findFirst({
        where: {
          conversationId, status: 'pending', source: 'inbox_action_centre',
          currency, provider: acProvider === 'paystack_va' ? 'paystack' : acProvider,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      })
      if (dup && Math.abs(Number(dup.amount ?? 0) - fee.totalCharge) < 0.005) {
        return {
          ok: false, code: 'DUPLICATE_PENDING',
          error: 'An identical payment request is already pending for this conversation.',
          existing: toDTO(dup),
        }
      }
    } catch (e) {
      console.warn('[action-centre] duplicate-pending check failed:', (e as Error).message)
    }
  }

  // (5) Client contact from the SERVER-resolved context (never the browser).
  const clientName  = ctx.contact?.name  ?? ''
  const clientEmail = ctx.contact?.email ?? ''
  const clientPhone = ctx.contact?.phone ?? ''
  if (acProvider === 'paystack_va' && (!clientEmail || !clientName || !clientPhone)) {
    return {
      ok: false, code: 'MISSING_CLIENT_CONTACT',
      error: 'Paystack bank transfer needs the client’s name, email and phone on file.',
    }
  }

  const desc = (description ?? '').trim() || PURPOSE_LABELS[purpose as PaymentPurpose]

  // (6) Provider execution — the same calls the existing admin
  //     payment-links routes make, with walz_tx_ref correlation so the
  //     EXISTING webhooks/verify routes settle the row.
  let provResult: {
    paymentUrl: string | null; accountNumber: string | null; bankName: string | null
    persistAmount: number; baseAmount: number; feeLabel: string
    type: string; providerName: string; feeChargedNgn?: number
  }
  try {
    if (acProvider === 'stripe') {
      const key = process.env.STRIPE_SECRET_KEY
      if (!key) return { ok: false, code: 'PROVIDER_NOT_CONFIGURED', error: 'Stripe is not configured.' }
      const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'CA$' }
      const label = formatFeeLabel(fee, SYM[currency] ?? currency)
      const stripe = new Stripe(key, { apiVersion: '2024-06-20' })
      const price = await stripe.prices.create({
        unit_amount: Math.round(fee.totalCharge * 100),
        currency: currency.toLowerCase(),
        product_data: {
          name: desc,
          metadata: {
            generated_by: 'walztravels_action_centre',
            walz_tx_ref: txRef,
            base_amount: String(fee.baseAmount),
          },
        },
      })
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        after_completion: {
          type: 'hosted_confirmation',
          hosted_confirmation: {
            custom_message: 'Thank you for your payment to Walz Travels. We will be in touch shortly.',
          },
        },
        metadata: {
          walz_tx_ref: txRef,
          walz_conversation_id: String(conversationId),
          generated_by: session.email || 'admin',
          description: desc,
          base_amount: String(fee.baseAmount),
        },
        custom_text: { submit: { message: `Paying Walz Travels for: ${desc}` } },
      })
      provResult = {
        paymentUrl: link.url, accountNumber: null, bankName: null,
        persistAmount: fee.totalCharge, baseAmount: fee.baseAmount, feeLabel: label,
        type: 'stripe', providerName: 'stripe',
      }
    } else if (acProvider === 'flutterwave') {
      const appUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://walztravels.com'
      const res = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getFLWKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref: txRef,
          amount: fee.totalCharge,
          currency,
          payment_options: 'card,banktransfer,ussd',
          redirect_url: `${appUrl}/payment/success`,
          meta: {
            description: desc,
            generated_by: session.email || 'admin',
            walz_conversation_id: String(conversationId),
            base_amount: fee.baseAmount,
            fee_amount: fee.feeTotal,
          },
          customer: {
            email: clientEmail || 'client@walztravels.com',
            name: clientName || 'Client',
          },
          customizations: {
            title: 'Walz Travels',
            description: `${desc} · incl. ${fee.feePercent}% processing fee`,
            logo: `${appUrl}/logo.png`,
          },
        }),
      })
      const data = await res.json()
      if (data.status !== 'success' || !data.data?.link) {
        console.error('[action-centre] flutterwave link failed:', data.message ?? res.status)
        return { ok: false, code: 'PROVIDER_UNAVAILABLE', error: 'Payment link could not be generated. Retry.' }
      }
      provResult = {
        paymentUrl: data.data.link, accountNumber: null, bankName: null,
        persistAmount: fee.totalCharge, baseAmount: fee.baseAmount,
        feeLabel: `${fee.feePercent}%`,
        type: 'flutterwave', providerName: 'flutterwave',
      }
    } else {
      // paystack_va — dedicated NUBAN (NGN bank transfer, exact reconciliation)
      const PS_SECRET = process.env.PAYSTACK_SECRET_KEY
      if (!PS_SECRET) return { ok: false, code: 'PROVIDER_NOT_CONFIGURED', error: 'Paystack is not configured.' }
      const PS_BASE = 'https://api.paystack.co'
      const feeLabel = formatFeeLabel(fee, '₦')
      const nameParts = clientName.trim().split(' ')
      const custRes = await fetch(`${PS_BASE}/customer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: clientEmail,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || undefined,
          phone: clientPhone,
          metadata: { walz_tx_ref: txRef, walz_amount: String(amountMajor) },
        }),
      })
      const custData = await custRes.json()
      if (!custData.status || !custData.data?.customer_code) {
        console.error('[action-centre] paystack customer failed:', custData.message)
        return { ok: false, code: 'PROVIDER_UNAVAILABLE', error: 'Payment link could not be generated. Retry.' }
      }
      if (!custData.data.phone) {
        await fetch(`${PS_BASE}/customer/${custData.data.customer_code}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: clientPhone }),
        }).catch(() => null)
      }
      const vaRes = await fetch(`${PS_BASE}/dedicated_account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PS_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer: custData.data.customer_code, preferred_bank: 'wema-bank' }),
      })
      const vaData = await vaRes.json()
      if (!vaData.status || !vaData.data?.account_number) {
        console.error('[action-centre] paystack dedicated_account failed:', vaData.message)
        return { ok: false, code: 'PROVIDER_UNAVAILABLE', error: 'Payment link could not be generated. Retry.' }
      }
      provResult = {
        paymentUrl: null,
        accountNumber: vaData.data.account_number,
        bankName: vaData.data.bank?.name ?? 'Wema Bank',
        // Persist the fee-inclusive totalCharge: the client is told to
        // transfer EXACTLY this and the Paystack webhook's exact
        // minor-unit reconciliation settles against it (review M2).
        persistAmount: fee.totalCharge, baseAmount: fee.baseAmount, feeLabel,
        type: 'paystack_va', providerName: 'paystack',
        feeChargedNgn: fee.feeTotal,
      }
    }
  } catch (e) {
    console.error('[action-centre] provider call failed:', (e as Error).message)
    return { ok: false, code: 'PROVIDER_UNAVAILABLE', error: 'Payment link could not be generated. Retry.' }
  }

  // (7) Persist — unlike the legacy routes, a failed save here is a FAILURE
  //     (the request must be auditable), reported as such. Status is
  //     'pending'; ONLY the provider webhooks / verify route may set 'paid'.
  try {
    const row = await prisma.paymentLink.create({
      data: {
        txRef,
        paymentUrl: provResult.paymentUrl,
        accountNumber: provResult.accountNumber,
        bankName: provResult.bankName,
        amount: provResult.persistAmount,
        currency,
        clientName, clientEmail,
        // H1: the description is CLIENT-FACING (it reaches the payment
        // message verbatim). The staff note lives in its own column and
        // never enters the DTO or any client-facing surface.
        description: desc,
        internalNote: input.internalNote?.trim() || null,
        type: provResult.type,
        provider: provResult.providerName,
        status: 'pending',
        ...(provResult.feeChargedNgn != null ? { feeChargedNgn: provResult.feeChargedNgn } : {}),
        conversationId,
        visaApplicationId: ctx.application?.id ?? null,
        purpose,
        requestedBy: session.email ?? null,
        source: 'inbox_action_centre',
      },
    })
    console.log(
      `[action-centre] PAYMENT_REQUEST_CREATED txRef=${txRef} conv=${conversationId} ` +
      `provider=${provResult.providerName} amount=${provResult.persistAmount} ${currency} ` +
      `purpose=${purpose} by=${maskEmail(session.email)} client=${maskEmail(clientEmail)}`,
    )
    console.log(`[action-centre] PAYMENT_REQUEST_LINK_GENERATED txRef=${txRef} conv=${conversationId}`)
    return {
      ok: true, deduplicated: false,
      request: toDTO(row, { baseAmount: provResult.baseAmount, feeLabel: provResult.feeLabel }),
    }
  } catch (e) {
    // A unique-violation here means a concurrent identical retry won — converge.
    const msg = (e as { code?: string; message?: string })
    if (msg?.code === 'P2002' || /unique|duplicate key|23505/i.test(msg?.message ?? '')) {
      const existing = await prisma.paymentLink.findUnique({ where: { txRef } }).catch(() => null)
      // Converge only on OUR OWN request (same conversation + feature) —
      // a cross-scope key collision is a conflict, never a leak (M3).
      if (existing && sameScope(existing)) return { ok: true, request: toDTO(existing), deduplicated: true }
      if (existing) {
        return {
          ok: false, code: 'IDEMPOTENCY_CONFLICT',
          error: 'This request reference is already in use. Close and reopen the payment form.',
        }
      }
    }
    console.error('[action-centre] PERSIST_FAILED txRef=' + txRef, (e as Error).message)
    return {
      ok: false, code: 'PERSIST_FAILED',
      error: 'The payment link was created but could not be recorded. Do not resend; contact an administrator.',
    }
  }
}

/** Conversation's payment requests for the Client 360 view (safe DTO only). */
export async function listPaymentRequests(conversationId: number): Promise<PaymentRequestDTO[]> {
  try {
    const rows = await prisma.paymentLink.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    return rows.map(r => toDTO(r))
  } catch (e) {
    console.warn('[action-centre] listPaymentRequests failed:', (e as Error).message)
    return []
  }
}
