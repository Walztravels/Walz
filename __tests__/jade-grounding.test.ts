/**
 * V1.4 — read-only commercial grounding layer (owner decisions 4, 5, 6).
 * Reuses resolveClientActionContext/loadActionStatusSummary; never mutates
 * anything; correctly understands V1.3 quote revision semantics rather than
 * naively using "latest quote by createdAt".
 */
const mockPrisma = {
  quote: { findFirst: jest.fn() },
  paymentLink: { findFirst: jest.fn() },
  tripRequest: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))
jest.mock('@/lib/inbox/action-status', () => ({ loadActionStatusSummary: jest.fn() }))

import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { loadActionStatusSummary } from '@/lib/inbox/action-status'
import { buildConversationGrounding, renderGroundingBlock } from '@/lib/jade/assist/grounding'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} } as never

function baseIdentity(overrides: Partial<{ resolution: string; user: unknown; application: unknown }> = {}) {
  return {
    ok: true as const,
    context: {
      conversationId: 42,
      contact: { name: 'Jane Doe', email: 'jane@example.com', phone: null },
      supabaseLead: null, prismaLead: null, user: null, clientAccount: null,
      application: null, link: null, heuristicCandidates: null,
      resolution: 'UNRESOLVED',
      ambiguityReasons: [],
      ...overrides,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(loadActionStatusSummary as jest.Mock).mockResolvedValue({ payment: null, quote: null, visaForm: null, itineraryRequest: null })
  mockPrisma.quote.findFirst.mockResolvedValue(null)
  mockPrisma.paymentLink.findFirst.mockResolvedValue(null)
  mockPrisma.tripRequest.findFirst.mockResolvedValue(null)
})

describe('buildConversationGrounding — identity classification', () => {
  it('propagates an authz failure from resolveClientActionContext (never bypasses it)', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: false, status: 403, error: 'You do not have access to this conversation.' })
    const result = await buildConversationGrounding(42, SESSION)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.status).toBe(403)
  })

  it('does NOT surface a client display name at HEURISTIC resolution — never mistake a guess for identity', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(baseIdentity({ resolution: 'HEURISTIC' }))
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.identity.clientDisplayName).toBeNull()
    expect(result.grounding.identity.resolution).toBe('HEURISTIC')
  })

  it('does NOT surface a client display name at UNRESOLVED', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(baseIdentity({ resolution: 'UNRESOLVED' }))
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.identity.clientDisplayName).toBeNull()
  })

  it('surfaces the client display name at LINKED', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(
      baseIdentity({ resolution: 'LINKED', user: { id: 'u1', name: 'Aduke Okafor', email: 'aduke@example.com' } }),
    )
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.identity.clientDisplayName).toBe('Aduke Okafor')
  })

  it('surfaces the client display name at VERIFIED', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(
      baseIdentity({ resolution: 'VERIFIED', user: { id: 'u1', name: 'Aduke Okafor', email: 'aduke@example.com' } }),
    )
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.identity.clientDisplayName).toBe('Aduke Okafor')
  })

  it('every returned fact is classified AUTHORITATIVE_SYSTEM_FACT — grounding never emits a CLIENT_CLAIM itself', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(baseIdentity({ resolution: 'LINKED', user: { id: 'u1', name: 'Aduke', email: 'a@example.com' } }))
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.facts.every(f => f.source === 'AUTHORITATIVE_SYSTEM_FACT')).toBe(true)
  })
})

describe('buildConversationGrounding — quote revision awareness (owner decision 5)', () => {
  beforeEach(() => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(baseIdentity())
  })

  it('reports a current (non-superseded) quote as-is', async () => {
    mockPrisma.quote.findFirst.mockResolvedValueOnce({
      id: 'q1', reference: 'WT-Q-1', status: 'sent', currency: 'GBP',
      rootQuoteId: null, revisionNumber: 1, isLatestRevision: true,
      sentAt: new Date('2026-09-01'), firstViewedAt: null, lastViewedAt: null,
    })
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.quote.exists).toBe(true)
    expect(result.grounding.quote.isLatestRevision).toBe(true)
    expect(result.grounding.quote.currentRevisionReference).toBeUndefined()
    // No "superseded" fact should be emitted for a current quote.
    expect(result.grounding.facts.some(f => f.label === 'Quote revision notice')).toBe(false)
  })

  it('detects a STALE revision and resolves the true current one via rootQuoteId — never naive createdAt ordering', async () => {
    // The conversation's own most-recently-created row is revision 1, but it
    // has since been superseded by revision 2 (a different Quote row).
    mockPrisma.quote.findFirst
      .mockResolvedValueOnce({
        id: 'q1', reference: 'WT-Q-1', status: 'sent', currency: 'GBP',
        rootQuoteId: null, revisionNumber: 1, isLatestRevision: false,
        sentAt: new Date('2026-09-01'), firstViewedAt: new Date('2026-09-02'), lastViewedAt: new Date('2026-09-02'),
      })
      .mockResolvedValueOnce({ reference: 'WT-Q-1-R2', status: 'draft' }) // the true current revision lookup
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.quote.isLatestRevision).toBe(false)
    expect(result.grounding.quote.currentRevisionReference).toBe('WT-Q-1-R2')
    expect(result.grounding.quote.currentRevisionStatus).toBe('draft')
    // The current-revision lookup must scope by rootQuoteId OR id = root — verify the actual query shape.
    const secondCallArgs = mockPrisma.quote.findFirst.mock.calls[1][0]
    expect(secondCallArgs.where.isLatestRevision).toBe(true)
    expect(secondCallArgs.where.OR).toEqual([{ id: 'q1' }, { rootQuoteId: 'q1' }])
    // And a fact explicitly warns against presenting the stale one as current.
    const notice = result.grounding.facts.find(f => f.label === 'Quote revision notice')
    expect(notice).toBeDefined()
    expect(notice!.value).toContain('WT-Q-1-R2')
  })

  it('resolves the root correctly when the conversation row IS ITSELF already a revision (rootQuoteId set)', async () => {
    mockPrisma.quote.findFirst
      .mockResolvedValueOnce({
        id: 'q2', reference: 'WT-Q-1-R2', status: 'sent', currency: 'GBP',
        rootQuoteId: 'q1', revisionNumber: 2, isLatestRevision: false,
        sentAt: new Date(), firstViewedAt: null, lastViewedAt: null,
      })
      .mockResolvedValueOnce({ reference: 'WT-Q-1-R3', status: 'accepted' })
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    const secondCallArgs = mockPrisma.quote.findFirst.mock.calls[1][0]
    // Root resolves to rootQuoteId ('q1'), never the row's own id, when rootQuoteId is set.
    expect(secondCallArgs.where.OR).toEqual([{ id: 'q1' }, { rootQuoteId: 'q1' }])
    expect(result.grounding.quote.currentRevisionReference).toBe('WT-Q-1-R3')
  })

  it('reports no quote when none exists for the conversation', async () => {
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.quote.exists).toBe(false)
  })
})

describe('buildConversationGrounding — payment (owner decision 6)', () => {
  beforeEach(() => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(baseIdentity())
  })

  it('reports payment status/amount as authoritative, from PaymentLink, never inferred from a claim', async () => {
    mockPrisma.paymentLink.findFirst.mockResolvedValue({
      status: 'pending', amount: 1250, currency: 'GBP', chargeAmount: null, chargeCurrency: null,
    })
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.payment.status).toBe('pending')
    expect(result.grounding.payment.amount).toBe('GBP 1250.00')
    const fact = result.grounding.facts.find(f => f.label === 'Payment status')
    expect(fact!.value).toContain('pending')
  })

  it('prefers chargeAmount/chargeCurrency over amount/currency when present', async () => {
    mockPrisma.paymentLink.findFirst.mockResolvedValue({
      status: 'paid', amount: 1000, currency: 'USD', chargeAmount: 1300, chargeCurrency: 'GBP',
    })
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.payment.amount).toBe('GBP 1300.00')
  })

  it('reports no payment record when none exists — never fabricates one', async () => {
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.payment.exists).toBe(false)
  })
})

describe('buildConversationGrounding — visa and itinerary request', () => {
  it('reuses the already-resolved, already-coarse application DTO for visa status — never recomputes it', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(
      baseIdentity({ application: { id: 'app1', walzRef: 'VIS-1', applicationType: 'UK Visitor Visa', status: 'In Progress' } }),
    )
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.visa.status).toBe('In Progress')
    expect(result.grounding.visa.reference).toBe('VIS-1')
  })

  it('itinerary-request grounding excludes sensitive fields (passport data, DOB, signature) — only trip-shape fields selected', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue(baseIdentity())
    mockPrisma.tripRequest.findFirst.mockResolvedValue({
      status: 'submitted', destination: 'Lagos', departureDate: '2026-12-18', returnDate: '2027-01-05', numberOfTravellers: 2,
    })
    const result = await buildConversationGrounding(42, SESSION)
    if (!result.ok) throw new Error('unreachable')
    expect(result.grounding.itineraryRequest.destination).toBe('Lagos')
    expect(result.grounding.itineraryRequest.numberOfTravellers).toBe(2)
    // Confirm the select clause itself never asks for sensitive fields.
    const selectArg = mockPrisma.tripRequest.findFirst.mock.calls[0][0].select
    expect(selectArg.passportNumber).toBeUndefined()
    expect(selectArg.passportName).toBeUndefined()
    expect(selectArg.dateOfBirth).toBeUndefined()
    expect(selectArg.signature).toBeUndefined()
  })
})

describe('renderGroundingBlock', () => {
  it('explicitly frames facts as server-verified and to be trusted over a conflicting client claim', () => {
    const block = renderGroundingBlock({
      conversationId: 42,
      identity: { resolution: 'LINKED', clientDisplayName: 'Aduke' },
      quote: { exists: false }, payment: { exists: true, status: 'pending' }, visa: { exists: false }, itineraryRequest: { exists: false },
      facts: [{ source: 'AUTHORITATIVE_SYSTEM_FACT', label: 'Payment status', value: 'pending' }],
    })
    expect(block).toMatch(/server-verified/i)
    expect(block).toMatch(/trust this over/i)
    expect(block).toContain('Payment status: pending')
  })

  it('renders a clean "none on record" message when there are no facts', () => {
    const block = renderGroundingBlock({
      conversationId: 42,
      identity: { resolution: 'UNRESOLVED', clientDisplayName: null },
      quote: { exists: false }, payment: { exists: false }, visa: { exists: false }, itineraryRequest: { exists: false },
      facts: [],
    })
    expect(block).toMatch(/none on record/i)
  })
})
