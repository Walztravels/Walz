// Maps ComfortPass API responses to Walz normalised models.
// Supplier amounts are intentionally stripped — never expose CP net pricing
// to Jade, customer-facing routes, or any non-admin surface.

import type {
  CPAirport, CPService, CPPrice,
  CPBookingResponse, CPVoucher,
  WalzAirport, WalzService, WalzServicePrice,
  WalzBookingRecord, WalzVoucher,
} from './types'

export function toWalzAirport(cp: CPAirport): WalzAirport {
  return {
    code:    cp.code,
    name:    cp.name,
    city:    cp.city,
    country: cp.country,
  }
}

export function toWalzService(cp: CPService): WalzService {
  // CP API returns snake_case fields; our type uses camelCase.
  // Read both variants defensively so either convention works.
  const raw = cp as unknown as Record<string, unknown>

  const code        = cp.code        ?? (raw.id           as string) ?? (raw.service_code as string) ?? ''
  const name        = cp.name        ?? (raw.title        as string) ?? (raw.service_name as string) ?? (raw.lounge_name as string) ?? ''
  const airportCode = cp.airportCode ?? (raw.airport_code as string) ?? (raw.airport      as string) ?? ''
  const imageUrl    = cp.imageUrl    ?? (raw.image_url    as string) ?? (raw.image        as string) ?? (raw.logo as string) ?? (raw.thumbnail as string)
  const amenities   = cp.amenities   ?? (raw.facilities   as string[]) ?? (raw.features as string[])

  return {
    code,
    name,
    type:        cp.type,
    airportCode,
    terminal:    cp.terminal ?? (raw.terminal_code as string),
    description: cp.description ?? (raw.info as string) ?? (raw.details as string),
    imageUrl,
    amenities,
  }
}

export function toWalzServicePrice(cp: CPPrice): WalzServicePrice {
  // Format for customer display only — raw amount never forwarded
  const formatted = new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency: cp.currency,
  }).format(cp.amount)

  return {
    serviceCode:  cp.serviceCode,
    displayPrice: cp.perPerson ? `${formatted} / person` : formatted,
    perPerson:    cp.perPerson,
  }
}

export function toWalzBookingRecord(
  cp:      CPBookingResponse,
  walzRef: string,
): WalzBookingRecord {
  return {
    walzRef,
    cpBookingId:    cp.id,
    bookingNumber:  cp.bookingNumber,
    status:         cp.status,
    serviceCode:    cp.serviceCode,
    airportCode:    cp.airportCode,
    date:           cp.date,
    time:           cp.time,
    flightNumber:   cp.flightNumber,
    passengerCount: cp.passengers.length,
    // supplier totalAmount intentionally omitted
  }
}

export function toWalzVoucher(cp: CPVoucher, walzRef: string): WalzVoucher {
  return {
    walzRef,
    bookingNumber: cp.bookingNumber,
    voucherUrl:    cp.voucherUrl,
    qrCode:        cp.qrCode,
  }
}

// Build a stable booking fingerprint for idempotency checking.
// Used as the UNIQUE constraint value in comfortpass_bookings.fingerprint.
export function buildFingerprint(params: {
  requestId:    string
  serviceCode:  string
  airportCode:  string
  date:         string
  flightNumber: string
  passengers:   number
}): string {
  return [
    params.requestId,
    params.serviceCode,
    params.airportCode,
    params.date,
    params.flightNumber,
    String(params.passengers),
  ].join('::')
}
