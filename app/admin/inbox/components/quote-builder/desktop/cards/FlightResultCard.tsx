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

import { useState } from 'react'
import type { NormalizedFlightOffer } from '@/lib/travel-search/types'
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

function totalDurationMinutes(offer: NormalizedFlightOffer): number | null {
  const segs = offer.segments
  if (segs.length === 0) return null
  const known = segs.every(s => s.durationMinutes != null)
  if (known) return segs.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  try {
    const start = new Date(segs[0].departureAt).getTime()
    const end = new Date(segs[segs.length - 1].arrivalAt).getTime()
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.round((end - start) / 60000)
  } catch { /* fall through */ }
  return null
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
  const first = offer.segments[0]
  const last = offer.segments[offer.segments.length - 1]
  const stops = offer.segments.length - 1
  const duration = formatDuration(totalDurationMinutes(offer))

  return (
    <li className="rounded-xl border border-walz-border bg-white p-3 hover:border-walz-gold/60 transition-colors">
      <div className="flex items-start gap-3">
        <AirlineBadge airline={offer.airline} airlineCode={offer.airlineCode} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-walz-deep-navy truncate">{offer.airline}</p>
            <p className="font-mono text-sm font-bold text-walz-deep-navy flex-shrink-0">{fmtMinor(offer.supplierTotalMinor, offer.supplierCurrency)}</p>
          </div>
          {first && last && (
            <p className="text-xs text-walz-muted-strong mt-0.5">
              {formatTime(first.departureAt)} {first.originCode} → {formatTime(last.arrivalAt)} {last.destinationCode}
              {' · '}{duration}{' · '}{stops === 0 ? 'Non-stop' : `${stops} stop${stops > 1 ? 's' : ''}`}
            </p>
          )}
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
