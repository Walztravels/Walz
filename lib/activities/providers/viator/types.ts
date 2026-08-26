// Viator Partner API v2 — response types
// Full spec: https://github.com/viator-docs/Viator-Partner-API-v2

export interface ViatorProductSearchRequest {
  filtering: {
    destination: string
    tags?: number[]
    flags?: string[]
    startDate?: string
    endDate?: string
    priceFrom?: number
    priceTo?: number
    durationInMinutes?: { from?: number; to?: number }
  }
  sorting?: {
    sort?: 'TRAVELER_RATING' | 'PRICE' | 'PRICE_AND_POPULARITY' | 'DEFAULT'
    order?: 'ASCENDING' | 'DESCENDING'
  }
  pagination?: {
    start: number
    count: number
  }
  currency: string
}

// Viator detail API inclusion/exclusion item (objects, not strings)
export interface ViatorInclusionItem {
  category?: string
  categoryDescription?: string
  type?: string
  typeDescription?: string
  otherDescription?: string  // inclusions
  description?: string       // exclusions
}

export interface ViatorImage {
  imageSource: string
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

// Search API: pricing is { summary: { fromPrice }, currency }
// NOT a flat { fromPrice } — the summary nesting is required
export interface ViatorSearchPricing {
  summary?: {
    fromPrice?: number
    fromPriceBeforeDiscount?: number
  }
  currency?: string
}

// Legacy type — kept for compatibility
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
  type?: string
  description?: string
  cancelIfBadWeather?: boolean
  cancelIfInsufficientTravelers?: boolean
  refundEligibility?: Array<{
    dayRangeMin?: number
    dayRangeMax?: number
    percentageRefundable?: number
  }>
}

// Actual price breakdown from the schedule endpoint
export interface ViatorAgeBandPrice {
  original: {
    recommendedRetailPrice: number
    partnerNetPrice: number
    bookingFee?: number
    commission?: number
    partnerTotalPrice?: number
  }
  special?: {
    recommendedRetailPrice: number
    partnerNetPrice: number
    bookingFee?: number
    commission?: number
    partnerTotalPrice?: number
    offerStartDate?: string
    offerEndDate?: string
  }
}

export interface ViatorPricingDetail {
  pricingPackageType?: string
  minTravelers?: number
  ageBand: string           // 'ADULT' | 'CHILD' | 'INFANT' | 'SENIOR' | 'YOUTH' | 'TRAVELER'
  price: ViatorAgeBandPrice
}

export interface ViatorTimedEntry {
  startTime: string         // HH:MM
  unavailableDates?: Array<{ date: string; reason?: string }>
}

export interface ViatorPricingRecord {
  daysOfWeek?: string[]
  timedEntries?: ViatorTimedEntry[]
  pricingDetails?: ViatorPricingDetail[]
}

export interface ViatorSeason {
  startDate: string
  endDate: string
  pricingRecords?: ViatorPricingRecord[]
}

// GET /availability/schedules/{productCode} response
export interface ViatorScheduleBookableItem {
  productOptionCode: string
  seasons?: ViatorSeason[]
}

export interface ViatorScheduleResponse {
  currency?: string
  totalCount?: number
  bookableItems?: ViatorScheduleBookableItem[]
  status?: number
  message?: string
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
  // Search API shape: { summary: { fromPrice }, currency }
  pricing?: ViatorSearchPricing
  // Detail API pricingInfo: only age-band definitions, no prices
  pricingInfo?: {
    type?: string
    ageBands?: Array<{
      ageBand?: string
      startAge?: number
      endAge?: number
      minTravelersPerBooking?: number
      maxTravelersPerBooking?: number
    }>
  }
  flags?: string[]
  tags?: number[]
  translationInfo?: { containsMachineTranslatedText?: boolean }
  productUrl?: string
  destinations?: Array<{ ref: string; primary?: boolean }>
  cancellationPolicy?: ViatorCancellationPolicy
  language?: string
  highlights?: string[]
  inclusions?: Array<string | ViatorInclusionItem>
  exclusions?: Array<string | ViatorInclusionItem>
  additionalInfo?: Array<string | { type?: string; description?: string }>
  bookingQuestions?: Array<{ sortOrder?: number; requiredAnswerCount?: number; question?: string; hint?: string; stringQuestionId?: string; id?: number }>
  locations?: Array<{
    provider?: string
    unstructuredLocation?: string
    attractionLatitude?: number
    attractionLongitude?: number
  }>
  bookingProcess?: string
  productOptions?: Array<{
    productOptionCode: string
    title?: string
    description?: string
    languageGuides?: Array<{ type?: string; language?: string; legacyGuide?: string }>
  }>
  logistics?: Record<string, unknown>
}

export interface ViatorProductSearchResponse {
  products?: ViatorProductSummary[]
  totalCount?: number
  currency?: string
  status?: string
  message?: string
}
