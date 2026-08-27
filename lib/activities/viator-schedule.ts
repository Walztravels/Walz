// Shared Viator availability + pricing logic.
// Used by /api/activities/viator/pricing and server-side trip revalidation.
// SECURITY: partnerNetPrice is internal Walz cost — never expose to client.
import { viatorGet }          from '@/lib/activities/providers/viator/client'
import { applyActivityMarkup } from '@/lib/activities/pricing'
import type {
  ViatorScheduleResponse,
  ViatorPricingDetail,
  ViatorSeason,
} from '@/lib/activities/providers/viator/types'

export function findActiveSeason(seasons: ViatorSeason[], date: string): ViatorSeason | null {
  return seasons.find(s => s.startDate <= date && s.endDate >= date) ?? seasons[0] ?? null
}

export function isUnavailable(seasons: ViatorSeason[], date: string): boolean {
  const dayName = new Date(date + 'T12:00:00Z')
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    .toUpperCase()
  const season = findActiveSeason(seasons, date)
  if (!season) return true
  for (const rec of season.pricingRecords ?? []) {
    if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
    for (const entry of rec.timedEntries ?? []) {
      if (entry.unavailableDates?.some(u => u.date === date)) return true
    }
  }
  return false
}

export function getStartTimes(seasons: ViatorSeason[], date: string): string[] {
  const dayName = new Date(date + 'T12:00:00Z')
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    .toUpperCase()
  const season = findActiveSeason(seasons, date)
  if (!season) return []
  const times: string[] = []
  for (const rec of season.pricingRecords ?? []) {
    if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
    for (const entry of rec.timedEntries ?? []) {
      const blocked = entry.unavailableDates?.some(u => u.date === date)
      if (!blocked && !times.includes(entry.startTime)) times.push(entry.startTime)
    }
  }
  return times.sort()
}

export function getPricingDetails(seasons: ViatorSeason[], date: string): ViatorPricingDetail[] {
  const dayName = new Date(date + 'T12:00:00Z')
    .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
    .toUpperCase()
  const season = findActiveSeason(seasons, date)
  if (!season) return []
  for (const rec of season.pricingRecords ?? []) {
    if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue
    if (rec.pricingDetails?.length) return rec.pricingDetails
  }
  return []
}

export function activePrice(detail: ViatorPricingDetail, today: string) {
  const sp = detail.price.special
  if (
    sp && sp.offerStartDate && sp.offerEndDate &&
    sp.offerStartDate <= today && sp.offerEndDate >= today
  ) return sp
  return detail.price.original
}

export interface ViatorPricingResult {
  available:         boolean
  reason?:           string
  productCode:       string
  productOptionCode?: string
  date:              string
  currency:          string
  totalSellingPrice?: number
  breakdown?:        Array<{ ageBand: string; count: number; unitSellingPrice: number; subtotal: number }>
  startTimes?:       string[]
  markupPercent?:    number
}

export async function calculateViatorSellingPrice(params: {
  productCode: string
  date:        string
  adults?:     number
  children?:   number
  infants?:    number
  currency?:   string
}): Promise<ViatorPricingResult> {
  const { productCode, date, adults = 1, children = 0, infants = 0, currency = 'GBP' } = params
  const today = new Date().toISOString().slice(0, 10)

  const { status, data } = await viatorGet<ViatorScheduleResponse>(
    `/availability/schedules/${encodeURIComponent(productCode)}`
  )

  if (status !== 200 || !data.bookableItems?.length) {
    return { available: false, reason: 'No schedule data', productCode, date, currency }
  }

  const item          = data.bookableItems[0]
  const seasons       = item.seasons ?? []
  const scheduleCurrency = data.currency ?? currency

  if (isUnavailable(seasons, date)) {
    return { available: false, reason: 'Date unavailable or sold out', productCode, date, currency: scheduleCurrency }
  }

  const pricingDetails = getPricingDetails(seasons, date)
  if (!pricingDetails.length) {
    return { available: false, reason: 'No pricing for this date', productCode, date, currency: scheduleCurrency }
  }

  const bandPriceMap = new Map<string, ReturnType<typeof activePrice>>()
  for (const detail of pricingDetails) bandPriceMap.set(detail.ageBand, activePrice(detail, today))

  const paxGroups = [
    { band: 'ADULT',  count: adults   },
    { band: 'CHILD',  count: children },
    { band: 'INFANT', count: infants  },
  ]

  let totalNetPrice = 0
  const breakdown: NonNullable<ViatorPricingResult['breakdown']> = []

  for (const { band, count } of paxGroups) {
    if (count <= 0) continue
    const price = bandPriceMap.get(band)
    if (!price) continue
    const { sellingPrice: unitSelling } = applyActivityMarkup(price.partnerNetPrice, 'VIATOR', scheduleCurrency)
    totalNetPrice += price.partnerNetPrice * count
    breakdown.push({
      ageBand:          band,
      count,
      unitSellingPrice: Math.round(unitSelling * 100) / 100,
      subtotal:         Math.round(unitSelling * count * 100) / 100,
    })
  }

  const { sellingPrice: totalSelling, markupPercent } = applyActivityMarkup(totalNetPrice, 'VIATOR', scheduleCurrency)

  return {
    available:          true,
    productCode,
    productOptionCode:  item.productOptionCode,
    date,
    currency:           scheduleCurrency,
    totalSellingPrice:  Math.round(totalSelling * 100) / 100,
    breakdown,
    startTimes:         getStartTimes(seasons, date),
    markupPercent,
  }
}
