/**
 * lib/__tests__/revision-workflow.test.ts
 *
 * Unit tests for the revision workflow pure functions.
 * No I/O — all functions under test are pure or use injected data.
 *
 * Coverage:
 *   - buildContentSnapshot
 *   - computePaymentsReceived
 *   - buildRevisionDiff
 *   - derivePortalStatus (REVISION_PENDING + backward compat)
 *   - isAccepted / isRevisionInProgress helpers
 */

import {
  buildContentSnapshot,
  computePaymentsReceived,
  buildRevisionDiff,
  isAccepted,
  isRevisionInProgress,
  type ContentSnapshot,
  type PaymentSummaryRow,
} from '@/lib/v2/revision'

import { derivePortalStatus } from '@/lib/v2/portal-status'

// ─── buildContentSnapshot ─────────────────────────────────────────────────────

describe('buildContentSnapshot', () => {
  const BASE = {
    flights:    JSON.stringify([{ from: 'LHR', to: 'DXB', date: '2026-03-01', airline: 'EK', flightNumber: 'EK001' }]),
    hotels:     JSON.stringify([{ name: 'Atlantis', location: 'Dubai', checkIn: '2026-03-01', checkOut: '2026-03-07', nights: 6 }]),
    days:       JSON.stringify([{ day: 1, title: 'Arrival' }]),
    inclusions: JSON.stringify(['Airport transfer', 'Breakfast daily']),
    exclusions: JSON.stringify(['Visa fees']),
    totalPrice: 5495,
  }

  it('parses all JSON fields correctly', () => {
    const snap = buildContentSnapshot(BASE)
    expect(snap.flights).toHaveLength(1)
    expect(snap.hotels).toHaveLength(1)
    expect(snap.days).toHaveLength(1)
    expect(snap.inclusions).toHaveLength(2)
    expect(snap.exclusions).toHaveLength(1)
    expect(snap.totalPrice).toBe(5495)
  })

  it('defaults malformed JSON arrays to []', () => {
    const snap = buildContentSnapshot({ ...BASE, flights: 'NOT JSON', hotels: '{}' })
    expect(snap.flights).toEqual([])
    expect(snap.hotels).toEqual([])
  })

  it('handles null totalPrice', () => {
    const snap = buildContentSnapshot({ ...BASE, totalPrice: null })
    expect(snap.totalPrice).toBeNull()
  })

  it('handles empty arrays', () => {
    const snap = buildContentSnapshot({ ...BASE, flights: '[]', hotels: '[]' })
    expect(snap.flights).toEqual([])
    expect(snap.hotels).toEqual([])
  })
})

// ─── computePaymentsReceived ──────────────────────────────────────────────────

describe('computePaymentsReceived', () => {
  const makePayment = (amount: number, status: string, currency = 'GBP'): PaymentSummaryRow =>
    ({ amount, status, currency })

  it('sums only PAID payments in the target currency', () => {
    const payments: PaymentSummaryRow[] = [
      makePayment(1000, 'PAID', 'GBP'),
      makePayment(500,  'PAID', 'GBP'),
      makePayment(200,  'PENDING', 'GBP'),
      makePayment(100,  'FAILED', 'GBP'),
      makePayment(300,  'PAID', 'NGN'),   // different currency — excluded
    ]
    expect(computePaymentsReceived(payments, 'GBP')).toBe(1500)
  })

  it('returns 0 when no PAID payments', () => {
    expect(computePaymentsReceived([makePayment(500, 'PENDING', 'GBP')], 'GBP')).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(computePaymentsReceived([], 'GBP')).toBe(0)
  })

  it('handles string amounts from Supabase NUMERIC', () => {
    const payments: PaymentSummaryRow[] = [makePayment('750' as unknown as number, 'PAID', 'GBP')]
    expect(computePaymentsReceived(payments, 'GBP')).toBe(750)
  })

  it('excludes REFUNDED payments', () => {
    const payments: PaymentSummaryRow[] = [
      makePayment(1000, 'PAID', 'GBP'),
      makePayment(200,  'REFUNDED', 'GBP'),
    ]
    expect(computePaymentsReceived(payments, 'GBP')).toBe(1000)
  })
})

// ─── buildRevisionDiff ────────────────────────────────────────────────────────

function makeOriginalSnapshot(overrides?: Partial<ContentSnapshot>): ContentSnapshot {
  return {
    flights:    [{ from: 'LHR', to: 'DXB', date: '2026-03-01', airline: 'EK', flightNumber: 'EK001' }],
    hotels:     [{ name: 'Atlantis', location: 'Dubai', checkIn: '2026-03-01', checkOut: '2026-03-07', nights: 6 }],
    days:       [],
    inclusions: [],
    exclusions: [],
    totalPrice: 5495,
    ...overrides,
  }
}

describe('buildRevisionDiff — pricing', () => {
  it('computes a positive price diff (increase)', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ totalPrice: 5000 }),
      currentFlights:           [],
      currentHotels:            [],
      currentTotalPrice:        5400,
      currency:                 'GBP',
      paymentsReceived:         1500,
      confirmedFulfilmentItems: [],
    })
    expect(diff.originalAcceptedTotal).toBe(5000)
    expect(diff.revisedTotal).toBe(5400)
    expect(diff.priceDiff).toBe(400)
    expect(diff.paymentsReceived).toBe(1500)
    expect(diff.outstanding).toBe(3900)  // 5400 - 1500
    expect(diff.isPriceCredit).toBe(false)
  })

  it('computes a negative price diff (credit)', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ totalPrice: 5000 }),
      currentFlights:           [],
      currentHotels:            [],
      currentTotalPrice:        4500,
      currency:                 'GBP',
      paymentsReceived:         500,
      confirmedFulfilmentItems: [],
    })
    expect(diff.priceDiff).toBe(-500)
    expect(diff.isPriceCredit).toBe(true)
    expect(diff.outstanding).toBe(4000)  // max(0, 4500 - 500)
  })

  it('sets priceDiff null when original totalPrice is null', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ totalPrice: null }),
      currentFlights:           [],
      currentHotels:            [],
      currentTotalPrice:        5000,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.priceDiff).toBeNull()
  })

  it('outstanding is never negative (price decreased below payments received)', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ totalPrice: 5000 }),
      currentFlights:           [],
      currentHotels:            [],
      currentTotalPrice:        2000,  // revised down
      currency:                 'GBP',
      paymentsReceived:         3000,  // more than revised total
      confirmedFulfilmentItems: [],
    })
    expect(diff.outstanding).toBe(0)   // max(0, 2000 - 3000) = 0
    expect(diff.isPriceCredit).toBe(true)
  })
})

describe('buildRevisionDiff — flight changes', () => {
  it('detects removed flights', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot(),  // has LHR→DXB
      currentFlights:           [],                      // removed
      currentHotels:            [],
      currentTotalPrice:        5495,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.flightChanges).toHaveLength(1)
    expect(diff.flightChanges[0].type).toBe('removed')
    expect(diff.flightChanges[0].description).toContain('LHR')
  })

  it('detects added flights', () => {
    const newFlight = { from: 'DXB', to: 'LHR', date: '2026-03-08', airline: 'EK', flightNumber: 'EK002' }
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ flights: [] }),  // no original flights
      currentFlights:           [newFlight],
      currentHotels:            [],
      currentTotalPrice:        5495,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.flightChanges).toHaveLength(1)
    expect(diff.flightChanges[0].type).toBe('added')
    expect(diff.flightChanges[0].description).toContain('DXB')
  })

  it('reports no changes when flights are identical', () => {
    const flight = { from: 'LHR', to: 'DXB', date: '2026-03-01', airline: 'EK', flightNumber: 'EK001' }
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ flights: [flight] }),
      currentFlights:           [flight],
      currentHotels:            [],
      currentTotalPrice:        5495,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.flightChanges).toHaveLength(0)
  })
})

describe('buildRevisionDiff — hotel changes', () => {
  it('detects removed hotels', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot(),  // has Atlantis
      currentFlights:           [],
      currentHotels:            [],                      // removed
      currentTotalPrice:        5000,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.hotelChanges).toHaveLength(1)
    expect(diff.hotelChanges[0].type).toBe('removed')
    expect(diff.hotelChanges[0].description).toContain('Atlantis')
  })

  it('detects added hotels', () => {
    const newHotel = { name: 'Burj Al Arab', location: 'Dubai', checkIn: '2026-03-04', checkOut: '2026-03-07', nights: 3 }
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot({ hotels: [] }),
      currentFlights:           [],
      currentHotels:            [newHotel],
      currentTotalPrice:        6000,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.hotelChanges).toHaveLength(1)
    expect(diff.hotelChanges[0].type).toBe('added')
    expect(diff.hotelChanges[0].description).toContain('Burj Al Arab')
  })
})

describe('buildRevisionDiff — fulfilment impact', () => {
  it('flags confirmed fulfilment items', () => {
    const confirmedItems = [
      { id: 'fi-1', type: 'FLIGHT', description: 'EK001 LHR-DXB', status: 'CONFIRMED' },
    ]
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot(),
      currentFlights:           [],
      currentHotels:            [],
      currentTotalPrice:        5000,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: confirmedItems,
    })
    expect(diff.hasConfirmedFulfilmentItems).toBe(true)
    expect(diff.confirmedFulfilmentItems).toHaveLength(1)
    expect(diff.confirmedFulfilmentItems[0].type).toBe('FLIGHT')
  })

  it('hasConfirmedFulfilmentItems is false when list is empty', () => {
    const diff = buildRevisionDiff({
      revisionNumber:           1,
      originalSnapshot:         makeOriginalSnapshot(),
      currentFlights:           [],
      currentHotels:            [],
      currentTotalPrice:        5000,
      currency:                 'GBP',
      paymentsReceived:         0,
      confirmedFulfilmentItems: [],
    })
    expect(diff.hasConfirmedFulfilmentItems).toBe(false)
  })
})

// ─── derivePortalStatus — REVISION_PENDING ────────────────────────────────────

describe('derivePortalStatus — revision states', () => {
  const noItems: Parameters<typeof derivePortalStatus>[0] = []
  const noPayments: Parameters<typeof derivePortalStatus>[1] = []

  it('returns REVISION_PENDING when itinerary status is revision_sent', () => {
    expect(derivePortalStatus(noItems, noPayments, 'revision_sent')).toBe('REVISION_PENDING')
  })

  it('REVISION_PENDING overrides ACTION_REQUIRED (client should review proposal first)', () => {
    const failedItem = [{ id: 'f1', status: 'FAILED' }]
    // revision_sent takes precedence — client can't fix fulfilment, they need to accept revision
    expect(derivePortalStatus(failedItem, noPayments, 'revision_sent')).toBe('REVISION_PENDING')
  })

  it('revision_draft behaves like approved (no banner — client not yet notified)', () => {
    expect(derivePortalStatus(noItems, noPayments, 'revision_draft')).toBe('ACCEPTED')
  })

  it('revision_accepted behaves like approved — no REVISION_PENDING banner', () => {
    expect(derivePortalStatus(noItems, noPayments, 'revision_accepted')).toBe('ACCEPTED')
  })
})

// ─── derivePortalStatus — backward compat ────────────────────────────────────

describe('derivePortalStatus — backward compat (no third param)', () => {
  const noItems: Parameters<typeof derivePortalStatus>[0] = []
  const noPayments: Parameters<typeof derivePortalStatus>[1] = []

  it('still returns ACCEPTED for a normal approved itinerary with no third param', () => {
    expect(derivePortalStatus(noItems, noPayments)).toBe('ACCEPTED')
  })

  it('ACTION_REQUIRED still works', () => {
    const failedItem = [{ id: 'f1', status: 'FAILED' }]
    expect(derivePortalStatus(failedItem, noPayments)).toBe('ACTION_REQUIRED')
  })

  it('TRIP_CONFIRMED still works', () => {
    const confirmed = [{ id: 'f1', status: 'CONFIRMED' }]
    expect(derivePortalStatus(confirmed, noPayments)).toBe('TRIP_CONFIRMED')
  })

  it('PAYMENT_RECEIVED still works', () => {
    const paidPayments = [{ id: 'p1', status: 'PAID' }]
    expect(derivePortalStatus(noItems, paidPayments)).toBe('PAYMENT_RECEIVED')
  })
})

// ─── Status helpers ───────────────────────────────────────────────────────────

describe('isAccepted', () => {
  it('returns true for approved', () => expect(isAccepted('approved')).toBe(true))
  it('returns true for revision_accepted', () => expect(isAccepted('revision_accepted')).toBe(true))
  it('returns false for proposal', () => expect(isAccepted('proposal')).toBe(false))
  it('returns false for revision_draft', () => expect(isAccepted('revision_draft')).toBe(false))
  it('returns false for revision_sent', () => expect(isAccepted('revision_sent')).toBe(false))
  it('returns false for draft', () => expect(isAccepted('draft')).toBe(false))
})

describe('isRevisionInProgress', () => {
  it('returns true for revision_draft', () => expect(isRevisionInProgress('revision_draft')).toBe(true))
  it('returns true for revision_sent', () => expect(isRevisionInProgress('revision_sent')).toBe(true))
  it('returns false for approved', () => expect(isRevisionInProgress('approved')).toBe(false))
  it('returns false for revision_accepted', () => expect(isRevisionInProgress('revision_accepted')).toBe(false))
  it('returns false for proposal', () => expect(isRevisionInProgress('proposal')).toBe(false))
})
