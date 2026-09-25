import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getAdminSession } from '@/lib/admin-auth'
import { buildBlobMarginRows, type MarginRow } from '@/lib/itinerary/client-booking-dto'

// GET /api/admin/itineraries/[id]/margin
// Reads per-item cost vs price from normalized booking tables.
// Falls back to reading directly from the JSON blobs so it works
// even before the Phase 3 SQL migration has been run.


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

  // One margin row per booking row; a unified flight's booking-level cost /
  // supplierCost is counted ONCE (journeys never contribute).
  const rows: MarginRow[] = buildBlobMarginRows([
    { category: 'flight',   items: safe<AnyItem[]>(itin.flights,             []), descKey: 'airline' },
    { category: 'hotel',    items: safe<AnyItem[]>(itin.hotels,              []), descKey: 'name' },
    { category: 'transfer', items: safe<AnyItem[]>(itin.transfers ?? null,   []), descKey: 'type' },
    { category: 'tour',     items: safe<AnyItem[]>(itin.tours     ?? null,   []), descKey: 'name' },
    { category: 'train',    items: safe<AnyItem[]>(itin.trains    ?? null,   []), descKey: 'trainNumber' },
    { category: 'ferry',    items: safe<AnyItem[]>(itin.ferries   ?? null,   []), descKey: 'operator' },
  ])

  return NextResponse.json({ rows, source: 'blobs' })
}
