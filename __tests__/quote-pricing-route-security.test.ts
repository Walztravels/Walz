/**
 * UX-4.2 closure review — SECURITY FIX regression tests.
 * app/api/admin/quotes/[id]/pricing/route.ts
 *
 * This route previously had NO permission check, NO conversation-identity
 * re-check, NO draft-status gate, and NO audit log — any authenticated
 * staff session, any role, could PATCH any quote's pricing and silently
 * change its client-facing total. Fixed to match the exact pattern already
 * established by items/[itemId]/route.ts. These tests lock that in.
 */
const mockPrisma = {
  quote: { findUnique: jest.fn(), update: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { PATCH } from '@/app/api/admin/quotes/[id]/pricing/route'

const SESSION = { email: 'staff@walztravels.com', role: 'sales_agent', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0]
}
function ctx(id: string) {
  return { params: { id } }
}
function makeQuote(overrides: Partial<{ status: string; conversationId: number | null }> = {}) {
  return {
    id: 'q1', status: 'draft', conversationId: null,
    items: [{ sellingPriceMinor: BigInt(10000) }],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quote.findUnique.mockResolvedValue(makeQuote())
  mockPrisma.quote.update.mockResolvedValue({
    subtotalMinor: BigInt(10000), markupMinor: BigInt(1000), serviceChargeMinor: BigInt(0),
    discountMinor: BigInt(0), totalMinor: BigInt(11000),
  })
  mockPrisma.quoteActivity.create.mockResolvedValue({})
})

describe('PATCH pricing — permission gate (the CRITICAL fix)', () => {
  it('rejects a session with no quotes.manage_pricing permission, without touching the database', async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith(SESSION, 'quotes.manage_pricing')
    expect(mockPrisma.quote.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated request', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(401)
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('allows a session with quotes.manage_pricing on a plain (no-conversation) draft quote', async () => {
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quote.update).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH pricing — draft-status gate', () => {
  it('rejects pricing changes on a quote that has already been sent', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ status: 'sent' }))
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('QUOTE_NOT_DRAFT')
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('rejects pricing changes on an accepted quote', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ status: 'accepted' }))
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(409)
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })
})

describe('PATCH pricing — conversation-identity re-check', () => {
  it('rejects a conversation-linked quote when identity is not VERIFIED/LINKED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('allows a conversation-linked quote when identity resolves VERIFIED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'VERIFIED' } })
    const res = await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quote.update).toHaveBeenCalledTimes(1)
  })

  it('never calls resolveClientActionContext for a plain (no-conversation) quote', async () => {
    await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(resolveClientActionContext).not.toHaveBeenCalled()
  })
})

describe('PATCH pricing — audit log (the missing-auditability fix)', () => {
  it('writes a QuoteActivity row on every successful pricing update', async () => {
    await PATCH(req({ markupMinor: 1000, serviceChargeMinor: 500, discountMinor: 0 }), ctx('q1'))
    expect(mockPrisma.quoteActivity.create).toHaveBeenCalledTimes(1)
    const data = (mockPrisma.quoteActivity.create as jest.Mock).mock.calls[0][0].data
    expect(data.quoteId).toBe('q1')
    expect(data.actor).toBe(SESSION.email)
    expect(data.eventType).toBe('pricing_updated')
  })

  it('never writes an audit row when the permission check fails', async () => {
    ;(hasPermission as jest.Mock).mockReturnValue(false)
    await PATCH(req({ markupMinor: 1000 }), ctx('q1'))
    expect(mockPrisma.quoteActivity.create).not.toHaveBeenCalled()
  })
})
