import { viatorPost, viatorGet }    from './client'
import { resolveViatorDestId }      from './destinations'
import { mapViatorProduct }         from './mapper'
import { applyActivityMarkup }      from '../../pricing'
import type {
  ActivityProvider,
  ActivitySearchParams,
  NormalizedActivity,
  AvailabilityParams,
  ActivityAvailability,
  ActivityOption,
  ActivityBookingResult,
  BookingParams,
} from '../../types'
import type {
  ViatorProductSearchRequest,
  ViatorProductSearchResponse,
  ViatorProductSummary,
  ViatorScheduleResponse,
} from './types'

const MAX_RESULTS = 40

export class ViatorActivityProvider implements ActivityProvider {
  readonly name = 'VIATOR' as const

  async search(params: ActivitySearchParams): Promise<NormalizedActivity[]> {
    const destId = resolveViatorDestId(params.destination)
    if (!destId) {
      console.warn('[ViatorActivityProvider] No destination ID for:', params.destination)
      return []
    }

    const body: ViatorProductSearchRequest = {
      filtering:  { destination: destId },
      pagination: { start: 1, count: MAX_RESULTS },
      currency:   params.currency ?? 'GBP',
    }

    if (params.dateFrom) body.filtering.startDate = params.dateFrom
    if (params.dateTo)   body.filtering.endDate   = params.dateTo

    try {
      const { status, data } = await viatorPost<ViatorProductSearchResponse>(
        '/products/search',
        body,
      )

      if (status !== 200) {
        console.error('[ViatorActivityProvider] Search failed', status, (data as { message?: string }).message)
        return []
      }

      const products: ViatorProductSummary[] = data.products ?? []
      return products.map(p => mapViatorProduct(p, params.destination, params.currency ?? 'GBP'))
    } catch (err) {
      console.error('[ViatorActivityProvider] Search error:', err instanceof Error ? err.message : err)
      return []
    }
  }

  async getProduct(supplierProductId: string, opts?: { currency?: string }): Promise<NormalizedActivity> {
    const { data } = await viatorPost<{ product?: ViatorProductSummary }>('/products/bulk', {
      productCodes: [supplierProductId],
      currency:     opts?.currency ?? 'GBP',
    })

    const product = data.product
    if (!product) throw new Error(`Viator product not found: ${supplierProductId}`)
    return mapViatorProduct(product, '', opts?.currency ?? 'GBP')
  }

  async checkAvailability(params: AvailabilityParams): Promise<ActivityAvailability> {
    const currency = params.currency ?? 'GBP'
    const date = params.date  // YYYY-MM-DD

    // Correct endpoint: GET /availability/schedules/{productCode}
    // POST /availability/check returns 403 at the current API key tier.
    const { status, data } = await viatorGet<ViatorScheduleResponse>(
      `/availability/schedules/${encodeURIComponent(params.supplierProductId)}`
    )

    if (status !== 200 || !data.bookableItems?.length) {
      return { available: false, options: [], currency }
    }

    const scheduleCurrency = data.currency ?? currency
    const today = new Date().toISOString().slice(0, 10)
    const dayName = new Date(date + 'T12:00:00Z')
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      .toUpperCase()

    const options: ActivityOption[] = []

    for (const item of data.bookableItems) {
      for (const season of item.seasons ?? []) {
        if (season.startDate > date || season.endDate < date) continue

        for (const rec of season.pricingRecords ?? []) {
          if (rec.daysOfWeek && !rec.daysOfWeek.includes(dayName)) continue

          const pricingDetails = rec.pricingDetails ?? []
          const adultDetail = pricingDetails.find(d => d.ageBand === 'ADULT') ?? pricingDetails[0]
          if (!adultDetail) continue

          const sp = adultDetail.price.special
          const useSpecial = sp && sp.offerStartDate && sp.offerEndDate &&
            sp.offerStartDate <= today && sp.offerEndDate >= today
          const netPrice  = useSpecial ? sp.partnerNetPrice  : adultDetail.price.original.partnerNetPrice
          const { sellingPrice } = applyActivityMarkup(netPrice, 'VIATOR', scheduleCurrency)

          const availableTimes: string[] = []
          for (const entry of rec.timedEntries ?? []) {
            const soldOut = entry.unavailableDates?.some(u => u.date === date)
            if (!soldOut) availableTimes.push(entry.startTime)
          }

          if (rec.timedEntries?.length && !availableTimes.length) continue  // all times sold out

          options.push({
            code:              item.productOptionCode,
            name:              item.productOptionCode,
            sellingPrice:      Math.round(sellingPrice * 100) / 100,
            supplierNetPrice:  Math.round(netPrice * 100) / 100,
            currency:          scheduleCurrency,
            startTimes:        availableTimes.length ? availableTimes : undefined,
            freeCancellation:  false,
          } satisfies ActivityOption)
        }
      }
    }

    return { available: options.length > 0, options, currency: scheduleCurrency }
  }

  async book(params: BookingParams): Promise<ActivityBookingResult> {
    const { status, data } = await viatorPost<{
      bookingRef?: string
      status?: string
      error?: string
      message?: string
    }>('/bookings', {
      productCode:      params.supplierProductId,
      productOptionCode: params.modalityCode,
      startTime:        params.startTime,
      travelDate:       params.date,
      paxMix: [
        ...(params.adults   ? [{ ageBand: 'ADULT',    numberOfTravelers: params.adults   }] : []),
        ...(params.children ? [{ ageBand: 'CHILD',    numberOfTravelers: params.children }] : []),
        ...(params.infants  ? [{ ageBand: 'INFANT',   numberOfTravelers: params.infants  }] : []),
      ],
      bookerInfo: {
        firstName: params.holderName.split(' ')[0],
        lastName:  params.holderName.split(' ').slice(1).join(' ') || params.holderName,
        email:     params.holderEmail,
      },
      communication: { email: params.holderEmail, phone: params.holderPhone },
      languageGuide: { type: 'GUIDE', language: 'en', legacyGuide: 'en/SERVICE_GUIDE' },
      currency:         params.currency,
      partnerOrderId:   params.walzReference,
      bookingQuestionAnswers: params.questionAnswers
        ? Object.entries(params.questionAnswers).map(([id, answer]) => ({ question: id, answer }))
        : [],
    })

    if (status !== 200 || !data.bookingRef) {
      return {
        success: false,
        walzReference: params.walzReference,
        status: 'FAILED',
        error: data.message ?? data.error ?? `Viator booking failed (HTTP ${status})`,
      }
    }

    return {
      success: true,
      walzReference:     params.walzReference,
      supplierReference: data.bookingRef,
      status:            data.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
    }
  }

  async getBooking(supplierReference: string): Promise<ActivityBookingResult> {
    // Viator Partner API v2: GET /bookings/{bookingRef}
    const { status, data } = await viatorGet<{
      bookingRef?: string
      status?: string
      voucherKey?: string
      message?: string
    }>(`/bookings/${encodeURIComponent(supplierReference)}`)

    return {
      success:           status === 200 && !!(data.bookingRef),
      walzReference:     '',
      supplierReference: data.bookingRef,
      status:            data.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
    }
  }

  // Look up a booking by the walzReference (partnerOrderId) we passed at booking time.
  // Viator Partner API v2: GET /bookings?partnerOrderId={ref}
  // Returns null if not found or if the API doesn't support this query.
  async getBookingByPartnerRef(walzReference: string): Promise<ActivityBookingResult | null> {
    try {
      const { status, data } = await viatorGet<{
        bookings?: Array<{ bookingRef?: string; status?: string }>
        message?: string
      }>(`/bookings?partnerOrderId=${encodeURIComponent(walzReference)}`)

      if (status !== 200 || !data.bookings?.length) return null
      const found = data.bookings[0]
      return {
        success:           !!(found.bookingRef),
        walzReference,
        supplierReference: found.bookingRef,
        status:            found.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
      }
    } catch {
      return null
    }
  }

  async cancelBooking(supplierReference: string): Promise<{ success: boolean; refundAmount?: number; error?: string }> {
    const { status, data } = await viatorPost<{ status?: string; refundAmount?: number; error?: string }>(
      `/bookings/${supplierReference}/cancel`,
      { cancelCode: 'Customer_Cancellation' },
    )

    if (status !== 200) {
      return { success: false, error: data.error ?? `Cancel failed (HTTP ${status})` }
    }

    return { success: true, refundAmount: data.refundAmount }
  }
}
