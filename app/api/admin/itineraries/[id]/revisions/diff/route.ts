/**
 * GET /api/admin/itineraries/[id]/revisions/diff
 *
 * Returns a change summary comparing the original accepted state (from the
 * most recent itinerary_acceptance_history row) against the current mutable
 * itinerary state.
 *
 * Includes:
 *   - pricing diff (original vs revised total)
 *   - payment reconciliation (payments received, outstanding balance)
 *   - flight changes (added / removed)
 *   - hotel changes (added / removed)
 *   - fulfilment impact (confirmed/booked items that may be affected)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseOptions } from '@/lib/itinerary-options'
import {
  buildRevisionDiff,
  computePaymentsReceived,
  type ContentSnapshot,
  type PaymentSummaryRow,
} from '@/lib/v2/revision'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const DIFF_ELIGIBLE = ['revision_draft', 'revision_sent']
  if (!DIFF_ELIGIBLE.includes(itin.status)) {
    return NextResponse.json(
      { error: `Diff only available for revision_draft or revision_sent. Current: ${itin.status}` },
      { status: 409 },
    )
  }

  const opts       = parseOptions(itin.options) as Record<string, unknown>
  const revNum     = typeof opts.revisionNumber === 'number' ? opts.revisionNumber : 1
  const prevRevNum = revNum - 1

  const safeParseArray = (json: string): unknown[] => {
    try { const v = JSON.parse(json); return Array.isArray(v) ? v : [] } catch { return [] }
  }

  let sb: ReturnType<typeof getSupabaseAdmin>
  try { sb = getSupabaseAdmin() } catch {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // ── Load original accepted content snapshot from history ──────────────────
  let originalContentSnapshot: ContentSnapshot | null = null
  try {
    const { data: histRow } = await sb
      .from('itinerary_acceptance_history')
      .select('content_snapshot, accepted_total, currency')
      .eq('itinerary_id', id)
      .eq('revision_number', prevRevNum)
      .single()

    if (histRow?.content_snapshot) {
      const cs = histRow.content_snapshot as ContentSnapshot
      // Use accepted_total from the DB column as financial authority — it is set from
      // the immutable AcceptanceSnapshot at revision-creation time, not from the mutable
      // itin.totalPrice field that content_snapshot.totalPrice was captured from.
      originalContentSnapshot = {
        ...cs,
        totalPrice: histRow.accepted_total != null ? Number(histRow.accepted_total) : cs.totalPrice,
      }
    }
  } catch { /* table may not exist yet */ }

  // Fallback: use the current selectedOption snapshot total + live content
  // (occurs if history table isn't created yet or row not found)
  if (!originalContentSnapshot && itin.selectedOption) {
    try {
      const snap = JSON.parse(itin.selectedOption) as Record<string, unknown>
      originalContentSnapshot = {
        flights:    safeParseArray(itin.flights),
        hotels:     safeParseArray(itin.hotels),
        days:       [],
        inclusions: [],
        exclusions: [],
        totalPrice: (snap.acceptedTotal as number | null) ?? itin.totalPrice,
      }
    } catch { /* no snapshot */ }
  }

  if (!originalContentSnapshot) {
    return NextResponse.json(
      { error: 'No acceptance history found to diff against.' },
      { status: 404 },
    )
  }

  // ── Load payments received ────────────────────────────────────────────────
  let payments: PaymentSummaryRow[] = []
  try {
    const { data: payRows } = await sb
      .from('itinerary_payments')
      .select('amount, currency, status')
      .eq('itinerary_id', id)

    if (payRows) {
      payments = payRows.map(r => ({
        amount:   Number(r.amount),
        currency: r.currency as string,
        status:   r.status as string,
      }))
    }
  } catch { /* payments table may be empty */ }

  const paymentsReceived = computePaymentsReceived(payments, itin.currency)

  // ── Load confirmed/booked fulfilment items ────────────────────────────────
  type FulfilmentRow = { id: string; type: string; description: string | null; status: string }
  let confirmedFulfilmentItems: FulfilmentRow[] = []
  try {
    const { data: fulRows } = await sb
      .from('itinerary_fulfilment_items')
      .select('id, type, description, status')
      .eq('itinerary_id', id)
      .in('status', ['BOOKED', 'CONFIRMED'])

    if (fulRows) {
      confirmedFulfilmentItems = fulRows.map(r => ({
        id:          r.id as string,
        type:        r.type as string,
        description: r.description as string | null,
        status:      r.status as string,
      }))
    }
  } catch { /* table may not exist */ }

  // ── Build diff ────────────────────────────────────────────────────────────
  const diff = buildRevisionDiff({
    revisionNumber:           revNum,
    originalSnapshot:         originalContentSnapshot,
    currentFlights:           safeParseArray(itin.flights),
    currentHotels:            safeParseArray(itin.hotels),
    currentTotalPrice:        itin.totalPrice,
    currency:                 itin.currency,
    paymentsReceived,
    confirmedFulfilmentItems,
  })

  return NextResponse.json({
    itineraryId:    id,
    referenceNumber: itin.referenceNumber,
    currency:        itin.currency,
    diff,
  })
}
