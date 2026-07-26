// Aviapages Charter API — request and response shapes.
// All types are server-only; never re-export from client bundles.

// ── Airport ────────────────────────────────────────────────────────────────────

export interface APAirport {
  icao:      string
  iata?:     string
  name:      string
  city?:     string
  country?:  string
}

// ── Aircraft ───────────────────────────────────────────────────────────────────

export type APAircraftCategory =
  | 'very_light'
  | 'light'
  | 'midsize'
  | 'super_midsize'
  | 'heavy'
  | 'ultra_long_range'
  | 'vip_airliner'

export interface APAircraft {
  id:              number
  model:           string
  manufacturer:    string
  category:        APAircraftCategory
  pax_max:         number
  range_km:        number
  speed_kmh?:      number
  year_built?:     number
  image_url?:      string
}

// ── Flight Calculator ──────────────────────────────────────────────────────────

export interface APFlightCalculatorParams {
  from:       string   // ICAO or IATA
  to:         string
  passengers: number
  date?:      string   // YYYY-MM-DD
}

export interface APFlightCalculatorResult {
  from:           string
  to:             string
  distance_km:    number
  flight_time_h:  number
  price_from:     number | null
  price_to:       number | null
  currency:       string
}

// ── Charter Search ─────────────────────────────────────────────────────────────

export interface APCharterSearchParams {
  from:        string
  to:          string
  date:        string    // YYYY-MM-DD
  passengers:  number
  aircraft_category?: APAircraftCategory
}

export interface APCharterSearchResult {
  id:               number
  aircraft:         APAircraft
  operator:         string
  from_airport:     APAirport
  to_airport:       APAirport
  departure_date:   string
  price:            number | null
  currency:         string
  flight_time_h?:   number
  is_available:     boolean
}

// ── Charter Quote Request ──────────────────────────────────────────────────────

export interface APQuoteRequestPayload {
  from:               string   // ICAO/IATA
  to:                 string
  departure_date:     string   // YYYY-MM-DD
  return_date?:       string
  passengers:         number
  aircraft_category?: APAircraftCategory
  notes?:             string
  client_name?:       string
  client_email?:      string
  client_phone?:      string
  reference?:         string
}

export interface APQuoteRequestResponse {
  id:          number
  status:      'pending' | 'quoted' | 'cancelled'
  reference?:  string
  created_at:  string
}

// ── Charter Price ──────────────────────────────────────────────────────────────

export interface APCharterPrice {
  from:        string
  to:          string
  price_from:  number
  price_to:    number
  currency:    string
  category?:   APAircraftCategory
}

// ── Normalised Walz models (safe to pass through the API layer) ───────────────

export interface WalzCharterOption {
  aircraftModel:    string
  category:         APAircraftCategory
  paxCapacity:      number
  operator:         string
  estimatedHours?:  number
  displayPriceFrom: string   // e.g. "From $18,000"
  available:        boolean
}

export interface WalzFlightEstimate {
  distanceKm:   number
  flightHours:  number
  displayPrice: string   // e.g. "$18,000 – $25,000" or "Contact for quote"
}

export interface WalzQuoteConfirmation {
  quoteId:   number
  reference: string
  message:   string   // customer-facing confirmation text
}
