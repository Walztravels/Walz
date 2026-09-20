/**
 * V1.3 — atomic draft currency recalculation
 * app/api/admin/quotes/[id]/recalculate-currency/route.ts
 *
 * The sanctioned exception to the currency-integrity guard: converts every
 * item/option's pricing atomically when staff changes an existing draft's
 * currency after items already exist. Covers the required test matrix:
 * empty draft, supplier->quote conversions for all 5 currencies, mixed
 * supplier currencies converging to one client currency, FX failure
 * aborting with zero writes, finalized-quote blocking, and a stale
 * concurrent-edit rejection via the rowVersion optimistic lock.
 */
import { Prisma } from '@prisma/client'

const mockTx = {
  quoteItem: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  quoteFlightOption: { update: jest.fn(), updateMany: jest.fn() },
  quoteHotelOption: { update: jest.fn(), updateMany: jest.fn() },
  quote: { updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
const mockPrisma = {
  quote: { findUnique: jest.fn() },
  $transaction: jest.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))
jest.mock('@/lib/fx', () => ({ getStandardRate: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { getStandardRate } from '@/lib/fx'
import { POST } from '@/app/api/admin/quotes/[id]/recalculate-currency/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string) {
  return { params: { id } }
}
function rate(value: string) {
  return {
    rawRate: new Prisma.Decimal(value), rateSource: 'STANDARD_MARKET' as const,
    provider: 'exchangerate-api', fetchedAt: new Date('2026-09-19T12:00:00.000Z'),
    baseCurrency: 'X', quoteCurrency: 'Y',
  }
}

function makeQuote(overrides: Partial<{ status: string; currency: string; conversationId: number | null; rowVersion: number; items: unknown[]; flightOptions: unknown[]; hotelOptions: unknown[] }> = {}) {
  return {
    id: 'q1', status: 'draft', currency: 'GBP', conversationId: null, rowVersion: 0,
    items: [], flightOptions: [], hotelOptions: [],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quote.findUnique.mockResolvedValue(makeQuote())
  mockTx.quote.updateMany.mockResolvedValue({ count: 1 })
  mockTx.quote.findUnique.mockResolvedValue({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) })
  mockTx.quote.update.mockResolvedValue({})
  mockTx.quoteItem.update.mockResolvedValue({})
  mockTx.quoteItem.updateMany.mockResolvedValue({ count: 1 })
  mockTx.quoteItem.findMany.mockResolvedValue([])
  mockTx.quoteFlightOption.update.mockResolvedValue({})
  mockTx.quoteFlightOption.updateMany.mockResolvedValue({ count: 1 })
  mockTx.quoteHotelOption.update.mockResolvedValue({})
  mockTx.quoteHotelOption.updateMany.mockResolvedValue({ count: 1 })
  mockTx.quoteActivity.create.mockResolvedValue({})
})

describe('empty draft — allowed', () => {
  it('GBP -> USD with zero items succeeds and updates Quote.currency', async () => {
    ;(getStandardRate as jest.Mock).mockResolvedValue(rate('1.27'))
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockTx.quote.updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', rowVersion: 0 },
      data: { currency: 'USD', rowVersion: { increment: 1 } },
    })
  })

  it('USD -> CAD with zero items succeeds', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ currency: 'USD' }))
    ;(getStandardRate as jest.Mock).mockResolvedValue(rate('1.36'))
    const res = await POST(req({ targetCurrency: 'CAD' }), ctx('q1'))
    expect(res.status).toBe(200)
  })

  it('rejects a no-op recalculation into the SAME currency', async () => {
    const res = await POST(req({ targetCurrency: 'GBP' }), ctx('q1'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('NO_OP')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an unsupported currency', async () => {
    const res = await POST(req({ targetCurrency: 'JPY' }), ctx('q1'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('UNSUPPORTED_CURRENCY')
  })
})

describe('supplier -> quote currency conversion (using preserved supplierCostMinor/supplierCurrency, never the already-converted costMinor)', () => {
  it.each([
    ['GBP', 'USD', '1.27'],
    ['EUR', 'USD', '1.08'],
    ['CAD', 'USD', '0.73'],
    ['USD', 'GBP', '0.79'],
    ['USD', 'NGN', '1600'],
  ])('supplier %s -> quote %s converts the item using the ORIGINAL supplier amount', async (supplierCcy, targetCcy, rateStr) => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({
      currency: supplierCcy === 'USD' ? 'USD' : 'GBP', // arbitrary starting currency distinct from target where relevant
      items: [{
        id: 'i1', costMinor: BigInt(99999), markupMinor: BigInt(1000), serviceFeeMinor: BigInt(0),
        currency: supplierCcy === 'USD' ? 'USD' : 'GBP', // current (already-converted or original) currency
        supplierCostMinor: BigInt(50000), supplierCurrency: supplierCcy, // the PRESERVED original — must be the conversion source
      }],
    }))
    ;(getStandardRate as jest.Mock).mockResolvedValue(rate(rateStr))
    const res = await POST(req({ targetCurrency: targetCcy }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(getStandardRate).toHaveBeenCalledWith(supplierCcy, targetCcy, expect.any(Number))
    const updateArgs = mockTx.quoteItem.updateMany.mock.calls[0][0]
    expect(updateArgs.where.id).toBe('i1')
    expect(updateArgs.data.supplierCostMinor).toBe(BigInt(50000))
    expect(updateArgs.data.supplierCurrency).toBe(supplierCcy)
    expect(updateArgs.data.currency).toBe(targetCcy)
  })

  it('an item with NO prior supplierCostMinor/supplierCurrency (never converted before) uses its OWN current costMinor/currency as the conversion source', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({
      currency: 'GBP',
      items: [{
        id: 'i1', costMinor: BigInt(20000), markupMinor: BigInt(2000), serviceFeeMinor: BigInt(0),
        currency: 'GBP', supplierCostMinor: null, supplierCurrency: null,
      }],
    }))
    ;(getStandardRate as jest.Mock).mockResolvedValue(rate('1.27'))
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(getStandardRate).toHaveBeenCalledWith('GBP', 'USD', expect.any(Number))
    const updateArgs = mockTx.quoteItem.updateMany.mock.calls[0][0]
    expect(updateArgs.data.supplierCostMinor).toBe(BigInt(20000)) // now preserved going forward
    expect(updateArgs.data.supplierCurrency).toBe('GBP')
  })
})

describe('mixed supplier currencies converge into one client currency', () => {
  it('a flight (GBP-original) and a hotel (EUR-original) both end up in USD after one recalculation', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({
      currency: 'GBP',
      flightOptions: [{ id: 'fo1', costMinor: BigInt(50000), markupMinor: BigInt(2500), serviceFeeMinor: BigInt(0), currency: 'GBP', supplierCostMinor: BigInt(50000), supplierCurrency: 'GBP' }],
      hotelOptions: [{ id: 'ho1', costMinor: BigInt(40000), markupMinor: BigInt(7200), serviceFeeMinor: BigInt(0), currency: 'GBP', supplierCostMinor: BigInt(37000), supplierCurrency: 'EUR' }],
    }))
    ;(getStandardRate as jest.Mock)
      .mockImplementation(async (from: string) => from === 'GBP' ? rate('1.27') : rate('1.08'))
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockTx.quoteFlightOption.updateMany).toHaveBeenCalled()
    expect(mockTx.quoteHotelOption.updateMany).toHaveBeenCalled()
    expect(mockTx.quoteFlightOption.updateMany.mock.calls[0][0].data.currency).toBe('USD')
    expect(mockTx.quoteHotelOption.updateMany.mock.calls[0][0].data.currency).toBe('USD')
  })
})

describe('FX failure aborts the whole operation — zero writes', () => {
  it('one item failing to convert aborts before ANY write, even if other items would have succeeded', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({
      items: [
        { id: 'i1', costMinor: BigInt(1000), markupMinor: BigInt(0), serviceFeeMinor: BigInt(0), currency: 'GBP', supplierCostMinor: null, supplierCurrency: null },
        { id: 'i2', costMinor: BigInt(2000), markupMinor: BigInt(0), serviceFeeMinor: BigInt(0), currency: 'GBP', supplierCostMinor: null, supplierCurrency: null },
      ],
    }))
    ;(getStandardRate as jest.Mock).mockResolvedValue(null) // provider unavailable for both
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('FX_RATE_UNAVAILABLE')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('finalized quote — recalculation blocked, must use a revision instead', () => {
  it.each(['sent', 'viewed', 'accepted', 'converted', 'archived', 'cancelled'])('blocks on a %s quote', async (status) => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ status }))
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('QUOTE_NOT_DRAFT')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('concurrent-edit protection (rowVersion optimistic lock)', () => {
  it('rejects with QUOTE_STALE when the row was modified between read and write', async () => {
    ;(getStandardRate as jest.Mock).mockResolvedValue(rate('1.27'))
    mockTx.quote.updateMany.mockResolvedValue({ count: 0 }) // someone else's write won the race
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('QUOTE_STALE')
  })

  it('rejects with QUOTE_STALE when an item was concurrently removed/repriced during Phase 1', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({
      items: [{ id: 'i1', costMinor: BigInt(1000), markupMinor: BigInt(0), serviceFeeMinor: BigInt(0), currency: 'GBP', supplierCostMinor: null, supplierCurrency: null }],
    }))
    ;(getStandardRate as jest.Mock).mockResolvedValue(rate('1.27'))
    // simulate a concurrent DELETE/PATCH on the item: the snapshot-scoped updateMany claims zero rows
    mockTx.quoteItem.updateMany.mockResolvedValue({ count: 0 })
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('QUOTE_STALE')
    // the compound where clause must scope on the pre-conversion snapshot, not just id
    const claimArgs = mockTx.quoteItem.updateMany.mock.calls[0][0]
    expect(claimArgs.where.id).toBe('i1')
    expect(claimArgs.where.costMinor).toBe(BigInt(1000))
    expect(claimArgs.where.currency).toBe('GBP')
  })
})

describe('identity gate for Inbox-originated quotes', () => {
  it('blocks when conversationId is set and identity is not VERIFIED/LINKED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'UNRESOLVED' } })
    const res = await POST(req({ targetCurrency: 'USD' }), ctx('q1'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
