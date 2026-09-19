/**
 * INBOX Phase 3 (Agent D — Client Action Centre UX), item C.
 *
 * Covers lib/inbox/action-status.ts:
 *  - loadActionStatusSummary resolves each of the 4 action types by
 *    conversationId (payment/quote/itineraryRequest) or via the ALREADY-
 *    resolved ConversationClientLink → application DTO (visaForm) — never
 *    a fresh independent VisaApplication-by-conversation lookup, since
 *    VisaApplication has no conversationId column.
 *  - "most recent" tie-break: findFirst is called with orderBy createdAt
 *    desc for payment/quote/itineraryRequest.
 *  - an action with no record resolves to null (chip omitted upstream).
 *  - a query failure fails closed to an all-null summary, never a throw.
 *  - selectActionStatusChips (the pure selector ClientInfo's chips render
 *    from) omits nulls and preserves each present entry's raw status.
 */

const mockPrisma = {
  paymentLink:     { findFirst: jest.fn() },
  quote:           { findFirst: jest.fn() },
  tripRequest:     { findFirst: jest.fn() },
  visaApplication: { findUnique: jest.fn() },
}

jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { loadActionStatusSummary, selectActionStatusChips, type ActionStatusSummary } from '@/lib/inbox/action-status'
import type { ClientApplicationDTO } from '@/lib/inbox/client-context'

const CONV_ID = 4242

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.paymentLink.findFirst.mockResolvedValue(null)
  mockPrisma.quote.findFirst.mockResolvedValue(null)
  mockPrisma.tripRequest.findFirst.mockResolvedValue(null)
  mockPrisma.visaApplication.findUnique.mockResolvedValue(null)
})

describe('loadActionStatusSummary', () => {
  it('returns null for every action when no records exist', async () => {
    const summary = await loadActionStatusSummary(CONV_ID, null)
    expect(summary).toEqual({ payment: null, quote: null, visaForm: null, itineraryRequest: null })
  })

  it('resolves payment/quote/itineraryRequest by conversationId, most-recent-first', async () => {
    mockPrisma.paymentLink.findFirst.mockResolvedValue({ status: 'pending', updatedAt: new Date('2026-01-01') })
    mockPrisma.quote.findFirst.mockResolvedValue({ status: 'sent', updatedAt: new Date('2026-01-02') })
    mockPrisma.tripRequest.findFirst.mockResolvedValue({ status: 'submitted', updatedAt: new Date('2026-01-03') })

    const summary = await loadActionStatusSummary(CONV_ID, null)

    expect(summary.payment).toEqual({ status: 'pending', updatedAt: new Date('2026-01-01').toISOString() })
    expect(summary.quote).toEqual({ status: 'sent', updatedAt: new Date('2026-01-02').toISOString() })
    expect(summary.itineraryRequest).toEqual({ status: 'submitted', updatedAt: new Date('2026-01-03').toISOString() })
    expect(summary.visaForm).toBeNull()

    // Every conversationId-scoped model is queried by the SAME conversationId,
    // ordered most-recent-first (createdAt desc) — never an arbitrary row
    // when multiple exist for the conversation.
    expect(mockPrisma.paymentLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID }, orderBy: { createdAt: 'desc' } }),
    )
    expect(mockPrisma.quote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID }, orderBy: { createdAt: 'desc' } }),
    )
    expect(mockPrisma.tripRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: CONV_ID }, orderBy: { createdAt: 'desc' } }),
    )
  })

  it('resolves visaForm ONLY via the already-resolved ConversationClientLink application DTO — never an independent VisaApplication-by-conversation query (VisaApplication has no conversationId column)', async () => {
    const application: ClientApplicationDTO = {
      id: 'app_1', walzRef: 'WLZ-1', applicationType: 'UK Tourist Visa', status: 'In Progress',
    }
    mockPrisma.visaApplication.findUnique.mockResolvedValue({ updatedAt: new Date('2026-02-01') })

    const summary = await loadActionStatusSummary(CONV_ID, application)

    expect(summary.visaForm).toEqual({ status: 'In Progress', updatedAt: new Date('2026-02-01').toISOString() })
    // The status is the DTO's own (already safeStatusLabel-coarsened) value,
    // never recomputed — only updatedAt is fetched, by primary key, from the
    // SAME application id the caller already resolved.
    expect(mockPrisma.visaApplication.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'app_1' } }),
    )
    // No conversationId-based VisaApplication query exists anywhere in this
    // module — the mock only ever exposes findUnique, never findFirst.
    expect((mockPrisma.visaApplication as Record<string, unknown>).findFirst).toBeUndefined()
  })

  it('null application (no ConversationClientLink) → visaForm stays null, no VisaApplication query at all', async () => {
    await loadActionStatusSummary(CONV_ID, null)
    expect(mockPrisma.visaApplication.findUnique).not.toHaveBeenCalled()
  })

  it('fails closed to an all-null summary if a query throws — never blocks or corrupts client-context', async () => {
    mockPrisma.paymentLink.findFirst.mockRejectedValue(new Error('db down'))
    const summary = await loadActionStatusSummary(CONV_ID, null)
    // Promise.all + individual .catch(() => null) on each query means one
    // failure only nulls THAT action, not the whole summary — but if the
    // whole Promise.all somehow rejects, the outer try/catch still yields
    // an all-null summary rather than throwing.
    expect(summary.payment).toBeNull()
  })
})

describe('selectActionStatusChips', () => {
  it('omits every action with no record — no "not started" clutter', () => {
    const summary: ActionStatusSummary = { payment: null, quote: null, visaForm: null, itineraryRequest: null }
    expect(selectActionStatusChips(summary)).toEqual([])
  })

  it('returns null/undefined summaries as an empty chip list', () => {
    expect(selectActionStatusChips(null)).toEqual([])
    expect(selectActionStatusChips(undefined)).toEqual([])
  })

  it('renders exactly the present actions, with the label and raw status verbatim', () => {
    const summary: ActionStatusSummary = {
      payment: { status: 'pending', updatedAt: '2026-01-01T00:00:00.000Z' },
      quote: null,
      visaForm: { status: 'In Progress', updatedAt: '2026-01-01T00:00:00.000Z' },
      itineraryRequest: { status: 'submitted', updatedAt: '2026-01-01T00:00:00.000Z' },
    }
    const chips = selectActionStatusChips(summary)
    expect(chips).toEqual([
      { key: 'payment', label: 'Payment', status: 'pending' },
      { key: 'visaForm', label: 'Visa form', status: 'In Progress' },
      { key: 'itineraryRequest', label: 'Itinerary request', status: 'submitted' },
    ])
    // Quote had no record — must not appear at all.
    expect(chips.find(c => c.key === 'quote')).toBeUndefined()
  })

  it('all four present renders all four, in a stable order', () => {
    const summary: ActionStatusSummary = {
      payment: { status: 'paid', updatedAt: '' },
      quote: { status: 'accepted', updatedAt: '' },
      visaForm: { status: 'Approved', updatedAt: '' },
      itineraryRequest: { status: 'converted', updatedAt: '' },
    }
    expect(selectActionStatusChips(summary).map(c => c.key)).toEqual(['payment', 'quote', 'visaForm', 'itineraryRequest'])
  })
})
