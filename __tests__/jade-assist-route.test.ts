/**
 * V1.4 — POST /api/admin/inbox/conversations/[id]/jade-assist. Covers the
 * required test matrix: auth/RBAC, rate limiting, invalid operation, each
 * text-transform operation, protected-fact retry-then-reject, content-safety
 * blocking, draft_reply/summarize grounding wiring, and identity-gate
 * propagation. Uses the REAL protected-facts/content-safety/pii-preflight/
 * context-fence modules (pure, already independently tested) — only
 * external boundaries (auth, authz, rate-limit, db, grounding, model) are
 * mocked.
 */
const mockPrisma = { activityLog: { create: jest.fn() } }
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/inbox/authz', () => ({ checkInboxPermission: jest.fn(), checkConversationAccess: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/jade/assist/grounding', () => ({
  buildConversationGrounding: jest.fn(),
  renderGroundingBlock: jest.fn(() => 'AUTHORITATIVE SYSTEM FACTS (server-verified): mocked'),
}))
jest.mock('@/lib/jade/assist/model', () => ({ callJadeModel: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { rateLimit } from '@/lib/rate-limit'
import { buildConversationGrounding } from '@/lib/jade/assist/grounding'
import { callJadeModel } from '@/lib/jade/assist/model'
import { POST } from '@/app/api/admin/inbox/conversations/[id]/jade-assist/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff Member', permissions: {} }

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string) {
  return { params: { id } }
}
function toolSuccess(suggestion: string, model = 'claude-sonnet-4-6') {
  return { ok: true as const, text: JSON.stringify({ suggestion }), toolInput: { suggestion }, model, provider: 'anthropic' as const, usage: {}, latencyMs: 10 }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: true })
  ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
  mockPrisma.activityLog.create.mockResolvedValue({})
})

describe('auth/RBAC', () => {
  it('rejects an unauthenticated request with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('42'))
    expect(res.status).toBe(401)
  })

  it('rejects a staff member lacking inbox_reply for a text operation', async () => {
    ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: false, status: 403, error: 'You do not have permission to do this.' })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('42'))
    expect(res.status).toBe(403)
    expect(checkInboxPermission).toHaveBeenCalledWith(SESSION, 'inbox_reply')
  })

  it('gates summarize on inbox_view (read-only), not inbox_reply', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue({
      ok: true, grounding: { conversationId: 42, identity: { resolution: 'UNRESOLVED', clientDisplayName: null }, quote: { exists: false }, payment: { exists: false }, visa: { exists: false }, itineraryRequest: { exists: false }, facts: [] },
    })
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Summary text'))
    await POST(req({ operation: 'summarize' }), ctx('42'))
    expect(checkInboxPermission).toHaveBeenCalledWith(SESSION, 'inbox_view')
  })

  it('enforces conversation access (IDOR protection) — denies a conversation the staff cannot access', async () => {
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'You do not have access to this conversation.' })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('999'))
    expect(res.status).toBe(403)
    expect(checkConversationAccess).toHaveBeenCalledWith(SESSION, '999')
  })

  it('rejects a malformed conversation id before doing any work', async () => {
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('not-a-number'))
    expect(res.status).toBe(400)
    expect(callJadeModel).not.toHaveBeenCalled()
  })
})

describe('rate limiting', () => {
  it('returns 429 when the per-staff limit is exceeded, reusing lib/rate-limit.ts', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('42'))
    expect(res.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: `jade-assist:${SESSION.email}` }))
  })
})

describe('input validation', () => {
  it('rejects an unknown operation', async () => {
    const res = await POST(req({ operation: 'delete_everything', text: 'hi' }), ctx('42'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_OPERATION')
  })

  it('rejects a blank composer for a text operation', async () => {
    const res = await POST(req({ operation: 'fix_writing', text: '   ' }), ctx('42'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('EMPTY_INPUT')
  })

  it('rejects text over the length ceiling', async () => {
    const res = await POST(req({ operation: 'fix_writing', text: 'x'.repeat(9000) }), ctx('42'))
    expect(res.status).toBe(413)
  })

  it('rejects translate with no target language', async () => {
    const res = await POST(req({ operation: 'translate', text: 'hello' }), ctx('42'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_LANGUAGE')
  })
})

describe('text operations', () => {
  it.each(['fix_writing', 'professionalize', 'friendly', 'formal', 'shorten', 'clarify'])(
    'runs %s and returns the model suggestion when protected facts are preserved',
    async (operation) => {
      ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('We received your document and will review it shortly.'))
      const res = await POST(req({ operation, text: 'we recieve your document we will check it' }), ctx('42'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.operation).toBe(operation)
      expect(body.protectedFactsPreserved).toBe(true)
    },
  )

  it('translate passes the target language into the operation instruction', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Bonjour, merci pour votre message.'))
    await POST(req({ operation: 'translate', text: 'Hello, thanks for your message.', targetLanguage: 'French' }), ctx('42'))
    const callArgs = (callJadeModel as jest.Mock).mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('French')
  })

  it('preserves a currency amount and reference across a rewrite', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Your outstanding balance is USD 1,250.00 for quote WT-Q-1.'))
    const res = await POST(req({ operation: 'professionalize', text: 'you owe USD 1,250.00 for quote WT-Q-1 pls pay' }), ctx('42'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.suggestion).toContain('USD 1,250.00')
    expect(body.suggestion).toContain('WT-Q-1')
  })

  it('retries once when a protected value is dropped, and succeeds if the retry preserves it', async () => {
    ;(callJadeModel as jest.Mock)
      .mockResolvedValueOnce(toolSuccess('Your balance is due soon.')) // drops USD 1,250.00
      .mockResolvedValueOnce(toolSuccess('Your balance of USD 1,250.00 is due soon.')) // retry preserves it
    const res = await POST(req({ operation: 'professionalize', text: 'you owe USD 1,250.00' }), ctx('42'))
    expect(callJadeModel).toHaveBeenCalledTimes(2)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.suggestion).toContain('USD 1,250.00')
    // The retry prompt must explicitly call out what was mismatched.
    const retryCallArgs = (callJadeModel as jest.Mock).mock.calls[1][0]
    expect(retryCallArgs.systemPrompt).toMatch(/protected value/i)
  })

  it('rejects outright (never silently accepts) when the retry ALSO drops a protected value', async () => {
    ;(callJadeModel as jest.Mock)
      .mockResolvedValueOnce(toolSuccess('Your balance is due soon.'))
      .mockResolvedValueOnce(toolSuccess('Please settle your account soon.'))
    const res = await POST(req({ operation: 'professionalize', text: 'you owe USD 1,250.00' }), ctx('42'))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('PROTECTED_FACT_MISMATCH')
  })

  it('blocks content containing cost-leakage language before it is ever returned', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Our margin on this booking is healthy, thanks for asking.'))
    const res = await POST(req({ operation: 'professionalize', text: 'thanks for asking' }), ctx('42'))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('CONTENT_SAFETY_BLOCKED')
  })

  it('blocks an unsafe payment/booking confirmation the model fabricated', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Great news — your payment has been received!'))
    const res = await POST(req({ operation: 'friendly', text: 'thanks' }), ctx('42'))
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('CONTENT_SAFETY_BLOCKED')
  })

  it('surfaces a controlled error when the model is unavailable, without throwing', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue({ ok: false, code: 'MODEL_UNAVAILABLE', message: 'Jade is unavailable right now.' })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('42'))
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('MODEL_UNAVAILABLE')
  })
})

describe('draft_reply and summarize (context operations)', () => {
  const GROUNDING_OK = {
    ok: true as const,
    grounding: {
      conversationId: 42,
      identity: { resolution: 'LINKED' as const, clientDisplayName: 'Aduke' },
      quote: { exists: false }, payment: { exists: true, status: 'pending', amount: 'GBP 1,250.00' },
      visa: { exists: false }, itineraryRequest: { exists: false },
      facts: [{ source: 'AUTHORITATIVE_SYSTEM_FACT' as const, label: 'Payment status', value: 'pending — GBP 1,250.00' }],
    },
  }

  it('propagates a client-identity gate failure from the grounding layer rather than bypassing it', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue({ ok: false, status: 403, error: 'Verify the client identity first.' })
    const res = await POST(req({ operation: 'draft_reply', recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
  })

  it('includes the fenced transcript and the grounding block in the system prompt for draft_reply', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess("Thanks for letting us know — the payment is still showing as pending on our side, so we'll verify it for you."))
    const res = await POST(req({
      operation: 'draft_reply',
      recentMessages: [{ role: 'client', text: 'I already paid!' }],
    }), ctx('42'))
    expect(res.status).toBe(200)
    const callArgs = (callJadeModel as jest.Mock).mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('AUTHORITATIVE SYSTEM FACTS')
    expect(callArgs.systemPrompt).toContain('<<<TRANSCRIPT_START>>>')
    expect(callArgs.systemPrompt).toContain('I already paid')
  })

  it('redacts a card number from the transcript before it reaches the model (PII preflight)', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Thanks, we will follow up.'))
    await POST(req({
      operation: 'draft_reply',
      recentMessages: [{ role: 'client', text: 'my card is 4111111111111111 please charge it' }],
    }), ctx('42'))
    const callArgs = (callJadeModel as jest.Mock).mock.calls[0][0]
    expect(callArgs.systemPrompt).not.toContain('4111111111111111')
    expect(callArgs.systemPrompt).toContain('[redacted: card number]')
  })

  it('returns grounding usage metadata reflecting what was actually available', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('draft text'))
    const res = await POST(req({ operation: 'draft_reply', recentMessages: [] }), ctx('42'))
    const body = await res.json()
    expect(body.grounding.usedClientContext).toBe(true)
    expect(body.grounding.usedPaymentState).toBe(true)
    expect(body.grounding.usedQuoteState).toBe(false)
  })

  it('summarize does NOT apply the protected-fact comparison (no original text exists to compare against)', async () => {
    ;(buildConversationGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Client wants: a flight quote.\nCurrent status: pending payment.'))
    const res = await POST(req({ operation: 'summarize', recentMessages: [] }), ctx('42'))
    expect(res.status).toBe(200)
    expect(callJadeModel).toHaveBeenCalledTimes(1) // no retry path for summarize
  })
})

describe('no-auto-send structural guarantee', () => {
  it('the route module never imports the message-send handler', () => {
    const fs = require('fs') as typeof import('fs')
    const src = fs.readFileSync(
      require.resolve('@/app/api/admin/inbox/conversations/[id]/jade-assist/route'),
      'utf8',
    )
    expect(src).not.toMatch(/conversations\/\[id\]\/reply/)
    expect(src).not.toMatch(/sendMessage|sendReply|generateAndSend|autoSend/i)
  })
})

describe('activity logging', () => {
  it('logs a jade_fix_writing event with metadata only — never raw text', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Fixed text.'))
    await POST(req({ operation: 'fix_writing', text: 'original text here' }), ctx('42'))
    const call = mockPrisma.activityLog.create.mock.calls[0][0]
    expect(call.data.action).toBe('jade_fix_writing')
    expect(call.data.entityId).toBe('42')
    expect(call.data.detail).not.toContain('original text here')
    expect(call.data.detail).not.toContain('Fixed text.')
  })

  it('maps friendly/formal to the shared jade_tone_transform event', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Warmer text.'))
    await POST(req({ operation: 'friendly', text: 'hi' }), ctx('42'))
    expect(mockPrisma.activityLog.create.mock.calls[0][0].data.action).toBe('jade_tone_transform')
  })

  it('does not fail the request if the activity log write itself fails', async () => {
    mockPrisma.activityLog.create.mockRejectedValue(new Error('db down'))
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Fixed text.'))
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx('42'))
    expect(res.status).toBe(200)
  })
})
