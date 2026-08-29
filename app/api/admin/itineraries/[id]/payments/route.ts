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
    notes?: unknown; status?: unknown
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
  const currency = typeof body.currency === 'string' ? body.currency.toUpperCase()
    : (safeParse<{ currency?: string }>(itin.selectedOption, {}).currency ?? itin.currency ?? 'GBP').toUpperCase()
  const notes    = typeof body.notes  === 'string' ? body.notes.slice(0, 500) : ''
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

  const snap = safeParse<{ acceptedTotal?: number }>(itin.selectedOption, {})
  if (snap.acceptedTotal != null && amount > snap.acceptedTotal * 1.01) {
    return NextResponse.json(
      { error: `Amount ${amount} exceeds accepted total ${snap.acceptedTotal} — overpayment rejected` },
      { status: 422 },
    )
  }

  try {
    const sb = getSupabaseAdmin()
    const providerRef = `MANUAL-${itin.referenceNumber}-${Date.now()}`
    const staffId = session.email ?? session.name ?? 'admin'

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
        provider_reference: providerRef,
        paid_at:            status === 'PAID' ? new Date().toISOString() : null,
        notes:              `${notes ? notes + ' · ' : ''}Recorded by ${staffId}`,
        recorded_by:        String(staffId),
      })
      .select()
      .single()

    if (error) {
      console.error('[admin/payments] Supabase insert error:', error)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    return NextResponse.json({ recorded: true, payment: data })
  } catch (err) {
    console.error('[admin/payments] Unexpected error:', err)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }
}
