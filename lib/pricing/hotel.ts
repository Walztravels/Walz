// lib/pricing/hotel.ts
// Single source of truth for SELF-SERVICE hotel retail pricing.
//
// Architecture:
//   Self-service channels (public website + Jade AI):
//     → calculateHotelRetailPrice() — net rate passed through to customer, no markup
//   Admin / concierge bookings:
//     → calculateBookingPrice()  (lib/pricing/booking-price.ts) — default 18% markup
//
// If the self-service channel markup policy ever changes, update only this file.
// Both the public hotel search route and Jade will automatically inherit the change.

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface HotelRetailPriceInput {
  supplierNetAmount: number  // Hotelbeds rate.net — total for the entire stay
  currency:          string
  nights:            number
}

export interface HotelRetailPrice {
  retailTotal:    number  // customer-facing total price for the stay
  retailPerNight: number  // customer-facing price per night
}

/**
 * Calculate the customer retail price for a self-service hotel booking.
 *
 * Returns null when the supplier net amount is zero, negative, or NaN.
 * Callers MUST skip the rate on null — never fall back to a raw net value.
 * This is the "fail-closed" contract for invalid pricing (requirement: PRICE_UNAVAILABLE).
 *
 * Note: supplierNetAmount (Hotelbeds rate.net) must never appear in the customer-visible
 * result or Jade tool response. Callers should store it in supplierPayload for
 * reconciliation only.
 */
export function calculateHotelRetailPrice(
  input: HotelRetailPriceInput,
): HotelRetailPrice | null {
  const { supplierNetAmount, nights } = input

  if (
    typeof supplierNetAmount !== 'number' ||
    isNaN(supplierNetAmount)              ||
    supplierNetAmount <= 0
  ) {
    return null
  }

  const safeNights = Math.max(1, Math.floor(nights))

  return {
    retailTotal:    round2(supplierNetAmount),
    retailPerNight: round2(supplierNetAmount / safeNights),
  }
}
