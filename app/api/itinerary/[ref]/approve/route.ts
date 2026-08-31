import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { tryLinkItineraryByEmail } from '@/lib/portal/customer-identity'
import { getResend } from '@/lib/email-internal'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getCurrencySymbol } from '@/lib/currency'
import { BUSINESS } from '@/lib/config/business'
import { esc } from '@/lib/html-escape'
import { parseOptions, patchOptions, type OptionsMap } from '@/lib/itinerary-options'
import { parseAcceptanceSnapshot } from '@/lib/acceptance-snapshot'
import {
  buildProposalHashPayload,
  hashProposalState,
  validateSentProposalState,
  getStoredProposalHash,
  buildPayloadSummary,
  type PackageOptionRow,
} from '@/lib/proposalHash'

// ─── constants ────────────────────────────────────────────────────────────────

const ELIGIBLE_STATUSES = ['proposal'] as const   // GA4.1: only 'proposal' is eligible
const SIG_MIN = 2                                  // minimum chars after trim
const SIG_MAX = 100                               // maximum chars after trim

// ─── request shape ─────────────────────────────────────────────────────────────

type AcceptBody = {
  token?: unknown
  name?: unknown                    // typed name = electronic signature
  signature?: unknown               // optional override for clientSignature
  selectedOptionIds?: unknown       // client's package option choices
  termsAccepted?: unknown           // must be true for acceptanceVersion >= 1
  acceptanceVersion?: unknown       // 1 = new GA5 flow (strict termsAccepted); absent = legacy page
}

// ─── acceptance snapshot ────────────────────────────────────────────────────────

type SelectedOptionSnapshot = {
  id:       string
  label:    string
  price:    number | null
  currency: string
}

export type AcceptanceSnapshot = {
  version:           1
  acceptedAt:        string
  acceptedBy:        string
  proposalHash:      string | null
  legacyNoHash:      boolean
  currency:          string
  acceptedTotal:     number | null
  deposit:           number | null
  selectedOptionIds: string[]
  options:           SelectedOptionSnapshot[]
  termsAccepted:     boolean
}

// ─── authoritative price calculation ───────────────────────────────────────────

function computeAcceptedTotal(
  baseTotalPrice: number | null,
  selectedOptions: (PackageOptionRow & { id: string })[]
): number | null {
  if (selectedOptions.length === 0) return baseTotalPrice ?? null
  if (selectedOptions.length === 1 && selectedOptions[0].price != null) {
    return selectedOptions[0].price
  }
  return baseTotalPrice ?? null
}

// ─── idempotency comparison ───────────────────────────────────────────────────

// Normalize option ID arrays for comparison: sort and dedupe.
function normIds(ids: string[]): string {
  return [...new Set(ids)].sort().join(',')
}

function isIdempotentReplay(
  incoming: { token: string; acceptedBy: string; selectedOptionIds: string[] },
  snapshot: AcceptanceSnapshot | null,
  storedToken: string | undefined
): boolean {
  if (!snapshot || storedToken !== incoming.token) return false
  const nameMatch = incoming.acceptedBy.toLowerCase() === snapshot.acceptedBy.toLowerCase()
  const optsMatch = normIds(incoming.selectedOptionIds) === normIds(snapshot.selectedOptionIds)
  return nameMatch && optsMatch
}

// ─── POST /api/itinerary/[ref]/approve ─────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const body = await req.json().catch(() => ({})) as AcceptBody

  // ── 1. Basic request validation ───────────────────────────────────────────

  if (typeof body.token !== 'string' || !body.token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }
  const token = body.token

  const rawName = typeof body.name === 'string' ? body.name.trim() : ''
  if (rawName.length < SIG_MIN) {
    return NextResponse.json({ error: 'Your full name is required to accept this proposal (minimum 2 characters)' }, { status: 400 })
  }
  if (rawName.length > SIG_MAX) {
    return NextResponse.json({ error: 'Name exceeds maximum length' }, { status: 400 })
  }
  const acceptedBy = rawName

  // termsAccepted is always required — acceptanceVersion no longer gates this check.
  // An attacker stripping acceptanceVersion from the request must not bypass terms enforcement.
  const termsAccepted = body.termsAccepted
  if (termsAccepted !== true) {
    return NextResponse.json({ error: 'You must accept the terms and conditions to proceed' }, { status: 400 })
  }
  const termsRecorded = true

  const requestedIds: string[] = Array.isArray(body.selectedOptionIds)
    ? body.selectedOptionIds.filter((id): id is string => typeof id === 'string')
    : []

  const signerName = typeof body.signature === 'string' && body.signature.trim().length >= SIG_MIN
    ? body.signature.trim().slice(0, SIG_MAX)
    : acceptedBy

  // ── 2. Locate itinerary ───────────────────────────────────────────────────

  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── 3. Already-approved idempotency check (before expensive work) ─────────
  // This handles clean retries after a successful acceptance without needing
  // a database lock. The lock path handles the concurrent same-request race.

  if (itin.status === 'approved') {
    const existingOpts = parseOptions(itin.options)
    const existingSnap = parseAcceptanceSnapshot(itin.selectedOption)
    const storedToken  = existingOpts.approvalToken as string | undefined

    if (isIdempotentReplay({ token, acceptedBy, selectedOptionIds: requestedIds }, existingSnap, storedToken)) {
      console.info('[approve] Idempotent replay — already accepted', { ref })
      return NextResponse.json({
        ok:              true,
        status:          'approved',
        referenceNumber: itin.referenceNumber,
        acceptedTotal:   existingSnap?.acceptedTotal ?? itin.totalPrice,
        currency:        existingSnap?.currency ?? itin.currency,
        deposit:         existingSnap?.deposit ?? itin.deposit,
        idempotent:      true,
      })
    }
    return NextResponse.json(
      { error: 'This proposal has already been accepted.' },
      { status: 409 }
    )
  }

  // ── 4. Status eligibility (pre-lock) ──────────────────────────────────────
  // live = client is already travelling; cannot accept
  // draft, archived = not a proposal
  if (!ELIGIBLE_STATUSES.includes(itin.status as typeof ELIGIBLE_STATUSES[number])) {
    const msg = itin.status === 'live'
      ? 'Your trip is already active. No further acceptance is required.'
      : 'This proposal is not in a state that can be accepted.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // ── 5. Pre-lock token validation ──────────────────────────────────────────
  // Check the token before fetching Supabase options (avoid unnecessary work).
  const opts        = parseOptions(itin.options)
  const storedToken = opts.approvalToken as string | undefined
  const tokenUsed   = opts.approvalTokenUsed as boolean | undefined
  const expiresAt   = opts.approvalTokenExpiresAt as string | undefined

  // Timing-safe comparison prevents token oracle via response time
  const tokenValid = storedToken != null && (() => {
    try {
      const a = Buffer.from(storedToken); const b = Buffer.from(token)
      return a.length === b.length && timingSafeEqual(a, b)
    } catch { return false }
  })()
  if (!tokenValid) {
    console.warn('[approve] Invalid token attempt', { ref, prefix: token.slice(0, 8) })
    return NextResponse.json({ error: 'Invalid or expired approval link' }, { status: 403 })
  }
  if (tokenUsed) {
    console.error('[approve] Token used but status not approved — inconsistent state', { ref })
    return NextResponse.json({ error: 'This approval link has already been used' }, { status: 409 })
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    console.info('[approve] Token expired', { ref })
    return NextResponse.json(
      { error: 'This approval link has expired. Please contact your travel advisor for a new link.' },
      { status: 410 }
    )
  }

  // ── 6. Package options — frozen snapshot from send time when available ────
  // frozenPackageOptions was stored by the send route inside the same transaction that
  // produced sentOptionsHash. Using it here eliminates the Supabase race at accept time:
  // the hash is validated against exactly the option set the client was shown.
  // Legacy proposals (sent before this change) fall back to a live Supabase fetch.
  const sb = getSupabaseAdmin()
  const frozenRaw = opts.frozenPackageOptions  // unknown — narrowed below
  const allPkgOptions: (PackageOptionRow & { id: string })[] = Array.isArray(frozenRaw)
    ? (frozenRaw as (PackageOptionRow & { id: string })[])
    : await sb
        .from('itinerary_package_options')
        .select('id, name, description, price, currency, features, sort_order')
        .eq('itinerary_id', itin.id)
        .order('sort_order')
        .then(({ data }) => (data ?? []) as (PackageOptionRow & { id: string })[])

  // ── 6b. H-7: Reject if active V2 option groups exist ─────────────────────
  // V1 /approve is incompatible with V2 option groups. The client must use
  // /accept-v2 instead. Checking server-side prevents the V2→V1 boundary bypass.
  const { data: v2Groups } = await sb
    .from('itinerary_option_groups')
    .select('id')
    .eq('itinerary_id', itin.id)
    .eq('active', true)
    .limit(1)
  if (v2Groups && v2Groups.length > 0) {
    console.warn('[approve] 409/V2_ROUTING — active V2 option groups block /approve; client must use /accept-v2', { ref })
    return NextResponse.json(
      { error: 'This itinerary uses a multi-option format and must be accepted through the updated proposal link.' },
      { status: 409 }
    )
  }

  // ── 7. Proposal hash validation (GA3) ─────────────────────────────────────
  const storedHash = getStoredProposalHash(itin.options)
  const hashResult = validateSentProposalState(itin, allPkgOptions, storedHash)

  if (hashResult.result === 'STALE') {
    const currentPayload = buildProposalHashPayload(itin, allPkgOptions)
    console.info('[approve] 409/HASH_STALE', {
      ref,
      storedHashPrefix:  hashResult.storedHash.slice(0, 8),
      currentHashPrefix: hashResult.currentHash.slice(0, 8),
      payloadSummary: buildPayloadSummary(currentPayload),
    })
    return NextResponse.json(
      {
        error: 'This proposal has been updated since it was sent to you. ' +
               'Please contact your travel advisor to receive the latest version.',
      },
      { status: 409 }
    )
  }
  const legacyNoHash = hashResult.result === 'NO_HASH_LEGACY'
  if (legacyNoHash) {
    console.warn('[approve] LEGACY_NO_HASH — proceeding without hash verification', { ref })
  }

  // ── 8. Option selection validation ────────────────────────────────────────
  let selectedOptions: (PackageOptionRow & { id: string })[] = []

  if (requestedIds.length > 0) {
    const idsForThisItin = new Set(allPkgOptions.map(o => o.id))
    const unknownIds     = requestedIds.filter(id => !idsForThisItin.has(id))
    if (unknownIds.length > 0) {
      console.warn('[approve] Unknown option IDs', { ref, unknownIds })
      return NextResponse.json(
        { error: 'One or more selected options are not valid for this proposal.' },
        { status: 422 }
      )
    }
    selectedOptions = allPkgOptions.filter(o => requestedIds.includes(o.id))
    if (selectedOptions.length > 1) {
      return NextResponse.json(
        { error: 'Only one package option may be selected at this time.' },
        { status: 422 }
      )
    }
  }

  // ── 9. Authoritative price calculation ────────────────────────────────────
  const acceptedTotal = computeAcceptedTotal(itin.totalPrice, selectedOptions)

  // ── 10. Build immutable snapshot (before entering the transaction) ─────────
  // acceptedAt is set inside the transaction using the locked-row timestamp
  // to ensure the winning request's timestamp is authoritative.
  const hashPayload   = buildProposalHashPayload(itin, allPkgOptions)
  const currentHash   = hashProposalState(hashPayload)

  const snapshot: AcceptanceSnapshot = {
    version:           1,
    acceptedAt:        new Date().toISOString(),  // overwritten inside tx if needed
    acceptedBy,
    proposalHash:      legacyNoHash ? null : currentHash,
    legacyNoHash,
    currency:          itin.currency,
    acceptedTotal:     acceptedTotal ?? null,
    deposit:           itin.deposit ?? null,
    selectedOptionIds: selectedOptions.map(o => o.id),
    options: selectedOptions.map(o => ({
      id:       o.id,
      label:    o.name,
      price:    o.price ?? null,
      currency: o.currency,
    })),
    termsAccepted: termsRecorded,
  }

  // ── 11. Atomic persistence via SELECT FOR UPDATE ───────────────────────────
  // SELECT FOR UPDATE acquires a Postgres row-level lock.
  // A concurrent request blocks at the SELECT until this transaction commits,
  // then reads the updated state (approvalTokenUsed: true) and takes the
  // loser path (idempotent 200 or 409 conflict).

  type LockedRow = { id: string; status: string; options: string; selectedOption: string | null }

  type TxResult =
    | { winner: true }
    | { winner: false; lockedOpts: OptionsMap; lockedSnap: AcceptanceSnapshot | null; lockedToken: string | undefined }

  let txResult: TxResult

  try {
    txResult = await prisma.$transaction(async (tx) => {
      // Lock the row — serializes concurrent accept attempts for this itinerary
      const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT id, status, options, "selectedOption"
        FROM "Itinerary"
        WHERE id = ${itin.id}
        FOR UPDATE
      `
      const locked = rows[0]
      if (!locked) throw new Error('NOT_FOUND')

      const lockedOpts = parseOptions(locked.options)

      // Re-check after lock: another request may have already accepted
      if (lockedOpts.approvalTokenUsed === true) {
        const lockedSnap = parseAcceptanceSnapshot(locked.selectedOption)
        const lockedToken = lockedOpts.approvalToken as string | undefined
        return { winner: false, lockedOpts, lockedSnap, lockedToken } satisfies TxResult
      }

      // Re-check status inside lock (could have changed between initial read and lock)
      if (!ELIGIBLE_STATUSES.includes(locked.status as typeof ELIGIBLE_STATUSES[number])) {
        throw Object.assign(new Error('INELIGIBLE_STATUS'), { statusValue: locked.status })
      }

      // Set the authoritative acceptedAt inside the transaction
      const now = new Date()
      snapshot.acceptedAt = now.toISOString()

      // Write all acceptance state atomically in one UPDATE
      // Use lockedOpts (post-lock) as the merge base so no concurrent options write is lost
      await tx.itinerary.update({
        where: { id: itin.id },
        data: {
          status:          'approved',
          approvedAt:      now,
          approvedBy:      acceptedBy,
          clientSignature: signerName,
          selectedOption:  JSON.stringify(snapshot),
          options:         patchOptions(locked.options, { approvalTokenUsed: true }),
          updatedAt:       now,
        },
      })

      return { winner: true } satisfies TxResult
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err instanceof Error && err.message === 'INELIGIBLE_STATUS') {
      return NextResponse.json(
        { error: 'This proposal is not in a state that can be accepted.' },
        { status: 409 }
      )
    }
    console.error('[approve] Transaction error', err)
    return NextResponse.json({ error: 'Acceptance could not be completed. Please try again.' }, { status: 500 })
  }

  // ── 12. Handle loser (concurrent race) ────────────────────────────────────
  if (!txResult.winner) {
    const { lockedSnap, lockedToken } = txResult
    if (isIdempotentReplay({ token, acceptedBy, selectedOptionIds: requestedIds }, lockedSnap, lockedToken)) {
      console.info('[approve] Concurrent race loser — idempotent replay', { ref })
      return NextResponse.json({
        ok:              true,
        status:          'approved',
        referenceNumber: itin.referenceNumber,
        acceptedTotal:   lockedSnap?.acceptedTotal ?? itin.totalPrice,
        currency:        lockedSnap?.currency ?? itin.currency,
        deposit:         lockedSnap?.deposit ?? itin.deposit,
        idempotent:      true,
      })
    }
    return NextResponse.json(
      { error: 'This proposal has already been accepted with a different configuration.' },
      { status: 409 }
    )
  }

  // ── 13. Winner post-acceptance logging + emails (non-fatal) ───────────────
  console.info('[approve] Acceptance recorded', {
    ref,
    legacyNoHash,
    acceptedTotal,
    optionCount: selectedOptions.length,
  })

  try {
    const resend = getResend()
    const BASE   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
    const sym    = getCurrencySymbol(itin.currency)

    await resend.emails.send({
      from:    'Walz Travels <contact@walztravels.com>',
      to:      itin.clientEmail,
      subject: `Booking Confirmed — ${itin.referenceNumber}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#fff;">
          <div style="background:#0B1F3A;padding:28px 36px;text-align:center;">
            <img src="${BASE}/walz-logo.png" alt="Walz Travels" width="140" style="display:block;margin:0 auto 10px;"/>
          </div>
          <div style="padding:36px;">
            <h1 style="color:#0B1F3A;font-size:22px;margin:0 0 12px;">Your trip is confirmed!</h1>
            <p style="color:#475569;font-size:14px;margin:0 0 8px;">Dear ${esc(acceptedBy)},</p>
            <p style="color:#475569;font-size:14px;margin:0 0 24px;">
              Thank you for approving your <strong>${esc(itin.destination)}</strong> itinerary
              (${itin.referenceNumber}). Your booking is now confirmed.
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Trip:</strong> ${esc(itin.title)}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Reference:</strong> ${itin.referenceNumber}</p>
              ${snapshot.options.length > 0 ? `<p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Package:</strong> ${snapshot.options.map(o => esc(o.label)).join(', ')}</p>` : ''}
              ${acceptedTotal != null ? `<p style="margin:0 0 6px;font-size:14px;color:#0B1F3A;font-weight:600;"><strong>Accepted Total:</strong> ${sym}${Number(acceptedTotal).toLocaleString()}</p>` : ''}
              ${snapshot.deposit ? `<p style="margin:0;font-size:14px;color:#C9A84C;font-weight:600;">Deposit of ${sym}${Number(snapshot.deposit).toLocaleString()} required to secure your booking.</p>` : ''}
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="${BASE}/itinerary/${itin.referenceNumber}" style="background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;display:inline-block;">View Itinerary →</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:24px;">
              Questions? <a href="https://wa.me/${BUSINESS.contacts.globalWhatsapp.e164}" style="color:#C9A84C;">WhatsApp us</a> or email <a href="mailto:${BUSINESS.contacts.email}" style="color:#C9A84C;">${BUSINESS.contacts.email}</a>
            </p>
          </div>
        </div>`,
    })

    await resend.emails.send({
      from:    'Walz Travels System <contact@walztravels.com>',
      to:      BUSINESS.contacts.email,
      subject: `✅ Proposal accepted — ${itin.referenceNumber} (${acceptedBy})`,
      html: `<p><strong>${esc(acceptedBy)}</strong> accepted proposal <strong>${itin.referenceNumber}</strong> for ${esc(itin.destination)}.</p>
             <p>Accepted at: ${new Date(snapshot.acceptedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
             ${acceptedTotal != null ? `<p>Accepted total: ${itin.currency} ${Number(acceptedTotal).toLocaleString()}</p>` : ''}
             ${legacyNoHash ? '<p>⚠️ LEGACY_NO_HASH: accepted without hash verification</p>' : ''}
             <p><a href="${BASE}/admin/itinerary-planner/${itin.id}">Open in admin →</a></p>`,
    })
  } catch { /* non-fatal */ }

  // Release 6.1 — Track 2: Link itinerary to verified portal User on acceptance.
  // Non-blocking: identity errors must never prevent proposal acceptance from completing.
  void tryLinkItineraryByEmail(itin.id, itin.clientEmail, 'acceptance')

  return NextResponse.json({
    ok:              true,
    status:          'approved',
    referenceNumber: itin.referenceNumber,
    acceptedTotal:   snapshot.acceptedTotal,
    currency:        snapshot.currency,
    deposit:         snapshot.deposit,
  })
}
