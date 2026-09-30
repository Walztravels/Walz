// lib/jade-club/purchase.ts — Jade Travel Club Release 2B: checkout
// creation.
//
// Server-authoritative price-at-checkout, mirroring
// app/api/esim/stripe-session/route.ts: the client sends ONLY a scope
// selector ({ tier, market, currency }), never a price. This module
// resolves the ACTIVE JadeClubCommercialPolicy for that exact scope
// immediately before creating anything, and copies its scalar fields
// (amountMinor, policyVersion, ...) onto the new JadeClubPurchase row —
// those fields are then NEVER re-derived or re-read from the live policy
// again by any downstream code (see docs/jade-2b-purchase-state-machine.md,
// "why policyVersion is copied at checkout-creation time").
//
// This file never imports the flight Miles redemption-freeze module and
// never mutates WalzRewardsMembership/WalzMilesTransaction.

import prisma from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { isJadeCommercialTier, type JadeCommercialTier } from './commercial-types'

const PENDING_REFERENCE_PREFIX = 'pending:'

export type CreateCheckoutFailureCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_TIER'
  | 'INVALID_SCOPE'
  | 'POLICY_NOT_FOUND'
  | 'ALREADY_ACTIVE'
  | 'STRIPE_ERROR'

export type CreateCheckoutResult =
  | { ok: true; purchaseId: string; checkoutUrl: string }
  | { ok: false; code: CreateCheckoutFailureCode; message: string }

export interface CreateCheckoutParams {
  userId: string
  customerEmail: string
  tier: string
  market: string
  currency: string
  origin: string // e.g. https://walztravels.com — used to build success/cancel URLs
}

/** Read-only lookup of the ACTIVE policy for one exact (tier, market, currency) scope. Never cached. */
export async function resolveActivePolicy(tier: string, market: string, currency: string) {
  return prisma.jadeClubCommercialPolicy.findFirst({
    where: { tier, market, currency: currency.toUpperCase(), status: 'ACTIVE' },
  })
}

/**
 * Read-only: every ACTIVE policy scope (market/currency) for one tier —
 * used to render the customer-facing join page. Returns an EMPTY array
 * (never a fabricated price) when nothing has been activated for this
 * tier yet.
 */
export async function listActivePoliciesForTier(tier: string) {
  if (!isJadeCommercialTier(tier)) return []
  return prisma.jadeClubCommercialPolicy.findMany({
    where: { tier, status: 'ACTIVE' },
    include: { benefits: true },
    orderBy: [{ market: 'asc' }, { currency: 'asc' }],
  })
}

/**
 * Creates a JadeClubPurchase row + a Stripe Checkout Session for it, with
 * the resolved authoritative amountMinor/currency and
 * { purchaseId, policyId, policyVersion } embedded in session metadata
 * (a defense-in-depth cross-check for the webhook — the webhook's
 * AUTHORITATIVE lookup is always by (provider, providerReference), never
 * by this metadata; see app/api/webhooks/jade-club/route.ts).
 */
export async function createJadeClubCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
  if (!params.userId) return { ok: false, code: 'UNAUTHENTICATED', message: 'Not signed in' }
  if (!isJadeCommercialTier(params.tier)) {
    return { ok: false, code: 'INVALID_TIER', message: 'Invalid membership tier' }
  }
  const tier = params.tier as JadeCommercialTier
  const market = (params.market ?? '').trim()
  const currency = (params.currency ?? '').trim().toUpperCase()
  if (!market || !currency) {
    return { ok: false, code: 'INVALID_SCOPE', message: 'market and currency are required' }
  }

  // Reject cleanly if no ACTIVE policy exists for this exact scope — never
  // fabricate a price or availability. Resolved fresh, immediately before
  // creating anything.
  const policy = await resolveActivePolicy(tier, market, currency)
  if (!policy) {
    return { ok: false, code: 'POLICY_NOT_FOUND', message: 'This membership tier is not currently available to purchase in your market/currency.' }
  }

  // Pre-check (not the structural guarantee — see below): reject before the
  // customer pays if they already have an unexpired commercial terms
  // period. This never replaces activateMembershipTerms's own
  // SELECT ... FOR UPDATE re-check inside its transaction — it only avoids
  // making a paying customer discover the guard AFTER paying.
  const membership = await prisma.jadeClubMembership.findUnique({ where: { userId: params.userId } })
  if (membership) {
    const existingUnexpired = await prisma.jadeClubMembershipTerms.findFirst({
      where: { membershipId: membership.id, expiresAt: { gt: new Date() } },
      select: { id: true },
    })
    if (existingUnexpired) {
      return { ok: false, code: 'ALREADY_ACTIVE', message: 'You already have an active Jade Club membership term. Renewal is not available yet.' }
    }
  }

  // Placeholder unique providerReference — replaced with the real Stripe
  // Checkout Session id immediately below. Needed because
  // (provider, providerReference) is NOT NULL + unique and we do not have
  // a session id until after this row exists (we want the row's id
  // available to embed in the session's metadata).
  const purchase = await prisma.jadeClubPurchase.create({
    data: {
      userId: params.userId,
      policyId: policy.id,
      policyVersion: policy.version,
      tier: policy.tier,
      market: policy.market,
      currency: policy.currency,
      amountMinor: policy.annualPriceMinor,
      provider: 'STRIPE',
      providerReference: `${PENDING_REFERENCE_PREFIX}${cryptoRandomId()}`,
      paymentStatus: 'PENDING',
      activationStatus: 'NOT_STARTED',
    },
  })

  let session
  try {
    session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: params.customerEmail,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: policy.currency.toLowerCase(),
          unit_amount: policy.annualPriceMinor,
          product_data: {
            name: `Jade ${policy.tier === 'CLUB_PLUS' ? 'Club+' : 'Club'} Membership`,
            description: `${policy.durationMonths}-month membership · ${policy.market}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        source: 'jade_club_membership_purchase',
        purchaseId: purchase.id,
        policyId: policy.id,
        policyVersion: String(policy.version),
        userId: params.userId,
      },
      success_url: `${params.origin}/dashboard/club/join/confirmation?purchase_id=${purchase.id}`,
      cancel_url: `${params.origin}/dashboard/club/join/${tier.toLowerCase()}?cancelled=1`,
    })
  } catch (err) {
    console.error('[jade-club/purchase] Stripe session creation failed:', err instanceof Error ? err.message : err)
    // Leave the purchase row as PENDING with its placeholder reference —
    // harmless, unreachable-by-webhook history (see design doc scenario 1).
    return { ok: false, code: 'STRIPE_ERROR', message: 'Could not start checkout. Please try again.' }
  }

  await prisma.jadeClubPurchase.update({
    where: { id: purchase.id },
    data: { providerReference: session.id },
  })

  return { ok: true, purchaseId: purchase.id, checkoutUrl: session.url ?? '' }
}

function cryptoRandomId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

// ─── Customer-facing read-only status (IDOR-safe) ──────────────────────────

export interface PurchaseStatusView {
  purchaseId: string
  tier: string
  paymentStatus: string
  activationStatus: string
  failureReason: string | null
}

/**
 * Scoped to the CALLING user's own row only — the `where` clause itself
 * enforces ownership (userId is part of the query, never checked
 * after-the-fact), so this can never leak another customer's purchase.
 */
export async function getOwnPurchaseStatus(userId: string, purchaseId: string): Promise<PurchaseStatusView | null> {
  const row = await prisma.jadeClubPurchase.findFirst({
    where: { id: purchaseId, userId },
    select: { id: true, tier: true, paymentStatus: true, activationStatus: true, failureReason: true },
  })
  if (!row) return null
  return {
    purchaseId: row.id,
    tier: row.tier,
    paymentStatus: row.paymentStatus,
    activationStatus: row.activationStatus,
    failureReason: row.failureReason,
  }
}
