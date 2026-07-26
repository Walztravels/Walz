// Aviapages Charter API — request and response shapes.
// All types are server-only; never re-export from client bundles.
// Spec: https://api.aviapages.com/docs/openapi.json

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

// Maps internal category slugs to Aviapages ac_class strings (PascalCase)
export const AP_AC_CLASS: Record<APAircraftCategory, string> = {
  very_light:       'Very Light',
  light:            'Light',
  midsize:          'Midsize',
  super_midsize:    'Super Midsize',
  heavy:            'Heavy',
  ultra_long_range: 'Ultra Long Range',
  vip_airliner:     'VIP Airliner',
}

export interface APAircraft {
  id:           number
  model:        string
  manufacturer: string
  category:     APAircraftCategory
  pax_max:      number
  range_km:     number
  speed_kmh?:   number
  year_built?:  number
  image_url?:   string
}

// ── Shared leg / aircraft-class types ─────────────────────────────────────────
// Used by charter_prices, charter_search_aircraft, charter_quote_requests.
// Airport format here is an OBJECT (not a string like flight_calculator).

export interface APLeg {
  departure_airport:  { icao?: string; iata?: string }
  arrival_airport:    { icao?: string; iata?: string }
  pax:                number
  departure_datetime: string   // YYYY-MM-DDThh:mm — no seconds, no timezone
}

export interface APAircraftClass {
  ac_class: string   // "Heavy" | "Light" | "Midsize" etc. (PascalCase)
}

// ── Flight calculator ──────────────────────────────────────────────────────────
// POST /v3/flight_calculator/
// Airport format: plain string (ICAO or IATA). NOT an object.
// All output fields are opt-in via boolean flags; omit them and you get nothing.

export interface APFlightCalculatorRequest {
  departure_airport: string    // ICAO or IATA — string, NOT object
  arrival_airport:   string
  aircraft:          string    // aircraft model name e.g. "Global 6000"
  pax?:              number
  departure_datetime?: string  // YYYY-MM-DDThh:mm

  // Opt-in output flags — must be set true to receive the field
  airway_time_weather_impacted?:             boolean  // recommended method
  airway_distance?:                          boolean
  arrival_datetime?:                         boolean  // requires departure_datetime
  airway_carbon_emissions_weather_impacted?: boolean
  advise_techstops?:                         boolean  // critical for long routes
}

export interface APFlightCalculatorResult {
  // Present when airway_distance: true
  airway_distance?: number
  // Present when airway_time_weather_impacted: true (hours)
  airway_time_weather_impacted?: number
  // Present when arrival_datetime: true
  arrival_datetime?: string
  // Present when advise_techstops: true
  techstops?: string[]
  // Airport — spec declares departure/arrival but examples show departure_airport/arrival_airport.
  // Read both keys defensively.
  airport?: {
    departure?:          string
    arrival?:            string
    departure_airport?:  string
    arrival_airport?:    string
    techstops?:          string[]
  }
  // 200 does NOT mean success — check this array
  errors?: { code: number; message: string }[]
}

// ── Charter prices (market estimate) ──────────────────────────────────────────
// POST /v3/charter_prices/
// range: true gives price_min/price_max for an honest estimate range.

export interface APCharterPriceRequest {
  legs:          APLeg[]
  aircraft:      APAircraftClass[]
  currency_code?: string   // defaults to USD
  range?:        boolean   // true → include price_min / price_max
}

export interface APCharterPriceResponse {
  price:          number
  price_min?:     number   // present when range: true
  price_max?:     number
  currency_code:  string
}

// ── Charter search aircraft ────────────────────────────────────────────────────
// POST /v3/charter_search_aircraft/   (replaces deprecated /charter_searches/)

export interface APCharterSearchAircraftRequest {
  legs:      APLeg[]
  aircraft?: APAircraftClass[]
}

export interface APCharterSearchAircraftResult {
  aircraft:       APAircraft
  price?:         number
  currency?:      string
  flight_time_h?: number
  is_available?:  boolean
  // company, registration_number — NEVER forwarded — supplier identity
  company?:       unknown
}

// ── Charter quote request ──────────────────────────────────────────────────────
// POST /v3/charter_quote_requests/
// post_to_trip_board MUST be false — true publishes client data publicly.
// channels enum: "Email" | "Leon" | "Fl3xx" | "Skylegs" — use Email only.

export interface APQuoteRequestBody {
  legs:                APLeg[]
  aircraft?:           APAircraftClass[]
  channels:            ['Email']
  post_to_trip_board:  false
  send_to_self:        false
  comment?:            string
}

// Internal params (what the adapter accepts from routes / Jade)
export interface APQuoteRequestInput {
  from:               string    // ICAO or IATA code
  to:                 string
  departure_date:     string    // YYYY-MM-DD
  return_date?:       string
  departure_time?:    string    // HH:mm, defaults to "10:00"
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

// ── Empty legs ─────────────────────────────────────────────────────────────────
// GET /v3/empty_legs/?has_price=true&has_arrival_airport=true
// company and registration_number are supplier identity — never forwarded.

export interface APEmptyLeg {
  from_date_utc:        string
  to_date_utc:          string
  price:                number
  currency_code:        string
  dep_airport:          APAirport
  arr_airport:          APAirport
  aircraft_type:        string
  // intentionally not typed: company, registration_number
}

// ── Normalised Walz models (safe to return through API routes) ────────────────

export interface WalzCharterOption {
  aircraftModel:    string
  category:         string
  paxCapacity:      number
  estimatedHours?:  number
  displayPriceFrom: string    // e.g. "From $18,000" or "Contact for quote"
  available:        boolean
  // operator / company intentionally omitted — supplier identity
}

export interface WalzFlightEstimate {
  distanceKm:   number
  flightHours:  number
  techStops?:   string[]
  displayPrice: string    // e.g. "Est. $15,000–$25,000" or "Contact for quote"
}

export interface WalzQuoteConfirmation {
  quoteId:   number
  reference: string
  message:   string
}

export interface WalzEmptyLeg {
  depAirport:   { code: string; name: string; city?: string }
  arrAirport:   { code: string; name: string; city?: string }
  aircraftType: string
  fromDate:     string
  toDate:       string
  displayPrice: string   // Walz price after markup
}
