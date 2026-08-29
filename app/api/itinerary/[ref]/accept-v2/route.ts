/**
 * POST /api/itinerary/[ref]/accept-v2
 * ──────────────────────────────────────────────────────────────────────────────
 * V2 acceptance endpoint. Separate from the V1 approve route — does NOT modify it.
 *
 * Body:
 *   { token, acceptedBy, termsAccepted, selections: ClientSelectionPayload[] }
 *
 * Success:
 *   200 { accepted: true, snapshot: { acceptedTotal, currency, deposit } }
 *
 * Errors:
 *   400 — bad request body
 *   403 — invalid or expired token
 *   404 — itinerary not found
 *   409 — not a proposal / already accepted / stale hash
 *   410 — token expired
 *   422 — selection validation errors
 *   500 — unexpected server error
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseOptions, patchOptions } from '@/lib/itinerary-options'
import { esc } from '@/lib/html-escape'
import { getCurrencySymbol } from '@/lib/currency'
import {
  buildProposalHashPayload,
  hashProposalState,
  validateSentProposalState,
  getStoredProposalHash,
  type PackageOptionRow,
} from '@/lib/proposalHash'
import { validateClientSelections }       from '@/lib/v2/validate-selection'
import { getResend }                      from '@/lib/email-internal'
import { BUSINESS }                       from '@/lib/config/business'
import { buildAcceptanceSnapshotV2 }      from '@/lib/v2/build-acceptance-snapshot'
import type {
  OptionGroup,
  OptionItem,
  ClientSelectionPayload,
  OptionCategory,
  SelectionMode,
  PricingMode,
  OptionSourceType,
} from '@/lib/v2/types'

// ─── constants ────────────────────────────────────────────────────────────────

const SIG_MIN = 2
const SIG_MAX = 100

// ─── request shape ────────────────────────────────────────────────────────────

type AcceptV2Body = {
  token?:         unknown
  acceptedBy?:    unknown
  termsAccepted?: unknown
  selections?:    unknown
}

// ─── Supabase raw row types (snake_case columns) ──────────────────────────────

type RawGroupRow = {
  id:                      string
  itinerary_id:            string
  name:                    string
  description:             string | null
  category:                string
  selection_mode:          string
  pricing_mode:            string
  required:                boolean
  min_selections:          number
  max_selections:          number
  sort_order:              number
  active:                  boolean
  client_visible:          boolean
  locked_after_acceptance: boolean
  created_at:              string
  updated_at:              string
}

type RawItemRow = {
  id:                string
  group_id:          string
  itinerary_id:      string
  name:              string
  description:       string | null
  client_price:      number | string
  currency:          string
  price_adjustment:  number | string
  recommended:       boolean
  default_selected:  boolean
  client_selectable: boolean
  active:            boolean
  sort_order:        number
  image_url:         string | null
  quote_expires_at:  string | null
  supplier_cost:     number | string | null
  internal_margin:   number | string | null
  source_type:       string | null
  source_booking_ref: string | null
  metadata:          Record<string, unknown> | null
  created_at:        string
  updated_at:        string
}

// ─── Row → TypeScript type mappers ────────────────────────────────────────────

function mapGroup(row: RawGroupRow): OptionGroup {
  return {
    id:                    row.id,
    itineraryId:           row.itinerary_id,
    name:                  row.name,
    description:           row.description ?? undefined,
    category:              row.category as OptionCategory,
    selectionMode:         row.selection_mode as SelectionMode,
    pricingMode:           row.pricing_mode as PricingMode,
    required:              row.required,
    minSelections:         row.min_selections,
    maxSelections:         row.max_selections,
    sortOrder:             row.sort_order,
    active:                row.active,
    clientVisible:         row.client_visible,
    lockedAfterAcceptance: row.locked_after_acceptance,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
  }
}

function mapItem(row: RawItemRow): OptionItem {
  return {
    id:               row.id,
    groupId:          row.group_id,
    itineraryId:      row.itinerary_id,
    name:             row.name,
    description:      row.description ?? undefined,
    clientPrice:      Number(row.client_price),
    currency:         row.currency,
    priceAdjustment:  Number(row.price_adjustment),
    recommended:      row.recommended,
    defaultSelected:  row.default_selected,
    clientSelectable: row.client_selectable,
    active:           row.active,
    sortOrder:        row.sort_order,
    imageUrl:         row.image_url ?? undefined,
    quoteExpiresAt:   row.quote_expires_at ?? undefined,
    supplierCost:     row.supplier_cost != null ? Number(row.supplier_cost) : null,
    internalMargin:   row.internal_margin != null ? Number(row.internal_margin) : null,
    sourceType:       (row.source_type as OptionSourceType | null) ?? null,
    sourceBookingRef: row.source_booking_ref,
    metadata:         row.metadata,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  }
}

// ─── POST /api/itinerary/[ref]/accept-v2 ──────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const { ref } = await params
  const body = await req.json().catch(() => ({})) as AcceptV2Body

  // ── 1. Basic request validation ───────────────────────────────────────────

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

  if (!Array.isArray(body.selections)) {
    return NextResponse.json({ error: 'selections must be an array' }, { status: 400 })
  }
  const selections: ClientSelectionPayload[] = (body.selections as unknown[])
    .filter(
      (s): s is ClientSelectionPayload =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as Record<string, unknown>).groupId === 'string' &&
        Array.isArray((s as Record<string, unknown>).itemIds),
    )
    .map(s => ({
      groupId: (s as ClientSelectionPayload).groupId,
      itemIds: ((s as ClientSelectionPayload).itemIds as unknown[]).filter(
        (id): id is string => typeof id === 'string',
      ),
    }))

  // ── 2. Locate itinerary ───────────────────────────────────────────────────

  const itin = await prisma.itinerary.findUnique({ where: { referenceNumber: ref } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── 3. Already-approved early check ──────────────────────────────────────
  // No idempotent replay for V2 — return 409 if already accepted.

  if (itin.status === 'approved') {
    return NextResponse.json({ error: 'Already accepted' }, { status: 409 })
  }

  // ── 4. Status eligibility ─────────────────────────────────────────────────

  if (itin.status !== 'proposal') {
    return NextResponse.json(
      { error: 'This proposal is not in a state that can be accepted.' },
      { status: 409 },
    )
  }

  // ── 5. Token validation (pre-lock) ────────────────────────────────────────

  const opts        = parseOptions(itin.options)
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
    console.warn('[accept-v2] Invalid token attempt', { ref, prefix: token.slice(0, 8) })
    return NextResponse.json({ error: 'Invalid or expired approval link' }, { status: 403 })
  }
  if (tokenUsed) {
    console.error('[accept-v2] Token used but status not approved — inconsistent state', { ref })
    return NextResponse.json({ error: 'This approval link has already been used' }, { status: 409 })
  }
  if (expiresAt && new Date(expiresAt) < new Date()) {
    console.info('[accept-v2] Token expired', { ref })
    return NextResponse.json(
      { error: 'This approval link has expired. Please contact your travel advisor for a new link.' },
      { status: 410 },
    )
  }

  // ── 6. Fetch V1 package options (for proposal hash verification) ──────────

  const sb = getSupabaseAdmin()

  const { data: pkgRows } = await sb
    .from('itinerary_package_options')
    .select('id, name, description, price, currency, features, sort_order')
    .eq('itinerary_id', itin.id)
    .order('sort_order')
  const allPkgOptions = (pkgRows ?? []) as (PackageOptionRow & { id: string })[]

  // ── 7. Proposal hash validation ───────────────────────────────────────────

  const storedHash = getStoredProposalHash(itin.options)
  const hashResult = validateSentProposalState(itin, allPkgOptions, storedHash)

  if (hashResult.result === 'STALE') {
    console.info('[accept-v2] Stale proposal — advisor edited after send', { ref })
    return NextResponse.json(
      {
        error:
          'This proposal has been updated since it was sent to you. ' +
          'Please contact your travel advisor to receive the latest version.',
      },
      { status: 409 },
    )
  }
  const legacyNoHash = hashResult.result === 'NO_HASH_LEGACY'
  if (legacyNoHash) {
    console.warn('[accept-v2] LEGACY_NO_HASH — proceeding without hash verification', { ref })
  }

  // ── 8. Load V2 option groups and items from Supabase ─────────────────────

  // H-8: Filter at DB level — inactive/hidden groups and items never reach validation.
  // validateClientSelections is a second layer, not the first line of defence.
  const [{ data: groupRows }, { data: itemRows }] = await Promise.all([
    sb
      .from('itinerary_option_groups')
      .select(
        'id, itinerary_id, name, description, category, selection_mode, pricing_mode, ' +
        'required, min_selections, max_selections, sort_order, active, client_visible, ' +
        'locked_after_acceptance, created_at, updated_at',
      )
      .eq('itinerary_id', itin.id)
      .eq('active', true)
      .eq('client_visible', true),
    sb
      .from('itinerary_option_items')
      .select(
        'id, group_id, itinerary_id, name, description, client_price, currency, ' +
        'price_adjustment, recommended, default_selected, client_selectable, active, ' +
        'sort_order, image_url, quote_expires_at, supplier_cost, internal_margin, ' +
        'source_type, source_booking_ref, metadata, created_at, updated_at',
      )
      .eq('itinerary_id', itin.id)
      .eq('active', true),
  ])

  const optionGroups: OptionGroup[] = (groupRows ?? []).map(r => mapGroup(r as unknown as RawGroupRow))
  const optionItems: OptionItem[]   = (itemRows ?? []).map(r => mapItem(r as unknown as RawItemRow))

  // ── 9. Validate client selections ─────────────────────────────────────────

  const validationResult = validateClientSelections(
    selections,
    optionGroups,
    optionItems,
    itin.id,
    itin.currency,
  )

  if (!validationResult.valid) {
    return NextResponse.json({ errors: validationResult.errors }, { status: 422 })
  }

  // ── 10. Build proposal hash for snapshot ──────────────────────────────────

  const hashPayload  = buildProposalHashPayload(itin, allPkgOptions)
  const currentHash  = hashProposalState(hashPayload)
  const proposalHash = legacyNoHash ? '' : currentHash

  // ── 11. Build preliminary snapshot (acceptedAt overwritten in tx) ─────────

  const snapshot = buildAcceptanceSnapshotV2({
    acceptedBy,
    proposalHash,
    currency:      itin.currency,
    baseTotal:     itin.totalPrice ?? 0,
    deposit:       itin.deposit ?? null,
    termsAccepted: true,
    payload:       selections,
    groups:        optionGroups,
    items:         optionItems,
  })

  // ── 12. Atomic Prisma transaction with SELECT FOR UPDATE ──────────────────
  //   A concurrent request blocks at the SELECT until this tx commits.
  //   Post-commit the loser reads approvalTokenUsed:true and returns 409.

  type LockedRow = { id: string; status: string; options: string; selectedOption: string | null }
  type TxResult  = { winner: true } | { winner: false }

  let txResult: TxResult

  try {
    txResult = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT id, status, options, "selectedOption"
        FROM "Itinerary"
        WHERE id = ${itin.id}
        FOR UPDATE
      `
      const locked = rows[0]
      if (!locked) throw new Error('NOT_FOUND')

      const lockedOpts = parseOptions(locked.options)

      // Re-check after acquiring the lock — another thread may have won
      if (lockedOpts.approvalTokenUsed === true || locked.status === 'approved') {
        return { winner: false } satisfies TxResult
      }

      // Re-check status inside the lock (could have changed between reads)
      if (locked.status !== 'proposal') {
        throw Object.assign(new Error('INELIGIBLE_STATUS'), { statusValue: locked.status })
      }

      // Winning request: set the authoritative acceptedAt timestamp
      const now = new Date()
      snapshot.acceptedAt = now.toISOString()

      await tx.itinerary.update({
        where: { id: itin.id },
        data: {
          status:         'approved',
          approvedAt:     now,
          approvedBy:     acceptedBy,
          selectedOption: JSON.stringify(snapshot),
          options:        patchOptions(locked.options, { approvalTokenUsed: true }),
          updatedAt:      now,
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
        { status: 409 },
      )
    }
    console.error('[accept-v2] Transaction error', err)
    return NextResponse.json(
      { error: 'Acceptance could not be completed. Please try again.' },
      { status: 500 },
    )
  }

  // ── 13. Loser path: concurrent race ──────────────────────────────────────

  if (!txResult.winner) {
    console.info('[accept-v2] Concurrent race loser — already accepted', { ref })
    return NextResponse.json({ error: 'Already accepted' }, { status: 409 })
  }

  // ── 14. Winner: success response ──────────────────────────────────────────
  // Return only the safe subset — no supplierCost, internalMargin, or internal fields.

  console.info('[accept-v2] Acceptance recorded', {
    ref,
    legacyNoHash,
    acceptedTotal: snapshot.acceptedTotal,
    groupCount:    snapshot.selectedGroups.length,
  })

  // ── 15. Post-acceptance notifications (non-fatal) ─────────────────────────
  try {
    const resend = getResend()
    const BASE   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://walztravels.com'
    const sym    = getCurrencySymbol(snapshot.currency)

    const groupsHtml = snapshot.selectedGroups
      .map(g => `<p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>${esc(g.groupName)}:</strong> ${g.selectedItems.map(i => esc(i.name)).join(', ')}</p>`)
      .join('')

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
              Thank you for confirming your <strong>${esc(itin.destination ?? 'trip')}</strong> itinerary
              (${itin.referenceNumber}).
            </p>
            <div style="background:#f8fafc;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Trip:</strong> ${esc(itin.title)}</p>
              <p style="margin:0 0 6px;font-size:14px;color:#475569;"><strong>Reference:</strong> ${itin.referenceNumber}</p>
              ${groupsHtml}
              <p style="margin:0 0 6px;font-size:14px;color:#0B1F3A;font-weight:600;"><strong>Total:</strong> ${sym}${Number(snapshot.acceptedTotal).toLocaleString()}</p>
              ${snapshot.deposit != null ? `<p style="margin:0;font-size:14px;color:#C9A84C;font-weight:600;">Deposit of ${sym}${Number(snapshot.deposit).toLocaleString()} required to secure your booking.</p>` : ''}
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
      subject: `✅ Proposal accepted — ${itin.referenceNumber} (${acceptedBy})`,
      html:    `<p><strong>${esc(acceptedBy)}</strong> accepted proposal <strong>${itin.referenceNumber}</strong> for ${esc(itin.destination ?? '')}.</p>
               <p>Accepted at: ${new Date(snapshot.acceptedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</p>
               <p>Total: ${snapshot.currency} ${Number(snapshot.acceptedTotal).toLocaleString()}</p>
               ${snapshot.selectedGroups.length > 0 ? `<p>Selections: ${snapshot.selectedGroups.map(g => `${esc(g.groupName)}: ${g.selectedItems.map(i => esc(i.name)).join(', ')}`).join(' | ')}</p>` : ''}
               ${legacyNoHash ? '<p>⚠️ LEGACY_NO_HASH: accepted without hash verification</p>' : ''}
               <p><a href="${BASE}/admin/itinerary-planner/${itin.id}">Open in admin →</a></p>`,
    })

  } catch { /* non-fatal */ }

  return NextResponse.json({
    accepted: true,
    snapshot: {
      acceptedTotal: snapshot.acceptedTotal,
      currency:      snapshot.currency,
      deposit:       snapshot.deposit,
    },
  })
}
