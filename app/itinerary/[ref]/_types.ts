// PublicProposalDTO — the ONLY shape the public proposal page receives.
// Built server-side. Zero internal fields.

import type { PublicOptionGroup } from '@/lib/v2/types'

export interface ProposalFlight {
  from?: string
  to?: string
  fromCity?: string
  toCity?: string
  airline?: string
  flightNumber?: string
  date?: string
  departureTime?: string
  arrivalTime?: string
  class?: string
  pnr?: string
  stops?: number
  airlineLogoUrl?: string  // pre-resolved safe URL, never iataCode
  imageUrl?: string        // aircraft image
}

export interface ProposalTrain {
  from?: string
  to?: string
  date?: string
  departureTime?: string
  arrivalTime?: string
  trainNumber?: string
  class?: string
  provider?: string
  image?: string
  images?: string[]
}

export interface ProposalFerry {
  from?: string
  to?: string
  date?: string
  departureTime?: string
  arrivalTime?: string
  operator?: string
  class?: string
  vessel?: string
  image?: string
  images?: string[]
}

export interface ProposalHotel {
  name?: string
  location?: string
  checkIn?: string
  checkOut?: string
  roomType?: string
  nights?: number
  mealPlan?: string
  images?: string[]
}

export interface ProposalTransfer {
  type?: string
  from?: string
  to?: string
  date?: string
  vehicle?: string
  images?: string[]
}

export interface ProposalTour {
  name?: string
  location?: string
  date?: string
  time?: string
  duration?: string
  provider?: string
  notes?: string
  images?: string[]
}

export interface ProposalDay {
  day: number
  title: string
  destination?: string
  description?: string
  activities?: string[]
  meals?: string
  accommodation?: string
  clientNotes?: string
}

export interface ProposalPriceLine {
  item: string
  description?: string
  cost: number
}

export interface ProposalPackageOption {
  id: string
  name: string
  price: number
  currency: string
  description?: string
  features: string[]
  isSelected?: boolean
}

export interface ProposalPaymentMilestone {
  label: string
  amount: number
  currency: string
  dueDate?: string
  paid?: boolean
}

export interface ProposalContact {
  globalWhatsAppE164: string
  globalWhatsAppDisplay: string
  nigeriaWhatsAppE164: string
  nigeriaWhatsAppDisplay: string
  email: string
  emergencyPhoneE164: string
  emergencyPhoneDisplay: string
}

// The complete safe DTO — never contains supplier cost, margin, internal notes,
// API payloads, or any other admin-only data.
export interface PublicProposalDTO {
  referenceNumber: string
  title: string
  status: string                // 'proposal' | 'approved' | 'live'
  clientName?: string
  destination?: string
  startDate?: string            // ISO string
  endDate?: string
  duration?: number
  numberOfTravellers: number
  tripType?: string
  currency: string

  coverImage?: string
  overview?: string
  terms?: string

  totalPrice?: number
  deposit?: number
  depositDue?: string
  balanceDue?: string

  days: ProposalDay[]
  flights: ProposalFlight[]
  hotels: ProposalHotel[]
  transfers: ProposalTransfer[]
  tours: ProposalTour[]
  trains: ProposalTrain[]
  ferries: ProposalFerry[]
  inclusions: string[]
  exclusions: string[]
  priceBreakdown: ProposalPriceLine[]
  packageOptions: ProposalPackageOption[]
  paymentSchedule: ProposalPaymentMilestone[]

  contact: ProposalContact

  // GA5: acceptance flow — only present when relevant to the UI
  approvalToken?: string      // status='proposal', valid + not used + not expired
  acceptedAt?: string         // status='approved': ISO timestamp from AcceptanceSnapshot
  acceptedTotal?: number | null
  acceptedBy?: string         // client's typed name from AcceptanceSnapshot
  acceptedOptionIds?: string[]

  // V2: option customiser — absent / empty = V1 flow (no customiser rendered)
  optionGroups?: PublicOptionGroup[]
  acceptanceVersion?: 1 | 2
}
