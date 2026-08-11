import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'

// GET /api/admin/itineraries/[id]/margin
// Reads per-item cost vs price from normalized booking tables.
// Falls back to reading directly from the JSON blobs so it works
// even before the Phase 3 SQL migration has been run.

type MarginRow = {
  category: string
  description: string
  client_price: number | null
  supplier_cost: number | null
}

type AnyItem = Record<string, unknown>

function safe<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try { return JSON.parse(json) as T } catch { return fallback }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id } = await params

  // Try normalized tables first (via itinerary_margin_summary view)
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from('itinerary_margin_summary')
      .select('category, description, client_price, supplier_cost')
      .eq('itinerary_id', id)

    if (!error && data && data.length > 0) {
      return NextResponse.json({ rows: data as MarginRow[], source: 'normalized' })
    }
  } catch { /* fall through to blob fallback */ }

  // Fallback: read JSON blobs from Prisma
  const itin = await prisma.itinerary.findUnique({ where: { id } })
  if (!itin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rows: MarginRow[] = []

  const pushItems = (category: string, items: AnyItem[], descKey: string) => {
    for (const item of items) {
      const cp = item.cost         != null ? Number(item.cost)         : null
      const sc = item.supplierCost != null ? Number(item.supplierCost) : null
      if (cp != null || sc != null) {
        rows.push({ category, description: String(item[descKey] ?? ''), client_price: cp, supplier_cost: sc })
      }
    }
  }

  pushItems('flight',   safe<AnyItem[]>(itin.flights,             []), 'airline')
  pushItems('hotel',    safe<AnyItem[]>(itin.hotels,              []), 'name')
  pushItems('transfer', safe<AnyItem[]>(itin.transfers ?? null,   []), 'type')
  pushItems('tour',     safe<AnyItem[]>(itin.tours     ?? null,   []), 'name')
  pushItems('train',    safe<AnyItem[]>(itin.trains    ?? null,   []), 'trainNumber')
  pushItems('ferry',    safe<AnyItem[]>(itin.ferries   ?? null,   []), 'operator')

  return NextResponse.json({ rows, source: 'blobs' })
}
