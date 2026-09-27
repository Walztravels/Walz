/**
 * POST /api/admin/quotes — flight price revalidation (closing fix, 2026-09-27).
 *
 * This route is the REAL production "New Quote" creation endpoint. Before
 * this fix, its flightOptions[] were persisted straight from client-
 * submitted costMinor/markupMinor/sellingPriceMinor with NO check against
 * the live Duffel offer — a real price-integrity gap on the actual
 * production path (unlike app/api/admin/travel-search/add-to-quote/route.ts,
 * which already revalidates its own single-item attach). These tests prove:
 *   - a live_search flight option whose revalidated price/currency matches
 *     the submission proceeds to creation;
 *   - any mismatch (price, currency), an expired/revalidation-failed offer,
 *     rejects the WHOLE request with 400 BEFORE the transaction runs — no
 *     partial quote is ever created;
 *   - manual flight options (sourceType 'manual', no duffelOfferId) are
 *     never checked against Duffel at all;
 *   - a mixed manual + live_search request revalidates only the live_search
 *     option.
 */

const mockGetOffer = jest.fn()

const mockPrisma = {
  quote: { create: jest.fn(), findFirst: jest.fn() },
  quoteItem: { createMany: jest.fn() },
  quoteFlightOption: { create: jest.fn() },
  quoteFlightSegment: { createMany: jest.fn() },
  quoteHotelOption: { create: jest.fn() },
  quoteActivity: { create: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: () => true }))
jest.mock('@/lib/quote-reference', () => ({ generateQuoteReference: async () => 'WT-Q-20260927-0001' }))
jest.mock('@/lib/email-quote-proposal', () => ({ sendQuoteProposalEmail: jest.fn(() => Promise.resolve()) }))
jest.mock('@/lib/inbox/authz', () => ({
  checkInboxPermission: () => ({ allowed: true }),
  checkConversationAccess: async () => ({ allowed: true }),
}))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))
jest.mock('@/lib/inbox/client-profile', () => ({
  resolveCanonicalContact: jest.fn(),
  evaluateProfileCompleteness: jest.fn(),
}))
jest.mock('@/lib/flights/duffel', () => ({ getOffer: (...a: unknown[]) => mockGetOffer(...a) }))

import { getAdminSession } from '@/lib/admin-auth'
import { POST } from '@/app/api/admin/quotes/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

function duffelOffer(totalAmount: string, currency = 'GBP', expiresAt: string | null = null) {
  return {
    data: {
      total_amount: totalAmount,
      total_currency: currency,
      expires_at: expiresAt,
    },
  }
}

function liveFlightOption(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Live fare',
    sourceType: 'live_search',
    duffelOfferId: 'off_live_123',
    airline: 'British Airways',
    tripType: 'oneway',
    cabinClass: 'ECONOMY',
    costMinor: 50000,
    markupMinor: 5000,
    serviceFeeMinor: 0,
    sellingPriceMinor: 55000,
    currency: 'GBP',
    segments: [],
    ...overrides,
  }
}

function manualFlightOption(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Manual fare',
    sourceType: 'manual',
    duffelOfferId: null,
    airline: 'Emirates',
    tripType: 'oneway',
    cabinClass: 'ECONOMY',
    costMinor: 40000,
    markupMinor: 4000,
    serviceFeeMinor: 0,
    sellingPriceMinor: 44000,
    currency: 'GBP',
    segments: [],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.quote.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'q1', reference: 'WT-Q-20260927-0001', status: 'draft', ...data,
  }))
  mockPrisma.quoteItem.createMany.mockResolvedValue({ count: 1 })
  mockPrisma.quoteFlightOption.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'fo1', ...data,
  }))
  mockPrisma.quoteFlightSegment.createMany.mockResolvedValue({ count: 1 })
  mockPrisma.quoteHotelOption.create.mockResolvedValue({ id: 'ho1' })
  mockPrisma.quoteActivity.create.mockResolvedValue({})
  mockPrisma.quote.findFirst.mockResolvedValue(null)
})

const BASE_BODY = {
  clientName: 'Real Client', clientEmail: 'client@walztravels.com',
  title: 'Lagos trip', currency: 'GBP',
}

describe('flight price revalidation on quote creation (plain admin path)', () => {
  it('live_search option whose revalidated total/currency matches costMinor/currency exactly → quote created', async () => {
    mockGetOffer.mockResolvedValue(duffelOffer('500.00', 'GBP'))
    const res = await POST(req({ ...BASE_BODY, flightOptions: [liveFlightOption()] }))
    expect(res.status).toBe(200)
    expect(mockGetOffer).toHaveBeenCalledTimes(1)
    expect(mockGetOffer).toHaveBeenCalledWith('off_live_123')
    expect(mockPrisma.quote.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
  })

  it('costMinor mismatch → 400 PRICE_MISMATCH, and NOTHING is written', async () => {
    // Revalidated total is 400.00 (40000 minor) but the client submitted 50000
    mockGetOffer.mockResolvedValue(duffelOffer('400.00', 'GBP'))
    const res = await POST(req({ ...BASE_BODY, flightOptions: [liveFlightOption()] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
    expect(mockPrisma.quoteFlightOption.create).not.toHaveBeenCalled()
  })

  it('currency mismatch → 400 PRICE_MISMATCH, and NOTHING is written', async () => {
    // Numerically equal amount (500.00) but supplier's real currency is USD
    mockGetOffer.mockResolvedValue(duffelOffer('500.00', 'USD'))
    const res = await POST(req({ ...BASE_BODY, flightOptions: [liveFlightOption()] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('PRICE_MISMATCH')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('getOffer throwing a 404/not_found-shaped error → 400 PRICE_REVALIDATION_FAILED, nothing written', async () => {
    mockGetOffer.mockRejectedValue(new Error('Duffel API error 404: not_found'))
    const res = await POST(req({ ...BASE_BODY, flightOptions: [liveFlightOption()] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('PRICE_REVALIDATION_FAILED')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('an expired offer → rejected as a revalidation failure, nothing written', async () => {
    mockGetOffer.mockResolvedValue(duffelOffer('500.00', 'GBP', '2020-01-01T00:00:00Z'))
    const res = await POST(req({ ...BASE_BODY, flightOptions: [liveFlightOption()] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('PRICE_REVALIDATION_FAILED')
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('manual flight option (sourceType manual, no duffelOfferId) → getOffer is NEVER called, and it proceeds to creation', async () => {
    const res = await POST(req({ ...BASE_BODY, flightOptions: [manualFlightOption()] }))
    expect(res.status).toBe(200)
    expect(mockGetOffer).not.toHaveBeenCalled()
    expect(mockPrisma.quote.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(1)
  })

  it('mixed request (one manual + one valid live_search) → both succeed, getOffer called exactly once (only for live_search)', async () => {
    mockGetOffer.mockResolvedValue(duffelOffer('500.00', 'GBP'))
    const res = await POST(req({
      ...BASE_BODY,
      flightOptions: [manualFlightOption(), liveFlightOption()],
    }))
    expect(res.status).toBe(200)
    expect(mockGetOffer).toHaveBeenCalledTimes(1)
    expect(mockGetOffer).toHaveBeenCalledWith('off_live_123')
    expect(mockPrisma.quote.create).toHaveBeenCalledTimes(1)
    expect(mockPrisma.quoteFlightOption.create).toHaveBeenCalledTimes(2)
  })

  it('a mismatch on the SECOND of two live_search options still rejects the whole request (no partial quote)', async () => {
    mockGetOffer
      .mockResolvedValueOnce(duffelOffer('500.00', 'GBP')) // first option: matches
      .mockResolvedValueOnce(duffelOffer('999.00', 'GBP')) // second option: mismatch
    const res = await POST(req({
      ...BASE_BODY,
      flightOptions: [
        liveFlightOption({ label: 'Outbound', duffelOfferId: 'off_A' }),
        liveFlightOption({ label: 'Return', duffelOfferId: 'off_B' }),
      ],
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('PRICE_MISMATCH')
    expect(data.error).toContain('Return')
    expect(mockPrisma.quote.create).not.toHaveBeenCalled()
  })

  it('no flightOptions at all (plain items-only quote) → getOffer never called, unaffected by this change', async () => {
    const res = await POST(req({
      ...BASE_BODY,
      items: [{ type: 'custom', title: 'Visa fee', sellingPriceMinor: 5000, currency: 'GBP' }],
    }))
    expect(res.status).toBe(200)
    expect(mockGetOffer).not.toHaveBeenCalled()
    expect(mockPrisma.quote.create).toHaveBeenCalledTimes(1)
  })
})
