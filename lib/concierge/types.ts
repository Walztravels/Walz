// lib/concierge/types.ts
// Shared TypeScript types for the Walz Concierge Core.
// All business entities map 1:1 to the concierge_* tables in Supabase.

// ── Enumerations ──────────────────────────────────────────────────────────────

export type FulfilmentMode  = 'instant' | 'request_to_book' | 'bespoke'
export type AdapterType     = 'manual' | 'api' | 'gds' | 'comfortpass' | 'aviapages'
export type RequestStatus   = 'pending' | 'quoted' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type QuoteStatus     = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
export type BookingStatus   = 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type DispatchStatus  = 'pending' | 'dispatched' | 'acknowledged' | 'completed' | 'failed'
export type PricingRuleType = 'fixed_markup' | 'percentage_markup' | 'seasonal' | 'volume'

// ── Category ─────────────────────────────────────────────────────────────────

export interface RequiredField {
  key:      string
  label:    string
  type:     'text' | 'date' | 'number' | 'select'
  required: boolean
  options?: string[]  // for select type
}

export interface ConciergeCategory {
  id:              string
  slug:            string
  name:            string
  description:     string
  icon?:           string
  fulfilmentModes: FulfilmentMode[]
  requiredFields:  RequiredField[]
  isActive:        boolean
  displayOrder:    number
  metadata:        Record<string, unknown>
}

// ── Supplier ──────────────────────────────────────────────────────────────────

export interface ConciergeSupplier {
  id:            string
  slug:          string
  name:          string
  adapterType:   AdapterType
  contactEmail?: string
  contactPhone?: string
  categorySlugs: string[]
  isActive:      boolean
  metadata:      Record<string, unknown>
  // NOTE: API credentials are NEVER in this type. They live in env vars only.
}

// ── Product ───────────────────────────────────────────────────────────────────

export interface BasePrice {
  amount:   number
  currency: string
  unit?:    string   // 'per_night' | 'per_person' | 'per_transfer' | etc.
}

export interface ConciergeProduct {
  id:          string
  categoryId:  string
  supplierId?: string
  name:        string
  description?: string
  basePrice:   BasePrice
  attributes:  Record<string, unknown>
  isActive:    boolean
}

// ── Pricing Rule ──────────────────────────────────────────────────────────────

export interface PricingRule {
  id:         string
  appliesTo:  'category' | 'product' | 'supplier' | 'global'
  targetId?:  string
  ruleType:   PricingRuleType
  conditions: Record<string, unknown>
  modifier:   { type: 'percent' | 'fixed'; value: number; currency?: string }
  priority:   number
  isActive:   boolean
  validFrom?: Date
  validUntil?: Date
}

// ── Request ───────────────────────────────────────────────────────────────────

export interface ConciergeRequest {
  id:             string
  reference:      string
  jadeSessionId:  string
  chatwootConvId?: number
  categoryId:     string
  category?:      ConciergeCategory
  fulfilmentMode: FulfilmentMode
  status:         RequestStatus
  intentFields:   Record<string, unknown>
  clientName?:    string
  clientEmail?:   string
  clientPhone?:   string
  slaDeadline?:   Date
  // assigned_to and internal_notes are intentionally excluded — never sent to Jade
  createdAt:      Date
  updatedAt:      Date
}

// ── Quote ─────────────────────────────────────────────────────────────────────

export interface QuotedPrice {
  amount:   number
  currency: string
}

export interface ConciergeQuote {
  id:               string
  requestId:        string
  productId?:       string
  supplierId?:      string
  quotedPrice:      QuotedPrice
  // pricing_breakdown intentionally excluded — never sent to Jade
  validUntil?:      Date
  status:           QuoteStatus
  createdAt:        Date
}

// ── Booking ───────────────────────────────────────────────────────────────────

export interface ConciergeBooking {
  id:              string
  quoteId?:        string
  requestId:       string
  confirmationRef?: string
  status:          BookingStatus
  bookedAt:        Date
  serviceDate?:    Date
  notes?:          string
}

// ── Fulfilment ────────────────────────────────────────────────────────────────

export interface ConciergeFulfilment {
  id:               string
  requestId:        string
  bookingId?:       string
  supplierId:       string
  adapterType:      AdapterType
  dispatchStatus:   DispatchStatus
  supplierRef?:     string
  dispatchPayload:  Record<string, unknown>
  dispatchResponse: Record<string, unknown>
  dispatchedAt?:    Date
  acknowledgedAt?:  Date
  completedAt?:     Date
  createdAt:        Date
}

// ── Adapter contract types ────────────────────────────────────────────────────

export interface DispatchPayload {
  requestId:        string
  requestReference: string
  category:         ConciergeCategory
  supplier:         ConciergeSupplier
  fulfilmentMode:   FulfilmentMode
  fields:           Record<string, unknown>
  clientName?:      string
  clientEmail?:     string
  clientPhone?:     string
  chatwootConvId?:  number
}

export interface DispatchResult {
  success:     boolean
  supplierRef?: string
  error?:      string
  metadata?:   Record<string, unknown>
}

export interface AvailabilityQuery {
  categorySlug: string
  date?:        Date
  pax?:         number
}

export interface AvailabilityResult {
  available: boolean
  sla:       string   // human-readable, e.g. "Within 4 hours"
  note?:     string
}

// ── Concierge Core return types (safe — never contain internal fields) ─────────

export interface CreateRequestResult {
  reference: string
  sla:       string
  status:    RequestStatus
}

export interface ValidationResult {
  valid:   boolean
  missing: string[]  // labels of missing required fields
}
