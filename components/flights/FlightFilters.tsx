'use client'

import { useState, useEffect } from 'react'
import type { FlightItinerary } from '@/lib/flights/types'
import { formatPrice } from '@/lib/flights/utils'

export interface FilterState {
  stops:       number[]   // empty = all
  maxPrice:    number
  refundable:  boolean
  airlines:    string[]   // empty = all
}

interface Props {
  results:   FlightItinerary[]
  onChange:  (f: FilterState) => void
}

export function FlightFilters({ results, onChange }: Props) {
  const allAirlines = [...new Set(results.flatMap(r => r.segments.map(s => s.airlineName)))]
  const maxResultPrice = Math.max(5000, ...results.map(r => r.price.total))

  const [stops,      setStops]     = useState<number[]>([])
  const [maxPrice,   setMaxPrice]  = useState(maxResultPrice)
  const [refundable, setRefundable] = useState(false)
  const [airlines,   setAirlines]  = useState<string[]>([])

  // Push changes upstream whenever any filter changes
  useEffect(() => {
    onChange({ stops, maxPrice, refundable, airlines })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, maxPrice, refundable, airlines])

  // When results change (new search), reset max price ceiling
  useEffect(() => {
    setMaxPrice(maxResultPrice)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length])

  const stopCount = (n: number) =>
    results.filter(r => n === 2 ? r.stops >= 2 : r.stops === n).length

  function toggleStop(n: number) {
    setStops(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n])
  }

  function toggleAirline(name: string) {
    setAirlines(a => a.includes(name) ? a.filter(x => x !== name) : [...a, name])
  }

  function reset() {
    setStops([])
    setMaxPrice(maxResultPrice)
    setRefundable(false)
    setAirlines([])
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-[#0B1F3A]">Filters</h3>
        {(stops.length > 0 || refundable || airlines.length > 0 || maxPrice < maxResultPrice) && (
          <button onClick={reset} className="text-xs text-[#C9A84C] font-semibold hover:underline">Reset</button>
        )}
      </div>

      {/* Stops */}
      <div>
        <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-3">Stops</p>
        {[{ n: 0, label: 'Direct' }, { n: 1, label: '1 stop' }, { n: 2, label: '2+ stops' }].map(({ n, label }) => (
          <label key={n} className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={stops.includes(n)} onChange={() => toggleStop(n)}
              className="rounded border-[#0B1F3A]/20 accent-[#C9A84C]" />
            <span className="text-sm text-[#0B1F3A] flex-1">{label}</span>
            <span className="text-xs text-[#0B1F3A]/30">{stopCount(n)}</span>
          </label>
        ))}
      </div>

      {/* Max price */}
      <div>
        <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-2">Max price</p>
        <input type="range" min={0} max={maxResultPrice} step={50} value={maxPrice}
          onChange={e => setMaxPrice(Number(e.target.value))}
          className="w-full accent-[#C9A84C]" />
        <div className="flex justify-between text-xs text-[#0B1F3A]/40 mt-1.5">
          <span>£0</span>
          <span className="font-semibold text-[#0B1F3A]">Up to {formatPrice(maxPrice)}</span>
          <span>{formatPrice(maxResultPrice)}+</span>
        </div>
      </div>

      {/* Refundable */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={refundable} onChange={() => setRefundable(!refundable)}
          className="rounded border-[#0B1F3A]/20 accent-[#C9A84C]" />
        <span className="text-sm text-[#0B1F3A]">Refundable fares only</span>
      </label>

      {/* Airlines */}
      {allAirlines.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wider mb-3">Airlines</p>
          {allAirlines.map(name => (
            <label key={name} className="flex items-center gap-2 py-1.5 cursor-pointer">
              <input type="checkbox"
                checked={airlines.length === 0 || airlines.includes(name)}
                onChange={() => toggleAirline(name)}
                className="rounded border-[#0B1F3A]/20 accent-[#C9A84C]" />
              <span className="text-sm text-[#0B1F3A]">{name}</span>
            </label>
          ))}
        </div>
      )}

      <button onClick={reset}
        className="w-full py-2.5 rounded-xl text-sm font-semibold border border-[#0B1F3A]/10 text-[#0B1F3A]/50 hover:border-[#0B1F3A]/30 transition-all">
        Reset filters
      </button>
    </div>
  )
}

export function applyFilters(results: FlightItinerary[], f: FilterState): FlightItinerary[] {
  return results.filter(r => {
    if (f.stops.length > 0) {
      const stopsMatch = f.stops.some(n => n === 2 ? r.stops >= 2 : r.stops === n)
      if (!stopsMatch) return false
    }
    if (r.price.total > f.maxPrice) return false
    if (f.refundable && !r.refundable) return false
    if (f.airlines.length > 0) {
      const airlineName = r.segments[0]?.airlineName ?? ''
      if (!f.airlines.includes(airlineName)) return false
    }
    return true
  })
}
