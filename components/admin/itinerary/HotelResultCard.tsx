'use client'

import { useState } from 'react'
import { AddControl } from './AddStatus'
import type { AddState } from './useResearchAdd'
import { fmtPrice } from './researchFormat'

export interface HotelRateResult {
  rateKey: string
  roomCode?: string | null
  roomName?: string | null
  boardCode?: string | null
  boardName?: string | null
  isRefundable?: boolean
  cancellationPolicy?: string | null
  cancellationDeadline?: string | null
  supplierCurrency: string
  supplierAmount: number
  perNightAmount?: number | null
  nights: number
}
export interface HotelOfferResult {
  providerHotelCode: string
  hotelName: string
  starRating: number | null
  destinationName?: string | null
  city?: string | null
  imageUrls?: string[]
  checkIn: string
  checkOut: string
  nights: number
  rooms: number
  adults: number
  children: number
  rates: HotelRateResult[]
  supplierCurrency: string
  supplierMinAmount: number
}

export default function HotelResultCard({
  hotel, stateOf, onAddRate, onAddAnyway, onCancel, onViewBookings,
}: {
  hotel: HotelOfferResult
  stateOf: (key: string) => AddState
  onAddRate: (rate: HotelRateResult, key: string) => void
  onAddAnyway: (rate: HotelRateResult, key: string) => void
  onCancel: (key: string) => void
  onViewBookings?: () => void
}) {
  const [open, setOpen] = useState(false)
  const image = hotel.imageUrls?.[0]
  const location = [hotel.city, hotel.destinationName].filter(Boolean).join(', ')
  const stars = hotel.starRating ?? 0
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10" data-testid="hotel-card">
      <div className="flex items-start gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={hotel.hotelName} className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-white/10" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 text-2xl">🏨</div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">{hotel.hotelName}</p>
          <p className="text-amber-400 text-xs">{stars > 0 ? '⭐'.repeat(Math.min(stars, 5)) : <span className="text-white/40">No rating</span>}</p>
          <p className="text-white/50 text-xs">{location}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-white/40 text-xs">from</p>
          <p className="text-white font-bold text-sm">{fmtPrice(hotel.supplierMinAmount, hotel.supplierCurrency)}</p>
          <p className="text-white/40 text-xs">total for {hotel.nights} night{hotel.nights === 1 ? '' : 's'}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 min-h-[44px] w-full sm:w-auto border border-white/20 text-white/80 hover:bg-white/10 text-sm font-semibold px-4 py-2 rounded-lg"
      >
        {open ? 'Hide rooms and rates' : `Choose room / rate (${hotel.rates.length})`}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {hotel.rates.length === 0 && <p className="text-white/40 text-sm">No rates available.</p>}
          {hotel.rates.map((r, i) => {
            const key = `${hotel.providerHotelCode}:${r.rateKey}`
            return (
              <div key={`${key}-${i}`} className="rounded-lg bg-white/5 border border-white/10 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="hotel-rate">
                <div className="min-w-0 text-sm">
                  <p className="text-white font-semibold">{r.roomName ?? 'Room'}</p>
                  <p className="text-white/60 text-xs">{r.boardName ?? r.boardCode ?? 'Board not specified'}</p>
                  <p className={`text-xs ${r.isRefundable ? 'text-green-400' : 'text-red-300'}`}>
                    {r.isRefundable ? 'Refundable' : 'Non-refundable'}
                    {r.isRefundable && r.cancellationDeadline ? ` until ${r.cancellationDeadline.slice(0, 10)}` : ''}
                  </p>
                  {r.cancellationPolicy && <p className="text-white/40 text-xs">{r.cancellationPolicy}</p>}
                  <p className="text-white font-bold mt-1">
                    {fmtPrice(r.supplierAmount, r.supplierCurrency, 2)}
                    <span className="text-white/40 text-xs font-normal"> total for {r.nights} night{r.nights === 1 ? '' : 's'}</span>
                  </p>
                  {r.perNightAmount != null && r.nights > 0 && (
                    <p className="text-white/40 text-xs">≈ {fmtPrice(r.perNightAmount, r.supplierCurrency, 2)} / night</p>
                  )}
                </div>
                <div className="sm:w-56">
                  <AddControl
                    state={stateOf(key)}
                    onAdd={() => onAddRate(r, key)}
                    onAddAnyway={() => onAddAnyway(r, key)}
                    onCancel={() => onCancel(key)}
                    onViewBookings={onViewBookings}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
