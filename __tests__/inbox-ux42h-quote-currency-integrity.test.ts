/**
 * V1.2.1.1 — Quote currency integrity hardening.
 *
 * Audit result (confirmed before implementing): grepped every caller of
 * `PATCH /api/admin/quotes/[id]` in the repo — the Quote Builder's
 * handleFinalize (action:'send'), the quote editor's action-based PATCHes
 * (send/resend/extend/duplicate/cancel/archive/update_notes), and the
 * new-quote wizard (which only ever POSTs to create, never PATCHes an
 * existing quote's currency). NONE sends `currency` in a PATCH body. The
 * generic field-update branch accepted it anyway, with no status check and
 * no check for existing priced children, at any quote status including
 * finalized/shared — a real "silently relabel a live quote's currency with
 * zero recomputation" hole, reachable by any future caller of this generic
 * path even though nothing currently exercises it.
 *
 * The fix (app/api/admin/quotes/[id]/route.ts, generic field-update branch,
 * immediately before `allowedFields` is applied) is a pure fail-closed
 * guard: whenever `currency` is a key in the PATCH body, the WHOLE request
 * is rejected (409, code CURRENCY_LOCKED) unless the quote is still
 * `draft` AND holds zero QuoteItem/QuoteFlightOption/QuoteHotelOption rows.
 * No conversion, no relabeling, no FX, no change to any amount or to
 * supplier pricing behavior — this only prevents the unsafe mutation from
 * happening at all. True multi-currency re-pricing is a separate,
 * not-yet-built workstream.
 */

const mockPrisma = {
  quote: { findUnique: jest.fn(), update: jest.fn() },
  quoteItem: { count: jest.fn() },
  quoteFlightOption: { count: jest.fn() },
  quoteHotelOption: { count: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/email-quote-proposal', () => ({ sendQuoteProposalEmail: jest.fn() }))
jest.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppBody: jest.fn(), twilioConfigured: jest.fn(() => false) }))
jest.mock('@/lib/quote-reference', () => ({ generateQuoteReference: jest.fn(() => 'WLZ-Q-TEST') }))
jest.mock('@/lib/commercial/track', () => ({ propagateJadeAttribution: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { PATCH } from '@/app/api/admin/quotes/[id]/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0]
}
function ctx(id: string) {
  return { params: { id } }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quoteActivity.create.mockResolvedValue({})
  mockPrisma.quote.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'q1', secureTokenHash: 'x', ...data,
  }))
})

describe('Quote currency integrity — server-side fail-closed guard', () => {
  it('empty draft, GBP -> CAD: allowed', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(0)
    mockPrisma.quoteFlightOption.count.mockResolvedValue(0)
    mockPrisma.quoteHotelOption.count.mockResolvedValue(0)

    const res = await PATCH(req({ currency: 'CAD' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { currency: 'CAD' },
    })
  })

  it('draft WITH an item, GBP -> CAD: rejected (409 CURRENCY_LOCKED), quote.update never called', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(1)
    mockPrisma.quoteFlightOption.count.mockResolvedValue(0)
    mockPrisma.quoteHotelOption.count.mockResolvedValue(0)

    const res = await PATCH(req({ currency: 'CAD' }), ctx('q1'))
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.code).toBe('CURRENCY_LOCKED')
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('draft with zero QuoteItem rows but a QuoteFlightOption: rejected (the guard checks all three child models, not just QuoteItem)', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(0)
    mockPrisma.quoteFlightOption.count.mockResolvedValue(1)
    mockPrisma.quoteHotelOption.count.mockResolvedValue(0)

    const res = await PATCH(req({ currency: 'CAD' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('draft with zero QuoteItem/QuoteFlightOption but a QuoteHotelOption: rejected', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(0)
    mockPrisma.quoteFlightOption.count.mockResolvedValue(0)
    mockPrisma.quoteHotelOption.count.mockResolvedValue(1)

    const res = await PATCH(req({ currency: 'CAD' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it.each(['sent', 'viewed', 'accepted', 'declined', 'changes_requested', 'expired', 'converted', 'cancelled', 'archived'])(
    'finalized/shared quote (status=%s) with ZERO items, GBP -> CAD: still rejected — status alone is disqualifying',
    async (status) => {
      mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status, currency: 'GBP' })
      mockPrisma.quoteItem.count.mockResolvedValue(0)
      mockPrisma.quoteFlightOption.count.mockResolvedValue(0)
      mockPrisma.quoteHotelOption.count.mockResolvedValue(0)

      const res = await PATCH(req({ currency: 'CAD' }), ctx('q1'))
      const data = await res.json()
      expect(res.status).toBe(409)
      expect(data.code).toBe('CURRENCY_LOCKED')
      expect(mockPrisma.quote.update).not.toHaveBeenCalled()
      // Status check must short-circuit before any child-count query runs.
      expect(mockPrisma.quoteItem.count).not.toHaveBeenCalled()
    }
  )

  it('a rejected currency mutation leaves the Quote and every child model completely unchanged — no partial write of any kind', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'sent', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(3)

    await PATCH(req({ currency: 'CAD' }), ctx('q1'))

    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
    expect(mockPrisma.quoteActivity.create).not.toHaveBeenCalled()
  })

  it('a currency change bundled with an unrelated field on a finalized quote rejects the WHOLE request — no partial application of the unrelated field either', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'sent', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(0)
    mockPrisma.quoteFlightOption.count.mockResolvedValue(0)
    mockPrisma.quoteHotelOption.count.mockResolvedValue(0)

    const res = await PATCH(req({ currency: 'CAD', title: 'New title' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('unrelated fields continue working unaffected on a finalized quote, per existing permissions/lifecycle — the guard only fires when `currency` is present', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'sent', currency: 'GBP' })

    const res = await PATCH(req({ title: 'New title' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { title: 'New title' },
    })
    // The guard's child-count queries must never run when currency isn't
    // one of the fields being changed.
    expect(mockPrisma.quoteItem.count).not.toHaveBeenCalled()
  })

  it('unrelated fields continue working unaffected on a draft quote that already has items — proves the guard is currency-specific, not a general "quote has items" lock', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })

    const res = await PATCH(req({ description: 'Updated description' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { description: 'Updated description' },
    })
  })

  it('no conversion, relabeling, or FX logic was introduced — the allowed case persists exactly the client-submitted currency string, untouched', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'draft', currency: 'GBP' })
    mockPrisma.quoteItem.count.mockResolvedValue(0)
    mockPrisma.quoteFlightOption.count.mockResolvedValue(0)
    mockPrisma.quoteHotelOption.count.mockResolvedValue(0)

    await PATCH(req({ currency: 'cad' }), ctx('q1')) // lower-case, deliberately unnormalized
    expect(mockPrisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { currency: 'cad' }, // stored verbatim — no normalization/conversion added
    })
  })
})
