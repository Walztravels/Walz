/**
 * lib/performance/sales.ts — the single authoritative "completed sale"
 * definition (mission brief §3). This is the most important invariant in
 * the whole feature: EVERY query that counts a "sale" must filter on
 * Booking.status = CONFIRMED AND Booking.paymentStatus = SUCCEEDED, and
 * attribute it via createdByStaffId.
 */
const mockPrisma = {
  booking: { aggregate: jest.fn(), findMany: jest.fn(), count: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { SALE_WHERE, computeStaffSalesSummary, computeSalesInPeriod } from '@/lib/performance/sales'

describe('SALE_WHERE — the authoritative sale filter', () => {
  it('is exactly CONFIRMED + SUCCEEDED (never quote/itinerary/payment-request/lead)', () => {
    expect(SALE_WHERE).toEqual({ status: 'CONFIRMED', paymentStatus: 'SUCCEEDED' })
  })
})

describe('computeStaffSalesSummary', () => {
  const NOW = new Date('2026-09-28T00:00:00Z')

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.booking.aggregate.mockResolvedValue({ _max: { updatedAt: null }, _count: { _all: 0 } })
    mockPrisma.booking.findMany.mockResolvedValue([])
  })

  it('every query is scoped to createdByStaffId + the authoritative status/paymentStatus pair', async () => {
    await computeStaffSalesSummary('staff-1', NOW)
    const aggWhere = mockPrisma.booking.aggregate.mock.calls[0][0].where
    const findWhere = mockPrisma.booking.findMany.mock.calls[0][0].where
    expect(aggWhere).toMatchObject({ createdByStaffId: 'staff-1', status: 'CONFIRMED', paymentStatus: 'SUCCEEDED' })
    expect(findWhere).toMatchObject({ createdByStaffId: 'staff-1', status: 'CONFIRMED', paymentStatus: 'SUCCEEDED' })
  })

  it('reports hasAnyBookingEver=false and null days-since when nothing was ever sold', async () => {
    const r = await computeStaffSalesSummary('staff-1', NOW)
    expect(r.hasAnyBookingEver).toBe(false)
    expect(r.daysSinceLastSale).toBeNull()
    expect(r.lastCompletedSaleAt).toBeNull()
  })

  it('a 120+ day gap is computed correctly from a real last-sale date', async () => {
    const lastSale = new Date(NOW.getTime() - 150 * 86_400_000)
    mockPrisma.booking.aggregate.mockResolvedValue({ _max: { updatedAt: lastSale }, _count: { _all: 3 } })
    const r = await computeStaffSalesSummary('staff-1', NOW)
    expect(r.hasAnyBookingEver).toBe(true)
    expect(r.daysSinceLastSale).toBe(150)
  })

  it('a staff member with a sale 5 days ago is correctly excluded from any "days since" threshold', async () => {
    const lastSale = new Date(NOW.getTime() - 5 * 86_400_000)
    mockPrisma.booking.aggregate.mockResolvedValue({ _max: { updatedAt: lastSale }, _count: { _all: 1 } })
    const r = await computeStaffSalesSummary('staff-1', NOW)
    expect(r.daysSinceLastSale).toBe(5)
  })

  it('keeps revenue PER CURRENCY, never summed across currencies', async () => {
    mockPrisma.booking.aggregate.mockResolvedValue({ _max: { updatedAt: NOW }, _count: { _all: 2 } })
    mockPrisma.booking.findMany.mockResolvedValue([
      { updatedAt: NOW, totalAmount: 1000, currency: 'NGN' },
      { updatedAt: NOW, totalAmount: 50, currency: 'USD' },
    ])
    const r = await computeStaffSalesSummary('staff-1', NOW)
    expect(r.revenueByCurrency).toEqual({ NGN: 1000, USD: 50 })
  })

  it('windowed counts (30/90/120) only include rows within each window', async () => {
    mockPrisma.booking.aggregate.mockResolvedValue({ _max: { updatedAt: NOW }, _count: { _all: 3 } })
    mockPrisma.booking.findMany.mockResolvedValue([
      { updatedAt: new Date(NOW.getTime() - 10 * 86_400_000), totalAmount: 1, currency: 'GBP' },  // within 30
      { updatedAt: new Date(NOW.getTime() - 80 * 86_400_000), totalAmount: 1, currency: 'GBP' },  // within 90, not 30
      { updatedAt: new Date(NOW.getTime() - 119 * 86_400_000), totalAmount: 1, currency: 'GBP' }, // within 120, not 90
    ])
    const r = await computeStaffSalesSummary('staff-1', NOW)
    expect(r.salesLast30).toBe(1)
    expect(r.salesLast90).toBe(2)
    expect(r.salesLast120).toBe(3)
  })
})

describe('computeSalesInPeriod', () => {
  it('counts using the same authoritative status/paymentStatus pair, scoped to an arbitrary period', async () => {
    mockPrisma.booking.count.mockResolvedValue(4)
    const start = new Date('2026-01-01')
    const end = new Date('2026-03-31')
    const n = await computeSalesInPeriod('staff-1', start, end)
    expect(n).toBe(4)
    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: { createdByStaffId: 'staff-1', status: 'CONFIRMED', paymentStatus: 'SUCCEEDED', updatedAt: { gte: start, lte: end } },
    })
  })
})
