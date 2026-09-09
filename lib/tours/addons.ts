/**
 * Tour add-on catalogue — single source of truth for add-on prices.
 * Imported by the booking UI (display) AND by lib/tours/pricing.ts
 * (server-side payment authority); the browser only ever submits the ids.
 */
export interface TourAddon {
  id:          string
  name:        string
  description: string
  price:       number   // per person, in the tour's currency
}

export const TOUR_ADDONS: TourAddon[] = [
  { id: 'transfer', name: 'Private Transfer',     description: 'Airport or hotel pickup and drop-off included',                   price: 45 },
  { id: 'photos',   name: 'Photography Package',  description: 'Professional photographer for the full tour (digital download)', price: 75 },
  { id: 'lunch',    name: 'Gourmet Lunch',        description: 'Three-course lunch at a top-rated local restaurant',              price: 35 },
  { id: 'guide',    name: 'Audio Guide Device',   description: 'Multilingual audio guide for the entire tour',                    price: 15 },
]
