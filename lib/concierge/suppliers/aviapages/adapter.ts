// AviapagesAdapter — implements SupplierAdapter for Private Aviation.
// Private jet charters are high-value, non-instant — this creates a quote
// request on Aviapages, then the Walz team closes the booking manually.
// Jade never reaches this layer directly.

import { getConfig }       from './config'
import { AviapagesClient } from './client'
import type { SupplierAdapter }             from '../../adapters/base'
import type { DispatchPayload, DispatchResult } from '../../types'
import type {
  APAircraftCategory,
  WalzCharterOption,
  WalzFlightEstimate,
  WalzQuoteConfirmation,
} from './types'

const CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style:    'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function fmt(amount: number | null): string {
  if (amount == null || isNaN(amount)) return 'Contact for quote'
  return CURRENCY_FORMAT.format(amount)
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
      const quote = await client.createQuoteRequest({
        from:               from,
        to:                 to,
        departure_date:     date,
        return_date:        returnDate,
        passengers,
        aircraft_category:  category,
        notes:              (fields.notes ?? '') as string,
        client_name:        payload.clientName,
        client_email:       payload.clientEmail,
        client_phone:       payload.clientPhone,
        reference:          ref,
      })

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

  async getFlightEstimate(params: {
    from:       string
    to:         string
    passengers: number
    date?:      string
  }): Promise<WalzFlightEstimate> {
    const result = await this.getClient().calculateFlight(params)
    const low    = result.price_from
    const high   = result.price_to

    let displayPrice: string
    if (low && high && low !== high) {
      displayPrice = `${fmt(low)} – ${fmt(high)}`
    } else if (low) {
      displayPrice = `From ${fmt(low)}`
    } else {
      displayPrice = 'Contact for quote'
    }

    return {
      distanceKm:  result.distance_km,
      flightHours: result.flight_time_h,
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
      from:               params.from,
      to:                 params.to,
      date:               params.date,
      passengers:         params.passengers,
      aircraft_category:  params.category,
    })

    // Strip supplier amounts — never expose net price to caller
    return results.map(r => ({
      aircraftModel:    r.aircraft.model,
      category:         r.aircraft.category,
      paxCapacity:      r.aircraft.pax_max,
      operator:         r.operator,
      estimatedHours:   r.flight_time_h,
      displayPriceFrom: r.price ? `From ${fmt(r.price)}` : 'Contact for quote',
      available:        r.is_available,
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
    const quote = await this.getClient().createQuoteRequest({
      from:               params.from,
      to:                 params.to,
      departure_date:     params.date,
      return_date:        params.returnDate,
      passengers:         params.passengers,
      aircraft_category:  params.category,
      notes:              params.notes,
      client_name:        params.clientName,
      client_email:       params.clientEmail,
      client_phone:       params.clientPhone,
      reference:          params.walzRef,
    })

    return {
      quoteId:   quote.id,
      reference: params.walzRef,
      message:   'Your charter enquiry has been submitted. Our private aviation team will contact you within 2 hours with tailored options and pricing.',
    }
  }
}
