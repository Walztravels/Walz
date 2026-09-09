import prisma from '@/lib/db'
import { TOUR_ADDONS, type TourAddon } from './addons'

/**
 * Authoritative tour pricing — the ONLY place tour totals are computed for
 * payment. The browser submits identifiers (tourId, groupSize, addon ids);
 * money always comes from the Tour DB row and the shared add-on catalogue.
 */

export { TOUR_ADDONS }
export type { TourAddon }

export interface TourPricing {
  tour: { id: string; name: string; slug: string; location: string; price: number; currency: string; imageUrl: string | null }
  groupSize:      number
  currency:       string
  basePrice:      number
  selectedAddons: TourAddon[]
  addonsTotal:    number
  total:          number
}

export class TourPricingError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'TourPricingError'
  }
}

export async function priceTour(
  tourId: string,
  groupSize: number,
  addonIds: string[],
): Promise<TourPricing> {
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 50) {
    throw new TourPricingError('Invalid group size')
  }

  const tour = await prisma.tour.findUnique({
    where:  { id: tourId },
    select: { id: true, name: true, slug: true, location: true, price: true, currency: true, active: true, imageUrl: true },
  })
  if (!tour || !tour.active) throw new TourPricingError('Tour not found', 404)

  const selectedAddons = TOUR_ADDONS.filter(a => addonIds.includes(a.id))
  if (selectedAddons.length !== new Set(addonIds).size) {
    throw new TourPricingError('Unknown add-on selected')
  }

  const basePrice   = tour.price * groupSize
  const addonsTotal = selectedAddons.reduce((s, a) => s + a.price * groupSize, 0)

  return {
    tour: { id: tour.id, name: tour.name, slug: tour.slug, location: tour.location, price: tour.price, currency: tour.currency, imageUrl: tour.imageUrl },
    groupSize,
    currency:    tour.currency,
    basePrice,
    selectedAddons,
    addonsTotal,
    total: basePrice + addonsTotal,
  }
}
