'use client'
/**
 * Planner "Bookings" cards for unified bookings (Research -> Add to Itinerary).
 *
 * ONE supplier offer = ONE card = ONE price. The card never sums or prints a
 * per-leg price; the booking-level `cost` / `supplierCost` are the only money
 * fields (see lib/itinerary/unified-booking.ts).
 *
 * Controlled + presentational: the parent (BookingsTab) owns row state and
 * persistence. Every edit returns a NEW row via `onChange` that preserves
 * `id`, `journeys` and `offer`.
 */
import type {
  UnifiedFlightBooking,
  UnifiedHotelBooking,
  UnifiedSegment,
} from '@/lib/itinerary/unified-booking'
import { flightRouteLabel, flightTripTypeLabel, journeyLabel, sumClientTotals } from '@/lib/itinerary/unified-booking'

const inp = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-500/50'
const sel = 'w-full bg-[#0b1525] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50'
const lbl = 'text-white/30 text-[10px] font-bold uppercase block mb-1'
const editBtnCls = 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg text-xs font-bold transition'
const rmBtnCls = 'text-white/20 hover:text-red-400 text-xs transition px-3 py-1.5 rounded-lg hover:bg-red-500/10'

type AnyRow = UnifiedFlightBooking | UnifiedHotelBooking

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

function parseArr(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[]
  try {
    const v = JSON.parse(String(json ?? '[]'))
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

/**
 * SINGLE source of truth for an itinerary's total (used by PricingTab's Save, the
 * Research onAdded persist, and the Preview stale-total guard). Every flight/hotel
 * BOOKING counts once (sumClientTotals); transfers/tours/trains/ferries and manual
 * priceBreakdown rows are added exactly as PricingTab always did.
 */
export function deriveItineraryTotal(src: {
  flights?: unknown; hotels?: unknown; transfers?: unknown; tours?: unknown
  trains?: unknown; ferries?: unknown; priceBreakdown?: unknown
}): number {
  const sum = (rows: Record<string, unknown>[]) => rows.reduce((t, r) => t + (Number(r.cost) || 0), 0)
  return (
    sumClientTotals(parseArr(src.flights)) +
    sumClientTotals(parseArr(src.hotels)) +
    sum(parseArr(src.transfers)) + sum(parseArr(src.tours)) +
    sum(parseArr(src.trains)) + sum(parseArr(src.ferries)) +
    sum(parseArr(src.priceBreakdown))
  )
}

/** True when the stored total no longer matches what the bookings + rows add up to. */
export function isTotalStale(stored: number | null | undefined, derived: number): boolean {
  return Math.abs((Number(stored) || 0) - derived) > 0.005
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : null
}

/** Margin = client - supplier, computed ONCE from the booking-level fields. */
export function bookingMargin(row: { cost?: unknown; supplierCost?: unknown }): { amount: number; pct: number } | null {
  const c = n(row.cost)
  const s = n(row.supplierCost)
  if (c == null || s == null || c <= 0 || s <= 0) return null
  const amount = c - s
  return { amount, pct: Math.round((amount / c) * 100) }
}

/**
 * Edit booking-level prices. Keeps the top-level fields and `pricing.*`
 * consistent (clientTotal/supplierTotal/markup). Preserves everything else.
 */
export function applyPriceEdit<T extends AnyRow>(row: T, patch: { cost?: number | null; supplierCost?: number | null }): T {
  const cost = 'cost' in patch ? patch.cost ?? null : row.cost
  const supplierCost = 'supplierCost' in patch ? patch.supplierCost ?? null : row.supplierCost
  const client = Number(cost) || 0
  const supplier = Number(supplierCost) || 0
  const markupAmount = client > 0 && supplier > 0 ? Math.round((client - supplier) * 100) / 100 : row.pricing?.markupAmount ?? null
  const markupPercent =
    client > 0 && supplier > 0 ? Math.round(((client - supplier) / supplier) * 10000) / 100 : row.pricing?.markupPercent ?? null
  return {
    ...row,
    cost: cost as number,
    supplierCost: supplierCost as number,
    pricing: { ...row.pricing, clientTotal: client, supplierTotal: supplier, markupAmount, markupPercent },
  }
}

/** Patch one segment; first segment mirrors into the legacy top-level fields. */
export function applySegmentEdit(
  row: UnifiedFlightBooking,
  journeyIndex: number,
  segmentIndex: number,
  patch: Partial<UnifiedSegment>,
): UnifiedFlightBooking {
  const journeys = row.journeys.map((j, ji) =>
    ji !== journeyIndex ? j : { ...j, segments: j.segments.map((s, si) => (si === segmentIndex ? { ...s, ...patch } : s)) },
  )
  const next: UnifiedFlightBooking = { ...row, journeys }
  if (journeyIndex === 0 && segmentIndex === 0) {
    const s = journeys[0].segments[0]
    next.from = s.from; next.to = s.to; next.airline = s.airline
    next.iataCode = s.iataCode ?? next.iataCode
    next.flightNumber = s.flightNumber; next.date = s.date; next.time = s.time; next.arrivalTime = s.arrivalTime
  }
  return next
}

function layover(prev: UnifiedSegment, next: UnifiedSegment): string {
  if (prev.arrivalAt && next.departureAt) {
    const ms = Date.parse(next.departureAt) - Date.parse(prev.arrivalAt)
    if (Number.isFinite(ms) && ms > 0) {
      const m = Math.round(ms / 60000)
      return ` · ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m layover`
    }
  }
  return ''
}

function offerHint(row: AnyRow): { text: string; expired: boolean } | null {
  const at = row.offer?.expiresAt
  if (!at) return null
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return null
  const d = new Date(t).toISOString().slice(0, 16).replace('T', ' ')
  return t < Date.now() ? { text: `Offer expired ${d} UTC`, expired: true } : { text: `Offer expires ${d} UTC`, expired: false }
}

const money = (sym: string, v: unknown) => `${sym}${(n(v) ?? 0).toLocaleString()}`

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'confirmed' ? 'bg-green-500/15 text-green-400'
    : status === 'pending' ? 'bg-amber-500/15 text-amber-400'
    : status === 'cancelled' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-white/40'
  return <span data-testid="status-badge" className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cls}`}>{status}</span>
}

function SourceBadges({ row }: { row: AnyRow }) {
  const hint = offerHint(row)
  const research = row.addedFrom === 'research' || row.pricing?.source === 'research'
  return (
    <>
      {research && <span data-testid="source-badge" className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">Research</span>}
      {hint && <span data-testid="offer-hint" className={`text-[10px] px-2 py-0.5 rounded-full ${hint.expired ? 'bg-red-500/10 text-red-300' : 'bg-white/5 text-white/40'}`}>{hint.text}</span>}
    </>
  )
}

function PriceFooter({ row, sym }: { row: AnyRow; sym: string }) {
  const m = bookingMargin(row)
  const p = row.pricing
  return (
    <div data-testid="price-footer" className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-3 border-t border-white/[0.06] bg-white/[0.02] text-xs">
      <div><span className="text-white/30 block text-[10px] uppercase font-bold">Supplier cost</span><span data-testid="supplier-cost" className="text-amber-400/80">{money(sym, row.supplierCost)}</span></div>
      {(p?.markupAmount != null || p?.markupPercent != null) && (
        <div><span className="text-white/30 block text-[10px] uppercase font-bold">Markup</span>
          <span data-testid="markup" className="text-white/60">
            {p.markupAmount != null ? money(sym, p.markupAmount) : ''}{p.markupPercent != null ? ` (${p.markupPercent}%)` : ''}
          </span></div>
      )}
      <div><span className="text-white/30 block text-[10px] uppercase font-bold">Client price</span><span data-testid="client-price" className="text-green-400 font-bold">{money(sym, row.cost)}</span></div>
      <div><span className="text-white/30 block text-[10px] uppercase font-bold">Currency</span><span data-testid="currency" className="text-white/60">{p?.currency || '—'}</span></div>
      {m && (
        <div><span className="text-white/30 block text-[10px] uppercase font-bold">Margin</span>
          <span data-testid="margin" className={m.amount >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
            {m.amount >= 0 ? '+' : ''}{sym}{m.amount.toLocaleString()} ({m.pct}%)
          </span></div>
      )}
    </div>
  )
}

interface CardProps<T> {
  booking: T
  sym: string
  editing: boolean
  saving?: boolean
  saveError?: string | null
  onEdit: () => void
  onDone: () => void
  onRemove: () => void
  onChange: (next: T) => void
}

function EditBar({ label, saving, saveError, onDone, onRemove }: { label: string; saving?: boolean; saveError?: string | null; onDone: () => void; onRemove: () => void }) {
  return (
    <div className="mb-4 pb-3 border-b border-white/[0.08]">
      <div className="flex items-center justify-between">
        <p className="text-amber-400 text-xs font-bold uppercase tracking-wider">✏️ Editing: {label}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-1.5 rounded-lg text-xs transition disabled:opacity-50">{saving ? 'Saving…' : '✓ Done'}</button>
          <button type="button" onClick={onRemove} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold transition">Remove</button>
        </div>
      </div>
      {saveError && <p className="mt-2 text-red-400 text-xs">⚠ {saveError} <button type="button" onClick={onDone} className="underline ml-1">Retry</button></p>}
    </div>
  )
}

function PriceInputs({ row, sym, onChange }: { row: AnyRow; sym: string; onChange: (r: AnyRow) => void }) {
  return (
    <>
      <div><label className="text-green-400/70 text-[10px] font-bold uppercase block mb-1">Client Price ({sym})</label>
        <input aria-label="Client price" type="number" value={row.cost ?? ''} onChange={e => onChange(applyPriceEdit(row, { cost: e.target.value ? Number(e.target.value) : null }))} className={inp} /></div>
      <div><label className="text-amber-400/70 text-[10px] font-bold uppercase block mb-1">Supplier Cost ({sym}) <span className="text-white/20 font-normal normal-case">internal</span></label>
        <input aria-label="Supplier cost" type="number" value={row.supplierCost ?? ''} onChange={e => onChange(applyPriceEdit(row, { supplierCost: e.target.value ? Number(e.target.value) : null }))} className={inp} /></div>
    </>
  )
}

// ── Flight card ──────────────────────────────────────────────────────────────

export function UnifiedFlightCard({ booking: b, sym, editing, saving, saveError, onEdit, onDone, onRemove, onChange }: CardProps<UnifiedFlightBooking>) {
  const route = flightRouteLabel(b)
  const airlines = Array.from(new Set(b.journeys.flatMap(j => j.segments.map(s => s.airline)).filter(Boolean)))
  const airline = b.airline || airlines[0] || 'Airline'

  if (editing) {
    return (
      <div data-testid="unified-flight-card" data-editing="true" className="bg-white/[0.04] rounded-xl border border-white/[0.06] p-4">
        <EditBar label={`${airline} ${route}`} saving={saving} saveError={saveError} onDone={onDone} onRemove={onRemove} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <PriceInputs row={b} sym={sym} onChange={r => onChange(r as UnifiedFlightBooking)} />
          <div><label className={lbl}>Status</label>
            <select aria-label="Status" value={b.status} onChange={e => onChange({ ...b, status: e.target.value })} className={sel}>
              <option value="confirmed">confirmed</option><option value="pending">pending</option><option value="cancelled">cancelled</option>
            </select></div>
          <div><label className={lbl}>Class</label>
            <select aria-label="Class" value={b.class} onChange={e => onChange({ ...b, class: e.target.value })} className={sel}>
              {Array.from(new Set([b.class, 'Economy', 'Premium Economy', 'Business', 'First Class'].filter(Boolean))).map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={lbl}>PNR</label><input aria-label="PNR" value={b.pnr} onChange={e => onChange({ ...b, pnr: e.target.value })} className={inp} /></div>
          <div className="col-span-2"><label className={lbl}>Notes</label><input aria-label="Notes" value={b.notes} onChange={e => onChange({ ...b, notes: e.target.value })} className={inp} /></div>
        </div>
        {b.journeys.map((j, ji) => (
          <div key={j.index} className="mb-3 rounded-lg border border-white/[0.06] p-3">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-2">{journeyLabel(j)}</p>
            {j.segments.map((s, si) => {
              const set = (patch: Partial<UnifiedSegment>) => onChange(applySegmentEdit(b, ji, si, patch))
              return (
                <div key={si} className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-2">
                  <div><label className={lbl}>Airline</label><input aria-label={`Airline ${ji}-${si}`} value={s.airline} onChange={e => set({ airline: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>Flight No.</label><input aria-label={`Flight number ${ji}-${si}`} value={s.flightNumber} onChange={e => set({ flightNumber: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>From</label><input aria-label={`From ${ji}-${si}`} value={s.from} onChange={e => set({ from: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>To</label><input aria-label={`To ${ji}-${si}`} value={s.to} onChange={e => set({ to: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>Date</label><input aria-label={`Date ${ji}-${si}`} type="date" value={s.date} onChange={e => set({ date: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>Departs</label><input aria-label={`Departs ${ji}-${si}`} type="time" value={s.time} onChange={e => set({ time: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>Arrives</label><input aria-label={`Arrives ${ji}-${si}`} type="time" value={s.arrivalTime} onChange={e => set({ arrivalTime: e.target.value })} className={inp} /></div>
                </div>
              )
            })}
          </div>
        ))}
        {bookingMargin(b) && (
          <div className="mt-2 px-3 py-2 bg-white/[0.03] rounded-lg flex items-center gap-4 text-xs">
            <span className="text-white/40">Margin:</span>
            <span className="font-bold text-green-400">{sym}{bookingMargin(b)!.amount.toLocaleString()} ({bookingMargin(b)!.pct}%)</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div data-testid="unified-flight-card" className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-white font-bold text-sm">✈️ {airline}</span>
            <span data-testid="route-label" className="text-white font-semibold text-sm font-mono">{route}</span>
            <span data-testid="trip-type" className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/60">{flightTripTypeLabel(b.tripType)}</span>
            {b.status && <StatusBadge status={b.status} />}
            <SourceBadges row={b} />
          </div>
          {b.journeys.map(j => (
            <div key={j.index} data-testid="journey" className="mb-2">
              <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-wider mb-1">{journeyLabel(j)}</p>
              {j.segments.map((s, si) => (
                <div key={si}>
                  {si > 0 && <p data-testid="connection" className="text-white/30 text-[11px] ml-2 my-0.5">↳ Connection at {j.segments[si - 1].to}{layover(j.segments[si - 1], s)}</p>}
                  <p data-testid="segment" className="text-white/70 text-xs">
                    <span className="font-mono text-white">{s.flightNumber}</span>{' '}
                    <span className="font-mono">{s.from} → {s.to}</span>{' '}
                    <span className="text-white/40">{s.date} {s.time}{s.arrivalTime ? ` → ${s.arrivalTime}` : ''}</span>
                    {s.airline && <span className="text-white/30"> · {s.airline}</span>}
                  </p>
                </div>
              ))}
            </div>
          ))}
          {(b.class || b.pnr) && <p className="text-white/30 text-xs">{b.class}{b.pnr ? ` · PNR: ${b.pnr}` : ''}</p>}
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button type="button" aria-expanded={false} onClick={onEdit} className={editBtnCls}>Edit</button>
          <button type="button" onClick={onRemove} className={rmBtnCls}>Remove</button>
        </div>
      </div>
      <PriceFooter row={b} sym={sym} />
    </div>
  )
}

// ── Hotel card ───────────────────────────────────────────────────────────────

export function UnifiedHotelCard({ booking: h, sym, editing, saving, saveError, onEdit, onDone, onRemove, onChange }: CardProps<UnifiedHotelBooking>) {
  const occ = h.rate?.occupancy
  const guests = occ ? occ.adults + occ.children : 0

  if (editing) {
    return (
      <div data-testid="unified-hotel-card" data-editing="true" className="bg-white/[0.04] rounded-xl border border-white/[0.06] p-4">
        <EditBar label={h.name || 'Hotel'} saving={saving} saveError={saveError} onDone={onDone} onRemove={onRemove} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <PriceInputs row={h} sym={sym} onChange={r => onChange(r as UnifiedHotelBooking)} />
          <div><label className={lbl}>Status</label>
            <select aria-label="Status" value={h.status} onChange={e => onChange({ ...h, status: e.target.value })} className={sel}>
              <option value="confirmed">confirmed</option><option value="pending">pending</option><option value="cancelled">cancelled</option>
            </select></div>
          <div><label className={lbl}>Notes</label><input aria-label="Notes" value={h.notes} onChange={e => onChange({ ...h, notes: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Check-In</label><input aria-label="Check-in" type="date" value={h.checkIn} onChange={e => onChange({ ...h, checkIn: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Check-Out</label><input aria-label="Check-out" type="date" value={h.checkOut} onChange={e => onChange({ ...h, checkOut: e.target.value })} className={inp} /></div>
          <div><label className={lbl}>Nights</label><input aria-label="Nights" type="number" min="1" value={h.nights} onChange={e => onChange({ ...h, nights: Number(e.target.value) })} className={inp} /></div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="unified-hotel-card" className="bg-white/[0.04] rounded-xl border border-white/[0.06] overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-white font-bold text-sm">🏨 {h.name || 'Hotel'}</span>
            {h.status && <StatusBadge status={h.status} />}
            <SourceBadges row={h} />
          </div>
          {h.location && <p className="text-white/50 text-xs mb-1">{h.location}</p>}
          <p className="text-white/50 text-xs" data-testid="hotel-stay">{h.checkIn} → {h.checkOut}{h.nights ? ` · ${h.nights} night${h.nights === 1 ? '' : 's'}` : ''}{guests ? ` · ${guests} guest${guests === 1 ? '' : 's'}` : ''}</p>
          <p className="text-white/50 text-xs" data-testid="hotel-room">{h.rate?.roomName || h.roomType}{(h.rate?.boardName || h.rate?.boardCode) ? ` · ${h.rate.boardName || h.rate.boardCode}` : ''}</p>
          {(h.rate?.cancellationPolicy || h.rate?.isRefundable != null) && (
            <p className="text-white/40 text-xs" data-testid="hotel-cancellation">
              {h.rate.isRefundable === false ? 'Non-refundable' : h.rate.isRefundable ? 'Refundable' : ''}
              {h.rate.cancellationPolicy ? `${h.rate.isRefundable != null ? ' · ' : ''}${h.rate.cancellationPolicy}` : ''}
              {h.rate.cancellationDeadline ? ` (free until ${h.rate.cancellationDeadline})` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button type="button" aria-expanded={false} onClick={onEdit} className={editBtnCls}>Edit</button>
          <button type="button" onClick={onRemove} className={rmBtnCls}>Remove</button>
        </div>
      </div>
      <PriceFooter row={h} sym={sym} />
    </div>
  )
}

// ── Preview summary (Preview & Send) ─────────────────────────────────────────

/** Compact read-only legs list for a unified flight; the price is not repeated per leg. */
export function UnifiedFlightSummary({ booking: b }: { booking: UnifiedFlightBooking }) {
  return (
    <div data-testid="unified-flight-summary" className="bg-gray-50 rounded-lg p-2 mb-1.5">
      <p className="text-gray-700 text-xs font-medium">{flightRouteLabel(b)} · {flightTripTypeLabel(b.tripType)} · {b.airline}</p>
      {b.journeys.map(j => (
        <div key={j.index} className="mt-1">
          <p className="text-gray-400 text-[10px] font-bold uppercase">{journeyLabel(j)}</p>
          {j.segments.map((s, si) => (
            <p key={si} className="text-gray-600 text-xs">{s.flightNumber} · {s.from} → {s.to} · {s.date} {s.time}</p>
          ))}
        </div>
      ))}
    </div>
  )
}
