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
import type { FulfilmentStatus, FulfilmentItemType } from '@/lib/v2/types'

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

  // Map snake_case → camelCase
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

  // Required fields
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

  const { data, error: dbErr } = await supabase!
    .from('itinerary_fulfilment_items')
    .insert({
      itinerary_id,
      type:               body.type,
      description:        body.description.trim(),
      status,
      supplier_reference: body.supplierReference?.trim() || null,
      client_reference:   body.clientReference?.trim() || null,
      assigned_to:        body.assignedTo?.trim() || null,
      notes:              body.notes?.trim() || null,
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

  const { itemId, ...rest } = body
  if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })

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

  const allowed = [
    'type', 'description', 'status', 'supplierReference',
    'clientReference', 'assignedTo', 'notes', 'completedAt',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) {
      // camelCase → snake_case mapping
      const col = key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
      updates[col] = rest[key]
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

  // FAILED item alert — notify the admin who flagged this so it appears in their notification bell (non-fatal)
  if (rest.status === 'FAILED') {
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
    } catch { /* non-fatal */ }
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
