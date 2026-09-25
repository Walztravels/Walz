/**
 * @jest-environment jsdom
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { FlightCard } from '@/app/itinerary/[ref]/portal/_PortalPage'
import { buildPortalFlight } from '@/lib/itinerary/client-booking-dto'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock('@stripe/stripe-js', () => ({ loadStripe: jest.fn() }))
jest.mock('@stripe/react-stripe-js', () => ({ Elements: () => null, PaymentElement: () => null, useStripe: () => null, useElements: () => null }))

const seg = (from: string, to: string, no: string) => ({
  from, to, airline: 'Qatar Airways', iataCode: 'QR', flightNumber: no,
  date: '2026-12-01', time: '09:15', arrivalTime: '17:40',
})
const jr = (index: number, direction: 'outbound' | 'return' | 'leg', segs: ReturnType<typeof seg>[]) =>
  ({ index, direction, segments: segs, stops: segs.length - 1 })
const unified = (tripType: string, journeys: unknown[]) => ({
  id: 'b1', bookingKind: 'unified-flight', tripType, from: 'LHR', to: 'DOH', airline: 'Qatar Airways', iataCode: 'QR',
  flightNumber: 'QR1408', date: '2026-12-01', time: '09:15', arrivalTime: '17:40', class: 'Economy', pnr: 'PNRSECRET',
  cost: 2353, supplierCost: 2241, notes: 'x', journeys,
  pricing: { supplierTotal: 2241, clientTotal: 2353 }, offer: { providerOfferId: 'off_SECRET' },
})
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const html = (row: Record<string, unknown>) => {
  const el = document.createElement('div')
  act(() => { createRoot(el).render(<FlightCard f={buildPortalFlight(row)} />) })
  return el.innerHTML
}

describe('portal FlightCard', () => {
  it('unified return: OUTBOUND + RETURN, both flight numbers, no price/PNR/supplier', () => {
    const h = html(unified('return', [jr(0, 'outbound', [seg('LHR', 'DOH', 'QR1408')]), jr(1, 'return', [seg('DOH', 'LHR', 'QR1407')])]))
    for (const x of ['OUTBOUND', 'RETURN', 'QR1408', 'QR1407']) expect(h).toContain(x)
    for (const x of ['2353', '2,353', '2241', 'PNRSECRET', 'off_SECRET', 'supplier']) expect(h).not.toContain(x)
  })
  it('connecting return shows every segment', () => {
    const h = html(unified('return', [
      jr(0, 'outbound', [seg('LHR', 'IST', 'TK1'), seg('IST', 'LOS', 'TK2')]),
      jr(1, 'return', [seg('LOS', 'IST', 'TK3'), seg('IST', 'LHR', 'TK4')]),
    ]))
    for (const x of ['TK1', 'TK2', 'TK3', 'TK4', 'Connection in IST']) expect(h).toContain(x)
  })
  it('multi-city shows LEG 1..N', () => {
    const h = html(unified('multi-city', [jr(0, 'leg', [seg('LHR', 'DOH', 'A1')]), jr(1, 'leg', [seg('DOH', 'JFK', 'A2')]), jr(2, 'leg', [seg('JFK', 'LHR', 'A3')])]))
    for (const x of ['LEG 1', 'LEG 2', 'LEG 3', 'A3']) expect(h).toContain(x)
  })
  it('legacy leg unchanged', () => {
    const h = html({ from: 'LHR', to: 'DOH', airline: 'BA', flightNumber: 'BA1', date: '2026-12-01', time: '10:00', arrivalTime: '12:00', stops: 0, cost: 500, pnr: 'P' })
    expect(h).toContain('BA1')
    expect(h).toContain('Non-stop')
    expect(h).toContain('Dep 10:00')
    expect(h).not.toContain('OUTBOUND')
    expect(h).not.toContain('500')
  })
})
