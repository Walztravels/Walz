import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { FlightItinerary, FlightSearchParams, Passenger, Ancillary } from '@/lib/flights/types'

export type BookingStep = 'search' | 'results' | 'detail' | 'seats' | 'travellers' | 'extras' | 'review' | 'payment' | 'confirmed'

export interface SelectedSeat {
  segmentId: string
  seatNumber: string
  paxIndex:   number
  type:       'window' | 'aisle' | 'middle' | 'extra-legroom' | 'business'
  priceGBP:   number
}

export interface FarePrediction {
  recommendation: 'book_now' | 'wait' | 'flexible'
  confidence:     number
  headline:       string
  detail:         string
  alternativeDates: { date: string; saving: number; label: string }[]
  priceHistory:   { label: string; price: number }[]
  aiMessage:      string
  fetchedAt:      number
}

export interface LoyaltyAccount {
  isGuest:    boolean
  miles:      number
  tier:       'bronze' | 'silver' | 'gold' | 'platinum'
  nextTier:   'silver' | 'gold' | 'platinum' | null
  milesNextTier: number
  recentActivity: { date: string; description: string; miles: number }[]
  multiplier: number
}

export interface PaymentState {
  clientSecret?: string
  intentId?:     string
  method?:       string
  last4?:        string
}

interface SearchState {
  from:     string
  to:       string
  depart:   string
  returnDate: string
  tripType: string
  cabin:    string
  adults:   number
  children: number
  infants:  number
}

interface FlightStoreState {
  // Search
  search:       SearchState
  results:      FlightItinerary[]
  resultsSource: 'duffel' | 'mock' | null
  isSearching:  boolean
  searchError:  string | null
  // Selection
  selected:     FlightItinerary | null
  // Seats
  seats:        SelectedSeat[]
  // Passengers
  passengers:   Passenger[]
  // Extras
  extras:       Ancillary[]
  // Miles redemption
  milesRedeemed: number
  discountGBP:   number
  // Booking flow
  step:         BookingStep
  payment:      PaymentState
  bookingRef:   string | null
  orderId:      string | null
  // AI & Loyalty
  farePredict:  FarePrediction | null
  loyalty:      LoyaltyAccount | null
}

interface FlightStoreActions {
  // Search
  setSearch: (s: Partial<SearchState>) => void
  resetSearch: () => void
  setResults: (results: FlightItinerary[], source: 'duffel' | 'mock') => void
  setSearching: (v: boolean) => void
  setSearchError: (e: string | null) => void
  // Selection
  setSelected: (it: FlightItinerary | null) => void
  // Seats
  setSeat: (seat: SelectedSeat) => void
  removeSeat: (segmentId: string, paxIndex: number) => void
  clearSeats: () => void
  // Passengers
  setPassengers: (pax: Passenger[]) => void
  // Extras
  addExtra: (a: Ancillary) => void
  removeExtra: (id: string) => void
  clearExtras: () => void
  // Miles
  setMilesRedeemed: (miles: number, discount: number) => void
  // Flow
  setStep: (s: BookingStep) => void
  setPayment: (p: PaymentState) => void
  setConfirmed: (ref: string, orderId: string) => void
  resetBooking: () => void
  // AI & Loyalty
  setFarePredict: (p: FarePrediction | null) => void
  setLoyalty: (a: LoyaltyAccount | null) => void
  // Computed
  totalPrice: () => number
  seatsTotal: () => number
  extrasTotal: () => number
  passengerCount: () => number
}

const defaultSearch: SearchState = {
  from: '', to: '', depart: '', returnDate: '',
  tripType: 'round-trip', cabin: 'ECONOMY',
  adults: 1, children: 0, infants: 0,
}

export const useFlightStore = create<FlightStoreState & FlightStoreActions>()(
  persist(
    (set, get) => ({
      // Initial state
      search:        defaultSearch,
      results:       [],
      resultsSource: null,
      isSearching:   false,
      searchError:   null,
      selected:      null,
      seats:         [],
      passengers:    [],
      extras:        [],
      milesRedeemed: 0,
      discountGBP:   0,
      step:          'search',
      payment:       {},
      bookingRef:    null,
      orderId:       null,
      farePredict:   null,
      loyalty:       null,

      // Actions
      setSearch: (s) => set(st => ({ search: { ...st.search, ...s } })),
      resetSearch: () => set({ search: defaultSearch, results: [], resultsSource: null }),

      setResults: (results, source) => set({ results, resultsSource: source }),
      setSearching: (v) => set({ isSearching: v }),
      setSearchError: (e) => set({ searchError: e }),

      setSelected: (it) => set({ selected: it, seats: [], extras: [] }),

      setSeat: (seat) => set(st => {
        const filtered = st.seats.filter(s => !(s.segmentId === seat.segmentId && s.paxIndex === seat.paxIndex))
        return { seats: [...filtered, seat] }
      }),
      removeSeat: (segmentId, paxIndex) => set(st => ({
        seats: st.seats.filter(s => !(s.segmentId === segmentId && s.paxIndex === paxIndex))
      })),
      clearSeats: () => set({ seats: [] }),

      setPassengers: (pax) => set({ passengers: pax }),

      addExtra: (a) => set(st => {
        if (st.extras.find(e => e.id === a.id)) return st
        return { extras: [...st.extras, a] }
      }),
      removeExtra: (id) => set(st => ({ extras: st.extras.filter(e => e.id !== id) })),
      clearExtras: () => set({ extras: [] }),

      setMilesRedeemed: (miles, discount) => set({ milesRedeemed: miles, discountGBP: discount }),

      setStep: (s) => set({ step: s }),
      setPayment: (p) => set({ payment: p }),
      setConfirmed: (ref, orderId) => set({ bookingRef: ref, orderId, step: 'confirmed' }),
      resetBooking: () => set({
        selected: null, seats: [], passengers: [], extras: [],
        milesRedeemed: 0, discountGBP: 0,
        step: 'search', payment: {}, bookingRef: null, orderId: null,
      }),

      setFarePredict: (p) => set({ farePredict: p }),
      setLoyalty: (a) => set({ loyalty: a }),

      // Computed
      totalPrice: () => {
        const st = get()
        const base = st.selected?.price.total ?? 0
        return base + st.extrasTotal() + st.seatsTotal() - st.discountGBP
      },
      seatsTotal: () => {
        const st = get()
        return st.seats.reduce((s, seat) => s + seat.priceGBP, 0)
      },
      extrasTotal: () => {
        const st = get()
        return st.extras.reduce((s, e) => s + e.price, 0)
      },
      passengerCount: () => {
        const st = get()
        return st.search.adults + st.search.children + st.search.infants || 1
      },
    }),
    {
      name: 'walz-flight-store',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? sessionStorage : {
        getItem: () => null, setItem: () => {}, removeItem: () => {},
      })),
      partialize: (st) => ({
        search:        st.search,
        selected:      st.selected,
        seats:         st.seats,
        passengers:    st.passengers,
        extras:        st.extras,
        milesRedeemed: st.milesRedeemed,
        discountGBP:   st.discountGBP,
        step:          st.step,
        payment:       st.payment,
        bookingRef:    st.bookingRef,
        orderId:       st.orderId,
        loyalty:       st.loyalty,
      }),
    }
  )
)
