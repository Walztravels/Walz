// __tests__/release-63.test.ts — Release 6.3: Booking & Fulfillment Experience

import {
  getCustomerBookingState,
  getCustomerBookingStateLabel,
  getCustomerBookingStateDescription,
  getCustomerBookingStateColor,
  bookingStateNeedsAction,
  getCustomerActivityState,
  getCustomerActivityStateLabel,
  getCustomerActivityStateColor,
} from '@/lib/portal/booking-states'
import { toCustomerBookingDetail } from '@/lib/portal/booking-dto'

// ─── Booking state derivation ───────────────────────────────────────────────

describe('getCustomerBookingState', () => {
  // HARD RULE: SUCCEEDED + PENDING ≠ CONFIRMED
  it('returns PAYMENT_RECEIVED when payment succeeded but status is PENDING', () => {
    expect(getCustomerBookingState({ status: 'PENDING', paymentStatus: 'SUCCEEDED' }))
      .toBe('PAYMENT_RECEIVED')
  })

  it('PAYMENT_RECEIVED is NOT the same as CONFIRMED — hard rule enforced', () => {
    const state = getCustomerBookingState({ status: 'PENDING', paymentStatus: 'SUCCEEDED' })
    expect(state).not.toBe('CONFIRMED')
  })

  it('returns CONFIRMED only when status is CONFIRMED', () => {
    expect(getCustomerBookingState({ status: 'CONFIRMED', paymentStatus: 'SUCCEEDED' }))
      .toBe('CONFIRMED')
    expect(getCustomerBookingState({ status: 'CONFIRMED', paymentStatus: 'PENDING' }))
      .toBe('CONFIRMED')
  })

  it('returns PENDING_PAYMENT when no payment yet', () => {
    expect(getCustomerBookingState({ status: 'PENDING', paymentStatus: 'PENDING' }))
      .toBe('PENDING_PAYMENT')
    expect(getCustomerBookingState({ status: 'PENDING', paymentStatus: 'PROCESSING' }))
      .toBe('PENDING_PAYMENT')
  })

  it('returns ACTION_REQUIRED when payment succeeded but booking failed', () => {
    expect(getCustomerBookingState({ status: 'FAILED', paymentStatus: 'SUCCEEDED' }))
      .toBe('ACTION_REQUIRED')
  })

  it('returns FAILED when payment failed and booking failed', () => {
    expect(getCustomerBookingState({ status: 'FAILED', paymentStatus: 'FAILED' }))
      .toBe('FAILED')
    expect(getCustomerBookingState({ status: 'FAILED', paymentStatus: 'PENDING' }))
      .toBe('FAILED')
  })

  it('returns FAILED when payment failed and booking is pending', () => {
    expect(getCustomerBookingState({ status: 'PENDING', paymentStatus: 'FAILED' }))
      .toBe('FAILED')
  })

  it('returns COMPLETED when booking is completed', () => {
    expect(getCustomerBookingState({ status: 'COMPLETED', paymentStatus: 'SUCCEEDED' }))
      .toBe('COMPLETED')
    expect(getCustomerBookingState({ status: 'COMPLETED', paymentStatus: 'PENDING' }))
      .toBe('COMPLETED')
  })

  it('returns CANCELLED when cancelled without prior payment', () => {
    expect(getCustomerBookingState({ status: 'CANCELLED', paymentStatus: 'PENDING' }))
      .toBe('CANCELLED')
    expect(getCustomerBookingState({ status: 'CANCELLED', paymentStatus: 'FAILED' }))
      .toBe('CANCELLED')
  })

  it('returns REFUND_PROCESSING when cancelled after payment succeeded', () => {
    expect(getCustomerBookingState({ status: 'CANCELLED', paymentStatus: 'SUCCEEDED' }))
      .toBe('REFUND_PROCESSING')
  })

  it('returns REFUNDED when payment was refunded', () => {
    expect(getCustomerBookingState({ status: 'CANCELLED', paymentStatus: 'REFUNDED' }))
      .toBe('REFUNDED')
    expect(getCustomerBookingState({ status: 'PENDING', paymentStatus: 'REFUNDED' }))
      .toBe('REFUNDED')
  })
})

// ─── State labels ────────────────────────────────────────────────────────────

describe('getCustomerBookingStateLabel', () => {
  const cases: Array<[ReturnType<typeof getCustomerBookingState>, string]> = [
    ['PENDING_PAYMENT',   'Awaiting Payment'],
    ['PAYMENT_RECEIVED',  'Payment Received'],
    ['CONFIRMED',         'Confirmed'],
    ['ACTION_REQUIRED',   'Action Required'],
    ['COMPLETED',         'Completed'],
    ['CANCELLED',         'Cancelled'],
    ['REFUND_PROCESSING', 'Refund Processing'],
    ['REFUNDED',          'Refunded'],
    ['FAILED',            'Failed'],
  ]
  it.each(cases)('state %s → label %s', (state, expected) => {
    expect(getCustomerBookingStateLabel(state)).toBe(expected)
  })
})

// ─── State descriptions ───────────────────────────────────────────────────────

describe('getCustomerBookingStateDescription', () => {
  it('ACTION_REQUIRED description mentions contact', () => {
    const desc = getCustomerBookingStateDescription('ACTION_REQUIRED')
    expect(desc.toLowerCase()).toContain('contact')
  })

  it('PAYMENT_RECEIVED description does NOT say "confirmed"', () => {
    const desc = getCustomerBookingStateDescription('PAYMENT_RECEIVED')
    expect(desc.toLowerCase()).not.toContain('confirmed')
  })

  it('CONFIRMED description says booking is confirmed', () => {
    const desc = getCustomerBookingStateDescription('CONFIRMED')
    expect(desc.toLowerCase()).toContain('confirmed')
  })
})

// ─── State colors ─────────────────────────────────────────────────────────────

describe('getCustomerBookingStateColor', () => {
  it('ACTION_REQUIRED has red color', () => {
    expect(getCustomerBookingStateColor('ACTION_REQUIRED')).toContain('red')
  })

  it('CONFIRMED has green color', () => {
    expect(getCustomerBookingStateColor('CONFIRMED')).toContain('green')
  })

  it('PAYMENT_RECEIVED has blue color — distinct from CONFIRMED green', () => {
    const paymentColor = getCustomerBookingStateColor('PAYMENT_RECEIVED')
    const confirmedColor = getCustomerBookingStateColor('CONFIRMED')
    expect(paymentColor).toContain('blue')
    expect(paymentColor).not.toBe(confirmedColor)
  })
})

// ─── Needs action ─────────────────────────────────────────────────────────────

describe('bookingStateNeedsAction', () => {
  it('returns true only for ACTION_REQUIRED', () => {
    expect(bookingStateNeedsAction('ACTION_REQUIRED')).toBe(true)
  })

  it('returns false for all other states', () => {
    const others: Array<ReturnType<typeof getCustomerBookingState>> = [
      'PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'CONFIRMED', 'COMPLETED',
      'CANCELLED', 'REFUND_PROCESSING', 'REFUNDED', 'FAILED',
    ]
    for (const s of others) {
      expect(bookingStateNeedsAction(s)).toBe(false)
    }
  })
})

// ─── Activity booking states ──────────────────────────────────────────────────

describe('getCustomerActivityState', () => {
  it('returns CONFIRMED when status is CONFIRMED', () => {
    expect(getCustomerActivityState({ status: 'CONFIRMED', paymentStatus: 'PAID' }))
      .toBe('CONFIRMED')
  })

  it('returns PAYMENT_RECEIVED when paid and supplier confirming', () => {
    expect(getCustomerActivityState({ status: 'SUPPLIER_CONFIRMING', paymentStatus: 'PAID' }))
      .toBe('PAYMENT_RECEIVED')
    expect(getCustomerActivityState({ status: 'RECONCILIATION_REQUIRED', paymentStatus: 'PAID' }))
      .toBe('PAYMENT_RECEIVED')
  })

  it('returns ENQUIRY when not paid', () => {
    expect(getCustomerActivityState({ status: 'ENQUIRY', paymentStatus: 'UNPAID' }))
      .toBe('ENQUIRY')
  })

  it('returns ACTION_REQUIRED when paid but manual intervention needed', () => {
    expect(getCustomerActivityState({ status: 'MANUAL_REQUIRED', paymentStatus: 'PAID' }))
      .toBe('ACTION_REQUIRED')
    expect(getCustomerActivityState({ status: 'FAILED', paymentStatus: 'PAID' }))
      .toBe('ACTION_REQUIRED')
  })

  it('returns FAILED when not paid and status is failed', () => {
    expect(getCustomerActivityState({ status: 'FAILED', paymentStatus: 'UNPAID' }))
      .toBe('FAILED')
  })

  it('returns CANCELLED when status is CANCELLED', () => {
    expect(getCustomerActivityState({ status: 'CANCELLED', paymentStatus: 'PAID' }))
      .toBe('CANCELLED')
  })
})

describe('getCustomerActivityStateLabel', () => {
  it('returns readable labels for all states', () => {
    expect(getCustomerActivityStateLabel('CONFIRMED')).toBe('Confirmed')
    expect(getCustomerActivityStateLabel('PAYMENT_RECEIVED')).toBe('Payment Received')
    expect(getCustomerActivityStateLabel('ENQUIRY')).toBe('Enquiry')
    expect(getCustomerActivityStateLabel('ACTION_REQUIRED')).toBe('Action Required')
    expect(getCustomerActivityStateLabel('CANCELLED')).toBe('Cancelled')
    expect(getCustomerActivityStateLabel('FAILED')).toBe('Failed')
  })
})

describe('getCustomerActivityStateColor', () => {
  it('returns color strings for all states', () => {
    const states: Array<ReturnType<typeof getCustomerActivityState>> = [
      'ENQUIRY', 'PAYMENT_RECEIVED', 'CONFIRMED', 'ACTION_REQUIRED', 'CANCELLED', 'FAILED',
    ]
    for (const s of states) {
      expect(getCustomerActivityStateColor(s)).toBeTruthy()
    }
  })
})

// ─── DTO sanitization ─────────────────────────────────────────────────────────

function makeRawBooking(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bk_test_001',
    bookingReference: 'WTZ-2026-TEST',
    type: 'FLIGHT',
    status: 'CONFIRMED',
    paymentStatus: 'SUCCEEDED',
    totalAmount: 1500,
    currency: 'GBP',
    pnr: 'ABC123',
    contactEmail: 'test@example.com',
    contactPhone: '+447700900000',
    flightDetails: {
      origin: 'LOS',
      destination: 'LHR',
      outbound: [
        {
          departureAirport: 'LOS',
          arrivalAirport: 'LHR',
          departureTime: '2026-10-01T10:00:00Z',
          airline: 'British Airways',
          flightNumber: 'BA075',
        },
      ],
    },
    hotelDetails: null,
    passengers: [
      { type: 'ADT', firstName: 'Jane', lastName: 'Doe', dateOfBirth: '1990-01-01', passportNumber: 'P1234567' },
    ],
    createdAt: new Date('2026-08-01T12:00:00Z'),
    tickets: [],
    // Internal fields — must not appear in output:
    notes: 'Internal staff note',
    fxRate: 1.2345,
    fxMargin: 0.03,
    fxSource: 'ECB',
    fxQuotedAt: new Date(),
    fareAmount: 1200,
    fareCurrency: 'USD',
    stripeClientSecret: 'pi_secret_XXXX',
    stripePaymentIntentId: 'pi_XXXX',
    cryptoInvoiceId: 'inv_crypto',
    cryptoPaidCurrency: 'BTC',
    cryptoAmountReceived: 0.05,
    jadeAssisted: true,
    leadId: 'lead_001',
    quoteId: 'q_001',
    createdByStaffId: 'staff_001',
    branch: 'nigeria',
    ...overrides,
  }
}

describe('toCustomerBookingDetail — sanitization', () => {
  it('maps basic fields correctly', () => {
    const dto = toCustomerBookingDetail(makeRawBooking())
    expect(dto.id).toBe('bk_test_001')
    expect(dto.reference).toBe('WTZ-2026-TEST')
    expect(dto.type).toBe('FLIGHT')
    expect(dto.totalAmount).toBe(1500)
    expect(dto.currency).toBe('GBP')
    expect(dto.pnr).toBe('ABC123')
    expect(dto.contactEmail).toBe('test@example.com')
    expect(dto.contactPhone).toBe('+447700900000')
  })

  it('does NOT expose internal fields', () => {
    const dto = toCustomerBookingDetail(makeRawBooking()) as unknown as Record<string, unknown>
    const blocked = [
      'notes', 'fxRate', 'fxMargin', 'fxSource', 'fxQuotedAt',
      'fareAmount', 'fareCurrency', 'stripeClientSecret',
      'stripePaymentIntentId', 'cryptoInvoiceId', 'cryptoPaidCurrency',
      'cryptoAmountReceived', 'jadeAssisted', 'leadId', 'quoteId',
      'createdByStaffId', 'branch',
    ]
    for (const field of blocked) {
      expect(dto[field]).toBeUndefined()
    }
  })

  it('does NOT expose passenger passport numbers', () => {
    const dto = toCustomerBookingDetail(makeRawBooking())
    const passengers = dto.passengers as Array<Record<string, unknown>>
    for (const p of passengers) {
      expect(p.passportNumber).toBeUndefined()
      expect(p.passportExpiry).toBeUndefined()
      expect(p.nationality).toBeUndefined()
    }
  })

  it('exposes safe passenger fields (name, type, dateOfBirth)', () => {
    const dto = toCustomerBookingDetail(makeRawBooking())
    expect(dto.passengers[0].firstName).toBe('Jane')
    expect(dto.passengers[0].lastName).toBe('Doe')
    expect(dto.passengers[0].type).toBe('ADT')
    expect(dto.passengers[0].dateOfBirth).toBe('1990-01-01')
  })

  it('maps flight details correctly', () => {
    const dto = toCustomerBookingDetail(makeRawBooking())
    expect(dto.flightDetails?.origin).toBe('LOS')
    expect(dto.flightDetails?.destination).toBe('LHR')
    expect(dto.flightDetails?.outbound).toHaveLength(1)
    expect(dto.flightDetails?.outbound[0].airline).toBe('British Airways')
    expect(dto.flightDetails?.outbound[0].flightNumber).toBe('BA075')
  })

  it('sets correct state for CONFIRMED + SUCCEEDED', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({ status: 'CONFIRMED', paymentStatus: 'SUCCEEDED' }))
    expect(dto.state).toBe('CONFIRMED')
    expect(dto.needsAction).toBe(false)
  })

  it('sets PAYMENT_RECEIVED (not CONFIRMED) for PENDING + SUCCEEDED', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({ status: 'PENDING', paymentStatus: 'SUCCEEDED' }))
    expect(dto.state).toBe('PAYMENT_RECEIVED')
    expect(dto.state).not.toBe('CONFIRMED')
  })

  it('sets needsAction=true for ACTION_REQUIRED state', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({ status: 'FAILED', paymentStatus: 'SUCCEEDED' }))
    expect(dto.state).toBe('ACTION_REQUIRED')
    expect(dto.needsAction).toBe(true)
  })

  it('includes stateLabel and stateDescription', () => {
    const dto = toCustomerBookingDetail(makeRawBooking())
    expect(dto.stateLabel).toBeTruthy()
    expect(dto.stateDescription).toBeTruthy()
  })

  it('handles null hotelDetails gracefully', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({ hotelDetails: null }))
    expect(dto.hotelDetails).toBeNull()
  })

  it('handles empty passengers gracefully', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({ passengers: null }))
    expect(dto.passengers).toEqual([])
  })

  it('maps tickets correctly', () => {
    const now = new Date('2026-08-15T10:00:00Z')
    const dto = toCustomerBookingDetail(makeRawBooking({
      tickets: [{ id: 'tkt_001', htmlSnapshot: '<html>ticket</html>', createdAt: now }],
    }))
    expect(dto.tickets).toHaveLength(1)
    expect(dto.tickets[0].id).toBe('tkt_001')
    expect(dto.tickets[0].htmlSnapshot).toBe('<html>ticket</html>')
    expect(dto.tickets[0].issuedAt).toBe(now.toISOString())
  })

  it('does NOT include ticket raw data field', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({
      tickets: [{ id: 'tkt_001', htmlSnapshot: null, data: { sensitive: 'supplier_data' }, createdAt: new Date() }],
    }))
    const ticket = dto.tickets[0] as unknown as Record<string, unknown>
    expect(ticket.data).toBeUndefined()
  })

  it('handles Decimal totalAmount (Prisma Decimal type)', () => {
    const dto = toCustomerBookingDetail(makeRawBooking({
      totalAmount: { toNumber: () => 2500 },
    }))
    expect(dto.totalAmount).toBe(2500)
  })

  it('createdAt is an ISO string', () => {
    const dto = toCustomerBookingDetail(makeRawBooking())
    expect(typeof dto.createdAt).toBe('string')
    expect(() => new Date(dto.createdAt)).not.toThrow()
  })
})

// ─── Source invariants ─────────────────────────────────────────────────────────

describe('Source invariants — Release 6.3', () => {
  it('booking-states.ts does not import from admin routes', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/booking-states.ts'),
      'utf-8',
    )
    expect(source).not.toContain('/admin/')
    expect(source).not.toContain('prisma')
  })

  it('booking-dto.ts does not import prisma directly', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../lib/portal/booking-dto.ts'),
      'utf-8',
    )
    expect(source).not.toContain("from '@/lib/db'")
    expect(source).not.toContain("from '../db'")
  })

  it('booking API route uses select (not findFirst without select) to prevent over-fetching', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/bookings/[id]/route.ts'),
      'utf-8',
    )
    expect(source).toContain('select:')
  })

  it('booking API route validates ownership in the WHERE clause (not fetch-then-check)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/bookings/[id]/route.ts'),
      'utf-8',
    )
    expect(source).toContain('userId')
    expect(source).toContain('contactEmail')
    // Ownership filter must be in the DB query
    expect(source).toContain('findFirst')
    expect(source).toContain('where:')
  })

  it('booking API route never selects internal cost or staff fields', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/api/portal/bookings/[id]/route.ts'),
      'utf-8',
    )
    expect(source).not.toContain('notes:')
    expect(source).not.toContain('fxRate:')
    expect(source).not.toContain('fxMargin:')
    expect(source).not.toContain('stripeClientSecret:')
    expect(source).not.toContain('stripePaymentIntentId:')
    expect(source).not.toContain('leadId:')
    expect(source).not.toContain('jadeAssisted:')
  })

  it('booking detail page validates ownership via IDOR-safe Prisma query', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/bookings/[id]/page.tsx'),
      'utf-8',
    )
    // Must use session.user.id in the query
    expect(source).toContain('userId')
    expect(source).toContain('session.user.id')
    // Must not call getServerSession after the Prisma query (auth-then-query order)
    const authIdx = source.indexOf('getServerSession')
    const queryIdx = source.indexOf('prisma.booking.findFirst')
    expect(authIdx).toBeLessThan(queryIdx)
  })

  it('booking detail page redirects (not 404s) for IDOR attempts', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/bookings/[id]/page.tsx'),
      'utf-8',
    )
    expect(source).toContain("redirect('/dashboard/bookings')")
  })

  it('booking hub page is an RSC (no use client)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/bookings/page.tsx'),
      'utf-8',
    )
    expect(source).not.toContain("'use client'")
    expect(source).not.toContain('"use client"')
  })

  it('booking hub links to detail page /dashboard/bookings/[id]', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/bookings/page.tsx'),
      'utf-8',
    )
    expect(source).toContain('/dashboard/bookings/${b.id}')
  })

  it('sidebar includes My Bookings nav entry', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../components/portal/PortalSidebar.tsx'),
      'utf-8',
    )
    expect(source).toContain('/dashboard/bookings')
    expect(source).toContain('My Bookings')
  })

  it('booking hub uses getCustomerBookingState (not bookingStatusLabel from R6.2)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../app/dashboard/bookings/page.tsx'),
      'utf-8',
    )
    expect(source).toContain('getCustomerBookingState')
    // Should not use the older R6.2 status normalizer for categorisation
    expect(source).not.toContain('bookingStatusLabel')
  })
})
