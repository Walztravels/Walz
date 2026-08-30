// app/api/admin/itineraries/[id]/fulfilment/route.ts
//
// CRUD for itinerary_fulfilment_items — admin-only.
// After acceptance/payment, advisors create work items tracking what needs
// to be booked with suppliers (flights, hotels, transfers, etc.).
//
// Note: supplier_reference (PNR, hotel confirmation, etc.) is recorded HERE
// after a genuine booking is made — it never appears on the public proposal.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/db'
import { createStaffNotification } from '@/lib/notifications/staff'
import { sendTripConfirmedEmail } from '@/lib/email-trip-confirmed'
import type { FulfilmentStatus, FulfilmentItemType } from '@/lib/v2/types'

function safeParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

// writeAudit returns the Supabase error so callers can inspect the code.
// 42P01 = table doesn't exist (migration not run yet) — callers treat as non-fatal.
// 23505 = unique violation — used by email concurrency guard to skip duplicate send.
async function writeAudit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  entry: {
    itinerary_id: string; item_id: string; staff_id: string; event: string
    old_status?: string; new_status?: string; old_ref?: string; new_ref?: string; note?: string
  },
): Promise<{ code: string } | null> {
  try {
    const { error } = await supabase.from('itinerary_fulfilment_audit').insert({
      itinerary_id: entry.itinerary_id,
      item_id:      entry.item_id,
      staff_id:     entry.staff_id,
      event:        entry.event,
      old_status:   entry.old_status  ?? null,
      new_status:   entry.new_status  ?? null,
      old_ref:      entry.old_ref     ?? null,
      new_ref:      entry.new_ref     ?? null,
      note:         entry.note        ?? null,
    })
    if (error && error.code !== '42P01' && error.code !== '23505') {
      console.error('[fulfilment audit] insert failed:', error.message, error.code)
    }
    return error ? { code: error.code } : null
  } catch {
    return null
  }
}

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const VALID_TYPES: FulfilmentItemType[] = [
  'FLIGHT', 'HOTEL', 'TRANSFER', 'TOUR', 'TRAIN', 'FERRY', 'ESIM', 'OTHER',
]
const VALID_STATUSES: FulfilmentStatus[] = [
  'PENDING', 'IN_PROGRESS', 'BOOKED', 'CONFIRMED', 'FAILED', 'CANCELLED',
]

function getSupabaseOrFail() {
  try {
    return { supabase: getSupabaseAdmin(), error: null }
  } catch {
    return { supabase: null, error: NextResponse.json({ error: 'Supabase not configured' }, { status: 503 }) }
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const { supabase, error } = getSupabaseOrFail()
  if (error) return error

  const { data, error: dbErr } = await supabase!
    .from('itinerary_fulfilment_items')
    .select('*')
    .eq('itinerary_id', itinerary_id)
    .order('created_at', { ascending: true })

  if (dbErr) {
    if (dbErr.code === '42P01') {
      return NextResponse.json(
        { error: 'Run supabase/migrations/v2_additive_tables.sql in the Supabase SQL editor first.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  const items = (data ?? []).map(row => ({
    id:                row.id,
    itineraryId:       row.itinerary_id,
    type:              row.type,
    description:       row.description,
    status:            row.status,
    supplierReference: row.supplier_reference,
    clientReference:   row.client_reference,
    assignedTo:        row.assigned_to,
    notes:             row.notes,
    completedAt:       row.completed_at,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  }))

  return NextResponse.json({ items })
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  if (!body.type || !VALID_TYPES.includes(body.type as FulfilmentItemType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const status: FulfilmentStatus = body.status ?? 'PENDING'
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const { supabase, error } = getSupabaseOrFail()
  if (error) return error

  const description = body.description.trim()

  // ── Duplicate guard ───────────────────────────────────────────────────────────
  // Prevent accidental double-creation of the same booking work item.
  // Active = status != CANCELLED. CANCELLED items are excluded so a cancelled
  // item can be re-created if needed.
  // source_booking_id is not in the current schema; type+description is the
  // idempotency key for manual workflow.
  try {
    const { data: existing } = await supabase!
      .from('itinerary_fulfilment_items')
      .select('id')
      .eq('itinerary_id', itinerary_id)
      .eq('type', body.type)
      .eq('description', description)
      .neq('status', 'CANCELLED')
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error:      'An active fulfilment item with the same type and description already exists.',
          code:       'DUPLICATE_FULFILMENT_ITEM',
          existingId: (existing as { id: string }).id,
        },
        { status: 409 },
      )
    }
  } catch {
    // Duplicate check failed — proceed with insert (non-fatal; DB constraint is last line of defence)
  }

  const { data, error: dbErr } = await supabase!
    .from('itinerary_fulfilment_items')
    .insert({
      itinerary_id,
      type:               body.type,
      description,
      status,
      supplier_reference: body.supplierReference?.trim() || null,
      client_reference:   body.clientReference?.trim()   || null,
      assigned_to:        body.assignedTo?.trim()         || null,
      notes:              body.notes?.trim()              || null,
    })
    .select()
    .single()

  if (dbErr) {
    if (dbErr.code === '42P01') {
      return NextResponse.json(
        { error: 'Run supabase/migrations/v2_additive_tables.sql in the Supabase SQL editor first.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({
    item: {
      id:                data.id,
      itineraryId:       data.itinerary_id,
      type:              data.type,
      description:       data.description,
      status:            data.status,
      supplierReference: data.supplier_reference,
      clientReference:   data.client_reference,
      assignedTo:        data.assigned_to,
      notes:             data.notes,
      completedAt:       data.completed_at,
      createdAt:         data.created_at,
      updatedAt:         data.updated_at,
    },
  }, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const {
    itemId,
    overridePaymentGate = false,
    overrideNote = '',
    ...rest
  } = body as {
    itemId?: unknown
    overridePaymentGate?: unknown
    overrideNote?: unknown
    [key: string]: unknown
  }

  if (!itemId || typeof itemId !== 'string') {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
  }

  if ('status' in rest && !VALID_STATUSES.includes(rest.status as FulfilmentStatus)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }
  if ('type' in rest && !VALID_TYPES.includes(rest.type as FulfilmentItemType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  const { supabase, error } = getSupabaseOrFail()
  if (error) return error

  // ── 1. Fetch current item ─────────────────────────────────────────────────────
  const { data: currentItem } = await supabase!
    .from('itinerary_fulfilment_items')
    .select('id, status, type, description, supplier_reference')
    .eq('id', itemId)
    .eq('itinerary_id', itinerary_id)
    .single()

  if (!currentItem) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const staffId   = session.email ?? session.name ?? 'admin'
  const newStatus = typeof rest.status === 'string' ? rest.status : undefined
  const newRef    = typeof rest.supplierReference === 'string' ? rest.supplierReference : undefined

  // ── 2. Payment gating (PENDING → IN_PROGRESS) ────────────────────────────────
  // FAIL CLOSED: if payment verification cannot be completed, return 503.
  // Admin can bypass with overridePaymentGate + overrideNote — this is always audited.
  if (newStatus === 'IN_PROGRESS' && currentItem.status === 'PENDING') {
    let gateCheckFailed = false
    let paidTotal = 0
    let required  = 0

    try {
      const itin = await prisma.itinerary.findUnique({
        where:  { id: itinerary_id },
        select: { referenceNumber: true, selectedOption: true },
      })
      if (!itin) {
        // Itinerary not found in Prisma — cannot verify payment
        gateCheckFailed = true
      } else {
        const snap = safeParse<{ acceptedTotal?: number; deposit?: number }>(
          itin.selectedOption, {}
        )
        required = snap.deposit ?? snap.acceptedTotal ?? 0

        if (required > 0) {
          const { data: paidRows, error: payErr } = await supabase!
            .from('itinerary_payments')
            .select('amount')
            .eq('itinerary_id', itin.referenceNumber)
            .eq('status', 'PAID')

          if (payErr) {
            // Payment table query failed — cannot verify
            gateCheckFailed = true
          } else {
            paidTotal = (paidRows ?? []).reduce((s, r: { amount: number }) => s + Number(r.amount), 0)
          }
        }
      }
    } catch {
      gateCheckFailed = true
    }

    if (gateCheckFailed) {
      // Payment status unavailable — FAIL CLOSED.
      // Admin override still allowed (audited).
      if (!overridePaymentGate) {
        return NextResponse.json(
          {
            error: 'Unable to verify payment status right now. Please retry or use the admin override if payment is confirmed.',
            code:  'PAYMENT_STATUS_UNAVAILABLE',
            hint:  'Re-submit with overridePaymentGate:true and overrideNote to proceed.',
          },
          { status: 503 },
        )
      }
      await writeAudit(supabase!, {
        itinerary_id, item_id: itemId, staff_id: staffId,
        event:      'PAYMENT_GATE_OVERRIDE',
        old_status: currentItem.status, new_status: 'IN_PROGRESS',
        note: typeof overrideNote === 'string' && overrideNote.trim()
          ? `${overrideNote.trim()} (payment verification unavailable)`
          : 'Admin override — payment verification unavailable',
      })
    } else if (required > 0 && paidTotal < required) {
      // Payment verified — insufficient funds, FAIL CLOSED unless override.
      if (!overridePaymentGate) {
        return NextResponse.json(
          {
            error:    'Payment not yet received. A minimum deposit must be confirmed PAID before booking can begin.',
            code:     'PAYMENT_GATE',
            paidTotal,
            required,
            hint:     'Re-submit with overridePaymentGate:true and overrideNote to proceed as admin override.',
          },
          { status: 402 },
        )
      }
      await writeAudit(supabase!, {
        itinerary_id, item_id: itemId, staff_id: staffId,
        event:      'PAYMENT_GATE_OVERRIDE',
        old_status: currentItem.status, new_status: 'IN_PROGRESS',
        note: typeof overrideNote === 'string' && overrideNote.trim()
          ? overrideNote.trim()
          : 'Admin override — payment gate bypassed',
      })
    }
  }

  // ── 3. Fetch all items before update (for Trip Confirmed state transition) ────
  const { data: allItemsBefore } = await supabase!
    .from('itinerary_fulfilment_items')
    .select('id, status')
    .eq('itinerary_id', itinerary_id)

  // ── 4. Apply update ───────────────────────────────────────────────────────────
  const allowed = [
    'type', 'description', 'status', 'supplierReference',
    'clientReference', 'assignedTo', 'notes', 'completedAt',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) {
      updates[key.replace(/([A-Z])/g, '_$1').toLowerCase()] = rest[key]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error: dbErr } = await supabase!
    .from('itinerary_fulfilment_items')
    .update(updates)
    .eq('id', itemId)
    .eq('itinerary_id', itinerary_id)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ── 5. Audit trail ────────────────────────────────────────────────────────────
  if (newStatus && newStatus !== currentItem.status) {
    await writeAudit(supabase!, {
      itinerary_id, item_id: itemId, staff_id: staffId,
      event: 'STATUS_CHANGED', old_status: currentItem.status, new_status: newStatus,
    })
  }
  if (newRef !== undefined && newRef !== currentItem.supplier_reference) {
    await writeAudit(supabase!, {
      itinerary_id, item_id: itemId, staff_id: staffId,
      event: 'REFERENCE_CHANGED',
      old_ref: currentItem.supplier_reference ?? undefined,
      new_ref: newRef || undefined,
    })
  }

  // ── 6. FAILED item alert ──────────────────────────────────────────────────────
  if (newStatus === 'FAILED') {
    try {
      const itin = await prisma.itinerary.findUnique({
        where:  { id: itinerary_id },
        select: { referenceNumber: true, destination: true },
      })
      await createStaffNotification({
        staffId:    session.id,
        category:   'BOOKING',
        title:      `Fulfilment item FAILED — ${itin?.referenceNumber ?? itinerary_id}`,
        body:       `A ${data.type} item ("${data.description ?? 'untitled'}") was marked FAILED${itin?.destination ? ` for the ${itin.destination} trip` : ''}. Immediate action required.`,
        important:  true,
        sourceId:   `fulfilment-failed:${data.id}`,
        sourceType: 'FULFILMENT_FAILED',
        data:       { itemId: data.id, itineraryId: itinerary_id, type: data.type },
      })
      await writeAudit(supabase!, {
        itinerary_id, item_id: itemId, staff_id: staffId, event: 'FAILED',
      })
    } catch { /* non-fatal */ }
  }

  // ── 7. Trip Confirmed email ───────────────────────────────────────────────────
  // Conditions for firing:
  //   A. The new status is CONFIRMED or BOOKED.
  //   B. Pre-update: not all active items were already terminal (wasDone = false).
  //   C. Post-update: all active items are now terminal (allDone = true).
  //   D. There was at least one pre-existing active item (guards against
  //      all-CANCELLED → one-CONFIRMED edge case where [].every() = true).
  //
  // Concurrency: the email is claimed atomically via INSERT into the audit table.
  // A partial unique index on (itinerary_id) WHERE event='TRIP_CONFIRMED_EMAIL'
  // ensures only one concurrent PATCH wins the INSERT. The loser gets error 23505
  // and skips sending. If the audit table doesn't exist yet (42P01), the email
  // is sent non-atomically (migration pending).
  if (newStatus && ['CONFIRMED', 'BOOKED'].includes(newStatus)) {
    try {
      const items = allItemsBefore ?? []

      // Pre-update active: items not CANCELLED at their old (pre-update) status
      const preActive = items.filter(i => i.status !== 'CANCELLED')
      // Post-update active: items not CANCELLED considering the new status for this item
      const postActive = items.filter(i => {
        const eff = i.id === itemId ? newStatus : i.status
        return eff !== 'CANCELLED'
      })

      const wasDone = preActive.length > 0 &&
        preActive.every(i => ['CONFIRMED', 'BOOKED'].includes(i.status))
      const allDone = postActive.length > 0 &&
        postActive.every(i => ['CONFIRMED', 'BOOKED'].includes(i.id === itemId ? newStatus : i.status))

      // Guard D: require at least one pre-existing active item
      if (allDone && !wasDone && preActive.length > 0) {
        const itinData = await prisma.itinerary.findUnique({
          where:  { id: itinerary_id },
          select: { referenceNumber: true, destination: true, clientEmail: true, clientName: true },
        })

        if (itinData?.clientEmail) {
          // Atomic claim: INSERT the TRIP_CONFIRMED_EMAIL audit record first.
          // If the partial unique index rejects it (23505), another request already
          // claimed email sending — skip.
          const claimErr = await writeAudit(supabase!, {
            itinerary_id, item_id: itemId, staff_id: staffId,
            event: 'TRIP_CONFIRMED_EMAIL',
            note:  `Trip Confirmed email sent to ${itinData.clientEmail}`,
          })

          const claimWon = !claimErr || claimErr.code === '42P01'
          if (claimWon) {
            const { data: confirmedRows } = await supabase!
              .from('itinerary_fulfilment_items')
              .select('type, description, client_reference, supplier_reference')
              .eq('itinerary_id', itinerary_id)
              .in('status', ['CONFIRMED', 'BOOKED'])

            await sendTripConfirmedEmail({
              to:              itinData.clientEmail,
              clientName:      itinData.clientName ?? '',
              referenceNumber: itinData.referenceNumber,
              destination:     itinData.destination ?? undefined,
              confirmedItems:  (confirmedRows ?? []).map(r => ({
                type:              r.type,
                description:       r.description,
                clientReference:   r.client_reference,
                supplierReference: r.supplier_reference,
              })),
            })
          }
          // claimErr.code === '23505': another request won the claim — skip silently
        }
      }
    } catch (emailErr) {
      console.error('[fulfilment PATCH] Trip Confirmed email failed:', emailErr)
    }
  }

  return NextResponse.json({
    item: {
      id:                data.id,
      itineraryId:       data.itinerary_id,
      type:              data.type,
      description:       data.description,
      status:            data.status,
      supplierReference: data.supplier_reference,
      clientReference:   data.client_reference,
      assignedTo:        data.assigned_to,
      notes:             data.notes,
      completedAt:       data.completed_at,
      createdAt:         data.created_at,
      updatedAt:         data.updated_at,
    },
  })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itinerary_id } = await params
  const body = await req.json().catch(() => null)
  const itemId = body?.itemId

  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

  const { supabase, error } = getSupabaseOrFail()
  if (error) return error

  const { error: dbErr } = await supabase!
    .from('itinerary_fulfilment_items')
    .delete()
    .eq('id', itemId)
    .eq('itinerary_id', itinerary_id)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
