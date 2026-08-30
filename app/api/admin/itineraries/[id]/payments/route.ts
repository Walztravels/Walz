// GET  /api/admin/itineraries/[id]/payments — payment summary for an itinerary
// POST /api/admin/itineraries/[id]/payments — record a manual payment (bank transfer, etc.)
//
// Security: admin session required. Never mutates AcceptanceSnapshot.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { parseOptions } from '@/lib/itinerary-options'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

interface PaymentRow {
  id: string
  amount: number
  currency: string
  type: string
  method: string
  status: string
  provider_reference: string | null
  paid_at: string | null
  notes: string | null
  recorded_by: string | null
}

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

// GET: return payment summary (acceptedTotal, paidTotal, outstanding, transactions)
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({
    where: { id },
    select: { id: true, referenceNumber: true, selectedOption: true, currency: true, status: true },
  }).catch(() => null)

  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const snap = safeParse<{ acceptedTotal?: number; deposit?: number; currency?: string }>(
    itin.selectedOption, {}
  )

  const acceptedTotal = snap.acceptedTotal ?? null
  const deposit       = snap.deposit ?? null
  const currency      = snap.currency ?? itin.currency ?? 'GBP'

  let payments: PaymentRow[] = []
  let paidTotal = 0

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('itinerary_payments')
      .select('id, amount, currency, type, method, status, provider_reference, paid_at, notes, recorded_by')
      .eq('itinerary_id', itin.referenceNumber)
      .order('paid_at', { ascending: false })

    if (!error && data) {
      payments = (data as PaymentRow[]).map(r => ({
        id:                 r.id,
        amount:             Number(r.amount),
        currency:           r.currency,
        type:               r.type,
        method:             r.method,
        status:             r.status,
        provider_reference: r.provider_reference,
        paid_at:            r.paid_at,
        notes:              r.notes,
        recorded_by:        r.recorded_by,
      }))
      paidTotal = payments.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
    }
  } catch { /* Supabase not configured */ }

  return NextResponse.json({
    referenceNumber: itin.referenceNumber,
    itineraryStatus: itin.status,
    currency,
    acceptedTotal,
    deposit,
    paidTotal,
    outstanding: acceptedTotal != null ? Math.max(0, acceptedTotal - paidTotal) : null,
    transactions: payments,
  })
}

// POST: record a manual / bank-transfer payment — requires admin authentication
// Body: { type, method, amount, currency, notes, status? }
// The amount here is advisory — it is recorded as supplied by the admin staff member.
// AcceptanceSnapshot is never mutated.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({
    where: { id },
    select: { id: true, referenceNumber: true, selectedOption: true, currency: true, status: true, options: true },
  }).catch(() => null)

  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (itin.status !== 'approved' && itin.status !== 'revision_accepted') {
    return NextResponse.json(
      { error: `Payments can only be recorded for accepted itineraries (current: ${itin.status})` },
      { status: 409 },
    )
  }

  let body: {
    type?: unknown; method?: unknown; amount?: unknown; currency?: unknown
    notes?: unknown; status?: unknown; providerReference?: unknown
  }
  try { body = await req.json() as typeof body } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const VALID_TYPES   = ['DEPOSIT', 'BALANCE', 'FULL', 'MANUAL']
  const VALID_METHODS = ['BANK_TRANSFER', 'MANUAL', 'STRIPE', 'PAYSTACK']
  const VALID_STATUSES = ['PAID', 'PENDING']

  const type     = typeof body.type   === 'string' ? body.type.toUpperCase()   : null
  const method   = typeof body.method === 'string' ? body.method.toUpperCase() : null
  const amount   = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? ''))

  // AcceptanceSnapshot currency is authoritative — never allow the client to dictate currency
  const snapCurrency = (safeParse<{ currency?: string }>(itin.selectedOption, {}).currency ?? itin.currency ?? 'GBP').toUpperCase()
  if (typeof body.currency === 'string' && body.currency.toUpperCase() !== snapCurrency) {
    return NextResponse.json(
      { error: `Payment must be recorded in ${snapCurrency} (the accepted total currency). Cannot record in ${body.currency.toUpperCase()}.` },
      { status: 422 },
    )
  }
  const currency = snapCurrency

  const notes             = typeof body.notes             === 'string' ? body.notes.slice(0, 500) : ''
  const providerReference = typeof body.providerReference === 'string' ? body.providerReference.trim() : null
  const status   = typeof body.status === 'string' && VALID_STATUSES.includes(body.status.toUpperCase())
    ? body.status.toUpperCase()
    : 'PAID'

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  if (!method || !VALID_METHODS.includes(method)) {
    return NextResponse.json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` }, { status: 400 })
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }
  if (method === 'PAYSTACK' && !providerReference) {
    return NextResponse.json({ error: 'providerReference is required for Paystack (offline) payments — enter the Paystack transaction reference' }, { status: 400 })
  }

  const snap = safeParse<{ acceptedTotal?: number }>(itin.selectedOption, {})

  // Authoritative cumulative overpayment guard:
  // Re-query current PAID total and reject if newAmount would exceed acceptedTotal.
  // A single-record check (amount > acceptedTotal) is insufficient — multiple records
  // can accumulate beyond the total without triggering it.
  if (snap.acceptedTotal != null) {
    let currentPaidTotal = 0
    try {
      const sb2 = getSupabaseAdmin()
      const { data: paidRows } = await sb2
        .from('itinerary_payments')
        .select('amount')
        .eq('itinerary_id', itin.referenceNumber)
        .eq('status', 'PAID')
      if (paidRows) {
        currentPaidTotal = (paidRows as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0)
      }
    } catch { /* non-fatal — conservative: proceed without check if Supabase unavailable */ }

    if (status === 'PAID' && currentPaidTotal + amount > snap.acceptedTotal) {
      return NextResponse.json(
        {
          error: `Recording this payment (${amount}) would exceed the accepted total (${snap.acceptedTotal}). ` +
                 `Already paid: ${currentPaidTotal}. Outstanding: ${Math.max(0, snap.acceptedTotal - currentPaidTotal)}.`,
        },
        { status: 422 },
      )
    }
  }

  try {
    const sb      = getSupabaseAdmin()
    const staffId = session.email ?? session.name ?? 'admin'

    const autoRef    = `MANUAL-${itin.referenceNumber}-${Date.now()}`
    const resolvedRef = providerReference ?? autoRef

    const { data, error } = await sb
      .from('itinerary_payments')
      .insert({
        itinerary_id:       itin.referenceNumber,
        acceptance_version: 2,
        amount,
        currency,
        type,
        method,
        status,
        provider_reference: resolvedRef,
        paid_at:            status === 'PAID' ? new Date().toISOString() : null,
        notes:              `${notes ? notes + ' · ' : ''}Recorded by ${staffId}`,
        recorded_by:        String(staffId),
      })
      .select()
      .single()

    if (error) {
      console.error('[admin/payments] Supabase insert error:', error)
      const safeMsg = error.code === 'PGRST205'
        ? 'Payment table not found — the itinerary_payments table must be created in Supabase. Contact your system administrator.'
        : (error.message ?? 'Failed to record payment')
      return NextResponse.json({ error: safeMsg }, { status: 500 })
    }

    return NextResponse.json({ recorded: true, payment: data })
  } catch (err) {
    console.error('[admin/payments] Unexpected error:', err)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }
}

// PATCH: promote a PENDING payment record to PAID — used for bank transfer confirmation.
// Promotes the SAME row rather than creating a duplicate PAID transaction.
// Body: { paymentId: string, notes?: string }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const itin = await prisma.itinerary.findUnique({
    where: { id },
    select: { id: true, referenceNumber: true, selectedOption: true, status: true },
  }).catch(() => null)

  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (itin.status !== 'approved' && itin.status !== 'revision_accepted') {
    return NextResponse.json({ error: 'Itinerary is not in an accepted state' }, { status: 409 })
  }

  let body: { paymentId?: unknown; notes?: unknown }
  try { body = await req.json() as typeof body } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : null
  const notes     = typeof body.notes     === 'string' ? body.notes.slice(0, 500) : ''

  if (!paymentId) {
    return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
  }

  try {
    const sb = getSupabaseAdmin()

    // Load the specific payment record and verify it belongs to this itinerary
    const { data: record, error: readErr } = await sb
      .from('itinerary_payments')
      .select('id, status, amount, itinerary_id')
      .eq('id', paymentId)
      .eq('itinerary_id', itin.referenceNumber)
      .single()

    if (readErr || !record) {
      return NextResponse.json({ error: 'Payment record not found for this itinerary' }, { status: 404 })
    }

    const row = record as { id: string; status: string; amount: number; itinerary_id: string }

    if (row.status === 'PAID') {
      return NextResponse.json({ error: 'Payment record is already marked as PAID' }, { status: 409 })
    }
    if (row.status !== 'PENDING') {
      return NextResponse.json({ error: `Can only promote PENDING records to PAID (current: ${row.status})` }, { status: 409 })
    }

    // Cumulative overpayment guard before promoting
    const snap2 = safeParse<{ acceptedTotal?: number }>(itin.selectedOption, {})
    if (snap2.acceptedTotal != null) {
      const { data: paidRows } = await sb
        .from('itinerary_payments')
        .select('amount')
        .eq('itinerary_id', itin.referenceNumber)
        .eq('status', 'PAID')
      const currentPaidTotal = paidRows
        ? (paidRows as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0)
        : 0
      if (currentPaidTotal + Number(row.amount) > snap2.acceptedTotal) {
        return NextResponse.json(
          {
            error: `Promoting this record would exceed the accepted total (${snap2.acceptedTotal}). ` +
                   `Already paid: ${currentPaidTotal}. This record amount: ${row.amount}.`,
          },
          { status: 422 },
        )
      }
    }

    const staffId = session.email ?? session.name ?? 'admin'
    const now     = new Date().toISOString()

    const { data: updated, error: updateErr } = await sb
      .from('itinerary_payments')
      .update({
        status:      'PAID',
        paid_at:     now,
        notes:       notes ? `${notes} · Confirmed by ${staffId}` : `Bank transfer confirmed by ${staffId}`,
        recorded_by: String(staffId),
      })
      .eq('id', paymentId)
      .select()
      .single()

    if (updateErr) {
      console.error('[admin/payments PATCH] Supabase update error:', updateErr)
      return NextResponse.json({ error: 'Failed to update payment record' }, { status: 500 })
    }

    return NextResponse.json({ confirmed: true, payment: updated })
  } catch (err) {
    console.error('[admin/payments PATCH] Unexpected error:', err)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }
}
