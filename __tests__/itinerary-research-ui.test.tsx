/**
 * @jest-environment jsdom
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import ResearchTab from '@/components/admin/itinerary/ResearchTab'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const seg = (from: string, to: string, no: string, dep: string, arr: string) => ({
  airline: 'Qatar Airways', iataCode: 'QR', flightNumber: no, from, to,
  departureAt: dep, arrivalAt: arr, duration: '6h 30m', cabin: 'Economy', baggage: '1 checked',
})
const RETURN_OFFER = {
  airline: 'Qatar Airways', flightNumber: 'QR1408', departure: '', arrival: '', duration: '', stops: 0,
  price: 2241, currency: 'GBP', offerId: 'off_123', expiresAt: '2099-01-01T00:00:00Z', tripType: 'return',
  cabin: 'Economy', baggage: '1 checked',
  journeys: [
    { index: 0, direction: 'outbound', from: 'LHR', to: 'DOH', stops: 0, duration: '6h 30m', segments: [seg('LHR', 'DOH', 'QR1408', '2026-12-01T09:15:00Z', '2026-12-01T15:45:00Z')] },
    { index: 1, direction: 'return', from: 'DOH', to: 'LHR', stops: 0, duration: '7h', segments: [seg('DOH', 'LHR', 'QR1407', '2026-12-10T02:00:00Z', '2026-12-10T09:00:00Z')] },
  ],
}
const HOTEL = {
  providerHotelCode: '1234', hotelName: 'Grand Paris', starRating: 4, city: 'Marais', destinationName: 'Paris',
  imageUrls: ['https://img/x.jpg'], checkIn: '2026-12-01', checkOut: '2026-12-04', nights: 3, rooms: 1, adults: 2, children: 0,
  supplierCurrency: 'GBP', supplierMinAmount: 450,
  rates: [
    { rateKey: 'RK-1', roomCode: 'DBL', roomName: 'Double Room', boardCode: 'BB', boardName: 'Bed & Breakfast', isRefundable: true, cancellationDeadline: '2026-11-25T00:00:00Z', cancellationPolicy: 'Free cancellation', supplierCurrency: 'GBP', supplierAmount: 450, perNightAmount: 150, nights: 3 },
    { rateKey: 'RK-2', roomCode: 'SUI', roomName: 'Suite', boardCode: 'RO', boardName: 'Room Only', isRefundable: false, supplierCurrency: 'GBP', supplierAmount: 900, perNightAmount: 300, nights: 3 },
  ],
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
let container: HTMLDivElement
let root: Root
const fetchMock = jest.fn()
let addResponse: () => unknown
const onAdded = jest.fn()
const onViewBookings = jest.fn()
const render = (ids?: string[]) => act(() => root.render(
  <ResearchTab itinId="it1" destination="Paris" startDate="2026-12-01" endDate="2026-12-04" numberOfTravellers={2} onAdded={onAdded} onViewBookings={onViewBookings} existingBookingIds={ids} />,
))

const posts = () => fetchMock.mock.calls.filter(([u, o]) => String(u).includes('/research-add') && o?.method === 'POST')
const setInput = (el: HTMLInputElement, v: string) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const btn = (text: string | RegExp) => Array.from(container.querySelectorAll('button')).find((b) =>
  typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''))!
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  fetchMock.mockReset(); onAdded.mockReset(); onViewBookings.mockReset()
  addResponse = () => json(200, { ok: true, kind: 'flight', booking: { id: 'b1' }, flights: [{ id: 'b1' }], hotels: [] })
  fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
    const u = String(url)
    if (u.includes('/research-add')) return addResponse()
    if (u.includes('type=flights')) return json(200, { flights: [RETURN_OFFER], source: 'duffel' })
    if (u.includes('travel-search/hotels')) return json(200, { offers: [HOTEL] })
    if (u.includes('type=hotels')) return json(200, { hotels: [{ name: 'Legacy', stars: 3, address: 'x', price: 100, currency: 'GBP' }], source: 'hotelbeds' })
    throw new Error('unexpected ' + u + opts?.method)
  })
  ;(globalThis as unknown as { fetch: unknown }).fetch = fetchMock
  container = document.createElement('div'); document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(
    <ResearchTab itinId="it1" destination="Paris" startDate="2026-12-01" endDate="2026-12-04" numberOfTravellers={2} onAdded={onAdded} onViewBookings={onViewBookings} />,
  ))
})
afterEach(() => { act(() => root.unmount()); container.remove() })

async function searchFlights() {
  const ins = container.querySelectorAll<HTMLInputElement>('input[placeholder="LOS"], input[placeholder="CDG"]')
  setInput(ins[0], 'LHR'); setInput(ins[1], 'DOH')
  await click(btn('Search Flights')); await flush()
}
async function searchHotels() {
  await click(btn('Search Hotels')); await flush()
  await click(btn(/Choose room/)); await flush()
}

describe('flight results', () => {
  it('shows one total price, both journeys, and Add to Itinerary', async () => {
    await searchFlights()
    const card = container.querySelector('[data-testid="flight-card"]')!
    expect(card.textContent!.split('£2,241').length - 1).toBe(1)
    expect(card.textContent).toContain('Outbound')
    expect(card.textContent).toContain('Return')
    expect(card.textContent).toContain('QR1408')
    expect(card.textContent).toContain('QR1407')
    expect(card.textContent).toContain('LHR ⇄ DOH')
    expect(card.textContent).toContain('Total (supplier)')
    expect(btn('Add to Itinerary')).toBeTruthy()
  })

  it('Add sends exactly one POST with only {type, offerId}; double click = one POST', async () => {
    await searchFlights()
    const b = btn('Add to Itinerary')
    await act(async () => {
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()
    expect(posts()).toHaveLength(1)
    expect(JSON.parse(posts()[0][1].body)).toEqual({ type: 'flight', offerId: 'off_123' })
  })

  it('success calls onAdded, shows added state, keeps results, View in Bookings works', async () => {
    await searchFlights()
    await click(btn('Add to Itinerary')); await flush()
    expect(onAdded).toHaveBeenCalledWith({ kind: 'flight', booking: { id: 'b1' }, flights: [{ id: 'b1' }], hotels: [] })
    expect(container.textContent).toContain('Added to itinerary')
    expect(container.querySelector('[data-testid="flight-card"]')).toBeTruthy()
    await click(btn('View in Bookings'))
    expect(onViewBookings).toHaveBeenCalledTimes(1)
  })

  it('409 duplicate warns; Add anyway re-POSTs with allowDuplicate; Cancel resets', async () => {
    addResponse = () => json(409, { duplicate: true, existingId: 'x1' })
    await searchFlights()
    await click(btn('Add to Itinerary')); await flush()
    expect(container.textContent).toContain('Already in this itinerary')
    expect(onAdded).not.toHaveBeenCalled()
    addResponse = () => json(200, { ok: true, kind: 'flight', booking: {}, flights: [], hotels: [] })
    await click(btn('Add anyway')); await flush()
    expect(posts()).toHaveLength(2)
    expect(JSON.parse(posts()[1][1].body)).toEqual({ type: 'flight', offerId: 'off_123', allowDuplicate: true })
    expect(onAdded).toHaveBeenCalledTimes(1)
  })

  it('duplicate Cancel returns to Add button', async () => {
    addResponse = () => json(409, { duplicate: true })
    await searchFlights()
    await click(btn('Add to Itinerary')); await flush()
    await click(btn('Cancel'))
    expect(btn('Add to Itinerary')).toBeTruthy()
    expect(posts()).toHaveLength(1)
  })

  it('expired offer shows a clear message and does not auto-retry', async () => {
    addResponse = () => json(410, { error: 'Offer expired' })
    await searchFlights()
    await click(btn('Add to Itinerary')); await flush(); await flush()
    expect(container.textContent).toContain('expired')
    expect(posts()).toHaveLength(1)
    expect(onAdded).not.toHaveBeenCalled()
  })
})

describe('stale added state', () => {
  it('clears Added when the booking id disappears; unchanged when prop undefined', async () => {
    render(['b1'])
    await searchFlights()
    await click(btn('Add to Itinerary')); await flush()
    expect(container.textContent).toContain('Added to itinerary')
    render(['b1', 'other'])
    expect(container.textContent).toContain('Added to itinerary')
    render([])
    expect(container.textContent).not.toContain('Added to itinerary')
    expect(btn('Add to Itinerary')).toBeTruthy()
    render(undefined)
    expect(container.textContent).toContain('Added to itinerary')
  })
  it('keeps Added when prop is undefined', async () => {
    await searchFlights()
    await click(btn('Add to Itinerary')); await flush()
    expect(container.textContent).toContain('Added to itinerary')
  })
})

describe('hotel rates', () => {
  it('lists rooms/board/cancellation, total stay, no "per night" mislabel', async () => {
    await searchHotels()
    const rates = container.querySelectorAll('[data-testid="hotel-rate"]')
    expect(rates).toHaveLength(2)
    expect(rates[0].textContent).toContain('Double Room')
    expect(rates[0].textContent).toContain('Bed & Breakfast')
    expect(rates[0].textContent).toContain('Refundable')
    expect(rates[0].textContent).toContain('total for 3 nights')
    expect(rates[1].textContent).toContain('Non-refundable')
    expect(container.textContent!.toLowerCase()).not.toContain('per night')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://img/x.jpg')
  })

  it('Add per rate POSTs hotelCode + rateKey with no price fields', async () => {
    addResponse = () => json(200, { ok: true, kind: 'hotel', booking: { id: 'h1' }, flights: [], hotels: [{ id: 'h1' }] })
    await searchHotels()
    const adds = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'Add to Itinerary')
    expect(adds).toHaveLength(2)
    await click(adds[1]); await flush()
    expect(posts()).toHaveLength(1)
    const body = JSON.parse(posts()[0][1].body)
    expect(body).toMatchObject({ type: 'hotel', hotelCode: '1234', rateKey: 'RK-2', checkIn: '2026-12-01', checkOut: '2026-12-04', rooms: 1, adults: 2, children: 0, hotelName: 'Grand Paris', stars: 4 })
    expect(Object.keys(body).filter((k) => /price|amount|cost|total|currency/i.test(k))).toEqual([])
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hotel' }))
    expect(container.querySelectorAll('[data-testid="hotel-rate"]')).toHaveLength(2)
  })

  it('falls back to hotel-level results with Add disabled when travel-search errors', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.includes('travel-search/hotels')) return json(500, { error: 'boom' })
      return json(200, { hotels: [{ name: 'Legacy', stars: 3, address: 'x', price: 100, currency: 'GBP' }], source: 'hotelbeds' })
    })
    await click(btn('Search Hotels')); await flush()
    expect(container.textContent).toContain('Legacy')
    expect(container.textContent).toContain('Adding to the itinerary is disabled')
    expect((btn('Add to Itinerary') as HTMLButtonElement).disabled).toBe(true)
    expect(container.textContent!.toLowerCase()).not.toContain('per night')
  })
})
