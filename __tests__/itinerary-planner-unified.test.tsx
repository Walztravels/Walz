/**
 * @jest-environment jsdom
 *
 * Planner Bookings tab: ONE card per unified booking, price counted once.
 * page.tsx is huge, so the presentational pieces live in
 * components/admin/itinerary/UnifiedBookingCards.tsx and are rendered for real;
 * wiring in page.tsx is pinned at source level.
 */
import fs from 'fs'
import path from 'path'
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import {
  UnifiedFlightCard,
  UnifiedHotelCard,
  UnifiedFlightSummary,
  applyPriceEdit,
  applySegmentEdit,
  bookingMargin,
  deriveItineraryTotal,
  isTotalStale,
} from '@/components/admin/itinerary/UnifiedBookingCards'
import {
  sumClientTotals,
  flightRouteLabel,
  type UnifiedFlightBooking,
  type UnifiedHotelBooking,
  type FlightJourney,
} from '@/lib/itinerary/unified-booking'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/admin/itinerary-planner/[id]/page.tsx'), 'utf8')

const seg = (from: string, to: string, no: string) => ({
  from, to, airline: 'Qatar Airways', iataCode: 'QR', flightNumber: no,
  date: '2026-12-01', time: '09:15', arrivalTime: '17:40',
})
const journey = (index: number, direction: FlightJourney['direction'], segs: ReturnType<typeof seg>[]): FlightJourney => ({
  index, direction, segments: segs, stops: segs.length - 1,
})
const booking = (over: Partial<UnifiedFlightBooking> = {}): UnifiedFlightBooking => ({
  id: 'b1', bookingKind: 'unified-flight', tripType: 'return',
  from: 'LHR', to: 'DOH', airline: 'Qatar Airways', iataCode: 'QR', flightNumber: 'QR1408',
  date: '2026-12-01', time: '09:15', arrivalTime: '17:40', class: 'Economy', pnr: '',
  cost: 2353, supplierCost: 2241, status: 'pending', notes: '',
  journeys: [journey(0, 'outbound', [seg('LHR', 'DOH', 'QR1408')]), journey(1, 'return', [seg('DOH', 'LHR', 'QR1407')])],
  pricing: { currency: 'GBP', supplierTotal: 2241, markupPercent: 5, markupAmount: 112, clientTotal: 2353, source: 'research' },
  offer: { provider: 'duffel', providerOfferId: 'off_123', searchedAt: '2026-09-25T10:00:00Z', expiresAt: '2999-01-01T00:00:00Z', supplierCurrency: 'GBP', supplierTotal: 2241 },
  addedFrom: 'research',
  ...over,
})
const hotel = (): UnifiedHotelBooking => ({
  id: 'h1', bookingKind: 'research-hotel', name: 'Grand Hyatt', location: 'Doha', checkIn: '2026-12-01', checkOut: '2026-12-05',
  roomType: 'Deluxe', nights: 4, cost: 800, supplierCost: 700, status: 'pending', notes: '',
  rate: { providerHotelCode: '1', rateKey: 'rk', roomName: 'Deluxe King', boardName: 'Bed & Breakfast', isRefundable: true, cancellationPolicy: 'Free cancel', occupancy: { rooms: 1, adults: 2, children: 0 } },
  pricing: { currency: 'GBP', supplierTotal: 700, clientTotal: 800, source: 'research' },
  offer: { provider: 'hotelbeds', providerOfferId: '1:rk', searchedAt: '2026-09-25T10:00:00Z', supplierCurrency: 'GBP', supplierTotal: 700 },
  addedFrom: 'research',
})

let container: HTMLDivElement
let root: Root
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove() })

const text = () => container.textContent ?? ''
const count = (s: string) => text().split(s).length - 1
const buttons = (label: string) => Array.from(container.querySelectorAll('button')).filter(b => b.textContent === label)

/** Mirrors BookingsTab wiring: rows state + edit toggle + confirm-guarded remove. */
function Harness({ initial, onRows }: { initial: UnifiedFlightBooking[]; onRows?: (r: UnifiedFlightBooking[]) => void }) {
  const [rows, setRows] = useState(initial)
  const [editing, setEditing] = useState<string | null>(null)
  onRows?.(rows)
  return (
    <div>
      {rows.map(b => (
        <UnifiedFlightCard
          key={b.id} booking={b} sym="£" editing={editing === b.id}
          onEdit={() => setEditing(b.id)} onDone={() => setEditing(null)}
          onRemove={() => { if (!window.confirm('Remove?')) return; setRows(p => p.filter(x => x.id !== b.id)); setEditing(null) }}
          onChange={next => setRows(p => p.map(x => (x.id === b.id ? next : x)))}
        />
      ))}
    </div>
  )
}
const setInput = (el: HTMLInputElement, v: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('UnifiedFlightCard', () => {
  it('return booking: ONE card, OUTBOUND + RETURN, price once, one Edit + one Remove', () => {
    act(() => root.render(<Harness initial={[booking()]} />))
    expect(container.querySelectorAll('[data-testid="unified-flight-card"]')).toHaveLength(1)
    expect(text()).toContain('OUTBOUND')
    expect(text()).toContain('RETURN')
    expect(text()).toContain('LHR ⇄ DOH')
    expect(container.querySelector('[data-testid="trip-type"]')!.textContent).toBe('Return')
    expect(container.querySelector('[data-testid="source-badge"]')!.textContent).toBe('Research')
    expect(container.querySelector('[data-testid="offer-hint"]')!.textContent).toMatch(/^Offer expires/)
    expect(count('£2,353')).toBe(1)
    expect(buttons('Edit')).toHaveLength(1)
    expect(buttons('Remove')).toHaveLength(1)
  })

  it('expired offers show an expired hint', () => {
    const b = booking({ offer: { ...booking().offer!, expiresAt: '2020-01-01T00:00:00Z' } })
    act(() => root.render(<Harness initial={[b]} />))
    expect(container.querySelector('[data-testid="offer-hint"]')!.textContent).toMatch(/^Offer expired/)
  })

  it('connecting return shows every segment and connection indicators', () => {
    const b = booking({
      journeys: [
        journey(0, 'outbound', [seg('LHR', 'DOH', 'QR1'), seg('DOH', 'SYD', 'QR2')]),
        journey(1, 'return', [seg('SYD', 'DOH', 'QR3'), seg('DOH', 'LHR', 'QR4')]),
      ],
    })
    act(() => root.render(<Harness initial={[b]} />))
    expect(container.querySelectorAll('[data-testid="segment"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-testid="connection"]')).toHaveLength(2)
    for (const no of ['QR1', 'QR2', 'QR3', 'QR4']) expect(text()).toContain(no)
    expect(count('£2,353')).toBe(1)
  })

  it('multi-city renders LEG 1..N and a Multi-city badge', () => {
    const b = booking({
      tripType: 'multi-city',
      journeys: [journey(0, 'leg', [seg('LHR', 'DOH', 'QR1')]), journey(1, 'leg', [seg('DOH', 'BKK', 'QR2')]), journey(2, 'leg', [seg('BKK', 'LHR', 'QR3')])],
    })
    act(() => root.render(<Harness initial={[b]} />))
    expect(text()).toContain('LEG 1'); expect(text()).toContain('LEG 2'); expect(text()).toContain('LEG 3')
    expect(container.querySelector('[data-testid="trip-type"]')!.textContent).toBe('Multi-city')
    expect(container.querySelector('[data-testid="route-label"]')!.textContent).toBe('LHR → DOH → BKK → LHR')
  })

  it('margin is computed once from booking-level prices', () => {
    act(() => root.render(<Harness initial={[booking()]} />))
    expect(container.querySelectorAll('[data-testid="margin"]')).toHaveLength(1)
    expect(container.querySelector('[data-testid="margin"]')!.textContent).toBe('+£112 (5%)')
    expect(bookingMargin(booking())).toEqual({ amount: 112, pct: 5 })
  })

  it('editing price updates cost + pricing consistently and keeps journeys/id/offer', () => {
    const seen: UnifiedFlightBooking[][] = []
    act(() => root.render(<Harness initial={[booking()]} onRows={r => seen.push(r)} />))
    act(() => buttons('Edit')[0].click())
    expect(container.querySelectorAll('[data-testid="unified-flight-card"]')).toHaveLength(1)
    setInput(container.querySelector<HTMLInputElement>('input[aria-label="Client price"]')!, '2500')
    setInput(container.querySelector<HTMLInputElement>('input[aria-label="Supplier cost"]')!, '2300')
    const b = seen[seen.length - 1][0]
    expect(b.cost).toBe(2500); expect(b.supplierCost).toBe(2300)
    expect(b.pricing.clientTotal).toBe(2500); expect(b.pricing.supplierTotal).toBe(2300)
    expect(b.pricing.markupAmount).toBe(200)
    expect(b.id).toBe('b1'); expect(b.journeys).toHaveLength(2); expect(b.offer!.providerOfferId).toBe('off_123')
    expect(sumClientTotals(seen[seen.length - 1])).toBe(2500)
  })

  it('segment edits stay inside the booking; first segment mirrors legacy fields', () => {
    const b = booking()
    const e = applySegmentEdit(b, 0, 0, { flightNumber: 'QR9999' })
    expect(e.journeys[0].segments[0].flightNumber).toBe('QR9999')
    expect(e.flightNumber).toBe('QR9999')
    expect(e.id).toBe(b.id); expect(e.offer).toBe(b.offer); expect(e.journeys).toHaveLength(2)
    const r = applySegmentEdit(b, 1, 0, { flightNumber: 'QR0001' })
    expect(r.flightNumber).toBe('QR1408') // return leg does not overwrite legacy mirror
    expect(applyPriceEdit(b, { cost: 10 }).journeys).toBe(b.journeys)
  })

  it('remove deletes the whole booking (all journeys) after confirm; cancel keeps it', () => {
    act(() => root.render(<Harness initial={[booking(), booking({ id: 'b2' })]} />))
    const confirm = jest.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false)
    act(() => buttons('Remove')[0].click())
    expect(container.querySelectorAll('[data-testid="unified-flight-card"]')).toHaveLength(2)
    confirm.mockReturnValueOnce(true)
    act(() => buttons('Remove')[0].click())
    expect(container.querySelectorAll('[data-testid="unified-flight-card"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="segment"]')).toHaveLength(2)
    confirm.mockRestore()
  })
})

describe('UnifiedHotelCard', () => {
  it('shows room/board/cancellation/nights/guests and price once with one Edit + Remove', () => {
    act(() => root.render(
      <UnifiedHotelCard booking={hotel()} sym="£" editing={false} onEdit={() => {}} onDone={() => {}} onRemove={() => {}} onChange={() => {}} />,
    ))
    expect(text()).toContain('Grand Hyatt')
    expect(text()).toContain('Deluxe King')
    expect(text()).toContain('Bed & Breakfast')
    expect(text()).toContain('Free cancel')
    expect(text()).toContain('4 nights')
    expect(text()).toContain('2 guests')
    expect(count('£800')).toBe(1)
    expect(container.querySelector('[data-testid="margin"]')!.textContent).toBe('+£100 (13%)')
    expect(buttons('Edit')).toHaveLength(1); expect(buttons('Remove')).toHaveLength(1)
  })
})

describe('totals + preview', () => {
  it('pricing totals with a unified return equal the single booking total', () => {
    const legacy = [{ id: 'x', cost: 100 }, { id: 'y', cost: 50 }]
    expect(sumClientTotals([booking() as never])).toBe(2353)
    expect(sumClientTotals([booking() as never, ...legacy])).toBe(2503)
  })

  it('preview summary lists all legs and no price', () => {
    act(() => root.render(<UnifiedFlightSummary booking={booking()} />))
    expect(text()).toContain('OUTBOUND'); expect(text()).toContain('RETURN')
    expect(text()).toContain('QR1408'); expect(text()).toContain('QR1407')
    expect(text()).not.toContain('2,353')
    expect(flightRouteLabel(booking())).toBe('LHR ⇄ DOH')
  })
})

describe('page.tsx wiring (source)', () => {
  it('routes unified rows to the unified cards; legacy rows keep the old markup', () => {
    expect(PAGE).toMatch(/isUnifiedFlight\(fr as unknown/)
    expect(PAGE).toMatch(/<UnifiedFlightCard/)
    expect(PAGE).toMatch(/<UnifiedHotelCard/)
    expect(PAGE).toContain('+ Add Flight')
    expect(PAGE).toContain('+ Add Hotel')
  })
  it('Research tab is kept mounted and wired with onAdded/onViewBookings/currency', () => {
    expect(PAGE).toMatch(/researchMounted && \(\s*<div hidden=\{activeTab !== 'research'\}/)
    expect(PAGE).not.toMatch(/activeTab === 'research'\s*&&\s*\(\s*<ResearchTab/)
    expect(PAGE).toMatch(/currency=\{itin\.currency\}/)
    expect(PAGE).toMatch(/existingBookingIds=\{existingBookingIds\}/)
    expect(PAGE).toMatch(/const existingBookingIds = useMemo\(/)
    expect(PAGE).toMatch(/onAdded=\{\(r\) => \{[\s\S]*?setItin\(prev => prev \? \{ \.\.\.prev, flights, hotels \}/)
    expect(PAGE).toMatch(/const flights = JSON\.stringify\(r\.flights\)/)
    expect(PAGE).toMatch(/const hotels = JSON\.stringify\(r\.hotels\)/)
    expect(PAGE).toMatch(/onViewBookings=\{\(\) => setActiveTab\('bookings'\)\}/)
  })
  it('BookingsTab re-syncs local rows from itin.flights/hotels', () => {
    expect(PAGE).toMatch(/\}, \[itin\.flights\]\)/)
    expect(PAGE).toMatch(/\}, \[itin\.hotels\]\)/)
  })
  it('pricing sums bookings once via the contract and labels a unified flight with one route line', () => {
    expect(PAGE).toMatch(/total: sumClientTotals\(rawFlights\)/)
    expect(PAGE).toMatch(/total: sumClientTotals\(rawHotels\)/)
    expect(PAGE).toMatch(/label: flightLabel\(f\)/)
    expect(PAGE).toMatch(/<UnifiedFlightSummary/)
  })
})

describe('stored total stays in step with bookings', () => {
  const base = {
    flights: '[]', hotels: '[]',
    transfers: JSON.stringify([{ cost: 40 }]), tours: JSON.stringify([{ cost: 60 }]),
    trains: '[]', ferries: '[]', priceBreakdown: JSON.stringify([{ cost: 100 }]),
  }
  it('derived total counts a unified return once and includes every other component + manual rows', () => {
    expect(deriveItineraryTotal(base)).toBe(200)
    expect(deriveItineraryTotal({ ...base, flights: JSON.stringify([booking()]) })).toBe(200 + 2353)
    // journeys/segments/pricing never add to the total
    expect(deriveItineraryTotal({ ...base, flights: [booking(), { id: 'l', cost: 10 }] })).toBe(200 + 2353 + 10)
  })
  it('adding a 2353 return to an itinerary with stored total X persists X+2353 exactly once', () => {
    const X = deriveItineraryTotal(base)
    const next = deriveItineraryTotal({ ...base, flights: JSON.stringify([booking()]) })
    expect(next).toBe(X + 2353)
    expect(isTotalStale(X, next)).toBe(true)
    expect(isTotalStale(next, next)).toBe(false)
  })
  it('page wires onAdded to ONE save({totalPrice}) using the shared formula; PricingTab uses it too', () => {
    expect(PAGE).toMatch(/deriveItineraryTotal\(\{ \.\.\.itin, flights, hotels \}\)/)
    expect((PAGE.match(/void save\(\{ totalPrice: total > 0 \? total : null \}\)/g) || []).length).toBe(1)
    expect(PAGE).toMatch(/const derivedTotal\s+= deriveItineraryTotal\(\{ \.\.\.itin, priceBreakdown: JSON\.stringify\(rows\) \}\)/)
  })
  it('Preview shows the amber note, keeps Send enabled, and confirms only when stale', () => {
    expect(PAGE).toContain('Total is out of date — open Pricing and Save')
    expect(PAGE).toMatch(/disabled=\{sending \|\| auditBlocks\}/)
    expect(PAGE).not.toMatch(/auditBlocks \|\| totalStale/)
    // confirm only when stale (matching totals short-circuit: no prompt); declining returns before setSending/fetch
    expect(PAGE).toMatch(/if \(totalStale && !window\.confirm\(`The saved total[^`]*Send anyway\?`\)\) return\n\s*setSending\(true\)/)
  })
})
