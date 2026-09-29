/**
 * UX-4.2 closure review — SECURITY FIX regression tests.
 * app/api/admin/quotes/[id]/route.ts — generic field-update branch.
 *
 * Two real gaps existed:
 *  1. `status` was in the generic PATCH's `allowedFields`, reachable by any
 *     `quotes.edit` holder (near-universal role) with no dedicated audit/
 *     verification path — a quote could be marked 'accepted' with zero
 *     client evidence (no acceptedAt/acceptedIp/clientSignatureName).
 *     Fixed by removing it — every legitimate status transition already has
 *     its own dedicated action branch (send/resend/cancel/archive/convert).
 *  2. `clientName`/`clientEmail`/`clientPhone`/`clientCountry` could be
 *     changed on a conversation-linked quote post-creation with no identity
 *     re-check, letting a `quotes.edit` holder redirect an already-created
 *     proposal to an arbitrary recipient — entirely bypassing the
 *     creation-time identity gate. Fixed by requiring the same
 *     VERIFIED/LINKED check every other commercial mutation on this quote
 *     already requires, but ONLY when quote.conversationId is set (a plain
 *     admin-created quote is unaffected — this must not regress that
 *     legitimate, unlinked workflow).
 */
const mockPrisma = {
  quote: { findUnique: jest.fn(), update: jest.fn() },
  quoteActivity: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: jest.fn() }))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))
jest.mock('@/lib/email-quote-proposal', () => ({ sendQuoteProposalEmail: jest.fn() }))
jest.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppBody: jest.fn(), twilioConfigured: jest.fn(() => false) }))
jest.mock('@/lib/quote-reference', () => ({ generateQuoteReference: jest.fn(() => 'WLZ-Q-TEST') }))
jest.mock('@/lib/commercial/track', () => ({ propagateJadeAttribution: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { PATCH } from '@/app/api/admin/quotes/[id]/route'

const SESSION = { email: 'staff@walztravels.com', role: 'sales_agent', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0]
}
function ctx(id: string) {
  return { params: { id } }
}
function makeQuote(overrides: Partial<{ status: string; conversationId: number | null }> = {}) {
  return { id: 'q1', status: 'draft', conversationId: null, clientEmail: 'real@client.com', ...overrides }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(hasPermission as jest.Mock).mockReturnValue(true)
  mockPrisma.quote.findUnique.mockResolvedValue(makeQuote())
  mockPrisma.quoteActivity.create.mockResolvedValue({})
  mockPrisma.quote.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'q1', secureTokenHash: 'x', ...data,
  }))
})

describe('generic PATCH — status field removed (the accept-with-zero-evidence fix)', () => {
  it('rejects a bare status change with no recognized field to update', async () => {
    const res = await PATCH(req({ status: 'accepted' }), ctx('q1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('a status key mixed with a legitimate field updates only the legitimate field, never status', async () => {
    const res = await PATCH(req({ status: 'accepted', title: 'New title' }), ctx('q1'))
    expect(res.status).toBe(200)
    const data = (mockPrisma.quote.update as jest.Mock).mock.calls[0][0].data
    expect(data).not.toHaveProperty('status')
    expect(data.title).toBe('New title')
  })
})

describe('generic PATCH — identity re-check on client fields for conversation-linked quotes', () => {
  it('rejects a clientEmail change on a conversation-linked quote when identity is not VERIFIED/LINKED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'HEURISTIC' } })
    const res = await PATCH(req({ clientEmail: 'attacker@evil.com' }), ctx('q1'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('CLIENT_IDENTITY_REQUIRED')
    expect(mockPrisma.quote.update).not.toHaveBeenCalled()
  })

  it('allows a clientEmail change on a conversation-linked quote once identity resolves VERIFIED', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'VERIFIED' } })
    const res = await PATCH(req({ clientEmail: 'corrected@client.com' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.quote.update).toHaveBeenCalledTimes(1)
  })

  it('allows a clientEmail change on a PLAIN (no-conversation) quote with no identity check at all — must not regress this legitimate workflow', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: null }))
    const res = await PATCH(req({ clientEmail: 'typo-fix@client.com' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(resolveClientActionContext).not.toHaveBeenCalled()
    expect(mockPrisma.quote.update).toHaveBeenCalledTimes(1)
  })

  it('a title-only edit on a conversation-linked quote never triggers the identity check (only identity fields do)', async () => {
    mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
    const res = await PATCH(req({ title: 'Updated title' }), ctx('q1'))
    expect(res.status).toBe(200)
    expect(resolveClientActionContext).not.toHaveBeenCalled()
  })

  it.each(['clientName', 'clientPhone', 'clientCountry'])(
    'also gates %s the same way clientEmail is gated',
    async (field) => {
      mockPrisma.quote.findUnique.mockResolvedValue(makeQuote({ conversationId: 42 }))
      ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: { resolution: 'UNRESOLVED' } })
      const res = await PATCH(req({ [field]: 'new-value' }), ctx('q1'))
      expect(res.status).toBe(403)
      expect(mockPrisma.quote.update).not.toHaveBeenCalled()
    },
  )
})
