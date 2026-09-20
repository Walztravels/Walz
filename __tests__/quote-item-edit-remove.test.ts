/**
 * V1.3 — Edit Pricing (PATCH) / Remove (DELETE)
 * app/api/admin/quotes/[id]/items/[itemId]/route.ts
 *
 * Closes the known V1.1/V1.2 limitation: a live-search-attached item was
 * permanently read-only. Covers: auth/permission, IDOR scoping (item must
 * belong to the quote named in the URL), draft-only gating, the dual-write
 * symmetry with the paired QuoteFlightOption/QuoteHotelOption (including
 * the legacy-item fallback correlation for pre-migration rows with no
 * flightOptionId/hotelOptionId), idempotent double-delete, and totals
 * recompute.
 */
const mockPrisma = {
  quote: { findUnique: jest.fn(), update: jest.fn() },
  quoteItem: { findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn(), update: jest.fn() },
  quoteFlightOption: { findFirst: jest.fn(), delete: jest.fn(), update: jest.fn() },
  quoteHotelOption: { findFirst: jest.fn(), delete: jest.fn(), update: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { DELETE, PATCH } from '@/app/api/admin/quotes/[id]/items/[itemId]/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body?: Record<string, unknown>) {
  return { json: async () => body ?? {} } as unknown as Parameters<typeof PATCH>[0]
}
function ctx(id: string, itemId: string) {
  return { params: { id, itemId } }
}

const DRAFT_QUOTE = { id: 'q1', status: 'draft', currency: 'GBP', conversationId: null }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quote.findUnique.mockResolvedValue(DRAFT_QUOTE)
  mockPrisma.quote.update.mockResolvedValue({})
  mockPrisma.quoteItem.findMany.mockResolvedValue([])
  mockPrisma.quoteActivity.create.mockResolvedValue({})
})

describe('Auth / permission', () => {
  it('401 when unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(401)
  })

  it('403 without quotes.edit — uses quotes.edit, not quotes.create (add-to-quote uses quotes.create for ADDING; this is a different, edit-shaped action)', async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith(SESSION, 'quotes.edit')
  })
})

describe('IDOR scoping', () => {
  it('404s when the item exists but belongs to a DIFFERENT quote than the one in the URL — never a bare findUnique({where:{id}})', async () => {
    // findFirst is called with {id, quoteId} together; simulate no match.
    mockPrisma.quoteItem.findFirst.mockResolvedValue(null)
    const res = await DELETE(req(), ctx('q1', 'item-belongs-to-q2'))
    expect(res.status).toBe(404)
    expect(mockPrisma.quoteItem.findFirst).toHaveBeenCalledWith({ where: { id: 'item-belongs-to-q2', quoteId: 'q1' } })
    expect(mockPrisma.quoteItem.delete).not.toHaveBeenCalled()
  })
})

describe('Identity re-check for Inbox-originated quotes', () => {
  it('blocks when conversationId is set and identity is not VERIFIED/LINKED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, conversationId: 42 })
    mockPrisma.quoteItem.findFirst.mockResolvedValue({ id: 'i1', quoteId: 'q1', type: 'activity', title: 'Tour', supplierRef: null, flightOptionId: null, hotelOptionId: null, markupMinor: BigInt(0), serviceFeeMinor: BigInt(0), costMinor: BigInt(1000) })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.quoteItem.delete).not.toHaveBeenCalled()
  })

  it('allows when identity is VERIFIED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, conversationId: 42 })
    mockPrisma.quoteItem.findFirst.mockResolvedValue({ id: 'i1', quoteId: 'q1', type: 'activity', title: 'Tour', supplierRef: null, flightOptionId: null, hotelOptionId: null, markupMinor: BigInt(0), serviceFeeMinor: BigInt(0), costMinor: BigInt(1000) })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'VERIFIED' } })
    mockPrisma.quoteItem.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
  })
})

describe('Draft-only gating — stricter than add-to-quote\'s own gate', () => {
  it.each(['sent', 'viewed', 'accepted', 'declined', 'converted', 'archived', 'cancelled'])(
    'blocks REMOVE on a %s quote even though add-to-quote itself only blocks converted/archived/cancelled',
    async (status) => {
      mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, status })
      mockPrisma.quoteItem.findFirst.mockResolvedValue({ id: 'i1', quoteId: 'q1', type: 'activity', title: 'Tour', supplierRef: null, flightOptionId: null, hotelOptionId: null })
      const res = await DELETE(req(), ctx('q1', 'i1'))
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('QUOTE_NOT_DRAFT')
      expect(mockPrisma.quoteItem.delete).not.toHaveBeenCalled()
    }
  )

  it('blocks EDIT PRICING identically', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...DRAFT_QUOTE, status: 'sent' })
    mockPrisma.quoteItem.findFirst.mockResolvedValue({ id: 'i1', quoteId: 'q1', type: 'activity', title: 'Tour', supplierRef: null, flightOptionId: null, hotelOptionId: null, costMinor: BigInt(1000), markupMinor: BigInt(100), serviceFeeMinor: BigInt(0) })
    const res = await PATCH(req({ markupMinor: 200 }), ctx('q1', 'i1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.quoteItem.update).not.toHaveBeenCalled()
  })
})

describe('REMOVE — dual-write symmetry', () => {
  it('flight item with flightOptionId set: deletes the OPTION (cascades to the item), not the item directly', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'flight', title: 'BA123', supplierRef: 'off_1', flightOptionId: 'fo1', hotelOptionId: null,
    })
    mockPrisma.quoteFlightOption.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.delete).toHaveBeenCalledWith({ where: { id: 'fo1' } })
    expect(mockPrisma.quoteItem.delete).not.toHaveBeenCalled()
  })

  it('hotel item with hotelOptionId set: deletes the OPTION', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'hotel', title: 'Hotel X', supplierRef: 'rk1', flightOptionId: null, hotelOptionId: 'ho1',
    })
    mockPrisma.quoteHotelOption.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteHotelOption.delete).toHaveBeenCalledWith({ where: { id: 'ho1' } })
  })

  it('activity/transfer/manual item with no option link: deletes the QuoteItem directly', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'activity', title: 'Desert Safari', supplierRef: null, flightOptionId: null, hotelOptionId: null,
    })
    mockPrisma.quoteItem.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteItem.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })
  })

  it('legacy flight item (created before flightOptionId existed): falls back to (quoteId, duffelOfferId) correlation and deletes the found option', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'flight', title: 'BA123', supplierRef: 'off_legacy', flightOptionId: null, hotelOptionId: null,
    })
    mockPrisma.quoteFlightOption.findFirst.mockResolvedValue({ id: 'fo-legacy' })
    mockPrisma.quoteFlightOption.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteFlightOption.findFirst).toHaveBeenCalledWith({ where: { quoteId: 'q1', duffelOfferId: 'off_legacy' } })
    expect(mockPrisma.quoteFlightOption.delete).toHaveBeenCalledWith({ where: { id: 'fo-legacy' } })
    expect(mockPrisma.quoteItem.delete).not.toHaveBeenCalled()
  })

  it('legacy flight item with NO matching option found: falls back to deleting just the item rather than crashing', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'flight', title: 'BA123', supplierRef: 'off_orphan', flightOptionId: null, hotelOptionId: null,
    })
    mockPrisma.quoteFlightOption.findFirst.mockResolvedValue(null)
    mockPrisma.quoteItem.delete.mockResolvedValue({})
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteItem.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })
  })

  it('idempotent double-delete: a P2025 (already deleted) is treated as a clean 404, not a 500, and totals are never recomputed for a write that did not happen', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'activity', title: 'Tour', supplierRef: null, flightOptionId: null, hotelOptionId: null,
    })
    mockPrisma.quoteItem.delete.mockRejectedValue({ code: 'P2025' })
    const res = await DELETE(req(), ctx('q1', 'i1'))
    expect(res.status).toBe(404)
    expect(mockPrisma.quoteItem.findMany).not.toHaveBeenCalled() // updateQuoteTotals never ran
  })

  it('recomputes totals and logs QuoteActivity on success', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue({
      id: 'i1', quoteId: 'q1', type: 'activity', title: 'Desert Safari', supplierRef: null, flightOptionId: null, hotelOptionId: null,
    })
    mockPrisma.quoteItem.delete.mockResolvedValue({})
    mockPrisma.quote.findUnique.mockResolvedValueOnce(DRAFT_QUOTE).mockResolvedValueOnce({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) })
    await DELETE(req(), ctx('q1', 'i1'))
    expect(mockPrisma.quoteItem.findMany).toHaveBeenCalledWith({ where: { quoteId: 'q1' } })
    expect(mockPrisma.quoteActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quoteId: 'q1', eventType: 'item_removed' }),
    }))
  })
})

describe('EDIT PRICING', () => {
  const BASE_ITEM = { id: 'i1', quoteId: 'q1', type: 'activity', title: 'Tour', supplierRef: null, flightOptionId: null, hotelOptionId: null, costMinor: BigInt(10000), markupMinor: BigInt(1000), serviceFeeMinor: BigInt(200) }

  it('recomputes sellingPriceMinor = costMinor + markupMinor + serviceFeeMinor, never touching cost', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue(BASE_ITEM)
    mockPrisma.quoteItem.update.mockResolvedValue({ ...BASE_ITEM, markupMinor: BigInt(1500), sellingPriceMinor: BigInt(11700) })
    mockPrisma.quote.findUnique.mockResolvedValueOnce(DRAFT_QUOTE).mockResolvedValueOnce({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) })
    const res = await PATCH(req({ markupMinor: 1500 }), ctx('q1', 'i1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quoteItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { markupMinor: BigInt(1500), serviceFeeMinor: BigInt(200), sellingPriceMinor: BigInt(11700) },
    })
  })

  it('rejects cost/offer fields silently ignored — only markupMinor/serviceFeeMinor are ever read from the body', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue(BASE_ITEM)
    mockPrisma.quoteItem.update.mockResolvedValue(BASE_ITEM)
    mockPrisma.quote.findUnique.mockResolvedValueOnce(DRAFT_QUOTE).mockResolvedValueOnce({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) })
    await PATCH(req({ markupMinor: 1000, costMinor: 999999999 }), ctx('q1', 'i1'))
    const updateArgs = mockPrisma.quoteItem.update.mock.calls[0][0]
    expect(updateArgs.data).not.toHaveProperty('costMinor')
  })

  it('rejects a negative markup/fee', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue(BASE_ITEM)
    const res = await PATCH(req({ markupMinor: -500 }), ctx('q1', 'i1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.quoteItem.update).not.toHaveBeenCalled()
  })

  it('rejects an empty body (no updatable fields)', async () => {
    mockPrisma.quoteItem.findFirst.mockResolvedValue(BASE_ITEM)
    const res = await PATCH(req({}), ctx('q1', 'i1'))
    expect(res.status).toBe(400)
  })

  it('syncs the paired QuoteFlightOption when flightOptionId is set', async () => {
    const flightItem = { ...BASE_ITEM, type: 'flight', flightOptionId: 'fo1' }
    mockPrisma.quoteItem.findFirst.mockResolvedValue(flightItem)
    mockPrisma.quoteItem.update.mockResolvedValue(flightItem)
    mockPrisma.quoteFlightOption.update.mockResolvedValue({})
    mockPrisma.quote.findUnique.mockResolvedValueOnce(DRAFT_QUOTE).mockResolvedValueOnce({ markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0) })
    await PATCH(req({ markupMinor: 1500 }), ctx('q1', 'i1'))
    expect(mockPrisma.quoteFlightOption.update).toHaveBeenCalledWith({
      where: { id: 'fo1' },
      data: { markupMinor: BigInt(1500), serviceFeeMinor: BigInt(200), sellingPriceMinor: BigInt(11700) },
    })
  })
})
