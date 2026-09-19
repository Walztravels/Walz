import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { createItineraryRequest, listRecentItineraryRequests } from '@/lib/action-centre/itinerary-request'

export const dynamic = 'force-dynamic'

/**
 * Itinerary Request (INBOX UX-4.4 — Client Action Centre).
 *
 * POST — create (or attach the conversation to an existing) itinerary
 *        intake request for this conversation's server-resolved client.
 *        Auth: getAdminSession -> inbox_view -> checkConversationAccess ->
 *        inbox_assign (same commercial-adjacent bar as Visa Form) -> rate
 *        limit -> service. Just one mutation, so — mirroring Request
 *        Payment's bare-POST shape rather than Visa Form's multi-action
 *        dispatch — there is no `action` discriminator here.
 * GET  — this conversation's recent itinerary requests (safe DTO only).
 *
 * Nothing here ever sends anything to the client; the drawer shares the
 * result through the existing composer send path (Copy/Insert/Send).
 */

function parseConversationId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

async function gate(params: { id: string }) {
  const session = await getAdminSession()
  if (!session) return { fail: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  const authz = checkInboxPermission(session, 'inbox_view')
  if (!authz.allowed) return { fail: NextResponse.json({ error: authz.error }, { status: authz.status }) } as const
  const convId = parseConversationId(params.id)
  if (!convId) return { fail: NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 }) } as const
  const access = await checkConversationAccess(session, params.id)
  if (!access.allowed) return { fail: NextResponse.json({ error: access.error }, { status: access.status }) } as const
  return { session, convId } as const
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await gate(params)
  if ('fail' in g) return g.fail
  const requests = await listRecentItineraryRequests(g.convId)
  return NextResponse.json({ requests })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params)
  if ('fail' in g) return g.fail
  const { session, convId } = g

  // Commercial-adjacent identity mutation — same bar as Visa Form and
  // manual client linking (UX-4.1A/C): stronger than plain inbox_view.
  const assignAuthz = checkInboxPermission(session, 'inbox_assign')
  if (!assignAuthz.allowed) {
    return NextResponse.json({ error: assignAuthz.error }, { status: assignAuthz.status })
  }

  const rl = rateLimit({ key: `itinerary-request:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many itinerary requests — try again shortly.' }, { status: 429 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* every field is optional — validated in the service */ }

  const result = await createItineraryRequest({
    session, conversationId: convId,
    destination: typeof body.destination === 'string' ? body.destination : null,
    departureDate: typeof body.departureDate === 'string' ? body.departureDate : null,
    returnDate: typeof body.returnDate === 'string' ? body.returnDate : null,
    numberOfTravellers: typeof body.numberOfTravellers === 'number' ? body.numberOfTravellers : null,
  })

  if (!result.ok) {
    const status =
      result.code === 'CLIENT_IDENTITY_REQUIRED' ? 403
      : result.code === 'REQUEST_ALREADY_EXISTS' || result.code === 'AMBIGUOUS_REQUEST' || result.code === 'ITINERARY_ALREADY_EXISTS' ? 409
      : result.code === 'PERSIST_FAILED' ? 502
      : 400
    return NextResponse.json(
      {
        error: result.error, code: result.code,
        ...(result.existing ? { existing: result.existing } : {}),
        ...(result.itineraryRef ? { itineraryRef: result.itineraryRef } : {}),
        ...(result.missingFields ? { missingFields: result.missingFields, availableFields: result.availableFields } : {}),
        ...(result.crossRecordConflicts && result.crossRecordConflicts.length > 0
          ? { crossRecordConflicts: result.crossRecordConflicts } : {}),
      },
      { status },
    )
  }
  return NextResponse.json({ result: result.data })
}
