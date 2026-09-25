// POST /api/admin/itineraries/[id]/research-add
// Adds a Research result (Duffel flight offer or Hotelbeds rate) to an
// itinerary. PERSIST ONLY — never books with a supplier. The browser supplies
// identifiers only; every price/segment/room/cancellation detail is re-fetched
// from the supplier here.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { addOfferToItinerary } from '@/lib/itinerary/add-offer'

export const dynamic = 'force-dynamic'

function err(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return err(401, 'Unauthorized')
  // Itinerary Planner is gated by the 'bookings' section permission (sidebar).
  if (!hasPermission(session, 'bookings')) return err(403, 'Forbidden')

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return err(400, 'Invalid JSON body')
  }

  // Shared core (also used by Jade Copilot → Add): one build + one write path.
  const r = await addOfferToItinerary({
    itineraryId: id,
    session,
    payload: body,
    allowDuplicate: body.allowDuplicate === true,
    source: 'research',
    cookie: req.headers.get('cookie') ?? '',
  })
  return NextResponse.json(r.body, { status: r.status })
}
