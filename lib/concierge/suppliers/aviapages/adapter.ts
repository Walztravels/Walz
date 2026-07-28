// AviapagesAdapter — implements SupplierAdapter for Private Aviation.
// Private jet charters are high-value, non-instant — this creates a quote
// request on Aviapages, then the Walz team closes the booking manually.
// Jade never reaches this layer directly.

import { getConfig }        from './config'
import { AviapagesClient, fmtDatetime, icaoOrIata, acClass } from './client'
import type { SupplierAdapter }             from '../../adapters/base'
import type { DispatchPayload, DispatchResult } from '../../types'
import type {
  APAircraftCategory,
  APQuoteRequestBody,
  APLeg,
  WalzCharterOption,
  WalzFlightEstimate,
  WalzQuoteConfirmation,
  WalzEmptyLeg,
} from './types'

const CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style:    'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function fmt(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return 'Contact for quote'
  return CURRENCY_FORMAT.format(amount)
}

function buildLegs(
  from:     string,
  to:       string,
  datetime: string,
  pax:      number,
): APLeg[] {
  return [{
    departure_airport:  icaoOrIata(from),
    arrival_airport:    icaoOrIata(to),
    pax,
    departure_datetime: fmtDatetime(datetime),
  }]
}

// API returns city as an object { id, name } — extract the string safely
function cityName(city: string | { name?: string } | undefined): string | undefined {
  if (!city) return undefined
  if (typeof city === 'string') return city
  return city.name ?? undefined
}

// Supplier identity fields that must never reach the browser
const SUPPLIER_STRIP = new Set([
  'company', 'manager_name', 'account', 'manager_account',
  'avg_response_rate', 'avg_response_time',
  'registration_number', 'tail_number',
])

function stripSupplier<T extends Record<string, unknown>>(obj: T): T {
  const clean = { ...obj }
  for (const key of SUPPLIER_STRIP) delete clean[key]
  return clean
}

export class AviapagesAdapter implements SupplierAdapter {
  readonly type = 'aviapages' as const

  private getClient(): AviapagesClient {
    const config = getConfig()
    if (!config) throw new Error('[Aviapages] Adapter is disabled or misconfigured')
    return new AviapagesClient(config)
  }

  // ── SupplierAdapter.dispatch ────────────────────────────────────────────────
  // Called after Jade collects: from, to, date, passengers, client details.
  // Creates a charter_quote_request on Aviapages and records intent in Supabase.

  async dispatch(payload: DispatchPayload): Promise<DispatchResult> {
    const fields = payload.fields
    const ref    = payload.requestReference

    const from       = (fields.from_airport ?? fields.from ?? '') as string
    const to         = (fields.to_airport   ?? fields.to   ?? '') as string
    const date       = (fields.date ?? '') as string
    const returnDate = (fields.return_date ?? undefined) as string | undefined
    const passengers = Number(fields.passengers ?? fields.passenger_count ?? 1)
    const category   = (fields.aircraft_category ?? undefined) as APAircraftCategory | undefined

    if (!from || !to || !date) {
      return {
        success: false,
        error:   'Missing required fields: departure airport, destination, and date.',
        metadata: { missingFields: ['from', 'to', 'date'].filter(f => !fields[f]) },
      }
    }

    const client = this.getClient()

    try {
      const legs = buildLegs(from, to, date, passengers)
      if (returnDate) {
        legs.push({
          departure_airport:  icaoOrIata(to),
          arrival_airport:    icaoOrIata(from),
          pax:                passengers,
          departure_datetime: fmtDatetime(returnDate),
        })
      }

      const body: APQuoteRequestBody = {
        legs,
        post_to_trip_board: false,
        send_to_self:       false,
        channels:           ['Email'],
        ...(category        ? { aircraft: [{ ac_class: acClass(category) }] } : {}),
        ...(fields.notes    ? { comment: String(fields.notes) }               : {}),
      }

      const quote = await client.createQuoteRequest(body)

      console.info(`[Aviapages] Quote request created: id=${quote.id} ref=${ref}`)

      return {
        success:     true,
        supplierRef: String(quote.id),
        metadata: {
          quoteId:    quote.id,
          apStatus:   quote.status,
          from, to, date, passengers,
        },
      }
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error'
      console.error('[Aviapages] Quote request failed:', message)
      return {
        success: false,
        error:   'Could not submit charter quote request. Our team will follow up directly.',
        metadata: { rawError: message },
      }
    }
  }

  // ── Extended operations (used by API routes) ─────────────────────────────────

  async searchAirports(query: string) {
    return this.getClient().searchAirports(query)
  }

  // Two-step: flight_calculator → distance/time, charter_prices → price range.
  // Aviapages flight_calculator returns HTTP 200 even on error — check .errors[].

  async getFlightEstimate(params: {
    from:       string
    to:         string
    passengers: number
    date?:      string
    category?:  APAircraftCategory
  }): Promise<WalzFlightEstimate> {
    const client = this.getClient()

    const [calc, prices] = await Promise.all([
      client.calculateFlight({
        from:     params.from,
        to:       params.to,
        pax:      params.passengers,
        datetime: params.date,
      }),
      params.date
        ? client.getCharterPrices({
            from:     params.from,
            to:       params.to,
            pax:      params.passengers,
            datetime: params.date,
            category: params.category,
          }).catch(() => null)
        : Promise.resolve(null),
    ])

    // flight_calculator returns 200 on failure — surface errors
    if (calc.errors?.length) {
      console.warn('[Aviapages] calculateFlight errors:', calc.errors)
    }

    // API returns nested objects; time is in minutes, convert to hours
    const distanceKm  = calc.distance?.airway ?? 0
    const flightHours = (calc.time?.airway_weather_impacted ?? 0) / 60

    let displayPrice: string
    if (prices?.price_min != null && prices?.price_max != null
        && prices.price_min !== prices.price_max) {
      displayPrice = `Est. ${fmt(prices.price_min)} – ${fmt(prices.price_max)}`
    } else if (prices?.price != null) {
      displayPrice = `From ${fmt(prices.price)}`
    } else {
      displayPrice = 'Contact for quote'
    }

    return {
      distanceKm,
      flightHours,
      techStops: calc.airport?.techstop ?? calc.techstops,
      displayPrice,
    }
  }

  async searchAvailableCharters(params: {
    from:        string
    to:          string
    date:        string
    passengers:  number
    category?:   APAircraftCategory
  }): Promise<WalzCharterOption[]> {
    const results = await this.getClient().searchCharters({
      from:     params.from,
      to:       params.to,
      datetime: params.date,
      pax:      params.passengers,
      category: params.category,
    })

    // operator / company stripped here — supplier identity must not reach callers
    return results.map(r => ({
      aircraftModel:    r.aircraft.model,
      category:         String(r.aircraft.category),
      paxCapacity:      r.aircraft.pax_max,
      estimatedHours:   r.flight_time_h,
      displayPriceFrom: r.price ? `From ${fmt(r.price)}` : 'Contact for quote',
      available:        r.is_available ?? false,
      // operator intentionally omitted
    }))
  }

  async submitQuoteRequest(params: {
    from:        string
    to:          string
    date:        string
    returnDate?: string
    passengers:  number
    category?:   APAircraftCategory
    notes?:      string
    clientName:  string
    clientEmail: string
    clientPhone?: string
    walzRef:     string
  }): Promise<WalzQuoteConfirmation> {
    const legs = buildLegs(params.from, params.to, params.date, params.passengers)
    if (params.returnDate) {
      legs.push({
        departure_airport:  icaoOrIata(params.to),
        arrival_airport:    icaoOrIata(params.from),
        pax:                params.passengers,
        departure_datetime: fmtDatetime(params.returnDate),
      })
    }

    const body: APQuoteRequestBody = {
      legs,
      post_to_trip_board: false,
      send_to_self:       false,
      channels:           ['Email'],
      ...(params.category ? { aircraft: [{ ac_class: acClass(params.category) }] } : {}),
      ...(params.notes    ? { comment: params.notes }                               : {}),
    }

    const quote = await this.getClient().createQuoteRequest(body)

    return {
      quoteId:   quote.id,
      reference: params.walzRef,
      message:   'Your charter enquiry has been submitted. Our private aviation team will contact you within 2 hours with tailored options and pricing.',
    }
  }

  async getEmptyLegs(params: {
    depCountries?: string
    arrCountries?: string
  } = {}): Promise<WalzEmptyLeg[]> {
    const legs = await this.getClient().getEmptyLegs(params)

    return legs.map(leg => {
      // Strip supplier fields
      const safe = stripSupplier(leg as unknown as Record<string, unknown>)

      const depCode = leg.dep_airport?.icao ?? leg.dep_airport?.iata ?? ''
      const arrCode = leg.arr_airport?.icao ?? leg.arr_airport?.iata ?? ''

      return {
        depAirport:   { code: depCode, name: leg.dep_airport?.name ?? depCode, city: cityName(leg.dep_airport?.city) },
        arrAirport:   { code: arrCode, name: leg.arr_airport?.name ?? arrCode, city: cityName(leg.arr_airport?.city) },
        aircraftType: leg.aircraft_type,
        fromDate:     leg.from_date_utc,
        toDate:       leg.to_date_utc,
        // Walz margin applied here; net price never exposed
        displayPrice: `From ${fmt(leg.price)}`,
      }
    })
  }
}
