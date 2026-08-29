/**
 * POST /api/itinerary/[ref]/accept-revision
 * ──────────────────────────────────────────────────────────────────────────────
 * Client accepts a revised proposal. Parallel in structure to accept-v2 and
 * approve — same security guarantees, same immutable snapshot pattern.
 *
 * Body:
 *   { token, acceptedBy, termsAccepted, selections? }
 *
 *   selections is required when the itinerary has active option groups (V2).
 *   For V1 (no option groups), selections may be omitted or empty.
 *
 * Success:
 *   200 { accepted: true, revisionNumber, snapshot: { acceptedTotal, currency, deposit } }
 *
 * Errors:
 *   400 — bad request body
 *   403 — invalid or expired token
 *   404 — not found
 *   409 — wrong status / already accepted
 *   410 — token expired
 *   422 — selection validation errors (V2 only)
 *   500 — unexpected
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * SECURITY: Preserves all mandates —
 *   - Server-authoritative pricing (never browser-supplied amounts)
 *   - Immutable acceptance snapshot (new row in itinerary_acceptance_history)
 *   - Row-level locking against concurrent acceptance
 *   - Hash validation against sentOptionsHash
 *   - Token validation + expiry check
 *   - Original selectedOption never overwritten without writing history first
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseOptions, patchOptions } from '@/lib/itinerary-options'
import { getResend } from '@/lib/email-internal'
import { getCurrencySymbol } from '@/lib/currency'
import { BUSINESS } from '@/lib/config/business'
import { esc } from '@/lib/html-escape'
import {
  buildProposalHashPayload,
  hashProposalState,
  validateSentProposalState,
  getStoredProposalHash,
  buildPayloadSummary,
  type PackageOptionRow,
} from '@/lib/proposalHash'
import { validateClientSelections } from '@/lib/v2/validate-selection'
import { buildAcceptanceSnapshotV2 } from '@/lib/v2/build-acceptance-snapshot'
import type {
  OptionGroup, OptionItem, ClientSelectionPayload,
  OptionCategory, SelectionMode, PricingMode, OptionSourceType,
} from '@/lib/v2/types'

const SIG_MIN = 2
const SIG_MAX = 100

// ─── Supabase raw row types (copy from accept-v2 for local use) ────────────────

type RawGroupRow = {
  id: string; itinerary_id: string; name: string; description: string | null
  category: string; selection_mode: string; pricing_mode: string; required: boolean
  min_selections: number; max_selections: number; sort_order: number
  active: boolean; client_visible: boolean; locked_after_acceptance: boolean
  created_at: string; updated_at: string
}
type RawItemRow = {
  id: string; group_id: string; itinerary_id: string; name: string
  description: string | null; client_price: number | string; currency: string
  price_adjustment: number | string; recommended: boolean; default_selected: boolean
  client_selectable: boolean; active: boolean; sort_order: number
  image_url: string | null; quote_expires_at: string | null
  supplier_cost: number | string | null; internal_margin: number | string | null
  source_type: string | null; source_booking_ref: string | null
  metadata: Record<string, unknown> | null; created_at: string; updated_at: string
}

function mapGroup(row: RawGroupRow): OptionGroup {
  return {
    id: row.id, itineraryId: row.itinerary_id, name: row.name,
    description: row.description ?? undefined,
    category: row.category as OptionCategory,
    selectionMode: row.selection_mode as SelectionMode,
    pricingMode: row.pricing_mode as PricingMode,
    required: row.required, minSelections: row.min_selections,
    maxSelections: row.max_selections, sortOrder: row.sort_order,
    active: row.active, clientVisible: row.client_visible,
    lockedAfterAcceptance: row.locked_after_acceptance,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}
function mapItem(row: RawItemRow): OptionItem {
  return {
    id: row.id, groupId: row.group_id, itineraryId: row.itinerary_id,
    name: row.name, description: row.description ?? undefined,
    clientPrice: Number(row.client_price), currency: row.currency,
    priceAdjustment: Number(row.price_adjustment),
    recommended: row.recommended, defaultSelected: row.default_selected,
    clientSelectable: row.client_selectable, active: row.active,
    sortOrder: row.sort_order, imageUrl: row.image_url ?? undefined,
    quoteExpiresAt: row.quote_expires_at ?? undefined,
    supplierCost:     row.supplier_cost != null ? Number(row.supplier_cost) : null,
    internalMargin:   row.internal_margin != null ? Number(row.internal_margin) : null,
    sourceType: (row.source_type as OptionSourceType) ?? null,
    sourceBookingRef: row.source_booking_ref ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params

  // ── 1. Parse body ─────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null) as {
    token?:         unknown
    acceptedBy?:    unknown
    termsAccepted?: unknown
    selections?:    unknown
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  if (typeof body.token !== 'string' || !body.token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }
  const token = body.token

  const rawName = typeof body.acceptedBy === 'string' ? body.acceptedBy.trim() : ''
  if (rawName.length < SIG_MIN) {
    return NextResponse.json(
      { error: 'Your full name is required to accept this proposal (minimum 2 characters)' },
      { status: 400 },
    )
  }
  if (rawName.length > SIG_MAX) {
    return NextResponse.json({ error: 'Name exceeds maximum length' }, { status: 400 })
  }
  const acceptedBy = rawName

  if (body.termsAccepted !== true) {
    return NextResponse.json(
      { error: 'You must accept the terms and conditions to proceed' },
      { status: 400 },
    )
  }

  const rawSelections: ClientSelectionPayload[] = Array.isArray(body.selections)
    ? (body.selections as unknown[])
        .filter(
          (s): s is ClientSelectionPayload =>
            typeof s === 'object' && s !== null &&
            typeof (s as Record<string, unknown>).groupId === 'string' &&
            Array.isArray((s as Record<string, unknown>).itemIds),
        )
        .map(s => ({
          groupId: (s as ClientSelectionPayload).groupId,
          itemIds: ((s as ClientSelectionPayload).itemIds as unknown[]).filter(
            (id): id is string => typeof id === 'string',
          ),
        }))
    : []

  // ── 2. Locate itinerary ───────────────────────────────────────────────────
  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (itin.status !== 'revision_sent') {
    return NextResponse.json(
      { error: 'This revised proposal is not currently awaiting acceptance.' },
      { status: 409 },
    )
  }

  // ── 3. Token validation ───────────────────────────────────────────────────
  const opts        = parseOptions(itin.options) as Record<string, unknown>
  const storedToken = opts.approvalToken as string | undefined
  const tokenUsed   = opts.approvalTokenUsed as boolean | undefined
  const expiresAt   = opts.approvalTokenExpiresAt as string | undefined

  const tokenValid = storedToken != null && (() => {
    try {
      const a = Buffer.from(storedToken); const b = Buffer.from(token)
      return a.length === b.length && timingSafeEqual(a, b)
    } catch { return false }
  })()
  if (!tokenValid) {
    return NextResponse.json({ error: 'Invalid or expired approval link' }, { status: 403 })
  }
  if (tokenUsed) {
    return NextResponse.json({ error: 'This approval link has already been used' }, { status: 409 })
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired' }, { status: 410 })
  }

  // ── 4. Supabase client + V2 detection ─────────────────────────────────────
  let sb: ReturnType<typeof getSupabaseAdmin>
  try { sb = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { data: groupRows } = await sb
    .from('itinerary_option_groups')
    .select('*')
    .eq('itinerary_id', itin.id)
    .eq('active', true)
    .eq('client_visible', true)
    .order('sort_order')

  const hasOptionGroups = (groupRows ?? []).length > 0

  // ── 5. Hash validation ────────────────────────────────────────────────────
  const { data: pkgRows } = await sb
    .from('itinerary_package_options')
    .select('name, description, price, currency, features, sort_order')
    .eq('itinerary_id', itin.id)
    .order('sort_order')

  const storedHash   = getStoredProposalHash(itin.options)
  const hashResult   = validateSentProposalState(itin, (pkgRows ?? []) as PackageOptionRow[], storedHash)
  const legacyNoHash = hashResult.result === 'NO_HASH_LEGACY'

  if (hashResult.result === 'STALE') {
    const currentPayload = buildProposalHashPayload(itin, (pkgRows ?? []) as PackageOptionRow[])
    console.info('[accept-revision] 409/HASH_STALE', {
      ref,
      storedHashPrefix:  hashResult.storedHash.slice(0, 8),
      currentHashPrefix: hashResult.currentHash.slice(0, 8),
      payloadSummary: buildPayloadSummary(currentPayload),
    })
    return NextResponse.json(
      {
        error: 'This revised proposal has been updated since it was sent. ' +
               'Please contact your travel advisor to receive the latest version.',
      },
      { status: 409 },
    )
  }

  const hashPayload   = buildProposalHashPayload(itin, (pkgRows ?? []) as PackageOptionRow[])
  const currentHash   = hashProposalState(hashPayload)

  const revisionNumber = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 1

  // ── 6. Build acceptance snapshot ─────────────────────────────────────────
  let snapshot: Record<string, unknown>

  if (hasOptionGroups) {
    // V2 path — validate option group selections
    const { data: itemRows } = await sb
      .from('itinerary_option_items')
      .select('*')
      .eq('itinerary_id', itin.id)
      .eq('active', true)

    const groups  = (groupRows ?? []).map(r => mapGroup(r as RawGroupRow))
    const items   = (itemRows  ?? []).map(r => mapItem(r as RawItemRow))

    const validationResult = validateClientSelections(rawSelections, groups, items, itin.id, itin.currency)
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: 'Selection validation failed', errors: validationResult.errors },
        { status: 422 },
      )
    }

    const v2Snapshot = buildAcceptanceSnapshotV2({
      acceptedBy,
      proposalHash:  legacyNoHash ? '' : currentHash,
      currency:      itin.currency,
      baseTotal:     itin.totalPrice ?? 0,
      deposit:       itin.deposit ?? null,
      termsAccepted: true,
      payload:       rawSelections,
      groups,
      items,
    })
    snapshot = { ...(v2Snapshot as unknown as Record<string, unknown>) }
  } else {
    // V1-style path — simple snapshot
    snapshot = {
      version:           1,
      acceptedAt:        new Date().toISOString(),
      acceptedBy,
      proposalHash:      legacyNoHash ? null : currentHash,
      legacyNoHash,
      currency:          itin.currency,
      acceptedTotal:     itin.totalPrice ?? null,
      deposit:           itin.deposit ?? null,
      selectedOptionIds: [],
      options:           [],
      termsAccepted:     true,
      revisionNumber,
    }
  }

  const acceptedTotal = snapshot.acceptedTotal as number | null
  const deposit       = snapshot.deposit as number | null

  // ── 7. Set authoritative acceptedAt — shared by both writes ─────────────
  // This timestamp must be set before either write so the history record and
  // the Prisma snapshot agree on the same acceptedAt value.
  const acceptedAtDate = new Date()
  ;(snapshot as Record<string, unknown>).acceptedAt = acceptedAtDate.toISOString()

  // ── 7b. Write acceptance history to Supabase FIRST (H-10) ───────────────
  // An accepted revision CANNOT exist without its immutable history record.
  // If this write fails we return 503 — the client retries and the Prisma
  // state is never committed. An orphaned history row on a later Prisma
  // failure is harmless; UNIQUE(itinerary_id, revision_number) prevents
  // a duplicate on retry.
  const { flights, hotels, days, inclusions, exclusions, totalPrice } = itin
  const safeArr = (s: string) => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] } }
  const { error: histErr } = await sb
    .from('itinerary_acceptance_history')
    .insert({
      itinerary_id:     itin.id,
      revision_number:  revisionNumber,
      version:          hasOptionGroups ? 2 : 1,
      snapshot:         snapshot,
      content_snapshot: {
        flights:    safeArr(flights),
        hotels:     safeArr(hotels),
        days:       safeArr(days),
        inclusions: safeArr(inclusions),
        exclusions: safeArr(exclusions),
        totalPrice,
      },
      proposal_hash:  legacyNoHash ? null : currentHash,
      accepted_at:    acceptedAtDate.toISOString(),
      accepted_by:    acceptedBy,
      accepted_total: acceptedTotal,
      currency:       itin.currency,
    })
  if (histErr) {
    console.error('[accept-revision] History write failed — aborting acceptance', histErr)
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again in a moment.' },
      { status: 503 },
    )
  }

  // ── 8. Atomic Prisma transaction (history already committed) ─────────────
  // History is durable before we touch Prisma. If the tx fails after history
  // succeeds, the history row is orphaned but harmless — the unique constraint
  // blocks a duplicate on retry, and the loser path handles duplicate detection.
  type LockedRow = { id: string; status: string; options: string }
  type TxResult  = { winner: boolean }
  let txResult: TxResult

  try {
    txResult = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT id, status, options
        FROM "Itinerary"
        WHERE id = ${itin.id}
        FOR UPDATE
      `
      const locked = rows[0]
      if (!locked) throw new Error('NOT_FOUND')

      const lockedOpts = parseOptions(locked.options) as Record<string, unknown>
      if (lockedOpts.approvalTokenUsed === true) {
        return { winner: false }
      }
      if (locked.status !== 'revision_sent') {
        throw new Error('INELIGIBLE_STATUS')
      }

      await tx.itinerary.update({
        where: { id: itin.id },
        data: {
          status:         'revision_accepted',
          approvedAt:     acceptedAtDate,
          approvedBy:     acceptedBy,
          selectedOption: JSON.stringify(snapshot),
          options:        patchOptions(locked.options, { approvalTokenUsed: true }),
          updatedAt:      acceptedAtDate,
        },
      })

      return { winner: true }
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err instanceof Error && err.message === 'INELIGIBLE_STATUS') {
      return NextResponse.json(
        { error: 'This revised proposal is not in a state that can be accepted.' },
        { status: 409 },
      )
    }
    console.error('[accept-revision] Transaction error', err)
    return NextResponse.json(
      { error: 'Acceptance could not be completed. Please try again.' },
      { status: 500 },
    )
  }

  if (!txResult.winner) {
    return NextResponse.json({ error: 'Already accepted' }, { status: 409 })
  }

  // ── 9. Post-acceptance notifications (non-fatal) ──────────────────────────
  console.info('[accept-revision] Revision accepted', {
    ref, revisionNumber, acceptedBy, acceptedTotal,
  })

  try {
    const resend = getResend()
    const BASE   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
    const sym    = getCurrencySymbol(itin.currency)

    await resend.emails.send({
      from:    'Walz Travels <contact@walztravels.com>',
      to:      itin.clientEmail,
      subject: `Updated Trip Confirmed — ${itin.referenceNumber}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;background:#fff;">
          <div style="background:#0B1F3A;padding:28px 36px;text-align:center;">
            <img src="${BASE}/walz-logo.png" alt="Walz Travels" width="140" style="display:block;margin:0 auto 10px;"/>
          </div>
          <div style="padding:36px;">
            <h1 style="color:#0B1F3A;font-size:22px;margin:0 0 12px;">Your updated trip is confirmed!</h1>
            <p style="color:#475569;font-size:14px;margin:0 0 8px;">Dear ${esc(acceptedBy)},</p>
            <p style="color:#475569;font-size:14px;margin:0 0 24px;">
              You&#x27;ve accepted the updated proposal for your <strong>${esc(itin.destination)}</strong>
              trip (${itin.referenceNumber}).
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Trip:</strong> ${esc(itin.title)}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Reference:</strong> ${itin.referenceNumber}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Revision:</strong> ${revisionNumber}</p>
              ${acceptedTotal != null ? `<p style="margin:0;font-size:14px;color:#0B1F3A;font-weight:600;"><strong>Confirmed Total:</strong> ${sym}${Number(acceptedTotal).toLocaleString()}</p>` : ''}
              ${deposit != null ? `<p style="margin:0;font-size:14px;color:#C9A84C;font-weight:600;">Deposit of ${sym}${Number(deposit).toLocaleString()} required to secure your booking.</p>` : ''}
            </div>
            <div style="text-align:center;margin:28px 0;">
              <a href="${BASE}/itinerary/${itin.referenceNumber}/portal" style="background:#C9A84C;color:#0B1F3A;font-weight:700;font-size:14px;padding:14px 28px;border-radius:10px;text-decoration:none;display:inline-block;">View Your Portal →</a>
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
      subject: `✅ Revision ${revisionNumber} accepted — ${itin.referenceNumber} (${acceptedBy})`,
      html:    `<p><strong>${esc(acceptedBy)}</strong> accepted revision <strong>${revisionNumber}</strong> of ${itin.referenceNumber} for ${esc(itin.destination ?? '')}.</p>
               <p>Total: ${itin.currency} ${acceptedTotal != null ? Number(acceptedTotal).toLocaleString() : 'n/a'}</p>
               <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'}/admin/itinerary-planner/${itin.id}">Open in admin →</a></p>`,
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({
    accepted:       true,
    revisionNumber,
    snapshot: {
      acceptedTotal,
      currency: itin.currency,
      deposit,
    },
  })
}
