// Viator Partner API v2 — response types (subset used by the mapper)
// Full spec: https://github.com/viator-docs/Viator-Partner-API-v2

export interface ViatorProductSearchRequest {
  filtering: {
    destination: string    // Viator destination ID (numeric string)
    tags?: number[]
    flags?: string[]
    startDate?: string     // YYYY-MM-DD
    endDate?: string       // YYYY-MM-DD
    priceFrom?: number
    priceTo?: number
    durationInMinutes?: { from?: number; to?: number }
  }
  sorting?: {
    sort?: 'TRAVELER_RATING' | 'PRICE' | 'PRICE_AND_POPULARITY' | 'POPULARITY' | 'DEFAULT'
    order?: 'ASCENDING' | 'DESCENDING'
  }
  pagination?: {
    start: number
    count: number
  }
  currency: string
}

export interface ViatorImage {
  imageSource: string        // URL
  caption?: string
  isCover?: boolean
  variants?: Array<{
    width?: number
    height?: number
    url?: string
  }>
}

export interface ViatorReview {
  combinedAverageRating?: number
  totalReviews?: number
}

export interface ViatorPriceSummary {
  fromPrice?: number
  fromPriceBeforeDiscount?: number
  currency?: string
}

export interface ViatorItinerary {
  itineraryType?: string
  duration?: {
    fixedDurationInMinutes?: number
    variableDurationFromMinutes?: number
    variableDurationToMinutes?: number
    unstructuredDuration?: string
  }
}

export interface ViatorCancellationPolicy {
  type?: string                      // 'STANDARD' | 'ALL_SALES_FINAL' | 'CUSTOM' | 'UNKNOWN'
  description?: string
  cancelIfBadWeather?: boolean
  cancelIfInsufficientTravelers?: boolean
  refundEligibility?: Array<{
    dayRangeMin?: number
    dayRangeMax?: number
    percentageRefundable?: number
  }>
}

export interface ViatorProductSummary {
  productCode: string
  title: string
  description?: string
  shortDescription?: string
  duration?: ViatorItinerary['duration']
  itinerary?: ViatorItinerary
  images?: ViatorImage[]
  reviews?: ViatorReview
  pricing?: ViatorPriceSummary
  pricingInfo?: ViatorPriceSummary
  flags?: string[]
  tags?: number[]
  translationInfo?: { containsMachineTranslatedText?: boolean }
  productUrl?: string
  destinations?: Array<{ ref: string; primary?: boolean }>
  cancellationPolicy?: ViatorCancellationPolicy
  language?: string
  highlights?: string[]
  inclusions?: string[]
  exclusions?: string[]
  additionalInfo?: string[]
  locations?: Array<{
    provider?: string
    unstructuredLocation?: string
    attractionLatitude?: number
    attractionLongitude?: number
  }>
  bookingProcess?: string
}

export interface ViatorProductSearchResponse {
  products?: ViatorProductSummary[]
  totalCount?: number
  currency?: string
  status?: string
  message?: string
}

export interface ViatorAvailabilityScheduleItem {
  productCode: string
  bookableItems?: Array<{
    productOptionCode: string
    startTime?: string
    unavailableDates?: string[]
    available?: boolean
    pricing?: {
      summary?: ViatorPriceSummary
      fareDetails?: Array<{
        fareType?: string
        ticketCount?: number
        unitPrice?: number
        unit?: string
      }>
    }
  }>
}
