// POST /api/activities/viator/pricing
// Calculates live Walz selling price from the Viator availability schedule.
// Uses GET /availability/schedules/{productCode} — the only pricing endpoint
// available at the current API key tier (POST /availability/check returns 403).
//
// SECURITY: partnerNetPrice is NEVER returned to the client.
// Only the Walz selling price (net + markup) is exposed.

import { NextRequest, NextResponse } from 'next/server'
import { viatorGet }                  from '@/lib/activities/providers/viator/client'
import { applyActivityMarkup }        from '@/lib/activities/pricing'
import type { ViatorScheduleResponse, ViatorPricingDetail, ViatorSeason } from '@/lib/activities/providers/viator/types'

export const dynamic = 'force-dynamic'

interface PricingRequest {
  productCode:    string
  date:           string   // YYYY-MM-DD
  adults?:        number
  children?:      number
  infants?:       number
  currency?:      string
}

// Mapping from Viator age band names to request pax fields
const BAND_TO_FIELD: Record<string, keyof Pick<PricingRequest, 'adults' | 'children' | 'infants'>> = {
  ADULT:     'adults',
  SENIOR:    'adults',   // senior treated as adult-price tier
  YOUTH:     'adults',
  TRAVELER:  'adults',
  CHILD:     'children',
  INFANT:    'infants',
}

// Find the active season for a given date
function findActiveSeason(seasons: ViatorSeason[], date: string): ViatorSeason | null {
  return seasons.find(s => s.startDate <= date && s.endDate >= date) ?? seasons[0] ?? null
}

// Check if a date falls in a timed entry's unavailable list
function isUnavailable(seasons: ViatorSeason[], date: string): boolean {
  const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toUpperCase()
  const season = findActiveSeason(seasons, date)
  if (!season) return true

  for (const rec of season.pricingRecords ?? []) {
    if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
    for (const entry of rec.timedEntries ?? []) {
      const blocked = entry.unavailableDates?.some(u => u.date === date)
      if (blocked) return true
    }
  }
  return false
}

// Get all available start times for a date
function getStartTimes(seasons: ViatorSeason[], date: string): string[] {
  const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toUpperCase()
  const season = findActiveSeason(seasons, date)
  if (!season) return []

  const times: string[] = []
  for (const rec of season.pricingRecords ?? []) {
    if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
    for (const entry of rec.timedEntries ?? []) {
      const blocked = entry.unavailableDates?.some(u => u.date === date)
      if (!blocked && !times.includes(entry.startTime)) {
        times.push(entry.startTime)
      }
    }
  }
  return times.sort()
}

// Get pricing details for the active season on a given date
function getPricingDetails(seasons: ViatorSeason[], date: string): ViatorPricingDetail[] {
  const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toUpperCase()
  const season = findActiveSeason(seasons, date)
  if (!season) return []

  for (const rec of season.pricingRecords ?? []) {
    if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
    if (rec.pricingDetails?.length) return rec.pricingDetails
  }
  return []
}

// Pick the active price (special if valid today, else original)
function activePrice(detail: ViatorPricingDetail, today: string) {
  const sp = detail.price.special
  if (sp && sp.offerStartDate && sp.offerEndDate &&
      sp.offerStartDate <= today && sp.offerEndDate >= today) {
    return sp
  }
  return detail.price.original
}

export async function POST(req: NextRequest) {
  const body: PricingRequest = await req.json()
  const { productCode, date, adults = 1, children = 0, infants = 0, currency = 'GBP' } = body

  if (!productCode || !date) {
    return NextResponse.json({ error: 'productCode and date are required' }, { status: 400 })
  }
  if (!process.env.VIATOR_API_KEY) {
    return NextResponse.json({ error: 'Viator not configured' }, { status: 503 })
  }

  const today = new Date().toISOString().slice(0, 10)

  try {
    const { status, data } = await viatorGet<ViatorScheduleResponse>(
      `/availability/schedules/${encodeURIComponent(productCode)}`
    )

    if (status !== 200 || !data.bookableItems?.length) {
      return NextResponse.json({ available: false, reason: 'No schedule data' })
    }

    const item = data.bookableItems[0]
    const seasons = item.seasons ?? []
    const scheduleCurrency = data.currency ?? currency

    // Check if the date is in the schedule's unavailable list
    if (isUnavailable(seasons, date)) {
      return NextResponse.json({ available: false, reason: 'Date unavailable or sold out' })
    }

    const pricingDetails = getPricingDetails(seasons, date)
    if (!pricingDetails.length) {
      return NextResponse.json({ available: false, reason: 'No pricing for this date' })
    }

    // Build a map from ageBand → active price object
    const bandPriceMap = new Map<string, ReturnType<typeof activePrice>>()
    for (const detail of pricingDetails) {
      bandPriceMap.set(detail.ageBand, activePrice(detail, today))
    }

    // Calculate totals per pax type
    const paxGroups: Array<{ band: string; count: number }> = [
      { band: 'ADULT',  count: adults },
      { band: 'CHILD',  count: children },
      { band: 'INFANT', count: infants },
    ]

    let totalNetPrice = 0
    const breakdown: Array<{
      ageBand: string
      count: number
      unitSellingPrice: number
      subtotal: number
    }> = []

    for (const { band, count } of paxGroups) {
      if (count <= 0) continue
      const price = bandPriceMap.get(band)
      if (!price) continue

      // partnerNetPrice is our cost — apply Walz markup for the selling price
      const { sellingPrice: unitSelling } = applyActivityMarkup(
        price.partnerNetPrice,
        'VIATOR',
        scheduleCurrency,
      )
      totalNetPrice += price.partnerNetPrice * count

      breakdown.push({
        ageBand: band,
        count,
        unitSellingPrice: Math.round(unitSelling * 100) / 100,
        subtotal: Math.round(unitSelling * count * 100) / 100,
      })
    }

    // Apply markup to the combined net total
    const { sellingPrice: totalSelling, markupPercent } = applyActivityMarkup(
      totalNetPrice,
      'VIATOR',
      scheduleCurrency,
    )

    const startTimes = getStartTimes(seasons, date)

    return NextResponse.json({
      available:          true,
      productCode,
      productOptionCode:  item.productOptionCode,
      date,
      currency:           scheduleCurrency,
      totalSellingPrice:  Math.round(totalSelling * 100) / 100,
      breakdown,
      startTimes,
      markupPercent,
      // NOTE: partnerNetPrice / supplierNetPrice is intentionally NOT returned
    })
  } catch (err) {
    console.error('[Viator pricing]', productCode, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Pricing check failed' }, { status: 500 })
  }
}
