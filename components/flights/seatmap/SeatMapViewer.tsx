'use client'

import { useState, useEffect } from 'react'
import { useFlightStore, type SelectedSeat } from '@/store/flightStore'
import type { SeatElement } from '@/app/api/flights/seat-map/route'

interface Props {
  offerId:        string
  passengerCount: number
  onComplete:     (seats: SelectedSeat[]) => void
}

const COL_LABELS: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'> = ['A', 'B', 'C', 'D', 'E', 'F']

const TYPE_BG: Record<string, string> = {
  business:      'bg-purple-100 border-purple-300',
  'extra-legroom': 'bg-amber-100 border-amber-300',
  window:        'bg-blue-100 border-blue-300',
  aisle:         'bg-green-100 border-green-300',
  middle:        'bg-white border-gray-200',
}

export function SeatMapViewer({ offerId, passengerCount, onComplete }: Props) {
  const [seats,     setSeats]    = useState<SeatElement[]>([])
  const [loading,   setLoading]  = useState(true)
  const [activePax, setActivePax] = useState(0)
  const [tooltip,   setTooltip]  = useState<{ seat: SeatElement; x: number; y: number } | null>(null)
  const { seats: selectedSeats, setSeat, clearSeats } = useFlightStore()

  useEffect(() => {
    fetch(`/api/flights/seat-map?offer_id=${offerId}`)
      .then(r => r.json())
      .then(d => { setSeats(d.seats ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [offerId])

  const rows = Array.from({ length: 30 }, (_, i) => i + 1)

  function getSeat(row: number, col: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'): SeatElement | undefined {
    return seats.find(s => s.row === row && s.col === col)
  }

  function isSelected(designator: string): boolean {
    return selectedSeats.some(s => s.seatNumber === designator)
  }

  function selectedByPax(designator: string): number {
    const idx = selectedSeats.findIndex(s => s.seatNumber === designator)
    return idx // -1 if not selected
  }

  function handleSeatClick(seat: SeatElement) {
    if (!seat.available) return
    if (isSelected(seat.designator)) return // already selected — could deselect

    const segmentId = 'seg_0'
    setSeat({
      segmentId,
      seatNumber: seat.designator,
      paxIndex:   activePax,
      type:       seat.type,
      priceGBP:   seat.priceGBP,
    })

    if (activePax < passengerCount - 1) setActivePax(ap => ap + 1)
  }

  function handleConfirm() {
    onComplete(selectedSeats)
  }

  function handleSkip() {
    clearSeats()
    onComplete([])
  }

  const totalSelected = selectedSeats.length

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-8 text-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-4" />
        <p className="text-[#0B1F3A]/50 text-sm">Loading seat map...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
      {/* Passenger tabs */}
      <div className="px-5 pt-5 pb-3 border-b border-black/5">
        <p className="text-xs text-[#0B1F3A]/50 mb-2 font-medium">Selecting seats for:</p>
        <div className="flex gap-2">
          {Array.from({ length: passengerCount }, (_, i) => (
            <button key={i} type="button"
              onClick={() => setActivePax(i)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activePax === i
                  ? 'bg-[#C9A84C] text-[#0B1F3A]'
                  : 'bg-[#0B1F3A]/5 text-[#0B1F3A]/60 hover:bg-[#0B1F3A]/10'
              }`}>
              Pax {i + 1}
              {selectedSeats.find(s => s.paxIndex === i) && (
                <span className="ml-1 text-xs opacity-70">· {selectedSeats.find(s => s.paxIndex === i)?.seatNumber}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 flex flex-wrap gap-3 border-b border-black/5 bg-[#FAF7F2]">
        {[
          { label: 'Business', cls: 'bg-purple-100 border-purple-300' },
          { label: 'Extra Legroom', cls: 'bg-amber-100 border-amber-300' },
          { label: 'Window', cls: 'bg-blue-100 border-blue-300' },
          { label: 'Aisle', cls: 'bg-green-100 border-green-300' },
          { label: 'Middle', cls: 'bg-white border-gray-200' },
          { label: 'Selected', cls: 'bg-[#C9A84C] border-[#C9A84C]' },
          { label: 'Occupied', cls: 'bg-gray-200 border-gray-300' },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded border ${cls}`} />
            <span className="text-[10px] text-[#0B1F3A]/60 font-medium">{label}</span>
          </div>
        ))}
      </div>

      {/* Aircraft map */}
      <div className="p-4 overflow-x-auto">
        {/* Nose indicator */}
        <div className="flex justify-center mb-4">
          <div className="text-center">
            <div className="text-2xl">✈</div>
            <p className="text-[10px] text-[#0B1F3A]/40 mt-1">FRONT OF AIRCRAFT</p>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex justify-center mb-2">
          <div className="grid w-full max-w-xs" style={{ gridTemplateColumns: '24px 32px 32px 32px 12px 32px 32px 32px' }}>
            <div />
            {['A','B','C'].map(c => <div key={c} className="text-center text-[10px] font-bold text-[#0B1F3A]/40">{c}</div>)}
            <div />
            {['D','E','F'].map(c => <div key={c} className="text-center text-[10px] font-bold text-[#0B1F3A]/40">{c}</div>)}
          </div>
        </div>

        <div className="relative flex flex-col items-center gap-1 max-h-96 overflow-y-auto">
          {rows.map(row => (
            <div key={row}
              className="grid items-center w-full max-w-xs"
              style={{ gridTemplateColumns: '24px 32px 32px 32px 12px 32px 32px 32px' }}>
              {/* Row number */}
              <div className="text-[10px] text-[#0B1F3A]/30 text-center">{row}</div>

              {/* Left seats A B C */}
              {(['A','B','C'] as const).map(col => {
                const seat = getSeat(row, col)
                if (!seat) return <div key={col} />
                const sel    = isSelected(seat.designator)
                const paxIdx = selectedByPax(seat.designator)

                return (
                  <button key={col} type="button"
                    title={`${seat.designator} · ${seat.type} · £${seat.priceGBP}${!seat.available ? ' (occupied)' : ''}`}
                    onClick={() => handleSeatClick(seat)}
                    disabled={!seat.available}
                    onMouseEnter={e => setTooltip({ seat, x: (e.target as HTMLElement).getBoundingClientRect().left, y: (e.target as HTMLElement).getBoundingClientRect().top })}
                    onMouseLeave={() => setTooltip(null)}
                    className={`w-7 h-7 rounded text-[9px] font-bold border transition-all mx-0.5 ${
                      sel
                        ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0B1F3A]'
                        : !seat.available
                          ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'
                          : `${TYPE_BG[seat.type] ?? 'bg-white border-gray-200'} hover:opacity-80 cursor-pointer`
                    }`}>
                    {sel ? (paxIdx + 1) : ''}
                  </button>
                )
              })}

              {/* Aisle */}
              <div />

              {/* Right seats D E F */}
              {(['D','E','F'] as const).map(col => {
                const seat = getSeat(row, col)
                if (!seat) return <div key={col} />
                const sel    = isSelected(seat.designator)
                const paxIdx = selectedByPax(seat.designator)

                return (
                  <button key={col} type="button"
                    title={`${seat.designator} · ${seat.type} · £${seat.priceGBP}${!seat.available ? ' (occupied)' : ''}`}
                    onClick={() => handleSeatClick(seat)}
                    disabled={!seat.available}
                    onMouseEnter={e => setTooltip({ seat, x: (e.target as HTMLElement).getBoundingClientRect().left, y: (e.target as HTMLElement).getBoundingClientRect().top })}
                    onMouseLeave={() => setTooltip(null)}
                    className={`w-7 h-7 rounded text-[9px] font-bold border transition-all mx-0.5 ${
                      sel
                        ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0B1F3A]'
                        : !seat.available
                          ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'
                          : `${TYPE_BG[seat.type] ?? 'bg-white border-gray-200'} hover:opacity-80 cursor-pointer`
                    }`}>
                    {sel ? (paxIdx + 1) : ''}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="fixed z-50 bg-[#0B1F3A] text-white text-xs rounded-lg px-3 py-2 pointer-events-none"
          style={{ top: tooltip.y - 60, left: tooltip.x }}>
          <p className="font-bold">{tooltip.seat.designator}</p>
          <p className="capitalize opacity-80">{tooltip.seat.type.replace('-', ' ')}</p>
          <p>{tooltip.seat.priceGBP > 0 ? `£${tooltip.seat.priceGBP}` : 'Included'}</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-4 border-t border-black/5 bg-[#FAF7F2] flex items-center justify-between">
        <p className="text-sm text-[#0B1F3A]/60">
          {totalSelected} of {passengerCount} seat{passengerCount !== 1 ? 's' : ''} selected
          {totalSelected > 0 && (
            <span className="text-[#C9A84C] font-semibold ml-2">
              +£{selectedSeats.reduce((s, seat) => s + seat.priceGBP, 0)}
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={handleSkip}
            className="px-4 py-2 rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A] text-sm font-medium hover:bg-[#0B1F3A]/10 transition-all">
            Skip seats
          </button>
          <button type="button" onClick={handleConfirm}
            disabled={totalSelected < passengerCount}
            className="px-5 py-2 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold hover:bg-[#E8C87A] transition-all disabled:opacity-40">
            Confirm seats
          </button>
        </div>
      </div>
    </div>
  )
}

export type { SelectedSeat }
