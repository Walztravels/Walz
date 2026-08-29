import { derivePortalStatus } from '../portal-status'
import type { FulfilmentSummary, PaymentSummary } from '../portal-status'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fi(id: string, status: string): FulfilmentSummary {
  return { id, status }
}

function pay(id: string, status: string): PaymentSummary {
  return { id, status }
}

const noPay: PaymentSummary[] = []
const noItems: FulfilmentSummary[] = []

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('derivePortalStatus', () => {
  test('accepted but unfulfilled trip → ACCEPTED', () => {
    expect(derivePortalStatus(noItems, noPay)).toBe('ACCEPTED')
  })

  test('accepted with payment recorded, no fulfilment items → PAYMENT_RECEIVED', () => {
    expect(derivePortalStatus(noItems, [pay('p1', 'PAID')])).toBe('PAYMENT_RECEIVED')
  })

  test('any fulfilment item FAILED → ACTION_REQUIRED (overrides everything)', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CONFIRMED'), fi('f2', 'FAILED')],
        [pay('p1', 'PAID')],
      ),
    ).toBe('ACTION_REQUIRED')
  })

  test('some fulfilment items PENDING → BOOKING_IN_PROGRESS', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CONFIRMED'), fi('f2', 'PENDING')],
        noPay,
      ),
    ).toBe('BOOKING_IN_PROGRESS')
  })

  test('all active items CONFIRMED → TRIP_CONFIRMED', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CONFIRMED'), fi('f2', 'CONFIRMED')],
        noPay,
      ),
    ).toBe('TRIP_CONFIRMED')
  })

  test('all active items BOOKED → TRIP_CONFIRMED', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'BOOKED'), fi('f2', 'BOOKED')],
        noPay,
      ),
    ).toBe('TRIP_CONFIRMED')
  })

  test('mix of CONFIRMED and BOOKED → TRIP_CONFIRMED', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CONFIRMED'), fi('f2', 'BOOKED'), fi('f3', 'CONFIRMED')],
        noPay,
      ),
    ).toBe('TRIP_CONFIRMED')
  })

  test('CONFIRMED + CANCELLED → TRIP_CONFIRMED (cancelled not a blocker)', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CONFIRMED'), fi('f2', 'CANCELLED')],
        noPay,
      ),
    ).toBe('TRIP_CONFIRMED')
  })

  test('PENDING + CANCELLED → BOOKING_IN_PROGRESS', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'PENDING'), fi('f2', 'CANCELLED')],
        noPay,
      ),
    ).toBe('BOOKING_IN_PROGRESS')
  })

  test('only CANCELLED items → ACCEPTED (all cancelled, no active)', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CANCELLED'), fi('f2', 'CANCELLED')],
        noPay,
      ),
    ).toBe('ACCEPTED')
  })

  test('FAILED item with others CONFIRMED → ACTION_REQUIRED', () => {
    expect(
      derivePortalStatus(
        [fi('f1', 'CONFIRMED'), fi('f2', 'CONFIRMED'), fi('f3', 'FAILED')],
        noPay,
      ),
    ).toBe('ACTION_REQUIRED')
  })

  test('payment PENDING (not PAID) → ACCEPTED, not PAYMENT_RECEIVED', () => {
    expect(
      derivePortalStatus(noItems, [pay('p1', 'PENDING')]),
    ).toBe('ACCEPTED')
  })
})
