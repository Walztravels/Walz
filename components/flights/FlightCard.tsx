'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Luggage,
  Info,
  ArrowRight,
  Plane,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatPrice, formatDuration, formatTime, formatDate, getStopLabel } from '@/lib/utils'
import type { FlightResult, FlightSegmentResult } from '@/types/booking'

interface FlightCardProps {
  flight: FlightResult
  totalPassengers?: number
}

const AIRLINE_COLORS: Record<string, string> = {
  BA: '#2e0075',
  EK: '#d71920',
  QR: '#5c0632',
  LH: '#05164d',
  AA: '#0078d4',
  UA: '#003087',
  DL: '#e01933',
  VS: '#d42b1e',
  AF: '#002395',
  SQ: '#0e3568',
}

function AirlineBadge({ code, name }: { code: string; name: string }) {
  const color = AIRLINE_COLORS[code] || '#0A1628'
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
      style={{ backgroundColor: color }}
      title={name}
    >
      {code.slice(0, 2)}
    </div>
  )
}

function SegmentRow({ segment, isLast }: { segment: FlightSegmentResult; isLast: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <AirlineBadge code={segment.airlineCode} name={segment.airline} />
      <div className="flex-1 grid grid-cols-3 gap-2 items-center min-w-0">
        <div>
          <div className="font-bold text-walz-deep-navy text-lg leading-none">
            {formatTime(segment.departureTime)}
          </div>
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
          <div className="font-bold text-walz-deep-navy text-lg leading-none">
            {formatTime(segment.arrivalTime)}
          </div>
          <div className="text-sm text-walz-muted">{segment.arrivalAirport}</div>
          <div className="text-xs text-walz-muted">{formatDate(segment.arrivalTime)}</div>
        </div>
      </div>
    </div>
  )
}

export function FlightCard({ flight, totalPassengers = 1 }: FlightCardProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(false)

  const firstSegment = flight.outbound[0]
  const lastOutboundSegment = flight.outbound[flight.outbound.length - 1]
  const stops = flight.stops
  const stopLabel = getStopLabel(stops)

  const handleBook = () => {
    // Full flight objects are too large for URL params — use sessionStorage instead
    sessionStorage.setItem('pendingFlight', JSON.stringify(flight))
    router.push('/book')
  }

  return (
    <div className="card-luxury mb-4 overflow-hidden">
      {/* Main Row */}
      <div className="p-4 lg:p-5">
        <div className="flex items-center gap-4">
          {/* Airline */}
          <AirlineBadge
            code={firstSegment.airlineCode}
            name={firstSegment.airline}
          />

          {/* Flight Info */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-3 lg:grid-cols-5 gap-2 items-center">
              {/* Departure */}
              <div>
                <div className="text-xl lg:text-2xl font-bold text-walz-deep-navy leading-none">
                  {formatTime(firstSegment.departureTime)}
                </div>
                <div className="text-sm font-semibold text-walz-slate">
                  {firstSegment.departureAirport}
                </div>
                <div className="text-xs text-walz-muted hidden lg:block">
                  {formatDate(firstSegment.departureTime)}
                </div>
              </div>

              {/* Duration & Route */}
              <div className="col-span-1 text-center">
                <div className="text-xs text-walz-muted mb-1">
                  {formatDuration(flight.totalDuration)}
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-px bg-walz-border" />
                  <div className="w-2 h-2 rounded-full bg-walz-gold" />
                  {stops > 0 && (
                    <>
                      <div className="flex-1 h-px bg-walz-border" />
                      <div className="w-2 h-2 rounded-full border-2 border-walz-gold" />
                    </>
                  )}
                  <div className="flex-1 h-px bg-walz-border" />
                </div>
                <div className={cn(
                  'text-xs mt-1 font-medium',
                  stops === 0 ? 'text-walz-success' : 'text-walz-warning'
                )}>
                  {stopLabel}
                </div>
              </div>

              {/* Arrival */}
              <div className="text-right">
                <div className="text-xl lg:text-2xl font-bold text-walz-deep-navy leading-none">
                  {formatTime(lastOutboundSegment.arrivalTime)}
                </div>
                <div className="text-sm font-semibold text-walz-slate">
                  {lastOutboundSegment.arrivalAirport}
                </div>
                <div className="text-xs text-walz-muted hidden lg:block">
                  {formatDate(lastOutboundSegment.arrivalTime)}
                </div>
              </div>

              {/* Cabin & Baggage (desktop) */}
              <div className="hidden lg:flex lg:col-span-1 flex-col items-center gap-1">
                <span className="badge-navy">{flight.cabinClass.replace('_', ' ')}</span>
                {flight.baggage && (
                  <div className="flex items-center gap-1 text-xs text-walz-muted">
                    <Luggage className="w-3 h-3" />
                    <span>{flight.baggage.checked}</span>
                  </div>
                )}
              </div>

              {/* Price & Book */}
              <div className="hidden lg:flex lg:col-span-1 flex-col items-end gap-2">
                <div>
                  <div className="text-2xl font-bold text-walz-gold">
                    {formatPrice(flight.price.amount, flight.price.currency)}
                  </div>
                  {totalPassengers > 1 && (
                    <div className="text-xs text-walz-muted text-right">
                      {formatPrice(flight.price.perPerson, flight.price.currency)} per person
                    </div>
                  )}
                </div>
                {flight.seatsRemaining !== undefined && flight.seatsRemaining <= 5 && (
                  <p className="text-xs text-walz-warning font-medium">
                    Only {flight.seatsRemaining} left!
                  </p>
                )}
                <Button variant="gold" size="sm" onClick={handleBook}>
                  Book Now
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Price & Book */}
        <div className="lg:hidden flex items-center justify-between mt-4 pt-4 border-t border-walz-border">
          <div>
            <div className="text-xl font-bold text-walz-gold">
              {formatPrice(flight.price.amount, flight.price.currency)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="badge-navy text-[10px]">{flight.cabinClass.replace('_', ' ')}</span>
              {flight.isRefundable ? (
                <span className="text-xs text-walz-success flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refundable
                </span>
              ) : null}
            </div>
          </div>
          <Button variant="gold" size="sm" onClick={handleBook}>
            Book Now
          </Button>
        </div>

        {/* Tags row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {flight.isRefundable && (
            <span className="hidden lg:flex items-center gap-1 text-xs text-walz-success">
              <RefreshCw className="w-3 h-3" />
              Refundable
            </span>
          )}
          <span className="text-xs text-walz-muted">
            Operated by {firstSegment.airline}
          </span>
          {flight.seatsRemaining !== undefined && flight.seatsRemaining <= 5 && (
            <span className="lg:hidden text-xs text-walz-warning font-medium">
              Only {flight.seatsRemaining} seats left!
            </span>
          )}
        </div>
      </div>

      {/* Expand Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-t border-walz-border bg-walz-off-white hover:bg-walz-border/30 transition-colors text-sm text-walz-muted hover:text-walz-deep-navy"
      >
        <Info className="w-3.5 h-3.5" />
        <span>Flight details</span>
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-walz-border">
          <div className="p-4 lg:p-5">
            {/* Outbound */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Plane className="w-4 h-4 text-walz-gold" />
                <h4 className="font-semibold text-walz-deep-navy text-sm">Outbound Flight</h4>
              </div>
              <div className="space-y-1 divide-y divide-walz-border">
                {flight.outbound.map((segment, i) => (
                  <SegmentRow
                    key={i}
                    segment={segment}
                    isLast={i === flight.outbound.length - 1}
                  />
                ))}
              </div>
            </div>

            {/* Inbound */}
            {flight.inbound && flight.inbound.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Plane className="w-4 h-4 text-walz-gold rotate-180" />
                  <h4 className="font-semibold text-walz-deep-navy text-sm">Return Flight</h4>
                </div>
                <div className="space-y-1 divide-y divide-walz-border">
                  {flight.inbound.map((segment, i) => (
                    <SegmentRow
                      key={i}
                      segment={segment}
                      isLast={i === flight.inbound!.length - 1}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Fare Details */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-walz-off-white rounded-xl">
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Cabin Class</div>
                <div className="text-sm font-medium text-walz-deep-navy">{flight.cabinClass.replace('_', ' ')}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Carry-on</div>
                <div className="text-sm font-medium text-walz-deep-navy">{flight.baggage?.carry || '1 x 7kg'}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Checked Bag</div>
                <div className="text-sm font-medium text-walz-deep-navy">{flight.baggage?.checked || '1 x 23kg'}</div>
              </div>
              <div>
                <div className="text-xs text-walz-muted mb-0.5">Refundable</div>
                <div className={cn('text-sm font-medium', flight.isRefundable ? 'text-walz-success' : 'text-walz-error')}>
                  {flight.isRefundable ? 'Yes' : 'No'}
                </div>
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
    </div>
  )
}
