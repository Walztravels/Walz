// ─────────────────────────────────────────────────────────────────────────────
// Walz Travels — Activities marketplace types
// Shared across Hotelbeds, Viator, and future suppliers.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivitySupplier = 'HOTELBEDS' | 'VIATOR' | 'MANUAL'

export type ActivityBookingSource =
  | 'CUSTOMER_WEB'
  | 'ADMIN'
  | 'JADE'
  | 'PHONE'
  | 'WHATSAPP'
  | 'MANUAL'

// ── Normalized activity model (public-safe) ───────────────────────────────────
// All supplier-specific fields are mapped into this shape before leaving the
// server. supplierNetPrice must never appear in public API responses.

export interface NormalizedActivity {
  /** Walz-internal stable ID: "{supplier}-{supplierProductId}" */
  id: string
  supplier: ActivitySupplier
  supplierProductId: string

  /** URL-safe slug derived from supplier ID */
  slug: string

  title: string
  shortDescription?: string
  description?: string

  destination?: {
    name?: string
    code?: string
    country?: string
  }

  location?: {
    latitude?: number
    longitude?: number
    address?: string
  }

  images: Array<{
    url: string
    caption?: string
    isCover?: boolean
  }>

  rating?: number
  reviewCount?: number

  duration?: {
    text?: string
    minMinutes?: number
    maxMinutes?: number
  }

  categories?: string[]
  tags?: string[]

  highlights?: string[]
  included?: string[]
  excluded?: string[]

  meetingPoint?: string
  pickupAvailable?: boolean

  cancellationPolicy?: string
  freeCancellation: boolean

  instantConfirmation?: boolean

  accessibility?: string[]
  languages?: string[]

  /** Currency code for sellingPrice */
  currency: string

  /** Walz selling price (after markup). Always set. */
  sellingPrice: number

  /** Original / crossed-out price if the supplier reports a discount */
  originalPrice?: number

  /** Supplier net cost — set ONLY in admin/server contexts, never sent to public */
  supplierNetPrice?: number

  source: 'hotelbeds' | 'viator' | 'manual' | 'db'
}

// ── Search params ─────────────────────────────────────────────────────────────

export interface ActivitySearchParams {
  /** Human-readable destination name e.g. "Dubai", "London" */
  destination: string
  /** YYYY-MM-DD */
  dateFrom?: string
  /** YYYY-MM-DD */
  dateTo?: string
  adults: number
  children?: number
  infants?: number
  currency?: string
  /** Pagination */
  offset?: number
  limit?: number
}

// ── Availability ──────────────────────────────────────────────────────────────

export interface AvailabilityParams {
  supplier: ActivitySupplier
  supplierProductId: string
  modalityCode?: string
  destination?: string    // human-readable name, used to resolve supplier dest code
  date: string            // YYYY-MM-DD
  adults: number
  children?: number
  infants?: number
  currency?: string
}

export interface ActivityOption {
  code: string
  name: string
  /** Selling price for this option/modality */
  sellingPrice: number
  /** Supplier net — admin only, never public */
  supplierNetPrice?: number
  currency: string
  duration?: string
  startTimes?: string[]
  availabilityToken?: string  // supplier-specific booking token
  tokenExpiry?: string        // ISO datetime
  cancellationPolicy?: string
  freeCancellation?: boolean
}

export interface ActivityAvailability {
  available: boolean
  options: ActivityOption[]
  currency: string
  bookingQuestions?: BookingQuestion[]
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface BookingQuestion {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'date'
  required: boolean
  perPerson?: boolean
  options?: Array<{ label: string; value: string }>
  maxLength?: number
}

export interface Traveller {
  type: 'ADULT' | 'CHILD' | 'INFANT'
  age?: number
  firstName?: string
  lastName?: string
  answers?: Record<string, string>
}

export interface BookingParams {
  supplier: ActivitySupplier
  supplierProductId: string
  modalityCode?: string
  availabilityToken?: string

  date: string            // YYYY-MM-DD
  startTime?: string

  adults: number
  children?: number
  infants?: number
  travellers?: Traveller[]

  holderName: string
  holderEmail: string
  holderPhone?: string

  questionAnswers?: Record<string, string>

  currency: string
  sellingPrice: number
  supplierNetPrice?: number

  walzReference: string
  paymentReference?: string
  paymentGateway?: string
}

export interface ActivityBookingResult {
  success: boolean
  walzReference: string
  supplierReference?: string
  voucherUrl?: string
  status: 'CONFIRMED' | 'PENDING' | 'FAILED'
  error?: string
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface ActivityProvider {
  readonly name: ActivitySupplier

  search(params: ActivitySearchParams): Promise<NormalizedActivity[]>

  getProduct(
    supplierProductId: string,
    params?: { currency?: string; language?: string },
  ): Promise<NormalizedActivity>

  checkAvailability(params: AvailabilityParams): Promise<ActivityAvailability>

  book(params: BookingParams): Promise<ActivityBookingResult>

  getBooking?(supplierReference: string): Promise<ActivityBookingResult>

  cancelBooking?(supplierReference: string): Promise<{ success: boolean; refundAmount?: number; error?: string }>
}

// ── Unified search result ─────────────────────────────────────────────────────

export interface UnifiedSearchResult {
  activities: NormalizedActivity[]
  total: number
  suppliers: {
    hotelbeds?: { count: number; error?: string }
    viator?:    { count: number; error?: string }
    db?:        { count: number }
  }
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export interface ActivityPricingInput {
  supplier: ActivitySupplier
  supplierNetPrice: number
  supplierCurrency: string
  targetCurrency?: string
  productId?: string
  destination?: string
}

export interface ActivityPricingResult {
  supplierNetPrice: number
  supplierCurrency: string
  markupAmount: number
  markupPercent: number
  sellingPrice: number
  targetCurrency: string
}
