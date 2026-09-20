/**
 * V1.3 — Create Revision (PATCH .../route.ts, action:'create_revision')
 * plus a bugfix this session's schema change (QuoteItem.flightOptionId/
 * hotelOptionId) introduced into the pre-existing `duplicate` action: a
 * naive copy of QuoteItem rows before the new flight/hotel option rows
 * exist would copy those FK ids pointing at the ORIGINAL quote's options,
 * not the new row's — both actions now create options FIRST and remap via
 * an oldId->newId map before creating items.
 *
 * Covers: revision creation deep-copies items/options/media with ids
 * remapped, does NOT copy lifecycle/acceptance fields or itineraryId,
 * never sends anything (no email/WhatsApp, no 'sent' activity), flips the
 * previous latest revision's flag atomically, and blocks without identity
 * verification for Inbox-originated quotes — plus the duplicate-action
 * remapping fix.
 */
const mockTx = {
  quote: { create: jest.fn(), update: jest.fn() },
  quoteItem: { createMany: jest.fn() },
  quoteFlightOption: { create: jest.fn() },
  quoteFlightSegment: { createMany: jest.fn() },
  quoteHotelOption: { create: jest.fn() },
  quoteMedia: { createMany: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
const mockPrisma = {
  quote: { findUnique: jest.fn() },
  $transaction: jest.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/email-quote-proposal', () => ({ sendQuoteProposalEmail: jest.fn() }))
jest.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppBody: jest.fn(), twilioConfigured: jest.fn(() => false) }))
jest.mock('@/lib/quote-reference', () => ({ generateQuoteReference: jest.fn(() => 'WT-Q-20260919-0099') }))
jest.mock('@/lib/commercial/track', () => ({ propagateJadeAttribution: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { PATCH } from '@/app/api/admin/quotes/[id]/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0]
}
function ctx(id: string) {
  return { params: { id } }
}

const BASE_QUOTE = {
  id: 'q1', reference: 'WT-Q-20260919-0001', status: 'sent', currency: 'GBP', conversationId: null,
  rootQuoteId: null, revisionNumber: 1, isLatestRevision: true,
  clientName: 'Jane Doe', clientEmail: 'jane@example.com', clientPhone: null, clientCountry: null,
  title: 'Trip to Dubai', description: null, assignedTo: null,
  depositMinor: null, depositCurrency: null, depositPercentage: null,
  subtotalMinor: BigInt(50000), totalMinor: BigInt(52500), markupMinor: BigInt(0), serviceChargeMinor: BigInt(0), discountMinor: BigInt(0),
  internalNotes: null, leadId: null, tripId: null, source: null,
  itineraryId: 'old-itinerary-id', // must NOT be copied
  sentAt: new Date(), acceptedAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockTx.quote.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'q2', ...data }))
  mockTx.quote.update.mockResolvedValue({})
  mockTx.quoteFlightOption.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'fo-new', ...data }))
  mockTx.quoteHotelOption.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ho-new', ...data }))
  mockTx.quoteItem.createMany.mockResolvedValue({})
  mockTx.quoteMedia.createMany.mockResolvedValue({})
  mockTx.quoteFlightSegment.createMany.mockResolvedValue({})
  mockTx.quoteActivity.create.mockResolvedValue({})
})

describe('create_revision', () => {
  it('requires quotes.create in addition to the top-level quotes.edit gate', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(BASE_QUOTE)
    ;(hasPermission as jest.Mock).mockImplementation((_s, perm) => perm === 'quotes.edit')
    const res = await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith(SESSION, 'quotes.create')
  })

  it('deep-copies items/flight+hotel options with ids REMAPPED to the new revision\'s own option rows, never the original\'s', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({
      ...BASE_QUOTE,
      items: [
        { id: 'i1', quoteId: 'q1', type: 'flight', title: 'BA123', flightOptionId: 'fo-old', hotelOptionId: null, metadata: {}, costMinor: BigInt(50000), markupMinor: BigInt(2500), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(52500), currency: 'GBP', createdAt: new Date(), updatedAt: new Date() },
      ],
      flightOptions: [{ id: 'fo-old', quoteId: 'q1', airline: 'BA', cabinClass: 'ECONOMY', tripType: 'oneway', costMinor: BigInt(50000), markupMinor: BigInt(2500), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(52500), currency: 'GBP', createdAt: new Date(), updatedAt: new Date(), segments: [] }],
      hotelOptions: [],
      media: [],
    })
    const res = await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    expect(res.status).toBe(200)
    const itemsData = mockTx.quoteItem.createMany.mock.calls[0][0].data
    expect(itemsData[0].flightOptionId).toBe('fo-new') // remapped, not 'fo-old'
    expect(itemsData[0].quoteId).toBe('q2')
  })

  it('does NOT copy lifecycle/acceptance fields or itineraryId — a revision is a fresh draft with no conversion history', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, items: [], flightOptions: [], hotelOptions: [], media: [] })
    await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    const createData = mockTx.quote.create.mock.calls[0][0].data
    expect(createData.status).toBe('draft')
    expect(createData).not.toHaveProperty('itineraryId')
    expect(createData).not.toHaveProperty('sentAt')
    expect(createData).not.toHaveProperty('acceptedAt')
  })

  it('sets rootQuoteId/revisionNumber/isLatestRevision correctly for a first-time revision of an un-revised quote', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, items: [], flightOptions: [], hotelOptions: [], media: [] })
    await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    const createData = mockTx.quote.create.mock.calls[0][0].data
    expect(createData.rootQuoteId).toBe('q1') // the original IS the root
    expect(createData.revisionNumber).toBe(2)
    expect(createData.isLatestRevision).toBe(true)
    expect(createData.reference).toBe('WT-Q-20260919-0001-R2')
  })

  it('flips the PREVIOUS quote\'s isLatestRevision to false atomically with the new row\'s creation', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, items: [], flightOptions: [], hotelOptions: [], media: [] })
    await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    expect(mockTx.quote.update).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { isLatestRevision: false } })
  })

  it('never sends anything — no email, no WhatsApp, no "sent" QuoteActivity', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, items: [], flightOptions: [], hotelOptions: [], media: [] })
    await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    const activityEventTypes = mockTx.quoteActivity.create.mock.calls.map(c => c[0].data.eventType)
    expect(activityEventTypes).not.toContain('sent')
    expect(activityEventTypes.every((t: string) => t === 'revised')).toBe(true)
  })

  it('logs a "revised" QuoteActivity on BOTH the old and new quote rows', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, items: [], flightOptions: [], hotelOptions: [], media: [] })
    await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    const activityQuoteIds = mockTx.quoteActivity.create.mock.calls.map(c => c[0].data.quoteId)
    expect(activityQuoteIds).toContain('q1')
    expect(activityQuoteIds).toContain('q2')
  })

  it('blocks when conversationId is set and identity is not VERIFIED/LINKED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, conversationId: 42, items: [], flightOptions: [], hotelOptions: [], media: [] })
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('a direct API call cannot bypass the UI-only restriction — even with full permissions and a valid session, a draft quote is rejected server-side', async () => {
    // The UI never renders the Create Revision button for a draft quote,
    // but the server must not rely on that — this simulates an attacker
    // or script calling the endpoint directly, skipping the UI entirely.
    mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, status: 'draft' })
    const res = await PATCH(req({ action: 'create_revision' }), ctx('q1'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('QUOTE_NOT_ELIGIBLE_FOR_REVISION')
    expect(mockTx.quote.create).not.toHaveBeenCalled()
  })

  it('a second revision of an already-revised quote (revisionNumber 2 -> 3) correctly resolves the ROOT reference, not the immediate parent\'s', async () => {
    const revisionTwo = { ...BASE_QUOTE, id: 'q2', reference: 'WT-Q-20260919-0001-R2', rootQuoteId: 'q1', revisionNumber: 2 }
    mockPrisma.quote.findUnique
      .mockResolvedValueOnce(revisionTwo) // top-level `quote` fetch (unconditional, before the action branch)
      .mockResolvedValueOnce({ ...revisionTwo, items: [], flightOptions: [], hotelOptions: [], media: [] }) // `full` (with includes)
      .mockResolvedValueOnce({ reference: 'WT-Q-20260919-0001' }) // root reference lookup
    const res = await PATCH(req({ action: 'create_revision' }), ctx('q2'))
    expect(res.status).toBe(200)
    const createData = mockTx.quote.create.mock.calls[0][0].data
    expect(createData.rootQuoteId).toBe('q1')
    expect(createData.revisionNumber).toBe(3)
    expect(createData.reference).toBe('WT-Q-20260919-0001-R3')
  })
})

describe('create_revision — server-side lifecycle eligibility gate', () => {
  it.each(['sent', 'viewed', 'accepted', 'declined', 'changes_requested', 'expired'])(
    'allows revision creation from a %s quote',
    async (status) => {
      mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, status, items: [], flightOptions: [], hotelOptions: [], media: [] })
      const res = await PATCH(req({ action: 'create_revision' }), ctx('q1'))
      expect(res.status).toBe(200)
    },
  )

  it.each(['draft', 'converted', 'cancelled', 'archived'])(
    'rejects revision creation from a %s quote with a controlled 409 and creates no Quote/revision/activity',
    async (status) => {
      mockPrisma.quote.findUnique.mockResolvedValue({ ...BASE_QUOTE, status })
      const res = await PATCH(req({ action: 'create_revision' }), ctx('q1'))
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('QUOTE_NOT_ELIGIBLE_FOR_REVISION')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockTx.quote.create).not.toHaveBeenCalled()
      expect(mockTx.quoteActivity.create).not.toHaveBeenCalled()
    },
  )
})

describe('duplicate action — flightOptionId/hotelOptionId remapping fix', () => {
  it('copies a flight item\'s flightOptionId REMAPPED to the new flight option, not the original\'s id', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue({
      ...BASE_QUOTE,
      items: [
        { id: 'i1', quoteId: 'q1', type: 'flight', title: 'BA123', flightOptionId: 'fo-old', hotelOptionId: null, metadata: {}, costMinor: BigInt(50000), markupMinor: BigInt(2500), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(52500), currency: 'GBP', createdAt: new Date(), updatedAt: new Date() },
      ],
      flightOptions: [{ id: 'fo-old', quoteId: 'q1', airline: 'BA', cabinClass: 'ECONOMY', tripType: 'oneway', costMinor: BigInt(50000), markupMinor: BigInt(2500), serviceFeeMinor: BigInt(0), sellingPriceMinor: BigInt(52500), currency: 'GBP', createdAt: new Date(), updatedAt: new Date(), segments: [] }],
      hotelOptions: [],
    })
    const res = await PATCH(req({ action: 'duplicate' }), ctx('q1'))
    expect(res.status).toBe(200)
    const itemsData = mockTx.quoteItem.createMany.mock.calls[0][0].data
    expect(itemsData[0].flightOptionId).toBe('fo-new')
    expect(itemsData[0].flightOptionId).not.toBe('fo-old')
  })
})
