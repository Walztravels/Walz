'use client'

// QUOTE BUILDER V1.2 (desktop) — one flight result card.
//
// Airline logo: NormalizedFlightOffer carries `airlineCode` but no logo URL.
// This reuses the exact existing best-effort convention from
// lib/flights/duffel.ts / components/flights/FlightResults.tsx —
// `https://pics.avs.io/200/200/${iataCode}.png` via a plain <img>, with the
// airline name always shown alongside so a broken/missing image never
// leaves an empty-looking card, and an onError handler that swaps to a
// colored-circle initials badge instead of a broken image icon.
// `pics.avs.io` is already allowlisted in next.config.mjs remotePatterns.
//
// QUOTE BUILDER V1.2 closing fix (security review finding #2) — the
// fallback badge is React-state-driven (`logoFailed`), never DOM-mutated:
// onError only flips state, and the fallback <span> is plain JSX (React-
// escaped text interpolation), never innerHTML.
//
// V1.4 (Agent A — search UI) — stops/connections and multi-city
// presentation are derived from offer.journeys[] (the foundation's
// per-journey shape), never from the old flattened
// `offer.segments.length - 1` — that flattening only ever reflected
// journeys[0] (the outbound leg) and silently hid every other leg's stops.
// Presentation per offer.tripType:
//  - 'one-way'    → a single unlabeled journey row.
//  - 'round-trip' → OUTBOUND / RETURN rows (journeys[0]/[1]).
//  - 'multi-city' → a "MULTI-CITY · N JOURNEYS" header, then one
//    "JOURNEY 1".."JOURNEY N" row per journeys[] entry — connections stay
//    nested inside their own journey row, never hoisted into a flat list.
// In every case there is still exactly ONE total price and ONE "Select &
// price" action for the whole offer (pricing/add-to-quote is unowned here).

import { useState } from 'react'
import type { NormalizedFlightOffer, NormalizedFlightJourney } from '@/lib/travel-search/types'
import { fmtMinor } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function formatDuration(mins: number | null): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m}m`
}

// Literal uppercase strings on purpose (not CSS text-transform) — staff-
// facing badges like "DIRECT" / "1 STOP" / "2 STOPS" are asserted verbatim
// in tests and should read the same in the DOM as they render on screen.
function stopsLabel(stops: number): string {
  if (!Number.isFinite(stops) || stops <= 0) return 'DIRECT'
  if (stops === 1) return '1 STOP'
  return `${stops} STOPS`
}

// "LOS → ADD → DXB · 1 STOP · ADD" — the full route (every segment
// endpoint, so connection airports are visible inline), then this
// journey's own stop count, then the connection airport(s) again as a
// short explicit list. Derived purely from consecutive segments within
// THIS journey (segment[i].destinationCode for every segment but the
// last) — never from another journey's segments.
function journeyRouteLine(journey: NormalizedFlightJourney): string {
  const segs = journey.segments
  if (segs.length === 0) return ''
  const route = [segs[0].originCode, ...segs.map(s => s.destinationCode)].join(' → ')
  const label = stopsLabel(journey.stops)
  const connections = segs.length > 1 ? segs.slice(0, -1).map(s => s.destinationCode).join(', ') : null
  return connections ? `${route} · ${label} · ${connections}` : `${route} · ${label}`
}

function journeyHeaderLabel(tripType: NormalizedFlightOffer['tripType'], journey: NormalizedFlightJourney, index: number): string | null {
  if (tripType === 'one-way') return null
  if (tripType === 'round-trip') return journey.direction === 'return' ? 'RETURN' : 'OUTBOUND'
  return `JOURNEY ${index + 1}`
}

function JourneyRow({ tripType, journey, index }: { tripType: NormalizedFlightOffer['tripType']; journey: NormalizedFlightJourney; index: number }) {
  const segs = journey.segments
  const first = segs[0]
  const last = segs[segs.length - 1]
  const headerLabel = journeyHeaderLabel(tripType, journey, index)
  if (!first || !last) return null
  return (
    <div className={index > 0 ? 'mt-1.5' : undefined}>
      {headerLabel && (
        <p className="text-[10px] font-bold text-walz-navy uppercase tracking-wide">{headerLabel}</p>
      )}
      <p className="text-xs text-walz-muted-strong">
        {formatTime(first.departureAt)} {first.originCode} → {formatTime(last.arrivalAt)} {last.destinationCode}
        {' · '}{formatDuration(journey.durationMinutes)}
      </p>
      <p className="text-[11px] text-walz-muted-strong">{journeyRouteLine(journey)}</p>
    </div>
  )
}

function AirlineBadge({ airline, airlineCode }: { airline: string; airlineCode: string | null }) {
  const initials = airline.slice(0, 2).toUpperCase()
  const [logoFailed, setLogoFailed] = useState(false)
  if (!airlineCode || logoFailed) {
    return (
      <div className="w-10 h-10 rounded-xl bg-walz-navy/10 flex items-center justify-center flex-shrink-0">
        <span className="text-walz-navy font-bold text-xs">{initials}</span>
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-white border border-walz-border flex items-center justify-center flex-shrink-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://pics.avs.io/200/200/${airlineCode}.png`}
        alt={airline}
        className="w-8 h-8 object-contain"
        onError={() => setLogoFailed(true)}
      />
    </div>
  )
}

export interface FlightResultCardProps {
  offer: NormalizedFlightOffer
  onSelect: () => void
}

export function FlightResultCard({ offer, onSelect }: FlightResultCardProps) {
  const journeys = offer.journeys ?? []

  return (
    <li className="rounded-xl border border-walz-border bg-white p-3 hover:border-walz-gold/60 transition-colors">
      <div className="flex items-start gap-3">
        <AirlineBadge airline={offer.airline} airlineCode={offer.airlineCode} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-walz-deep-navy truncate">{offer.airline}</p>
            <p className="font-mono text-sm font-bold text-walz-deep-navy flex-shrink-0">{fmtMinor(offer.supplierTotalMinor, offer.supplierCurrency)}</p>
          </div>
          {offer.tripType === 'multi-city' && (
            <p className="text-[11px] font-bold text-walz-deep-navy uppercase tracking-wide mt-0.5">
              MULTI-CITY · {journeys.length} JOURNEYS
            </p>
          )}
          <div className="mt-0.5">
            {journeys.map((j, i) => <JourneyRow key={i} tripType={offer.tripType} journey={j} index={i} />)}
          </div>
          <p className="text-[11px] text-walz-muted-strong mt-0.5 capitalize">
            {offer.cabinClass}{offer.checkedBaggage ? ` · ${offer.checkedBaggage}` : ''}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-2 w-full min-h-[40px] rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
      >
        Select &amp; price
      </button>
    </li>
  )
}
