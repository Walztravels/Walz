import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { hasPermission }             from '@/lib/admin/permissions'
import prisma                        from '@/lib/db'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { getOffer }                  from '@/lib/flights/duffel'
import { hotelbedsRequest }          from '@/lib/hotelbeds'
import type {
  AddToQuotePayload,
  NormalizedFlightSegment,
} from '@/lib/travel-search/types'

export const dynamic = 'force-dynamic'

// Closing fix (security + QA review, 2026-09-19): re-verify the freshly
// revalidated supplier cost for flight/hotel attaches instead of trusting
// the client-submitted costMinor outright. Reuses the exact Duffel/
// Hotelbeds calls the sibling revalidate routes make — no new supplier
// infrastructure — then rejects on ANY mismatch (strict, not tolerance-
// banded) rather than silently accepting a manipulated price.
async function revalidateFlightTotalMinor(
  offerId: string,
): Promise<{ ok: true; totalAmountMinor: number; currency: string | null } | { ok: false; error: string }> {
  let rawOffer: Record<string, unknown>
  try {
    rawOffer = await getOffer(offerId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('404') || msg.includes('not_found')) {
      return { ok: false, error: 'This fare is no longer available. Please re-search.' }
    }
    throw err
  }
  const data    = (rawOffer.data ?? rawOffer) as Record<string, unknown>
  const expires = (data.expires_at as string) ?? null
  if (expires && new Date(expires) < new Date()) {
    return { ok: false, error: 'This fare has expired. Please re-search.' }
  }
  const totalAmount = parseFloat(String((data.total_amount ?? data.base_amount ?? 0)))
  const currency = (data.total_currency ?? data.base_currency ?? null) as string | null
  return { ok: true, totalAmountMinor: Math.round(totalAmount * 100), currency }
}

async function revalidateHotelNetMinor(
  rateKey: string,
): Promise<{ ok: true; netMinor: number; currency: string | null } | { ok: false; error: string }> {
  let data: Record<string, unknown>
  try {
    data = await hotelbedsRequest('hotel', '/checkrates', {
      method: 'POST', body: { rooms: [{ rateKey }] },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('400') || msg.includes('INVALID_RATE')) {
      return { ok: false, error: 'This rate is no longer available. Please re-search.' }
    }
    throw err
  }
  const hotels = data.hotels as Array<Record<string, unknown>> | undefined
  const hotel  = (data.hotel ?? (hotels?.[0]) ?? {}) as Record<string, unknown>
  const rooms  = (hotel.rooms as Array<Record<string, unknown>>) ?? []
  const match  = rooms
    .flatMap(r => ((r.rates as Array<Record<string, unknown>>) ?? []))
    .find(rate => (rate.rateKey as string) === rateKey)
  if (!match) return { ok: false, error: 'This rate is no longer available. Please re-search.' }
  const net = parseFloat(String(match.net ?? match.sellingRate ?? 0))
  const currency = (match.currency ?? hotel.currency ?? null) as string | null
  return { ok: true, netMinor: Math.round(net * 100), currency }
}

function bigintToNumber(obj: unknown): unknown {
  if (typeof obj === 'bigint') return Number(obj)
  if (Array.isArray(obj)) return obj.map(bigintToNumber)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, bigintToNumber(v)])
    )
  }
  return obj
}

// POST /api/admin/travel-search/add-to-quote
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = (await req.json()) as AddToQuotePayload

  const quote = await prisma.quote.findUnique({ where: { id: payload.quoteId } })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  if (['converted', 'archived', 'cancelled'].includes(quote.status)) {
    return NextResponse.json({ error: 'Quote is not editable' }, { status: 409 })
  }

  // Closing fix (security + QA review, 2026-09-19): re-verify identity for
  // Inbox-originated quotes before this commercial mutation, mirroring the
  // HARD INVARIANT createPaymentRequest() enforces for every other Action
  // Centre commercial route (VERIFIED/LINKED only; HEURISTIC/UNRESOLVED
  // never authorize anything). A quote with no conversationId was built
  // outside the Inbox (e.g. the standalone travel-search builder) — there
  // is no conversation to resolve identity against, so this check is
  // skipped for it; that is the existing, correct scope of the invariant.
  if (quote.conversationId != null) {
    const resolved = await resolveClientActionContext(quote.conversationId, session)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, code: 'CLIENT_IDENTITY_REQUIRED' }, { status: resolved.status })
    }
    if (resolved.context.resolution !== 'VERIFIED' && resolved.context.resolution !== 'LINKED') {
      return NextResponse.json(
        { error: 'Verify the client identity before adding items to this quote.', code: 'CLIENT_IDENTITY_REQUIRED' },
        { status: 403 },
      )
    }
  }

  // Currency safety (defense in depth — the drawer/page also check this
  // client-side): a Quote has one currency; totals sum blindly across
  // items, so an item priced in a different currency must never attach.
  if (String(payload.currency).toUpperCase() !== String(quote.currency).toUpperCase()) {
    return NextResponse.json(
      { error: `This item is priced in ${payload.currency}; the quote uses ${quote.currency}.`, code: 'CURRENCY_MISMATCH' },
      { status: 400 },
    )
  }

  if (payload.type === 'flight') {
    const { offer, costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor, currency,
            isRecommended, label, clientNote, internalNote } = payload

    // Price verification (defense in depth — do NOT trust client-submitted
    // costMinor): re-fetch the live Duffel offer, the same call
    // /api/admin/travel-search/flights/revalidate makes, and reject on any
    // mismatch rather than persisting a possibly-manipulated cost.
    const revalidated = await revalidateFlightTotalMinor(offer.providerOfferId)
    if (!revalidated.ok) {
      return NextResponse.json({ error: revalidated.error, code: 'PRICE_REVALIDATION_FAILED' }, { status: 400 })
    }
    if (revalidated.totalAmountMinor !== costMinor) {
      return NextResponse.json(
        { error: 'This fare’s price has changed since it was selected. Please re-search and try again.', code: 'PRICE_MISMATCH' },
        { status: 400 },
      )
    }
    // A magnitude match alone isn't enough — the supplier's own currency for
    // this offer must match what's being persisted, or a numerically-equal
    // amount in a different currency would silently pass the check above.
    if (revalidated.currency && revalidated.currency.toUpperCase() !== String(currency).toUpperCase()) {
      return NextResponse.json(
        { error: 'This fare is priced in a different currency than expected. Please re-search and try again.', code: 'PRICE_MISMATCH' },
        { status: 400 },
      )
    }

    const allSegs: NormalizedFlightSegment[] = [...offer.segments, ...offer.returnSegments]
    const firstSeg = allSegs[0]

    const flightOption = await prisma.quoteFlightOption.create({
      data: {
        quoteId:          quote.id,
        label:            label ?? null,
        isRecommended:    isRecommended ?? false,
        airline:          offer.airline,
        airlineCode:      offer.airlineCode ?? null,
        tripType:         offer.tripType,
        cabinClass:       offer.cabinClass,
        fareClass:        offer.fareClass,
        fareFamily:       offer.fareFamily,
        isRefundable:     offer.isRefundable,
        changesAllowed:   offer.isChangeable,
        changeFee:        offer.changeFee,
        noShowRule:       offer.noShowRule,
        seatIncluded:     offer.seatIncluded,
        mealIncluded:     offer.mealIncluded,
        personalItem:     offer.personalItem,
        cabinBaggage:     offer.cabinBaggage,
        checkedBaggage:   offer.checkedBaggage,
        checkedPieces:    offer.checkedPieces,
        checkedWeight:    offer.checkedWeight,
        duffelOfferId:    offer.providerOfferId,
        costMinor:        BigInt(costMinor),
        markupMinor:      BigInt(markupMinor),
        serviceFeeMinor:  BigInt(serviceFeeMinor),
        sellingPriceMinor: BigInt(sellingPriceMinor),
        currency,
        fareExpiresAt:    offer.offerExpiresAt ? new Date(offer.offerExpiresAt) : null,
        sourceType:       'live_search',
        clientNote:       clientNote ?? null,
        internalNote:     internalNote ?? null,
        segments: {
          create: allSegs.map((s: NormalizedFlightSegment): {
            segmentOrder: number; originCode: string; originCity: string | null; originTerminal: string | null;
            departureAt: Date; destinationCode: string; destinationCity: string | null; destinationTerminal: string | null;
            arrivalAt: Date; flightNumber: string | null; operatingCarrier: string | null; marketingCarrier: string | null;
            aircraft: string | null; durationMinutes: number | null; stops: number; layoverMinutes: number | null;
          } => ({
            segmentOrder:        s.segmentOrder,
            originCode:          s.originCode,
            originCity:          s.originCity,
            originTerminal:      s.originTerminal,
            departureAt:         new Date(s.departureAt),
            destinationCode:     s.destinationCode,
            destinationCity:     s.destinationCity,
            destinationTerminal: s.destinationTerminal,
            arrivalAt:           new Date(s.arrivalAt),
            flightNumber:        s.flightNumber,
            operatingCarrier:    s.operatingCarrier,
            marketingCarrier:    s.marketingCarrier,
            aircraft:            s.aircraft,
            durationMinutes:     s.durationMinutes,
            stops:               s.stops,
            layoverMinutes:      s.layoverMinutes,
          })),
        },
      },
      include: { segments: true },
    })

    // Create matching QuoteItem for totals
    const firstDep = firstSeg?.originCode ?? ''
    const lastArr  = allSegs[allSegs.length - 1]?.destinationCode ?? ''
    const item = await prisma.quoteItem.create({
      data: {
        quoteId:           quote.id,
        type:              'flight',
        title:             label ?? `${offer.airline} · ${firstDep} → ${lastArr}`,
        sourceType:        'live_search',
        supplier:          offer.airline,
        supplierRef:       offer.providerOfferId,
        costMinor:         BigInt(costMinor),
        markupMinor:       BigInt(markupMinor),
        serviceFeeMinor:   BigInt(serviceFeeMinor),
        sellingPriceMinor: BigInt(sellingPriceMinor),
        currency,
        clientNote:        clientNote ?? null,
        internalNote:      internalNote ?? null,
      },
    })

    await updateQuoteTotals(quote.id)

    return NextResponse.json({
      type:          'flight',
      flightOption:  bigintToNumber(flightOption),
      item:          bigintToNumber(item),
    })
  }

  if (payload.type === 'hotel') {
    const { offer, selectedRateKey, costMinor, markupMinor, serviceFeeMinor,
            sellingPriceMinor, currency, isRecommended, label, clientNote, internalNote } = payload

    // Price verification (defense in depth — do NOT trust client-submitted
    // costMinor): re-fetch the live Hotelbeds rate, the same call
    // /api/admin/travel-search/hotels/revalidate makes, and reject on any
    // mismatch rather than persisting a possibly-manipulated cost.
    const revalidated = await revalidateHotelNetMinor(selectedRateKey)
    if (!revalidated.ok) {
      return NextResponse.json({ error: revalidated.error, code: 'PRICE_REVALIDATION_FAILED' }, { status: 400 })
    }
    if (revalidated.netMinor !== costMinor) {
      return NextResponse.json(
        { error: 'This rate’s price has changed since it was selected. Please re-search and try again.', code: 'PRICE_MISMATCH' },
        { status: 400 },
      )
    }
    // A magnitude match alone isn't enough — the supplier's own currency for
    // this rate must match what's being persisted, or a numerically-equal
    // amount in a different currency would silently pass the check above.
    if (revalidated.currency && revalidated.currency.toUpperCase() !== String(currency).toUpperCase()) {
      return NextResponse.json(
        { error: 'This rate is priced in a different currency than expected. Please re-search and try again.', code: 'PRICE_MISMATCH' },
        { status: 400 },
      )
    }

    const selectedRate = offer.rates.find(r => r.rateKey === selectedRateKey) ?? offer.rates[0]

    const hotelOption = await prisma.quoteHotelOption.create({
      data: {
        quoteId:            quote.id,
        label:              label ?? null,
        isRecommended:      isRecommended ?? false,
        hotelName:          offer.hotelName,
        starRating:         offer.starRating,
        city:               offer.city,
        country:            offer.country,
        checkIn:            new Date(offer.checkIn),
        checkOut:           new Date(offer.checkOut),
        nights:             offer.nights,
        rooms:              offer.rooms,
        adults:             offer.adults,
        children:           offer.children,
        mealPlan:           selectedRate?.mealPlan ?? null,
        breakfastIncluded:  selectedRate?.breakfastIncluded ?? false,
        cancellationPolicy: selectedRate?.cancellationPolicy ?? null,
        isRefundable:       selectedRate?.isRefundable ?? true,
        supplier:           'hotelbeds',
        supplierRef:        selectedRateKey,
        costMinor:          BigInt(costMinor),
        markupMinor:        BigInt(markupMinor),
        serviceFeeMinor:    BigInt(serviceFeeMinor),
        sellingPriceMinor:  BigInt(sellingPriceMinor),
        currency,
        sourceType:         'live_search',
        clientNote:         clientNote ?? null,
        internalNote:       internalNote ?? null,
      },
    })

    const item = await prisma.quoteItem.create({
      data: {
        quoteId:           quote.id,
        type:              'hotel',
        title:             label ?? offer.hotelName,
        sourceType:        'live_search',
        supplier:          'Hotelbeds',
        supplierRef:       selectedRateKey,
        costMinor:         BigInt(costMinor),
        markupMinor:       BigInt(markupMinor),
        serviceFeeMinor:   BigInt(serviceFeeMinor),
        sellingPriceMinor: BigInt(sellingPriceMinor),
        currency,
        clientNote:        clientNote ?? null,
        internalNote:      internalNote ?? null,
      },
    })

    await updateQuoteTotals(quote.id)

    return NextResponse.json({
      type:        'hotel',
      hotelOption: bigintToNumber(hotelOption),
      item:        bigintToNumber(item),
    })
  }

  if (payload.type === 'activity' || payload.type === 'transfer') {
    // KNOWN, SCOPED RESIDUAL GAP (security + QA review, 2026-09-19): unlike
    // flight/hotel above, there is no existing revalidation route for
    // activities or transfers (no /api/admin/travel-search/activities|
    // transfers/revalidate) — Hotelbeds/Viator expose no equivalent
    // "confirm this rate/offer is still valid at this price" call for these
    // product types today. The client-submitted net costMinor is trusted
    // as-is here, pending future revalidation infrastructure for these two
    // types. Flagged deliberately so this does not read as an oversight.
    const { offer, costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor, currency,
            clientNote, internalNote } = payload

    const isActivity  = payload.type === 'activity'
    const activityOffer = isActivity ? (offer as import('@/lib/travel-search/types').NormalizedActivityOffer) : null
    const transferOffer = !isActivity ? (offer as import('@/lib/travel-search/types').NormalizedTransferOffer) : null

    const title = isActivity
      ? (activityOffer?.name ?? 'Activity')
      : (transferOffer?.name ?? 'Transfer')

    // Derive supplier from provider field — never hardcode Hotelbeds for Viator activities
    const supplierName = isActivity
      ? (activityOffer?.provider === 'viator' ? 'Viator' : 'Hotelbeds')
      : 'Hotelbeds'

    // Guard against undefined providerCode/providerModalityCode producing "undefined/undefined"
    const supplierRef = isActivity
      ? (activityOffer?.providerCode && activityOffer?.providerModalityCode
          ? `${activityOffer.providerCode}/${activityOffer.providerModalityCode}`
          : (activityOffer?.providerCode ?? null))
      : (transferOffer?.providerRateKey ?? null)

    const item = await prisma.quoteItem.create({
      data: {
        quoteId:           quote.id,
        type:              payload.type,
        title,
        sourceType:        'live_search',
        supplier:          supplierName,
        supplierRef:       supplierRef,
        costMinor:         BigInt(costMinor),
        markupMinor:       BigInt(markupMinor),
        serviceFeeMinor:   BigInt(serviceFeeMinor),
        sellingPriceMinor: BigInt(sellingPriceMinor),
        currency,
        clientNote:        clientNote ?? null,
        internalNote:      internalNote ?? null,
        // bigintToNumber removes BigInt values that JSON.stringify can't handle
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata:          bigintToNumber(offer) as any,
      },
    })

    await updateQuoteTotals(quote.id)

    return NextResponse.json({ type: payload.type, item: bigintToNumber(item) })
  }

  return NextResponse.json({ error: 'Unknown product type' }, { status: 400 })
}

async function updateQuoteTotals(quoteId: string) {
  const [items, quote] = await Promise.all([
    prisma.quoteItem.findMany({ where: { quoteId } }),
    (prisma.quote as any).findUnique({ where: { id: quoteId }, select: { markupMinor: true, serviceChargeMinor: true, discountMinor: true } }),
  ])
  if (!quote) return
  const { calculateProposalPricing } = await import('@/lib/pricing/proposal-pricing')
  const subtotalMinor = items.reduce((s, i) => s + i.sellingPriceMinor, BigInt(0))
  const result = calculateProposalPricing({
    subtotalMinor,
    markupMinor:        (quote as any).markupMinor ?? BigInt(0),
    serviceChargeMinor: (quote as any).serviceChargeMinor ?? BigInt(0),
    discountMinor:      (quote as any).discountMinor ?? BigInt(0),
  })
  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      subtotalMinor: result.subtotalMinor,
      totalMinor:    result.totalMinor,
    },
  })
}
