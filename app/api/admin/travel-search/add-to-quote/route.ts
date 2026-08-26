import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { hasPermission }             from '@/lib/admin/permissions'
import prisma                        from '@/lib/db'
import type {
  AddToQuotePayload,
  NormalizedFlightSegment,
} from '@/lib/travel-search/types'

export const dynamic = 'force-dynamic'

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

  if (payload.type === 'flight') {
    const { offer, costMinor, markupMinor, serviceFeeMinor, sellingPriceMinor, currency,
            isRecommended, label, clientNote, internalNote } = payload

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
