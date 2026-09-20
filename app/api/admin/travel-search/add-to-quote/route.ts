import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { hasPermission }             from '@/lib/admin/permissions'
import prisma                        from '@/lib/db'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { getOffer }                  from '@/lib/flights/duffel'
import { hotelbedsRequest }          from '@/lib/hotelbeds'
import { updateQuoteTotals }         from '@/lib/quotes/update-totals'
import { convertSupplierAmount, convertMinorUnitAmount } from '@/lib/pricing/fx-convert'
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

// Tolerance-banded hotel price re-verification (closing fix, 2026-09-19):
// the hotel branch's revalidateHotelNetMinor() above makes a SECOND,
// independent live Hotelbeds /checkrates call — beyond the one the client
// already made moments earlier via /api/admin/travel-search/hotels/
// revalidate when staff clicked "Select & price". Hotelbeds documents (see
// the RECHECK rate-type comment in app/api/admin/travel-search/hotels/
// route.ts) that some rates are dynamically re-priced on every check BY
// DESIGN — so two live checks seconds apart can legitimately return a
// fractionally different net rate with zero price manipulation involved. A
// strict !== comparison (the original implementation) therefore rejected
// ordinary, unmodified staff selections on nothing more than live-rate
// jitter. This band replaces that strict check.
//
// Expressed as a PERCENTAGE of the client-submitted cost, not a fixed
// minor-unit amount, because hotel nightly rates span several orders of
// magnitude (a ~£30/night budget room vs a ~£3,000/night suite) — a fixed
// absolute tolerance would be far too tight for the low end or far too loose
// for the high end. 1% is small enough that it cannot plausibly absorb a
// materially manipulated price, while comfortably covering ordinary
// live-rate jitter between two /checkrates calls seconds apart.
// Math.max(1, …) keeps a non-zero floor so the band never collapses to
// exact-match at very low cost values.
const HOTEL_PRICE_TOLERANCE_PERCENT = 0.01

function hotelPriceToleranceMinor(costMinor: number): number {
  return Math.max(1, Math.round(costMinor * HOTEL_PRICE_TOLERANCE_PERCENT))
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

  // V1.3 — currency handling moved into each branch below (server-side FX
  // conversion for flight/hotel; unchanged strict-match for activity/
  // transfer until their own FX step). There is no longer a single blanket
  // "payload.currency must equal quote.currency" gate here: a payload whose
  // stated currency differs from the quote's is no longer automatically
  // rejected — for flight/hotel it is independently converted server-side
  // (see convertSupplierAmount below), never relabeled and never trusting
  // any client-submitted rate/converted amount.

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
    // A magnitude match alone isn't enough — the CLAIMED currency (payload's
    // `currency`, the currency costMinor/markupMinor/etc. were actually
    // computed in) must match the supplier's own TRUE live currency for this
    // offer, or a numerically-equal amount in a different currency would
    // silently pass the check above. This is unchanged and unrelated to
    // whether that (verified) supplier currency equals the quote's own
    // currency — that relationship is handled by the FX step next.
    if (revalidated.currency && revalidated.currency.toUpperCase() !== String(currency).toUpperCase()) {
      return NextResponse.json(
        { error: 'This fare is priced in a different currency than expected. Please re-search and try again.', code: 'PRICE_MISMATCH' },
        { status: 400 },
      )
    }

    // V1.3 — server-authoritative FX. `currency` above is the VERIFIED
    // supplier currency (just confirmed to match Duffel's own live offer
    // currency). If it differs from the quote's target currency, convert
    // every minor-unit figure by the SAME server-fetched rate (never a
    // client-submitted one) — scaling cost, markup, and service fee
    // together preserves the cost+markup+fee=selling relationship and the
    // markup's original percentage, without requiring any change to how
    // staff/the client currently compute markup (a percentage of supplier
    // cost) ahead of the later UI-integration phase. The verified supplier
    // amount is preserved unconverted in supplierCostMinor/supplierCurrency
    // for margin/reconciliation, per the non-negotiable "never relabel"
    // requirement.
    let finalCostMinor = costMinor
    let finalMarkupMinor = markupMinor
    let finalServiceFeeMinor = serviceFeeMinor
    let finalSellingPriceMinor = sellingPriceMinor
    let finalCurrency = currency
    let fxFields: { supplierCostMinor: bigint; supplierCurrency: string; fxRate: string; fxRateAt: Date; fxSource: string } | null = null

    if (String(currency).toUpperCase() !== String(quote.currency).toUpperCase()) {
      const converted = await convertSupplierAmount({
        supplierAmountMinor: costMinor, supplierCurrency: currency, targetCurrency: quote.currency,
      })
      if (!converted.ok) {
        return NextResponse.json({ error: converted.message, code: converted.code }, { status: 502 })
      }
      finalCostMinor = converted.convertedAmountMinor
      finalMarkupMinor = convertMinorUnitAmount(markupMinor, converted.rate, quote.currency)
      finalServiceFeeMinor = convertMinorUnitAmount(serviceFeeMinor, converted.rate, quote.currency)
      finalSellingPriceMinor = finalCostMinor + finalMarkupMinor + finalServiceFeeMinor
      finalCurrency = quote.currency
      fxFields = {
        supplierCostMinor: BigInt(costMinor), supplierCurrency: currency,
        fxRate: converted.rate, fxRateAt: new Date(converted.rateTimestamp), fxSource: converted.source,
      }
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
        costMinor:        BigInt(finalCostMinor),
        markupMinor:      BigInt(finalMarkupMinor),
        serviceFeeMinor:  BigInt(finalServiceFeeMinor),
        sellingPriceMinor: BigInt(finalSellingPriceMinor),
        currency:         finalCurrency,
        ...(fxFields ?? {}),
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
        costMinor:         BigInt(finalCostMinor),
        markupMinor:       BigInt(finalMarkupMinor),
        serviceFeeMinor:   BigInt(finalServiceFeeMinor),
        sellingPriceMinor: BigInt(finalSellingPriceMinor),
        currency:          finalCurrency,
        ...(fxFields ?? {}),
        flightOptionId:    flightOption.id,
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
    // sellingPriceMinor is intentionally not destructured from the payload:
    // it is always recomputed below (freshSellingPriceMinor) from the
    // freshly-revalidated net cost, never trusted from the client.
    const { offer, selectedRateKey, costMinor, markupMinor, serviceFeeMinor,
            currency, isRecommended, label, clientNote, internalNote } = payload

    // Price verification (defense in depth — do NOT trust client-submitted
    // costMinor): re-fetch the live Hotelbeds rate, the same call
    // /api/admin/travel-search/hotels/revalidate makes, and reject on any
    // mismatch rather than persisting a possibly-manipulated cost.
    const revalidated = await revalidateHotelNetMinor(selectedRateKey)
    if (!revalidated.ok) {
      return NextResponse.json({ error: revalidated.error, code: 'PRICE_REVALIDATION_FAILED' }, { status: 400 })
    }
    // A magnitude match alone isn't enough — the supplier's own currency for
    // this rate must match what's being persisted, or a numerically-equal
    // amount in a different currency would silently pass the check below.
    // No tolerance makes sense here: a currency mismatch is a real bug or a
    // real data problem, not price jitter, so this stays a hard reject.
    if (revalidated.currency && revalidated.currency.toUpperCase() !== String(currency).toUpperCase()) {
      return NextResponse.json(
        { error: 'This rate is priced in a different currency than expected. Please re-search and try again.', code: 'PRICE_MISMATCH' },
        { status: 400 },
      )
    }

    // Tolerance-banded comparison (see HOTEL_PRICE_TOLERANCE_PERCENT above).
    // Small drift within the band is treated as live-rate jitter, not a
    // manipulated price: proceed, but persist the FRESH revalidated net
    // cost, never the client-submitted (now slightly stale) figure. The
    // payload only ever carries absolute markup/service-fee minor amounts
    // (AddToQuotePayload has no markup-percentage field), so those absolute
    // amounts are preserved unchanged and only cost/selling price move —
    // consistent with how sellingPrice = net + markup + serviceFee is
    // computed everywhere else in this codebase (lib/pricing/booking-price.ts).
    const driftMinor = revalidated.netMinor - costMinor
    if (Math.abs(driftMinor) > hotelPriceToleranceMinor(costMinor)) {
      // Drift exceeds tolerance: do NOT flat-reject. Hand back the current
      // live price so the frontend can show staff "price changed from X to
      // Y — accept new price?" On acceptance the frontend simply re-submits
      // add-to-quote with these new* values, which will be an exact (zero-
      // drift) match against a fresh check and persist normally.
      const newNetMinor = revalidated.netMinor
      const newMarkupMinor = markupMinor
      const newServiceFeeMinor = serviceFeeMinor
      const newSellingPriceMinor = newNetMinor + newMarkupMinor + newServiceFeeMinor
      return NextResponse.json(
        {
          error: 'This rate’s price has changed since it was selected. Please review the new price.',
          code: 'PRICE_CHANGED_REQUIRES_ACCEPTANCE',
          newNetMinor,
          newMarkupMinor,
          newServiceFeeMinor,
          newSellingPriceMinor,
          currency: revalidated.currency ?? currency,
        },
        { status: 409 },
      )
    }
    const freshCostMinor = revalidated.netMinor

    // V1.3 — server-authoritative FX (see the identical flight-branch
    // comment above for the full rationale: scale cost+markup+fee together
    // by one server-fetched rate, preserve the verified supplier amount
    // unconverted for margin/reconciliation, never trust a client rate).
    // Note: the existing PRICE_CHANGED_REQUIRES_ACCEPTANCE 409 response
    // above deliberately still returns UNCONVERTED (supplier-currency)
    // new* figures — its resubmit round-trip re-enters this same branch and
    // is converted here exactly like a fresh attach; converting it in two
    // places would double-convert. This is correct as long as the payload's
    // `currency` field is always genuinely the supplier currency at the
    // point of resubmission, which remains true until the UI-integration
    // phase changes what the client sends here.
    let finalCostMinor = freshCostMinor
    let finalMarkupMinor = markupMinor
    let finalServiceFeeMinor = serviceFeeMinor
    let finalCurrency = currency
    let fxFields: { supplierCostMinor: bigint; supplierCurrency: string; fxRate: string; fxRateAt: Date; fxSource: string } | null = null

    if (String(currency).toUpperCase() !== String(quote.currency).toUpperCase()) {
      const converted = await convertSupplierAmount({
        supplierAmountMinor: freshCostMinor, supplierCurrency: currency, targetCurrency: quote.currency,
      })
      if (!converted.ok) {
        return NextResponse.json({ error: converted.message, code: converted.code }, { status: 502 })
      }
      finalCostMinor = converted.convertedAmountMinor
      finalMarkupMinor = convertMinorUnitAmount(markupMinor, converted.rate, quote.currency)
      finalServiceFeeMinor = convertMinorUnitAmount(serviceFeeMinor, converted.rate, quote.currency)
      finalCurrency = quote.currency
      fxFields = {
        supplierCostMinor: BigInt(freshCostMinor), supplierCurrency: currency,
        fxRate: converted.rate, fxRateAt: new Date(converted.rateTimestamp), fxSource: converted.source,
      }
    }
    const freshSellingPriceMinor = finalCostMinor + finalMarkupMinor + finalServiceFeeMinor

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
        costMinor:          BigInt(finalCostMinor),
        markupMinor:        BigInt(finalMarkupMinor),
        serviceFeeMinor:    BigInt(finalServiceFeeMinor),
        sellingPriceMinor:  BigInt(freshSellingPriceMinor),
        currency:           finalCurrency,
        ...(fxFields ?? {}),
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
        costMinor:         BigInt(finalCostMinor),
        markupMinor:       BigInt(finalMarkupMinor),
        serviceFeeMinor:   BigInt(finalServiceFeeMinor),
        sellingPriceMinor: BigInt(freshSellingPriceMinor),
        currency:          finalCurrency,
        ...(fxFields ?? {}),
        hotelOptionId:     hotelOption.id,
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

    // V1.3 — server-authoritative FX, SAME conversion mechanism as flight/
    // hotel above, but converting a WEAKER-CONFIDENCE input: costMinor here
    // is the client-submitted figure, never independently re-verified
    // against a live supplier call (the residual gap documented above —
    // this FX step does not change or paper over that; it converts
    // whatever figure was trusted going in, exactly as honestly as
    // flight/hotel convert their independently-verified figure). Logged
    // distinctly so this lower-confidence path is never confused with
    // flight/hotel's revalidated one.
    let finalCostMinor = costMinor
    let finalMarkupMinor = markupMinor
    let finalServiceFeeMinor = serviceFeeMinor
    let finalSellingPriceMinor = sellingPriceMinor
    let finalCurrency = currency
    let fxFields: { supplierCostMinor: bigint; supplierCurrency: string; fxRate: string; fxRateAt: Date; fxSource: string } | null = null

    if (String(currency).toUpperCase() !== String(quote.currency).toUpperCase()) {
      const converted = await convertSupplierAmount({
        supplierAmountMinor: costMinor, supplierCurrency: currency, targetCurrency: quote.currency,
      })
      if (!converted.ok) {
        return NextResponse.json({ error: converted.message, code: converted.code }, { status: 502 })
      }
      finalCostMinor = converted.convertedAmountMinor
      finalMarkupMinor = convertMinorUnitAmount(markupMinor, converted.rate, quote.currency)
      finalServiceFeeMinor = convertMinorUnitAmount(serviceFeeMinor, converted.rate, quote.currency)
      finalSellingPriceMinor = finalCostMinor + finalMarkupMinor + finalServiceFeeMinor
      finalCurrency = quote.currency
      fxFields = {
        supplierCostMinor: BigInt(costMinor), supplierCurrency: currency,
        fxRate: converted.rate, fxRateAt: new Date(converted.rateTimestamp), fxSource: converted.source,
      }
      console.log(`[add-to-quote] fx_convert_unverified type=${payload.type} pair=${currency}/${quote.currency} rate=${converted.rate}`)
    }

    const item = await prisma.quoteItem.create({
      data: {
        quoteId:           quote.id,
        type:              payload.type,
        title,
        sourceType:        'live_search',
        supplier:          supplierName,
        supplierRef:       supplierRef,
        costMinor:         BigInt(finalCostMinor),
        markupMinor:       BigInt(finalMarkupMinor),
        serviceFeeMinor:   BigInt(finalServiceFeeMinor),
        sellingPriceMinor: BigInt(finalSellingPriceMinor),
        currency:          finalCurrency,
        ...(fxFields ?? {}),
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

