/**
 * V1.4 — POST /api/admin/inbox/conversations/[id]/jade-suggest-actions.
 * Release-blocking per owner decisions 9 and 10: the model may only return
 * a structured proposal (never execute), through a fixed 5-value enum
 * (never a model-generated URL/route), with allowlisted per-type fields
 * (REQUEST_PAYMENT structurally cannot carry an amount).
 */
const mockPrisma = { activityLog: { create: jest.fn() } }
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/inbox/authz', () => ({ checkInboxPermission: jest.fn(), checkConversationAccess: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/jade/assist/grounding', () => ({
  buildConversationGrounding: jest.fn(),
  renderGroundingBlock: jest.fn(() => 'AUTHORITATIVE SYSTEM FACTS: mocked'),
}))
jest.mock('@/lib/jade/assist/model', () => ({ callJadeModel: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { rateLimit } from '@/lib/rate-limit'
import { buildConversationGrounding } from '@/lib/jade/assist/grounding'
import { callJadeModel } from '@/lib/jade/assist/model'
import { POST } from '@/app/api/admin/inbox/conversations/[id]/jade-suggest-actions/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string) {
  return { params: { id } }
}
function toolActions(actions: unknown[]) {
  return { ok: true as const, text: JSON.stringify({ actions }), toolInput: { actions }, model: 'claude-sonnet-4-6', provider: 'anthropic' as const, usage: {}, latencyMs: 5 }
}
const GROUNDING_OK = {
  ok: true as const,
  grounding: {
    conversationId: 42,
    identity: { resolution: 'LINKED' as const, clientDisplayName: 'Aduke' },
    quote: { exists: false }, payment: { exists: false }, visa: { exists: false }, itineraryRequest: { exists: false },
    facts: [],
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: true })
  ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
  ;(buildConversationGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
  mockPrisma.activityLog.create.mockResolvedValue({})
})

describe('auth/RBAC/IDOR', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(401)
  })

  it('rejects a staff member lacking inbox_view', async () => {
    ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: false, status: 403, error: 'no' })
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(403)
  })

  it('enforces conversation access — cannot read another agent\'s inaccessible conversation', async () => {
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no access' })
    const res = await POST(req({ recentMessages: [] }), ctx('999'))
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
  })

  it('rate limits per staff email', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(429)
  })

  it('propagates a client-identity resolution failure from grounding', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue({ ok: false, status: 403, error: 'identity required' })
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
  })
})

describe('enum enforcement — the model may only return a known action type', () => {
  it('accepts a valid CREATE_QUOTE proposal', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'CREATE_QUOTE', fields: { origin: 'Toronto', destination: 'Lagos' } }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.actions).toHaveLength(1)
    expect(body.actions[0].type).toBe('CREATE_QUOTE')
    expect(body.actions[0].requiresConfirmation).toBe(true)
  })

  it('discards an action with an unrecognized/invented type rather than surfacing it', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'DELETE_ACCOUNT', fields: {} }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions).toEqual([])
  })

  it('discards a model-generated URL/route disguised as a type — never becomes navigation', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: '/admin/quotes/123', fields: {} }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions).toEqual([])
  })

  it('drops a NONE entry (not a real action to launch)', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'NONE', fields: {} }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions).toEqual([])
  })

  it('caps at 3 actions even if the model returns more', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([
      { type: 'CREATE_QUOTE', fields: {} }, { type: 'REQUEST_PAYMENT', fields: {} },
      { type: 'VISA_FORM', fields: {} }, { type: 'ITINERARY_REQUEST', fields: {} },
    ]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions.length).toBeLessThanOrEqual(3)
  })

  it('returns an empty array when the model itself is unavailable is handled as a controlled error, not a crash', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue({ ok: false, code: 'MODEL_UNAVAILABLE', message: 'down' })
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(502)
  })
})

describe('field allowlisting — untrusted AI output is validated, never passed through raw', () => {
  it('REQUEST_PAYMENT structurally cannot carry an amount or currency field', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([
      { type: 'REQUEST_PAYMENT', fields: { purpose: 'deposit', amount: 999999, currency: 'USD' } },
    ]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields.purpose).toBe('deposit')
    expect(body.actions[0].fields.amount).toBeUndefined()
    expect(body.actions[0].fields.currency).toBeUndefined()
  })

  it('drops unknown/extraneous keys on CREATE_QUOTE rather than passing them through', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([
      { type: 'CREATE_QUOTE', fields: { origin: 'Toronto', destination: 'Lagos', supplierOfferId: 'sneaky-id-123', priceOverride: 1 } },
    ]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields.origin).toBe('Toronto')
    expect(body.actions[0].fields.supplierOfferId).toBeUndefined()
    expect(body.actions[0].fields.priceOverride).toBeUndefined()
  })

  it('clamps an out-of-range passenger count rather than accepting it', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'CREATE_QUOTE', fields: { passengers: 500 } }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields.passengers).toBeUndefined()
  })

  it('accepts a valid passenger count', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'CREATE_QUOTE', fields: { passengers: 2 } }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields.passengers).toBe(2)
  })

  it('truncates an overlong origin/destination string rather than rejecting the whole action', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'CREATE_QUOTE', fields: { origin: 'x'.repeat(500) } }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields.origin.length).toBeLessThanOrEqual(100)
  })

  it('only accepts a supported currency code', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'CREATE_QUOTE', fields: { currency: 'JPY' } }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields.currency).toBeUndefined()
  })

  it('VISA_FORM only carries destinationCountry/visaType', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([
      { type: 'VISA_FORM', fields: { destinationCountry: 'UK', visaType: 'visitor', internalNote: 'leak' } },
    ]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions[0].fields).toEqual({ destinationCountry: 'UK', visaType: 'visitor' })
  })
})

describe('response shape', () => {
  it('returns the identity resolution alongside actions for the UI to decide whether to prompt Link Client first', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.identityResolution).toBe('LINKED')
  })

  it('every returned action has requiresConfirmation: true — never auto-launched', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolActions([{ type: 'ITINERARY_REQUEST', fields: {} }]))
    const res = await POST(req({ recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.actions.every((a: { requiresConfirmation: boolean }) => a.requiresConfirmation === true)).toBe(true)
  })
})

describe('no-auto-execute structural guarantee', () => {
  it('the route module never imports any commercial-action creation code', () => {
    const fs = require('fs') as typeof import('fs')
    const src = fs.readFileSync(
      require.resolve('@/app/api/admin/inbox/conversations/[id]/jade-suggest-actions/route'),
      'utf8',
    )
    expect(src).not.toMatch(/payment-request\/route|visa\/route|itinerary-request\/route/)
    expect(src).not.toMatch(/action-centre\/visa-form|createVisaCase|mintVisaFormLink/)
    expect(src).not.toMatch(/quote\.create|quoteItem\.create/)
  })
})
