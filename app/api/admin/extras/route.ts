import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { DEFAULT_EXTRAS, type FlightExtra } from '@/lib/flights/extras'
import { getAdminSession } from '@/lib/admin-auth'
import type { FlightExtra as DbRow } from '@prisma/client'

export const dynamic = 'force-dynamic'

function rowToExtra(row: DbRow): FlightExtra {
  return {
    id:          row.id,
    name:        row.name,
    category:    row.category,
    description: row.description ?? '',
    price:       Number(row.price ?? 0),
    currency:    row.currency,
    photoUrl:    row.photoUrl ?? '',
    enabled:     row.enabled,
    popular:     row.popular,
    perPerson:   row.perPerson,
    livePriced:  row.livePriced,
    sortOrder:   row.sortOrder,
  }
}

export async function GET() {
  try {
    const rows = await prisma.flightExtra.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ extras: rows.map(rowToExtra) })
  } catch (err) {
    console.error('[extras] DB read failed, falling back to defaults:', err)
    return NextResponse.json({ extras: DEFAULT_EXTRAS })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, ...updates } = body as { id: string } & Partial<Omit<FlightExtra, 'id'>>
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const data: Record<string, unknown> = {}
    if (updates.name        !== undefined) data.name        = updates.name
    if (updates.category    !== undefined) data.category    = updates.category
    if (updates.description !== undefined) data.description = updates.description
    if (updates.price       !== undefined) data.price       = updates.price
    if (updates.currency    !== undefined) data.currency    = updates.currency
    if (updates.photoUrl    !== undefined) data.photoUrl    = updates.photoUrl
    if (updates.enabled     !== undefined) data.enabled     = updates.enabled
    if (updates.popular     !== undefined) data.popular     = updates.popular
    if (updates.perPerson   !== undefined) data.perPerson   = updates.perPerson
    if (updates.sortOrder   !== undefined) data.sortOrder   = updates.sortOrder

    const row = await prisma.flightExtra.update({ where: { id }, data })
    return NextResponse.json({ ok: true, extra: rowToExtra(row) })
  } catch (err) {
    console.error('[extras] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
