'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronUp, Info, ArrowRight,
  Plane, RefreshCw, Luggage, Leaf,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatPrice, formatDuration, formatTime, formatDate, getStopLabel } from '@/lib/utils'
import type { FlightResult, FlightSegmentResult } from '@/types/booking'

interface FlightCardProps {
  flight: FlightResult
  totalPassengers?: number
}

const AIRLINE_COLORS: Record<string, string> = {
  BA: '#2e0075', EK: '#d71920', QR: '#5c0632', LH: '#05164d',
  ET: '#007dc5', AF: '#002395', KL: '#00a0e2', SQ: '#0e3568',
  TK: '#e30a17', MS: '#e60000', AA: '#0078d4', UA: '#003087',
  DL: '#e01933', VS: '#d42b1e',
}

const FARE_FAMILIES = [
  { name: 'Basic',    mult: 1.00, baggage: '1 × 23 kg', seat: 'Fee applies', changes: 'Not permitted', refund: 'No refund'   },
  { name: 'Standard', mult: 1.12, baggage: '2 × 23 kg', seat: 'Free',        changes: '£50 fee',       refund: 'No refund'   },
  { name: 'Flex',     mult: 1.25, baggage: '2 × 32 kg', seat: 'Free',        changes: 'Free',          refund: 'Full refund' },
]

function AirlineLogo({ code, name }: { code: string; name: string }) {
  const [failed, setFailed] = useState(false)
  const color = AIRLINE_COLORS[code] || '#0A1628'

  return failed ? (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color }}
      title={name}
    >
      {code.slice(0, 2)}
    </div>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt={name}
      width={40}
      height={40}
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded-lg object-contain bg-white border border-gray-100 p-0.5 flex-shrink-0"
    />
  )
}

function SegmentRow({ segment }: { segment: FlightSegmentResult }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <AirlineLogo code={segment.airlineCode} name={segment.airline} />
      <div className="flex-1 grid grid-cols-3 gap-2 items-center min-w-0">
        <div>
          <div className="font-bold text-walz-deep-navy text-lg leading-none">{formatTime(segment.departureTime)}</div>
          <div className="text-sm text-walz-muted">{segment.departureAirport}</div>
          <div className="text-xs text-walz-muted">{formatDate(segment.departureTime)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-walz-muted mb-1">{formatDuration(segment.duration)}</div>
          <div className="flex items-center justify-center gap-1">
            <div className="w-full h-px bg-walz-border" />
            <Plane className="w-3 h-3 text-walz-gold flex-shrink-0 rotate-90" />
            <div className="w-full h-px bg-walz-border" />
          </div>
          <div className="text-xs text-walz-muted mt-1">{segment.flightNumber}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-walz-deep-navy text-lg leading-none">{formatTime(segment.arrivalTime)}</div>
          <div className="text-sm text-walz-muted">{segment.arrivalAirport}</div>
          <div className="text-xs text-walz-muted">{formatDate(segment.arrivalTime)}</div>
        </div>
      </div>
    </div>
  )
}

function isNextDay(dep: string, arr: string): boolean {
  try {
    const d = new Date(dep); const a = new Date(arr)
    return a > d && a.toDateString() !== d.toDateString()
  } catch { return false }
}

function estimateCo2(totalMinutes: number): number {
  // ~0.115 kg CO2/km, ~900 km/h cruise
  return Math.round((totalMinutes / 60) * 900 * 0.115)
}

export function FlightCard({ flight, totalPassengers = 1 }: FlightCardProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)
  const [showFares,  setShowFares]  = useState(false)
  const [fareTier,   setFareTier]   = useState(0)

  const firstSeg        = flight.outbound[0]
  const lastSeg         = flight.outbound[flight.outbound.length - 1]
  const stops           = flight.stops
  const stopLabel       = getStopLabel(stops)
  const nextDay         = isNextDay(firstSeg.departureTime, lastSeg.arrivalTime)
  const adjustedPrice   = Math.round(flight.price.amount * FARE_FAMILIES[fareTier].mult)
  const adjustedPer     = Math.round(flight.price.perPerson * FARE_FAMILIES[fareTier].mult)
  const co2kg           = estimateCo2(flight.totalDuration)

  const handleBook = () => {
    sessionStorage.setItem('pendingFlight', JSON.stringify({
      ...flight,
      price: { ...flight.price, amount: adjustedPrice, perPerson: adjustedPer },
      selectedFareTier: FARE_FAMILIES[fareTier].name,
    }))
    router.push('/book')
  }

  return (
    <article
      className="card-luxury mb-4 overflow-hidden"
      itemScope
      itemType="https://schema.org/Flight"
    >
      {/* Hidden schema.org fields — visible to Google Rich Results crawler */}
      <meta itemProp="departureTime" content={firstSeg.departureTime} />
      <meta itemProp="arrivalTime"   content={lastSeg.arrivalTime} />
      <span itemProp="departureAirport" itemScope itemType="https://schema.org/Airport">
        <meta itemProp="iataCode" content={firstSeg.departureAirport} />
      </span>
      <span itemProp="arrivalAirport" itemScope itemType="https://schema.org/Airport">
        <meta itemProp="iataCode" content={lastSeg.arrivalAirport} />
      </span>

      {/* Urgency banner — only when ≤5 seats remain */}
      {flight.seatsRemaining !== undefined && flight.seatsRemaining <= 5 && (
        <div className="bg-red-600 text-white text-xs font-bold text-center py-1.5 px-4 tracking-wide">
          🔥 Only {flight.seatsRemaining} seat{flight.seatsRemaining !== 1 ? 's' : ''} remaining at this price
        </div>
      )}

      {/* ── Main row ─────────────────────────────────────────────────────────── */}
      <div className="p-4 lg:p-5">
        <div className="flex items-center gap-4">
          <AirlineLogo code={firstSeg.airlineCode} name={firstSeg.airline} />

          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 items-center">

              {/* Departure */}
              <div>
                <div className="text-xl lg:text-2xl font-bold text-walz-deep-navy leading-none">
                  {formatTime(firstSeg.departureTime)}
                </div>
                <div className="text-sm font-semibold text-walz-slate">{firstSeg.departureAirport}</div>
                <div className="text-xs text-walz-muted hidden lg:block">{formatDate(firstSeg.departureTime)}</div>
              </div>

              {/* Route visualisation */}
              <div className="col-span-1 text-center">
                <div className="text-xs text-walz-muted mb-1">{formatDuration(flight.totalDuration)}</div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-walz-gold flex-shrink-0" />
                  <div className="flex-1 h-px bg-walz-border" />
                  {stops > 0 && (
                    <>
                      <div className="w-2 h-2 rounded-full border-2 border-amber-400 flex-shrink-0" />
                      <div className="flex-1 h-px bg-walz-border" />
                    </>
                  )}
                  <div className="w-2 h-2 rounded-full border-2 border-walz-deep-navy flex-shrink-0" />
                </div>
                <div className={cn('text-xs mt-1 font-medium', stops === 0 ? 'text-walz-success' : 'text-amber-600')}>
                  {stopLabel}
                </div>
              </div>

              {/* Arrival + next-day badge */}
              <div className="text-right">
                <div className="flex items-start justify-end gap-1">
                  <div className="text-xl lg:text-2xl font-bold text-walz-deep-navy leading-none">
                    {formatTime(lastSeg.arrivalTime)}
                  </div>
                  {nextDay && (
                    <span className="text-[10px] font-bold text-white bg-red-500 rounded px-1 py-0.5 leading-none mt-0.5">
                      +1
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-walz-slate">{lastSeg.arrivalAirport}</div>
                <div className="text-xs text-walz-muted hidden lg:block">{formatDate(lastSeg.arrivalTime)}</div>
              </div>

              {/* Cabin / Baggage / CO₂ (desktop) */}
              <div className="hidden lg:flex lg:col-span-1 flex-col items-center gap-1">
                <span className="badge-navy">{flight.cabinClass.replace('_', ' ')}</span>
                <div className="flex items-center gap-1 text-xs text-walz-muted">
                  <Luggage className="w-3 h-3" />
                  <span>{FARE_FAMILIES[fareTier].baggage}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-green-600">
                  <Leaf className="w-3 h-3" />
                  <span>~{co2kg} kg CO₂</span>
                </div>
              </div>

              {/* Price & Book (desktop) */}
              <div className="hidden lg:flex lg:col-span-1 flex-col items-end gap-2">
                <div>
                  <div className="text-2xl font-bold text-walz-gold">
                    {formatPrice(adjustedPrice, flight.price.currency)}
                  </div>
                  {totalPassengers > 1 && (
                    <div className="text-xs text-walz-muted text-right">
                      {formatPrice(adjustedPer, flight.price.currency)} per person
                    </div>
                  )}
                </div>
                <Button variant="gold" size="sm" onClick={handleBook}>Book Now</Button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile price row */}
        <div className="lg:hidden flex items-center justify-between mt-4 pt-4 border-t border-walz-border">
          <div>
            <div className="text-xl font-bold text-walz-gold">
              {formatPrice(adjustedPrice, flight.price.currency)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-navy text-[10px]">{flight.cabinClass.replace('_', ' ')}</span>
              <span className="flex items-center gap-1 text-[10px] text-green-600">
                <Leaf className="w-3 h-3" />~{co2kg} kg CO₂
              </span>
            </div>
          </div>
          <Button variant="gold" size="sm" onClick={handleBook}>Book Now</Button>
        </div>

        {/* Tags row + Compare fares toggle */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {flight.isRefundable && (
            <span className="flex items-center gap-1 text-xs text-walz-success">
              <RefreshCw className="w-3 h-3" />Refundable
            </span>
          )}
          <span className="text-xs text-walz-muted">Operated by {firstSeg.airline}</span>
          <button
            onClick={() => setShowFares(!showFares)}
            className="text-xs text-walz-gold hover:text-walz-gold-light font-medium transition-colors ml-auto"
          >
            {showFares ? 'Hide fares' : 'Compare fares'}
          </button>
        </div>

        {/* Fare family selector */}
        {showFares && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {FARE_FAMILIES.map((fare, i) => (
              <button
                key={fare.name}
                onClick={() => setFareTier(i)}
                className={cn(
                  'rounded-xl border-2 p-3 text-left transition-all',
                  fareTier === i
                    ? 'border-walz-gold bg-walz-gold/5'
                    : 'border-walz-border bg-white hover:border-walz-gold/40'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-walz-deep-navy">{fare.name}</span>
                  {fareTier === i && <span className="text-walz-gold text-xs">✓</span>}
                </div>
                <div className="text-sm font-bold text-walz-gold mb-2">
                  {formatPrice(Math.round(flight.price.amount * fare.mult), flight.price.currency)}
                </div>
                <div className="space-y-0.5 text-[10px] text-walz-muted">
                  <div className="flex items-center gap-1"><Luggage className="w-2.5 h-2.5" />{fare.baggage}</div>
                  <div>Seat: {fare.seat}</div>
                  <div>Changes: {fare.changes}</div>
                  <div className={fare.refund !== 'No refund' ? 'text-walz-success' : ''}>
                    {fare.refund}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Expand toggle ────────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-t border-walz-border bg-walz-off-white hover:bg-walz-border/30 transition-colors text-sm text-walz-muted hover:text-walz-deep-navy"
      >
        <Info className="w-3.5 h-3.5" />
        <span>Flight details</span>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* ── Expanded segment details ─────────────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-walz-border">
          <div className="p-4 lg:p-5">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Plane className="w-4 h-4 text-walz-gold" />
                <h4 className="font-semibold text-walz-deep-navy text-sm">Outbound Flight</h4>
              </div>
              <div className="space-y-1 divide-y divide-walz-border">
                {flight.outbound.map((seg, i) => <SegmentRow key={i} segment={seg} />)}
              </div>
            </div>

            {flight.inbound && flight.inbound.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Plane className="w-4 h-4 text-walz-gold rotate-180" />
                  <h4 className="font-semibold text-walz-deep-navy text-sm">Return Flight</h4>
                </div>
                <div className="space-y-1 divide-y divide-walz-border">
                  {flight.inbound.map((seg, i) => <SegmentRow key={i} segment={seg} />)}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3 p-3 bg-walz-off-white rounded-xl">
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Cabin Class</div>
                <div className="text-sm font-medium text-walz-deep-navy">{flight.cabinClass.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Fare Type</div>
                <div className="text-sm font-medium text-walz-deep-navy">{FARE_FAMILIES[fareTier].name}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Carry-on</div>
                <div className="text-sm font-medium text-walz-deep-navy">{flight.baggage?.carry || '1 × 7 kg'}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Checked Bag</div>
                <div className="text-sm font-medium text-walz-deep-navy">{FARE_FAMILIES[fareTier].baggage}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">CO₂ estimate</div>
                <div className="text-sm font-medium text-green-600">~{co2kg} kg</div>
              </div>
            </div>
          </div>

          <div className="px-4 lg:px-5 pb-4 flex justify-end">
            <Button variant="gold" onClick={handleBook}>
              <ArrowRight className="w-4 h-4 mr-2" />
              Select &amp; Continue
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
