import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { buildItineraryDraftFromQuote } from '@/lib/action-centre/quote-to-itinerary'
import { resolveClientActionContext } from '@/lib/inbox/client-context'

/**
 * POST /api/admin/quotes/[id]/convert-to-itinerary
 *
 * Client Action Centre / Inbox V1, Phase 2/3 — Agent C, Proposal/
 * Commercial Lifecycle. ONE-WAY, ON-DEMAND conversion bridge: loads a
 * Quote + its relations, maps them into a draft Itinerary (via the pure
 * mapper in lib/action-centre/quote-to-itinerary.ts), creates the
 * Itinerary (status: 'draft' — never sent to a client by this route), and
 * writes the back-reference onto the source Quote. Mirrors the existing
 * TripRequest → Itinerary bridge at
 * app/api/admin/trip-requests/[id]/convert/route.ts.
 *
 * Quote stays the commercial/pricing source of truth; the existing GA0-GA6
 * Itinerary system (public page, approval route, proposalHash staleness
 * check) is the ONLY client-facing presentation + acceptance layer for
 * rich multi-service quotes — this route never touches any of that. The
 * legacy Quote-native accept endpoint
 * (app/api/quote-proposal/[token]/action/route.ts) is untouched and
 * unaffected: converting to an Itinerary does not change the source
 * Quote's own status or acceptance flow, only records a back-reference.
 *
 * Authorization mirrors the sibling PATCH action === 'convert' handler in
 * app/api/admin/quotes/[id]/route.ts exactly (quotes.convert) — this is
 * also a Quote "conversion" action, just into an Itinerary instead of a
 * Booking.
 *
 * Idempotent on Quote.itineraryId (fail-closed against double-conversion),
 * mirroring the fail-closed duplicate-prevention style established in
 * lib/action-centre/itinerary-request.ts. A best-effort atomic claim
 * (updateMany ... WHERE itineraryId IS NULL) additionally narrows the
 * create-then-link race between two concurrent requests: the loser's
 * orphan draft Itinerary is deleted and the winner's result is returned.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.convert')) {
    return NextResponse.json({ error: 'Forbidden — quotes.convert required' }, { status: 403 })
  }

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      items: true,
      flightOptions: { include: { segments: true } },
      hotelOptions: true,
      media: true,
    },
  })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // Closing fix (security + QA review, 2026-09-19): re-verify identity for
  // Inbox-originated quotes before this commercial mutation, mirroring the
  // HARD INVARIANT createPaymentRequest() enforces for every other Action
  // Centre commercial route (VERIFIED/LINKED only; HEURISTIC/UNRESOLVED
  // never authorize anything). A quote with no conversationId was built
  // outside the Inbox — there is no conversation to resolve identity
  // against, so this check is skipped for it; that is the existing,
  // correct scope of the invariant.
  if (quote.conversationId != null) {
    const resolved = await resolveClientActionContext(quote.conversationId, session)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
    }
    if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
      return NextResponse.json(
        { error: 'Verify the client identity before converting this quote.', code: 'CLIENT_IDENTITY_REQUIRED' },
        { status: 403 },
      )
    }
  }

  // Idempotent: already converted — return the existing itinerary, never
  // create a duplicate.
  if (quote.itineraryId) {
    const existing = await prisma.itinerary.findUnique({
      where: { id: quote.itineraryId },
      select: { id: true, referenceNumber: true },
    })
    if (existing) {
      return NextResponse.json({
        itineraryId: existing.id,
        referenceNumber: existing.referenceNumber,
        alreadyConverted: true,
      })
    }
    // itineraryId points at a row that no longer exists (deleted out of
    // band) — fall through and convert again rather than staying stuck.
  }

  const draft = buildItineraryDraftFromQuote(
    quote,
    quote.items,
    quote.flightOptions,
    quote.hotelOptions,
    quote.media,
  )

  const referenceNumber = await generateUniqueReferenceNumber()

  const itinerary = await prisma.itinerary.create({
    data: { ...draft, referenceNumber, type: 'itinerary' },
  })

  // Atomic claim: only succeeds if no other request already set
  // itineraryId on this Quote in the meantime.
  const claimed = await prisma.quote.updateMany({
    where: { id: quote.id, itineraryId: null },
    data: { itineraryId: itinerary.id },
  })

  if (claimed.count === 0) {
    // Lost the race — another concurrent request already converted this
    // Quote. Clean up the orphan draft and return the winner's result.
    await prisma.itinerary.delete({ where: { id: itinerary.id } }).catch(() => {})
    const winner = await prisma.quote.findUnique({ where: { id: quote.id }, select: { itineraryId: true } })
    if (winner?.itineraryId) {
      const winnerItin = await prisma.itinerary.findUnique({
        where: { id: winner.itineraryId },
        select: { id: true, referenceNumber: true },
      })
      if (winnerItin) {
        return NextResponse.json({
          itineraryId: winnerItin.id,
          referenceNumber: winnerItin.referenceNumber,
          alreadyConverted: true,
        })
      }
    }
    return NextResponse.json({ error: 'Conversion conflict — retry' }, { status: 409 })
  }

  await prisma.quoteActivity.create({
    data: {
      quoteId: quote.id, actor: session.email, actorType: 'staff',
      eventType: 'converted_to_itinerary',
      detail: `Converted to draft itinerary ${referenceNumber}`,
    },
  }).catch(() => { /* non-fatal — the conversion itself already succeeded */ })

  return NextResponse.json({ itineraryId: itinerary.id, referenceNumber })
}

/** Mirrors app/api/admin/trip-requests/[id]/convert/route.ts's own
 *  generateRef() character set/prefix, with a small uniqueness retry loop
 *  (Itinerary.referenceNumber is @unique) — the same pattern used by
 *  lib/action-centre/itinerary-request.ts for TripRequest.referenceNumber. */
async function generateUniqueReferenceNumber(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const gen = () => {
    let ref = 'WALZ-'
    for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)]
    return ref
  }
  let referenceNumber = gen()
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.itinerary.findUnique({ where: { referenceNumber }, select: { id: true } })
    if (!clash) break
    referenceNumber = gen()
  }
  return referenceNumber
}
