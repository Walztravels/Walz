// lib/portal/booking-dto.ts — Release 6.3: Sanitized customer booking DTO
// NEVER expose: notes, fxRate, fxMargin, fxSource, fxQuotedAt, fareAmount, fareCurrency,
//               stripeClientSecret, stripePaymentIntentId, cryptoInvoiceId, cryptoPaidCurrency,
//               cryptoAmountReceived, jadeAssisted, leadId, quoteId, createdByStaffId, branch

import {
  getCustomerBookingState,
  getCustomerBookingStateLabel,
  getCustomerBookingStateDescription,
  getCustomerBookingStateColor,
  bookingStateNeedsAction,
  type CustomerBookingState,
} from './booking-states'

export interface CustomerFlightSegment {
  departureAirport: string
  arrivalAirport: string
  departureTime: string
  airline: string
  flightNumber: string
}

export interface CustomerBookingDetail {
  id: string
  reference: string
  type: string
  state: CustomerBookingState
  stateLabel: string
  stateDescription: string
  stateColor: string
  needsAction: boolean
  totalAmount: number
  currency: string
  pnr: string | null
  contactEmail: string
  contactPhone: string | null
  createdAt: string
  flightDetails: {
    origin: string | null
    destination: string | null
    outbound: CustomerFlightSegment[]
  } | null
  hotelDetails: {
    name: string | null
    location: string | null
    checkIn: string | null
    checkOut: string | null
  } | null
  passengers: Array<{
    type: string
    firstName: string
    lastName: string
    dateOfBirth?: string
  }>
  tickets: Array<{
    id: string
    htmlSnapshot: string | null
    issuedAt: string
  }>
}

interface RawBooking {
  id: string
  bookingReference: string
  type: string
  status: string
  paymentStatus: string
  totalAmount: number | { toNumber(): number }
  currency: string
  pnr: string | null
  contactEmail: string
  contactPhone: string | null
  flightDetails: unknown
  hotelDetails: unknown
  passengers: unknown
  createdAt: Date
  tickets: Array<{
    id: string
    htmlSnapshot: string | null
    createdAt: Date
  }>
}

export function toCustomerBookingDetail(b: RawBooking): CustomerBookingDetail {
  const state = getCustomerBookingState({ status: b.status, paymentStatus: b.paymentStatus })

  let flightDetails: CustomerBookingDetail['flightDetails'] = null
  if (b.flightDetails && typeof b.flightDetails === 'object') {
    const raw = b.flightDetails as Record<string, unknown>
    const outboundRaw = Array.isArray(raw.outbound) ? (raw.outbound as Record<string, unknown>[]) : []
    flightDetails = {
      origin: typeof raw.origin === 'string' ? raw.origin : null,
      destination: typeof raw.destination === 'string' ? raw.destination : null,
      outbound: outboundRaw.map(seg => ({
        departureAirport: String(seg.departureAirport ?? ''),
        arrivalAirport: String(seg.arrivalAirport ?? ''),
        departureTime: String(seg.departureTime ?? ''),
        airline: String(seg.airline ?? ''),
        flightNumber: String(seg.flightNumber ?? ''),
      })),
    }
  }

  let hotelDetails: CustomerBookingDetail['hotelDetails'] = null
  if (b.hotelDetails && typeof b.hotelDetails === 'object') {
    const raw = b.hotelDetails as Record<string, unknown>
    hotelDetails = {
      name: typeof raw.name === 'string' ? raw.name
          : typeof raw.hotelName === 'string' ? raw.hotelName : null,
      location: typeof raw.location === 'string' ? raw.location : null,
      checkIn: typeof raw.checkIn === 'string' ? raw.checkIn : null,
      checkOut: typeof raw.checkOut === 'string' ? raw.checkOut : null,
    }
  }

  const passengers = (Array.isArray(b.passengers) ? (b.passengers as Record<string, unknown>[]) : [])
    .map(p => ({
      type: String(p.type ?? 'ADT'),
      firstName: String(p.firstName ?? ''),
      lastName: String(p.lastName ?? ''),
      ...(p.dateOfBirth ? { dateOfBirth: String(p.dateOfBirth) } : {}),
      // passportNumber, passportExpiry, nationality intentionally excluded
    }))

  const amount = typeof b.totalAmount === 'object' && b.totalAmount !== null
    ? (b.totalAmount as { toNumber(): number }).toNumber()
    : Number(b.totalAmount)

  return {
    id: b.id,
    reference: b.bookingReference,
    type: b.type,
    state,
    stateLabel: getCustomerBookingStateLabel(state),
    stateDescription: getCustomerBookingStateDescription(state),
    stateColor: getCustomerBookingStateColor(state),
    needsAction: bookingStateNeedsAction(state),
    totalAmount: amount,
    currency: b.currency,
    pnr: b.pnr ?? null,
    contactEmail: b.contactEmail,
    contactPhone: b.contactPhone ?? null,
    createdAt: b.createdAt.toISOString(),
    flightDetails,
    hotelDetails,
    passengers,
    tickets: b.tickets.map(t => ({
      id: t.id,
      htmlSnapshot: t.htmlSnapshot ?? null,
      issuedAt: t.createdAt.toISOString(),
    })),
  }
}
