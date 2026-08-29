// lib/v2/types.ts
// =============================================================================
// Walz Travels Itinerary Platform V2 — Shared Contracts
// FROZEN — all specialist agents use these types.
// No specialist agent may invent a parallel type system.
// =============================================================================
// Rules:
//   • No React, no Prisma, no HTTP imports — pure TypeScript types only
//   • Internal fields are marked // INTERNAL — never in public DTOs
//   • PublicOptionGroup / PublicOptionItem are the safe DTO versions
//   • AcceptedConfigurationV2 is immutable once written
// =============================================================================


// ─── Enums / Union Types ──────────────────────────────────────────────────────

export type OptionCategory =
  | 'FLIGHT'
  | 'HOTEL'
  | 'ROOM'
  | 'TRANSFER'
  | 'ACTIVITY'
  | 'INSURANCE'
  | 'ADDON'
  | 'OTHER'

export type SelectionMode = 'SINGLE' | 'MULTIPLE'

export type PricingMode = 'REPLACEMENT' | 'ADD_ON'

export type PaymentType   = 'DEPOSIT' | 'BALANCE' | 'FULL' | 'OTHER'
export type PaymentMethod = 'STRIPE' | 'PAYSTACK' | 'BANK_TRANSFER' | 'CRYPTO' | 'MANUAL'
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

export type FulfilmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'BOOKED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED'

export type FulfilmentItemType =
  | 'FLIGHT'
  | 'HOTEL'
  | 'TRANSFER'
  | 'TOUR'
  | 'TRAIN'
  | 'FERRY'
  | 'ESIM'
  | 'OTHER'

export type OptionSourceType =
  | 'MANUAL'
  | 'FLIGHT_BOOKING'
  | 'HOTEL_BOOKING'
  | 'TRANSFER_BOOKING'
  | 'TOUR_BOOKING'

export type SelectionValidationError =
  | 'GROUP_NOT_FOUND'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_NOT_ACTIVE'
  | 'ITEM_NOT_SELECTABLE'
  | 'ITEM_EXPIRED'
  | 'REQUIRED_GROUP_MISSING'
  | 'SINGLE_EXCEEDED'
  | 'MIN_NOT_MET'
  | 'MAX_EXCEEDED'
  | 'DUPLICATE_ITEM'
  | 'CURRENCY_MISMATCH'
  | 'WRONG_ITINERARY'


// ─── Option Group ─────────────────────────────────────────────────────────────

export interface OptionGroup {
  id:                    string
  itineraryId:           string
  name:                  string
  description?:          string
  category:              OptionCategory
  selectionMode:         SelectionMode
  pricingMode:           PricingMode
  required:              boolean
  minSelections:         number
  maxSelections:         number
  sortOrder:             number
  active:                boolean
  clientVisible:         boolean
  lockedAfterAcceptance: boolean
  createdAt:             string    // ISO
  updatedAt:             string    // ISO
}

/** Safe DTO — no internal fields. Sent to the client proposal page. */
export interface PublicOptionGroup {
  id:            string
  name:          string
  description?:  string
  category:      OptionCategory
  selectionMode: SelectionMode
  pricingMode:   PricingMode
  required:      boolean
  minSelections: number
  maxSelections: number
  sortOrder:     number
  items:         PublicOptionItem[]   // always populated; no items = no group in DTO
}


// ─── Option Item ──────────────────────────────────────────────────────────────

export interface OptionItem {
  id:               string
  groupId:          string
  itineraryId:      string
  name:             string
  description?:     string

  // Client-visible pricing
  clientPrice:      number
  currency:         string
  priceAdjustment:  number

  // Presentation
  recommended:      boolean
  defaultSelected:  boolean
  clientSelectable: boolean
  active:           boolean
  sortOrder:        number
  imageUrl?:        string
  quoteExpiresAt?:  string    // ISO — item unavailable after this date

  // INTERNAL — never in public DTOs
  supplierCost:     number | null
  internalMargin:   number | null
  sourceType:       OptionSourceType | null
  sourceBookingRef: string | null
  metadata:         Record<string, unknown> | null

  createdAt:        string    // ISO
  updatedAt:        string    // ISO
}

/** Safe DTO — no supplier cost, margin, or booking refs. Sent to the client proposal page. */
export interface PublicOptionItem {
  id:               string
  groupId:          string
  name:             string
  description?:     string
  clientPrice:      number
  currency:         string
  priceAdjustment:  number
  recommended:      boolean
  defaultSelected:  boolean
  active:           boolean
  sortOrder:        number
  imageUrl?:        string
  quoteExpiresAt?:  string
}


// ─── Pricing Engine ───────────────────────────────────────────────────────────

export interface SelectedItemInput {
  groupId:        string
  itemId:         string
  pricingMode:    PricingMode
  priceAdjustment: number   // authoritative for REPLACEMENT groups
  clientPrice:    number    // authoritative for ADD_ON groups
  currency:       string
  label:          string    // item name — for the line-item breakdown
}

export interface PricingInput {
  /** Base itinerary total (itinerary.totalPrice) before option adjustments */
  baseTotal:     number
  selectedItems: SelectedItemInput[]
  currency:      string
}

export interface PricingLineItem {
  itemId:      string
  groupId:     string
  pricingMode: PricingMode
  amount:      number    // the contribution to grandTotal
  label:       string
}

export interface PricingResult {
  baseTotal:               number
  replacementAdjustment:   number   // SUM of all REPLACEMENT priceAdjustments (can be negative)
  addOnTotal:              number   // SUM of all ADD_ON clientPrices
  grandTotal:              number   // baseTotal + replacementAdjustment + addOnTotal (min 0)
  lineItems:               PricingLineItem[]
  currency:                string
}


// ─── AcceptanceSnapshot V2 ────────────────────────────────────────────────────
// Written to Itinerary.selectedOption once at acceptance. NEVER modified after.
// V1 snapshots (version: 1 or undefined) remain valid and are read unchanged.

export interface AcceptedSelectedItem {
  itemId:          string
  name:            string
  description?:    string
  clientPrice:     number
  priceAdjustment: number
  currency:        string
}

export interface AcceptedGroup {
  groupId:       string
  groupName:     string
  selectionMode: SelectionMode
  pricingMode:   PricingMode
  selectedItems: AcceptedSelectedItem[]
}

export interface AcceptedConfigurationV2 {
  version:          2
  acceptedAt:       string   // ISO
  acceptedBy:       string   // client's typed name
  proposalHash:     string   // SHA-256 of the proposal state at acceptance
  currency:         string
  acceptedTotal:    number   // server-computed; browser never supplies this
  deposit:          number | null
  termsAccepted:    boolean
  selectedGroups:   AcceptedGroup[]
  pricingBreakdown: PricingResult
}

/** V1 snapshot shape — preserved for backwards compatibility */
export interface AcceptedConfigurationV1 {
  version?:          1
  acceptedAt?:       string
  acceptedBy?:       string
  proposalHash?:     string
  currency?:         string
  acceptedTotal?:    number
  deposit?:          number
  termsAccepted?:    boolean
  selectedOptionIds?: string[]
  options?:          unknown[]
}

export type AcceptanceSnapshot = AcceptedConfigurationV1 | AcceptedConfigurationV2


// ─── Payment Record ───────────────────────────────────────────────────────────

export interface PaymentRecord {
  id:                string
  itineraryId:       string
  acceptanceVersion: 1 | 2
  amount:            number
  currency:          string
  type:              PaymentType
  method:            PaymentMethod
  status:            PaymentStatus
  providerReference: string | null   // Stripe PI id, Paystack reference, etc.
  createdAt:         string           // ISO
  paidAt:            string | null    // ISO
  createdByStaffId:  string | null
  notes:             string | null
}

/** Payload the /api/itinerary-payments/initiate route accepts from the browser */
export interface PaymentInitiateRequest {
  itineraryReference: string
  paymentType:        PaymentType
  method:             PaymentMethod
  email?:             string
}

/** Response the initiate route returns */
export interface PaymentInitiateResponse {
  method:             PaymentMethod
  amount:             number       // server-authoritative; for display only
  currency:           string
  paymentType:        PaymentType
  itineraryReference: string
  // Stripe
  clientSecret?:      string
  paymentIntentId?:   string
  // Paystack / redirect
  url?:               string
  reference?:         string
  // Bank / pending
  pending?:           boolean
  instructions?:      { message: string; reference: string }
  message?:           string
}


// ─── Fulfilment ───────────────────────────────────────────────────────────────

export interface FulfilmentItem {
  id:                string
  itineraryId:       string
  type:              FulfilmentItemType
  description:       string
  status:            FulfilmentStatus
  supplierReference: string | null   // PNR, hotel confirmation — set AFTER genuine booking
  clientReference:   string | null
  assignedTo:        string | null
  notes:             string | null
  completedAt:       string | null   // ISO
  createdAt:         string          // ISO
  updatedAt:         string          // ISO
}


// ─── Selection Validation ─────────────────────────────────────────────────────

export interface SelectionValidationIssue {
  code:     SelectionValidationError
  groupId?: string
  itemId?:  string
  message:  string
}

export interface SelectionValidationResult {
  valid:  boolean
  errors: SelectionValidationIssue[]
}

/** The shape the client sends to the acceptance endpoint */
export interface ClientSelectionPayload {
  groupId:  string
  itemIds:  string[]   // one for SINGLE, one-or-more for MULTIPLE
}
