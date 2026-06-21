'use client'

import { useState, useEffect, useRef } from 'react'
import { useFlightStore, type SelectedSeat } from '@/store/flightStore'
import type { SeatElement } from '@/app/api/flights/seat-map/route'

interface Props {
  offerId:        string
  passengerCount: number
  onComplete:     (seats: SelectedSeat[]) => void
}

// Emirates-palette seat colours
const SEAT_STYLE: Record<string, { base: string; label: string; dot: string }> = {
  business:        { base: 'bg-[#C9A84C]/15 border-[#C9A84C]/60 hover:bg-[#C9A84C]/30',       label: 'Business',      dot: 'bg-[#C9A84C]'     },
  'extra-legroom': { base: 'bg-sky-50 border-sky-300 hover:bg-sky-100',                         label: 'Extra Legroom', dot: 'bg-sky-400'       },
  window:          { base: 'bg-[#EEF4FF] border-[#B8CCEE] hover:bg-[#DDE9FA]',                 label: 'Window',        dot: 'bg-[#6E96D4]'     },
  aisle:           { base: 'bg-[#F0FAF4] border-[#A8D8B8] hover:bg-[#DCF0E4]',                 label: 'Aisle',         dot: 'bg-[#4CAF72]'     },
  middle:          { base: 'bg-white border-[#D8D5D0] hover:bg-[#FAF7F2]',                      label: 'Middle',        dot: 'bg-[#C0BDB8]'     },
}

const PAX_COLORS = [
  { ring: 'bg-[#C9A84C] text-[#0B1F3A]',  dot: 'bg-[#C9A84C]'  },
  { ring: 'bg-[#6E96D4] text-white',        dot: 'bg-[#6E96D4]'  },
  { ring: 'bg-[#4CAF72] text-white',        dot: 'bg-[#4CAF72]'  },
  { ring: 'bg-[#E07B5A] text-white',        dot: 'bg-[#E07B5A]'  },
]

function seatStyle(seat: SeatElement, selected: boolean, occupied: boolean) {
  if (occupied)  return 'bg-[#E8E4DF] border-[#C8C4BF] cursor-not-allowed text-[#0B1F3A]/20'
  if (selected)  return 'border-transparent cursor-pointer'
  const s = SEAT_STYLE[seat.type] ?? SEAT_STYLE.middle
  return `${s.base} border cursor-pointer active:scale-95`
}

export function SeatMapViewer({ offerId, passengerCount, onComplete }: Props) {
  const [rawSeats,  setRawSeats]  = useState<SeatElement[]>([])
  const [loading,   setLoading]   = useState(true)
  const [activePax, setActivePax] = useState(0)
  const [hovered,   setHovered]   = useState<SeatElement | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)

  const { seats: selectedSeats, setSeat, clearSeats } = useFlightStore()

  useEffect(() => {
    fetch(`/api/flights/seat-map?offer_id=${offerId}`)
      .then(r => r.json())
      .then(d => { setRawSeats(d.seats ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [offerId])

  const rows = Array.from({ length: 30 }, (_, i) => i + 1)
  const EXIT_ROWS = [10, 20]
  const WING_ROWS = [14, 15, 16, 17, 18, 19]
  const BIZ_ROWS  = [1, 2, 3, 4]

  function getSeat(row: number, col: string): SeatElement | undefined {
    return rawSeats.find(s => s.row === row && s.col === col)
  }

  function isSelected(d: string)  { return selectedSeats.some(s => s.seatNumber === d) }
  function paxIndex(d: string)    { return selectedSeats.findIndex(s => s.seatNumber === d) }

  function handleClick(seat: SeatElement) {
    if (!seat.available) return
    // Deselect if this pax already has it
    const existing = selectedSeats.find(s => s.seatNumber === seat.designator)
    if (existing) return
    setSeat({ segmentId: 'seg_0', seatNumber: seat.designator, paxIndex: activePax, type: seat.type, priceGBP: seat.priceGBP })
    if (activePax < passengerCount - 1) setActivePax(p => p + 1)
  }

  const totalSelected  = selectedSeats.length
  const seatTotal      = selectedSeats.reduce((s, seat) => s + seat.priceGBP, 0)
  const allDone        = totalSelected >= passengerCount

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-[#C9A84C]/20 border-t-[#C9A84C] animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-xl">✈</span>
        </div>
        <p className="text-[#0B1F3A]/40 text-sm font-medium">Loading cabin map…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">

      {/* ── Seat map panel ── */}
      <div className="flex-1 min-w-0 bg-white rounded-2xl border border-black/5 overflow-hidden">

        {/* Legend */}
        <div className="px-5 py-3 border-b border-[#0B1F3A]/5 bg-[#FAF7F2] flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(SEAT_STYLE).map(([key, { dot, label }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${dot}`} />
              <span className="text-[10px] text-[#0B1F3A]/50 font-medium">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#E8E4DF]" />
            <span className="text-[10px] text-[#0B1F3A]/50 font-medium">Occupied</span>
          </div>
        </div>

        {/* Map */}
        <div ref={mapRef} className="overflow-y-auto max-h-[520px] p-4 pb-6">

          {/* Aircraft nose */}
          <div className="flex flex-col items-center mb-5">
            <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
              <path d="M30 2 C30 2 8 18 8 36 L52 36 C52 18 30 2 30 2Z" fill="#0B1F3A" opacity="0.07" />
              <path d="M30 6 C30 6 12 20 12 34 L48 34 C48 20 30 6 30 6Z" fill="#0B1F3A" opacity="0.05" />
            </svg>
            <p className="text-[9px] font-bold text-[#0B1F3A]/25 uppercase tracking-[0.2em] mt-1">Front of aircraft</p>
          </div>

          {/* Column headers */}
          <div className="flex justify-center mb-2">
            <div className="grid items-center" style={{ gridTemplateColumns: '28px 36px 36px 36px 20px 36px 36px 36px 12px' }}>
              <div />
              {['A','B','C'].map(c => (
                <div key={c} className="text-center text-[10px] font-bold text-[#0B1F3A]/35 tracking-widest">{c}</div>
              ))}
              <div />
              {['D','E','F'].map(c => (
                <div key={c} className="text-center text-[10px] font-bold text-[#0B1F3A]/35 tracking-widest">{c}</div>
              ))}
              <div />
            </div>
          </div>

          {/* Rows */}
          <div className="flex flex-col items-center gap-0.5">
            {rows.map(row => {
              const isBiz  = BIZ_ROWS.includes(row)
              const isExit = EXIT_ROWS.includes(row)
              const isWing = WING_ROWS.includes(row)

              return (
                <div key={row}>
                  {/* Cabin section label */}
                  {row === 1 && (
                    <div className="flex justify-center mb-2">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#C9A84C] bg-[#C9A84C]/8 px-4 py-1 rounded-full border border-[#C9A84C]/20">
                        Business Class
                      </span>
                    </div>
                  )}
                  {row === BIZ_ROWS[BIZ_ROWS.length - 1] + 1 && (
                    <div className="flex justify-center my-3">
                      <div className="flex items-center gap-3">
                        <div className="h-px w-16 bg-[#0B1F3A]/10" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#0B1F3A]/30 bg-[#0B1F3A]/5 px-4 py-1 rounded-full border border-[#0B1F3A]/8">
                          Economy Class
                        </span>
                        <div className="h-px w-16 bg-[#0B1F3A]/10" />
                      </div>
                    </div>
                  )}

                  {/* Exit row marker */}
                  {isExit && (
                    <div className="flex items-center gap-2 justify-center my-1">
                      <div className="h-px flex-1 max-w-[40px] bg-emerald-400/40" />
                      <span className="text-[8px] font-bold text-emerald-600 tracking-widest uppercase px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
                        EXIT
                      </span>
                      <div className="h-px flex-1 max-w-[40px] bg-emerald-400/40" />
                    </div>
                  )}

                  <div className="grid items-center" style={{ gridTemplateColumns: '28px 36px 36px 36px 20px 36px 36px 36px 12px' }}>
                    {/* Row number */}
                    <div className="text-[9px] text-[#0B1F3A]/25 text-center font-medium tabular-nums">{row}</div>

                    {/* Left: A B C */}
                    {(['A','B','C'] as const).map(col => {
                      const seat = getSeat(row, col)
                      if (!seat) return <div key={col} className="mx-0.5 h-8" />
                      const sel    = isSelected(seat.designator)
                      const paxIdx = paxIndex(seat.designator)
                      const paxClr = PAX_COLORS[paxIdx] ?? PAX_COLORS[0]

                      return (
                        <button key={col} type="button"
                          onClick={() => handleClick(seat)}
                          disabled={!seat.available}
                          onMouseEnter={() => setHovered(seat)}
                          onMouseLeave={() => setHovered(null)}
                          title={`${seat.designator} · ${seat.type} · ${seat.priceGBP > 0 ? `£${seat.priceGBP}` : 'Free'}`}
                          className={`relative mx-0.5 h-8 rounded-md text-[9px] font-bold transition-all duration-100 ${seatStyle(seat, sel, !seat.available)} ${sel ? paxClr.ring : ''}`}>
                          {/* Seat back line */}
                          {!sel && seat.available && (
                            <div className="absolute top-1 left-1 right-1 h-px bg-current opacity-10 rounded" />
                          )}
                          {sel && <span className="text-[10px] font-bold">{paxIdx + 1}</span>}
                        </button>
                      )
                    })}

                    {/* Aisle */}
                    <div className="flex items-center justify-center">
                      {isWing && (
                        <div className="w-px h-full bg-[#0B1F3A]/8" />
                      )}
                    </div>

                    {/* Right: D E F */}
                    {(['D','E','F'] as const).map(col => {
                      const seat = getSeat(row, col)
                      if (!seat) return <div key={col} className="mx-0.5 h-8" />
                      const sel    = isSelected(seat.designator)
                      const paxIdx = paxIndex(seat.designator)
                      const paxClr = PAX_COLORS[paxIdx] ?? PAX_COLORS[0]

                      return (
                        <button key={col} type="button"
                          onClick={() => handleClick(seat)}
                          disabled={!seat.available}
                          onMouseEnter={() => setHovered(seat)}
                          onMouseLeave={() => setHovered(null)}
                          title={`${seat.designator} · ${seat.type} · ${seat.priceGBP > 0 ? `£${seat.priceGBP}` : 'Free'}`}
                          className={`relative mx-0.5 h-8 rounded-md text-[9px] font-bold transition-all duration-100 ${seatStyle(seat, sel, !seat.available)} ${sel ? paxClr.ring : ''}`}>
                          {!sel && seat.available && (
                            <div className="absolute top-1 left-1 right-1 h-px bg-current opacity-10 rounded" />
                          )}
                          {sel && <span className="text-[10px] font-bold">{paxIdx + 1}</span>}
                        </button>
                      )
                    })}

                    {/* Wing silhouette */}
                    <div>
                      {isWing && <div className="w-2 h-6 bg-[#0B1F3A]/5 rounded-r-sm" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tail */}
          <div className="flex flex-col items-center mt-5">
            <p className="text-[9px] font-bold text-[#0B1F3A]/20 uppercase tracking-[0.2em] mb-1">Rear of aircraft</p>
            <svg width="60" height="30" viewBox="0 0 60 30" fill="none">
              <path d="M12 2 L48 2 L52 28 L8 28Z" fill="#0B1F3A" opacity="0.05" />
            </svg>
          </div>
        </div>

        {/* Hover tooltip */}
        {hovered && (
          <div className="mx-5 mb-4 p-3 bg-[#0B1F3A] rounded-xl text-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold">{hovered.designator}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold capitalize">{hovered.type.replace('-', ' ')} seat</p>
              <p className="text-[10px] text-white/50">{hovered.available ? 'Available' : 'Occupied'}</p>
            </div>
            <p className="text-sm font-bold text-[#C9A84C] flex-shrink-0">
              {hovered.priceGBP > 0 ? `+£${hovered.priceGBP}` : 'Included'}
            </p>
          </div>
        )}
      </div>

      {/* ── Right panel: selection summary ── */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-4">

        {/* Passenger pills */}
        <div className="bg-white rounded-2xl border border-black/5 p-5">
          <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">Select seat for</p>
          <div className="space-y-2">
            {Array.from({ length: passengerCount }, (_, i) => {
              const seat   = selectedSeats.find(s => s.paxIndex === i)
              const active = activePax === i
              const clr    = PAX_COLORS[i] ?? PAX_COLORS[0]
              return (
                <button key={i} type="button"
                  onClick={() => setActivePax(i)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border text-left ${active ? 'border-[#C9A84C]/40 bg-[#C9A84C]/5' : 'border-[#0B1F3A]/5 hover:border-[#0B1F3A]/10'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${clr.ring}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#0B1F3A]">Passenger {i + 1}</p>
                    {seat ? (
                      <p className="text-[10px] text-emerald-600 font-medium">Seat {seat.seatNumber} · {seat.type}</p>
                    ) : (
                      <p className="text-[10px] text-[#0B1F3A]/35">{active ? 'Select a seat on the map' : 'Not selected'}</p>
                    )}
                  </div>
                  {seat && <span className="text-emerald-500 text-sm flex-shrink-0">✓</span>}
                  {active && !seat && <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0 animate-pulse" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Price summary */}
        {totalSelected > 0 && (
          <div className="bg-white rounded-2xl border border-black/5 p-5">
            <p className="text-[10px] font-bold text-[#0B1F3A]/40 uppercase tracking-widest mb-3">Seat selection</p>
            <div className="space-y-2 mb-3">
              {selectedSeats.map(s => (
                <div key={s.seatNumber} className="flex items-center justify-between text-xs">
                  <span className="text-[#0B1F3A]/60">Pax {s.paxIndex + 1} · Seat {s.seatNumber}</span>
                  <span className="font-semibold text-[#0B1F3A]">{s.priceGBP > 0 ? `£${s.priceGBP}` : 'Free'}</span>
                </div>
              ))}
            </div>
            {seatTotal > 0 && (
              <div className="border-t border-[#0B1F3A]/5 pt-2 flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B1F3A]">Seats total</span>
                <span className="text-sm font-bold text-[#C9A84C]">+£{seatTotal}</span>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="space-y-2">
          <button type="button"
            onClick={() => onComplete(selectedSeats)}
            disabled={!allDone}
            className="w-full py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.98] transition-all disabled:opacity-35 shadow-sm shadow-[#C9A84C]/30">
            {allDone ? 'Confirm seats →' : `Select ${passengerCount - totalSelected} more seat${passengerCount - totalSelected > 1 ? 's' : ''}`}
          </button>
          <button type="button"
            onClick={() => { clearSeats(); onComplete([]) }}
            className="w-full py-2.5 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A]/60 font-medium text-sm hover:bg-[#0B1F3A]/8 transition-all">
            Skip seat selection
          </button>
        </div>

        {/* Info box */}
        <div className="bg-[#0B1F3A]/3 rounded-xl p-4 space-y-2">
          {[
            { icon: '🪑', text: 'Seat prices are per person, per flight' },
            { icon: '🔄', text: 'You can change seats up to 24h before departure' },
            { icon: '🧳', text: 'Window seats board first at most airports' },
          ].map(({ icon, text }) => (
            <p key={text} className="text-[10px] text-[#0B1F3A]/40 flex gap-2 leading-relaxed">
              <span className="flex-shrink-0">{icon}</span> {text}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

export type { SelectedSeat }
