import { viatorPost } from './client'
import { resolveViatorDestId } from './destinations'
import { mapViatorProduct } from './mapper'
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

    const { status, data } = await viatorPost<{
      bookableItems?: Array<{
        productOptionCode?: string
        startTime?: string
        unavailableDates?: string[]
        available?: boolean
        pricing?: {
          summary?: { fromPrice?: number; fromPriceBeforeDiscount?: number }
          fareDetails?: Array<{ fareType?: string; unitPrice?: number }>
        }
      }>
    }>(`/products/${params.supplierProductId}/availability/schedules`, {
      currency,
      month: params.date.slice(0, 7),  // YYYY-MM
    })

    if (status !== 200 || !data.bookableItems?.length) {
      return { available: false, options: [], currency }
    }

    const options: ActivityOption[] = data.bookableItems
      .filter(item => item.available !== false)
      .map(item => {
        const supplierNetPrice = item.pricing?.summary?.fromPrice ?? 0
        return {
          code:              item.productOptionCode ?? 'DEFAULT',
          name:              item.productOptionCode ?? 'Standard',
          sellingPrice:      supplierNetPrice,   // Viator sells at retail; we show as-is
          supplierNetPrice,
          currency,
          startTimes:        item.startTime ? [item.startTime] : undefined,
          freeCancellation:  false,
        } satisfies ActivityOption
      })

    return { available: options.length > 0, options, currency }
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
    const { data } = await viatorPost<{
      bookingRef?: string
      status?: string
      voucherKey?: string
    }>(`/bookings/${supplierReference}`, {})

    return {
      success: !!(data.bookingRef),
      walzReference:     '',
      supplierReference: data.bookingRef,
      status:            data.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
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
