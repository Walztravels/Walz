'use client'

import { useState, useEffect } from 'react'
import { useFlightStore, type SelectedSeat } from '@/store/flightStore'
import type { SeatElement } from '@/app/api/flights/seat-map/route'
import type { CabinClass } from '@/lib/flights/types'

interface Props {
  offerId:        string
  segmentId:      string       // 'out' | 'ret' — identifies which leg
  passengerCount: number
  cabinClass:     CabinClass   // booked cabin — restricts selectable seats
  onComplete:     (seats: SelectedSeat[]) => void
  onSkip:         () => void
}

// Emirates palette
const SEAT_STYLE: Record<string, { base: string; dot: string; label: string }> = {
  business:        { base: 'bg-[#C9A84C]/15 border-[#C9A84C]/50 hover:bg-[#C9A84C]/30',   dot: 'bg-[#C9A84C]',   label: 'Business'       },
  'extra-legroom': { base: 'bg-sky-50 border-sky-300 hover:bg-sky-100',                     dot: 'bg-sky-400',     label: 'Extra Legroom'  },
  window:          { base: 'bg-[#EEF4FF] border-[#B8CCEE] hover:bg-[#DDE9FA]',             dot: 'bg-[#6E96D4]',   label: 'Window'         },
  aisle:           { base: 'bg-[#F0FAF4] border-[#A8D8B8] hover:bg-[#DCF0E4]',             dot: 'bg-[#4CAF72]',   label: 'Aisle'          },
  middle:          { base: 'bg-white border-[#D8D5D0] hover:bg-[#FAF7F2]',                  dot: 'bg-[#C0BDB8]',   label: 'Middle'         },
}

const PAX_COLORS = [
  'bg-[#C9A84C] text-[#0B1F3A]',
  'bg-[#6E96D4] text-white',
  'bg-[#4CAF72] text-white',
  'bg-[#E07B5A] text-white',
]

function isEconomyCabin(c: CabinClass) { return c === 'ECONOMY' || c === 'PREMIUM_ECONOMY' }
function isBizCabin(c: CabinClass)     { return c === 'BUSINESS' || c === 'FIRST' }

// Can the booked cabin select this seat type?
function seatAllowed(seatType: string, booked: CabinClass): boolean {
  if (isBizCabin(booked))     return seatType === 'business'
  if (isEconomyCabin(booked)) return seatType !== 'business'
  return true
}

export function SeatMapViewer({ offerId, segmentId, passengerCount, cabinClass, onComplete, onSkip }: Props) {
  const [rawSeats, setRawSeats] = useState<SeatElement[]>([])
  const [loading,  setLoading]  = useState(true)
  const [activePax, setActivePax] = useState(0)
  const [hovered,  setHovered]  = useState<SeatElement | null>(null)

  const { seats: allSeats, setSeat, removeSeat } = useFlightStore()

  // Only seats for this leg's segmentId
  const legSeats = allSeats.filter(s => s.segmentId === segmentId)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/flights/seat-map?offer_id=${offerId}`)
      .then(r => r.json())
      .then(d => { setRawSeats(d.seats ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [offerId])

  // Auto-advance activePax to first without a seat when leg seats change
  useEffect(() => {
    const firstUnseat = Array.from({ length: passengerCount }, (_, i) => i).find(
      i => !legSeats.some(s => s.paxIndex === i)
    )
    if (firstUnseat !== undefined) setActivePax(firstUnseat)
  }, [legSeats.length]) // eslint-disable-line

  const BIZ_ROWS  = [1, 2, 3, 4]
  const EXIT_ROWS = [10, 20]
  const WING_ROWS = [14, 15, 16, 17, 18, 19]
  const rows = Array.from({ length: 30 }, (_, i) => i + 1)

  function getSeat(row: number, col: string): SeatElement | undefined {
    return rawSeats.find(s => s.row === row && s.col === col)
  }

  function isSelected(d: string) { return legSeats.some(s => s.seatNumber === d) }
  function paxOfSeat(d: string)  { return legSeats.findIndex(s => s.seatNumber === d) }

  function handleClick(seat: SeatElement) {
    if (!seat.available) return
    if (!seatAllowed(seat.type, cabinClass)) return

    // Toggle off if this pax already picked this seat
    if (isSelected(seat.designator)) {
      const p = paxOfSeat(seat.designator)
      removeSeat(segmentId, p)
      return
    }
    // Replace current pax's existing seat for this leg
    if (legSeats.some(s => s.paxIndex === activePax)) {
      removeSeat(segmentId, activePax)
    }
    setSeat({ segmentId, seatNumber: seat.designator, paxIndex: activePax, type: seat.type, priceGBP: seat.priceGBP })
    // Advance to next unseated pax
    const nextUnseat = Array.from({ length: passengerCount }, (_, i) => i).find(
      i => i !== activePax && !legSeats.some(s => s.paxIndex === i && s.seatNumber !== seat.designator)
    )
    if (nextUnseat !== undefined) setActivePax(nextUnseat)
  }

  const totalSelected = legSeats.length
  const allDone       = totalSelected >= passengerCount
  const seatTotal     = legSeats.reduce((s, seat) => s + seat.priceGBP, 0)

  // Cabin label shown at top of the restricted section
  const cabinRestrictionBanner = isBizCabin(cabinClass)
    ? { section: 'economy', msg: 'Economy seats not available with your fare' }
    : { section: 'business', msg: 'Business cabin not included in your fare' }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-4 border-[#C9A84C]/20 border-t-[#C9A84C] animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-xl">✈</span>
        </div>
        <p className="text-[#0B1F3A]/40 text-sm">Loading cabin map…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">

      {/* ── Seat map ── */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-black/5 overflow-hidden">

        {/* Legend */}
        <div className="px-5 py-3 bg-[#FAF7F2] border-b border-[#0B1F3A]/5 flex flex-wrap gap-x-4 gap-y-2 items-center">
          {Object.entries(SEAT_STYLE)
            .filter(([key]) => seatAllowed(key, cabinClass))
            .map(([key, { dot, label }]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${dot}`} />
                <span className="text-[10px] text-[#0B1F3A]/50 font-medium">{label}</span>
              </div>
            ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#E8E4DF]" />
            <span className="text-[10px] text-[#0B1F3A]/50 font-medium">Occupied</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#F0EDE8] border border-dashed border-[#C8C4BF]" />
            <span className="text-[10px] text-[#0B1F3A]/30 font-medium">Not in your fare</span>
          </div>
        </div>

        {/* Map scroll area */}
        <div className="overflow-y-auto max-h-[540px] p-4 pb-6">

          {/* Aircraft nose */}
          <div className="flex flex-col items-center mb-5">
            <svg width="56" height="36" viewBox="0 0 56 36" fill="none">
              <path d="M28 2C28 2 6 16 6 34L50 34C50 16 28 2 28 2Z" fill="#0B1F3A" opacity="0.06"/>
              <path d="M28 7C28 7 11 19 11 32L45 32C45 19 28 7 28 7Z" fill="#0B1F3A" opacity="0.04"/>
            </svg>
            <p className="text-[9px] font-bold text-[#0B1F3A]/20 uppercase tracking-[0.2em] mt-1">Front</p>
          </div>

          {/* Column labels */}
          <div className="flex justify-center mb-2">
            <div className="grid items-center" style={{ gridTemplateColumns: '26px 34px 34px 34px 18px 34px 34px 34px 10px' }}>
              <div/>
              {['A','B','C','','D','E','F'].map((c, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-[#0B1F3A]/30 tracking-widest">{c}</div>
              ))}
              <div/>
            </div>
          </div>

          {/* Rows */}
          <div className="flex flex-col items-center gap-[3px]">
            {rows.map(row => {
              const isBiz  = BIZ_ROWS.includes(row)
              const isExit = EXIT_ROWS.includes(row)
              const isWing = WING_ROWS.includes(row)

              return (
                <div key={row} className="w-full">
                  {/* Cabin section headers */}
                  {row === 1 && (
                    <div className="flex justify-center mb-2">
                      <div className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full border ${
                        isBizCabin(cabinClass)
                          ? 'text-[#C9A84C] bg-[#C9A84C]/8 border-[#C9A84C]/20'
                          : 'text-[#0B1F3A]/30 bg-[#0B1F3A]/4 border-[#0B1F3A]/8'
                      }`}>
                        {!isBizCabin(cabinClass) && <span>🔒</span>}
                        Business Class
                        {isBizCabin(cabinClass) && <span className="text-[#C9A84C]">✓ Your cabin</span>}
                      </div>
                    </div>
                  )}
                  {row === BIZ_ROWS[BIZ_ROWS.length - 1] + 1 && (
                    <div className="flex justify-center my-3">
                      <div className="flex items-center gap-3">
                        <div className="h-px w-12 bg-[#0B1F3A]/8" />
                        <div className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] px-4 py-1.5 rounded-full border ${
                          isEconomyCabin(cabinClass)
                            ? 'text-[#0B1F3A]/60 bg-[#0B1F3A]/5 border-[#0B1F3A]/10'
                            : 'text-[#0B1F3A]/25 bg-[#0B1F3A]/3 border-[#0B1F3A]/6'
                        }`}>
                          {isBizCabin(cabinClass) && <span>🔒</span>}
                          Economy Class
                          {isEconomyCabin(cabinClass) && <span className="text-emerald-500">✓ Your cabin</span>}
                        </div>
                        <div className="h-px w-12 bg-[#0B1F3A]/8" />
                      </div>
                    </div>
                  )}

                  {/* Exit row */}
                  {isExit && (
                    <div className="flex items-center gap-2 justify-center my-1">
                      <div className="h-px flex-1 max-w-[36px] bg-emerald-300/50" />
                      <span className="text-[8px] font-bold text-emerald-600 tracking-widest uppercase px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">EXIT</span>
                      <div className="h-px flex-1 max-w-[36px] bg-emerald-300/50" />
                    </div>
                  )}

                  {/* Seat row */}
                  <div className="grid items-center justify-center" style={{ gridTemplateColumns: '26px 34px 34px 34px 18px 34px 34px 34px 10px' }}>
                    <div className="text-[9px] text-[#0B1F3A]/20 text-center font-medium tabular-nums">{row}</div>

                    {(['A','B','C','D','E','F'] as const).map((col, colIdx) => {
                      if (colIdx === 3) {
                        // Insert aisle spacer before D
                        return [
                          <div key="aisle" className="flex items-center justify-center">
                            {isWing && <div className="w-px h-5 bg-[#0B1F3A]/6" />}
                          </div>,
                          renderSeat(col)
                        ]
                      }
                      return renderSeat(col)
                    }).flat()}

                    {/* Wing tip */}
                    <div>{isWing && <div className="w-2 h-5 bg-[#0B1F3A]/4 rounded-r-sm" />}</div>
                  </div>
                </div>
              )

              function renderSeat(col: 'A'|'B'|'C'|'D'|'E'|'F') {
                const seat    = getSeat(row, col)
                if (!seat) return <div key={col} className="mx-0.5 h-7" />
                const sel     = isSelected(seat.designator)
                const paxIdx  = paxOfSeat(seat.designator)
                const allowed = seatAllowed(seat.type, cabinClass)
                const paxClr  = PAX_COLORS[paxIdx] ?? PAX_COLORS[0]

                let cls = ''
                if (sel) {
                  cls = `${paxClr} border-transparent cursor-pointer active:scale-95`
                } else if (!allowed) {
                  cls = 'bg-[#F5F2EE] border-dashed border-[#D8D5D0] cursor-not-allowed text-[#0B1F3A]/10'
                } else if (!seat.available) {
                  cls = 'bg-[#E8E4DF] border-[#C8C4BF] cursor-not-allowed'
                } else {
                  const s = SEAT_STYLE[seat.type] ?? SEAT_STYLE.middle
                  cls = `${s.base} border cursor-pointer active:scale-95`
                }

                return (
                  <button key={col} type="button"
                    disabled={!seat.available || !allowed}
                    onClick={() => handleClick(seat)}
                    onMouseEnter={() => setHovered(seat)}
                    onMouseLeave={() => setHovered(null)}
                    title={!allowed
                      ? `${seat.designator} — not available in your fare`
                      : `${seat.designator} · ${seat.type} · ${seat.priceGBP > 0 ? `£${seat.priceGBP}` : 'Free'}`}
                    className={`relative mx-0.5 h-7 rounded-md text-[9px] font-bold transition-all duration-100 border ${cls}`}>
                    {!allowed && <span className="text-[8px] opacity-30">🔒</span>}
                    {sel && <span className="text-[10px] font-bold">{paxIdx + 1}</span>}
                    {!sel && seat.available && allowed && (
                      <div className="absolute top-0.5 left-1 right-1 h-px bg-current opacity-8 rounded" />
                    )}
                  </button>
                )
              }
            })}
          </div>

          {/* Tail */}
          <div className="flex flex-col items-center mt-4">
            <p className="text-[9px] font-bold text-[#0B1F3A]/15 uppercase tracking-[0.2em] mb-1">Rear</p>
            <svg width="56" height="24" viewBox="0 0 56 24" fill="none">
              <path d="M10 2L46 2L50 22L6 22Z" fill="#0B1F3A" opacity="0.04"/>
            </svg>
          </div>
        </div>

        {/* Hover info bar */}
        {hovered && (
          <div className="mx-4 mb-4 p-3 bg-[#0B1F3A] rounded-xl text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold">{hovered.designator}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold capitalize">{hovered.type.replace('-', ' ')} seat</p>
              <p className="text-[10px] text-white/40">
                {!seatAllowed(hovered.type, cabinClass)
                  ? 'Not included in your fare'
                  : hovered.available ? 'Available' : 'Occupied'}
              </p>
            </div>
            {seatAllowed(hovered.type, cabinClass) && (
              <p className="text-sm font-bold text-[#C9A84C] flex-shrink-0">
                {hovered.priceGBP > 0 ? `+£${hovered.priceGBP}` : 'Included'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-4">

        {/* Fare restriction notice */}
        <div className={`rounded-xl p-3.5 flex gap-3 items-start border ${
          isBizCabin(cabinClass)
            ? 'bg-[#C9A84C]/8 border-[#C9A84C]/20'
            : 'bg-[#0B1F3A]/4 border-[#0B1F3A]/8'
        }`}>
          <span className="text-base flex-shrink-0">{isBizCabin(cabinClass) ? '👑' : '💺'}</span>
          <div>
            <p className="text-xs font-bold text-[#0B1F3A]">
              {isBizCabin(cabinClass) ? 'Business / First class' : cabinClass.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())} fare
            </p>
            <p className="text-[10px] text-[#0B1F3A]/50 mt-0.5 leading-relaxed">
              {isBizCabin(cabinClass)
                ? 'Only business class seats are available on your ticket.'
                : 'Business class seats are not included in your fare.'}
            </p>
          </div>
        </div>

        {/* Passenger pills */}
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">Select seat for</p>
          <div className="space-y-2">
            {Array.from({ length: passengerCount }, (_, i) => {
              const seat   = legSeats.find(s => s.paxIndex === i)
              const active = activePax === i
              const clr    = PAX_COLORS[i] ?? PAX_COLORS[0]
              return (
                <button key={i} type="button"
                  onClick={() => setActivePax(i)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border text-left ${active ? 'border-[#C9A84C]/40 bg-[#C9A84C]/5' : 'border-[#0B1F3A]/5 hover:border-[#0B1F3A]/10'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${clr}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#0B1F3A]">Passenger {i + 1}</p>
                    {seat
                      ? <p className="text-[10px] text-emerald-600 font-medium">Seat {seat.seatNumber} · {seat.type}</p>
                      : <p className="text-[10px] text-[#0B1F3A]/30">{active ? 'Click a seat on the map' : 'Not selected'}</p>}
                  </div>
                  {seat
                    ? <span className="text-emerald-500 text-sm flex-shrink-0">✓</span>
                    : active && <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0 animate-pulse" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Price summary */}
        {seatTotal > 0 && (
          <div className="bg-white rounded-2xl border border-black/5 p-5">
            <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">Seat charges</p>
            <div className="space-y-1.5 mb-3">
              {legSeats.map(s => (
                <div key={s.seatNumber} className="flex items-center justify-between text-xs">
                  <span className="text-[#0B1F3A]/50">Pax {s.paxIndex + 1} · {s.seatNumber}</span>
                  <span className="font-semibold text-[#0B1F3A]">{s.priceGBP > 0 ? `£${s.priceGBP}` : 'Free'}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#0B1F3A]/5 pt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-[#0B1F3A]">Total added</span>
              <span className="text-sm font-bold text-[#C9A84C]">+£{seatTotal}</span>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-2">
          <button type="button"
            onClick={() => onComplete(legSeats)}
            disabled={!allDone}
            className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.98] transition-all disabled:opacity-35 shadow-sm shadow-[#C9A84C]/30">
            {allDone
              ? 'Confirm seats →'
              : `${passengerCount - totalSelected} more seat${passengerCount - totalSelected > 1 ? 's' : ''} to select`}
          </button>
          <button type="button" onClick={onSkip}
            className="w-full py-2.5 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A]/55 font-medium text-sm hover:bg-[#0B1F3A]/8 transition-all">
            Skip seat selection
          </button>
        </div>

        {/* Tips */}
        <div className="space-y-2">
          {[
            { icon: '🪑', text: 'Seat charges are per person, per flight' },
            { icon: '🔒', text: 'Seats outside your fare class cannot be selected' },
            { icon: '🔄', text: 'You can change seats up to 24h before departure' },
          ].map(({ icon, text }) => (
            <p key={text} className="text-[10px] text-[#0B1F3A]/35 flex gap-2 leading-relaxed">
              <span className="flex-shrink-0">{icon}</span>{text}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { SelectedSeat }
