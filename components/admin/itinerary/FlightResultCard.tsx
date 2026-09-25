'use client'

import { AddControl } from './AddStatus'
import type { AddState } from './useResearchAdd'
import { fmtDate, fmtPrice, fmtTime } from './researchFormat'

export interface FlightSegmentResult {
  airline: string
  iataCode?: string | null
  flightNumber: string
  from: string
  to: string
  departureAt: string
  arrivalAt: string
  duration?: string
  cabin?: string | null
  baggage?: string | null
}
export interface FlightJourneyResult {
  index: number
  direction: 'outbound' | 'return' | 'leg'
  from: string
  to: string
  segments: FlightSegmentResult[]
  stops: number
  duration?: string
}
export interface FlightSliceResult {
  airline: string; flightNumber: string; departure: string; arrival: string; duration: string; stops: number
}
export interface FlightOfferResult {
  airline: string
  flightNumber: string
  departure: string
  arrival: string
  duration: string
  stops: number
  price: number
  currency: string
  slices?: FlightSliceResult[]
  offerId?: string | null
  expiresAt?: string | null
  tripType?: 'one-way' | 'return' | 'multi-city'
  journeys?: FlightJourneyResult[]
  cabin?: string | null
  baggage?: string | null
}

const dirLabel = (j: FlightJourneyResult, n: number) =>
  n === 1 ? '' : j.direction === 'outbound' ? 'Outbound' : j.direction === 'return' ? 'Return' : `Leg ${j.index + 1}`

function routeLabel(f: FlightOfferResult): string {
  const js = f.journeys ?? []
  if (!js.length) return ''
  if (f.tripType === 'return' && js.length === 2) return `${js[0].from} ⇄ ${js[0].to}`
  if (js.length === 1) return `${js[0].from} → ${js[0].to} (one-way)`
  return `${js.map((j) => j.from).join(' → ')} → ${js[js.length - 1].to} (multi-city)`
}

export default function FlightResultCard({
  flight, state, onAdd, onAddAnyway, onCancel, onViewBookings,
}: {
  flight: FlightOfferResult
  state: AddState
  onAdd: () => void
  onAddAnyway: () => void
  onCancel: () => void
  onViewBookings?: () => void
}) {
  const journeys = flight.journeys ?? []
  const canAdd = !!flight.offerId
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-white/20 transition-colors" data-testid="flight-card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-white font-semibold text-sm">{flight.airline}</p>
        <p className="text-white/60 text-xs font-mono">{routeLabel(flight)}</p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mb-2">
        {flight.cabin && <span>Cabin: {flight.cabin}</span>}
        {flight.baggage && <span>Baggage: {flight.baggage}</span>}
      </div>

      {journeys.length > 0 ? journeys.map((j, ji) => (
        <div key={ji} className={ji > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
          <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">{dirLabel(j, journeys.length) || `${j.from} → ${j.to}`}</p>
            <p className="text-xs text-white/40">
              {j.stops === 0 ? 'Direct' : `${j.stops} stop${j.stops > 1 ? 's' : ''}`}
              {j.duration ? ` · ${j.duration}` : ''}
            </p>
          </div>
          <div className="space-y-2">
            {j.segments.map((s, si) => (
              <div key={si} className="text-sm">
                <div className="flex flex-wrap items-center gap-2 text-white/80">
                  <span className="font-mono text-xs bg-white/5 px-2 py-0.5 rounded">{s.flightNumber}</span>
                  <span className="text-white font-bold">{s.from}</span>
                  <span className="text-white/50">{fmtTime(s.departureAt)} {fmtDate(s.departureAt)}</span>
                  <span className="text-white/30">→</span>
                  <span className="text-white font-bold">{s.to}</span>
                  <span className="text-white/50">{fmtTime(s.arrivalAt)} {fmtDate(s.arrivalAt)}</span>
                  {s.duration && <span className="text-white/40 text-xs">({s.duration})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )) : (flight.slices ?? [flight]).map((s, si) => (
        <div key={si} className="text-sm text-white/70">{s.airline} {s.flightNumber} · {fmtTime(s.departure)} → {fmtTime(s.arrival)} · {s.duration}</div>
      ))}

      <div className="flex flex-wrap items-end justify-between gap-3 mt-3 pt-3 border-t border-white/10">
        <div>
          <p className="text-white font-bold text-lg" data-testid="flight-total">{fmtPrice(flight.price, flight.currency)}</p>
          <p className="text-white/40 text-xs">Total (supplier), whole offer, all passengers</p>
        </div>
        <AddControl
          state={state}
          onAdd={onAdd}
          onAddAnyway={onAddAnyway}
          onCancel={onCancel}
          onViewBookings={onViewBookings}
          disabled={!canAdd}
          disabledReason={canAdd ? undefined : 'Offer id unavailable. Search again.'}
        />
      </div>
    </div>
  )
}
