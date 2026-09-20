/**
 * POST /api/admin/team/conversations/[id]/jade-prepare-client-reply.
 * Covers the cross-product LOGICAL AND authorization (Team Hub membership
 * AND Inbox conversation access — either failing denies the whole
 * request), grounding wiring, content-safety blocking, and the structural
 * no-auto-send regression check for BOTH products.
 */
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({ checkConversationMembership: jest.fn() }))
jest.mock('@/lib/inbox/authz', () => ({ checkConversationAccess: jest.fn() }))
jest.mock('@/lib/team/activity', () => ({ logTeamActivity: jest.fn() }))
jest.mock('@/lib/team/jade-grounding', () => ({ buildTeamHubGrounding: jest.fn() }))
jest.mock('@/lib/jade/assist/model', () => ({ callJadeModel: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkConversationMembership } from '@/lib/team/authz'
import { checkConversationAccess } from '@/lib/inbox/authz'
import { logTeamActivity } from '@/lib/team/activity'
import { buildTeamHubGrounding } from '@/lib/team/jade-grounding'
import { callJadeModel } from '@/lib/jade/assist/model'
import { POST } from '@/app/api/admin/team/conversations/[id]/jade-prepare-client-reply/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const TEAM_CONVO_ID = 'teamconv1'
const INBOX_CONVO_ID = 42

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string = TEAM_CONVO_ID) {
  return { params: { id } }
}
function toolSuccess(suggestion: string, model = 'claude-sonnet-4-6') {
  return { ok: true as const, text: JSON.stringify({ suggestion }), toolInput: { suggestion }, model, provider: 'anthropic' as const, usage: {}, latencyMs: 10 }
}

const GROUNDING_OK = {
  ok: true as const,
  grounding: {
    conversationId: TEAM_CONVO_ID,
    conversationType: 'CHANNEL',
    conversationName: 'reservations',
    messages: [],
    participantNames: ['Staff One'],
    fencedTranscript: '<<<TRANSCRIPT_START>>>\n[agent] Staff One: client wants a refund\n<<<TRANSCRIPT_END>>>',
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
  ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
  ;(logTeamActivity as jest.Mock).mockResolvedValue(undefined)
  ;(buildTeamHubGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
})

describe('auth', () => {
  it('rejects an unauthenticated request with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(401)
  })

  it('rejects a missing/invalid inboxConversationId with 400', async () => {
    for (const bad of [undefined, 'not-a-number', 0, -1, 1.5]) {
      const res = await POST(req({ inboxConversationId: bad as never }), ctx())
      expect(res.status).toBe(400)
    }
    expect(checkConversationMembership).not.toHaveBeenCalled()
  })
})

describe('cross-product LOGICAL AND authorization', () => {
  it('DENIES when Team Hub membership fails, even though Inbox access would succeed', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
    expect(buildTeamHubGrounding).not.toHaveBeenCalled()
  })

  it('DENIES when Inbox access fails, even though Team Hub membership would succeed', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'You do not have access to this conversation.' })
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
    expect(buildTeamHubGrounding).not.toHaveBeenCalled()
  })

  it('DENIES when BOTH fail', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(403)
  })

  it('ALLOWS only when BOTH succeed, checking each independently with the right identifiers', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Thanks for reaching out — we will confirm this for you shortly.'))
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(200)
    expect(checkConversationMembership).toHaveBeenCalledWith(SESSION, TEAM_CONVO_ID)
    expect(checkConversationAccess).toHaveBeenCalledWith(SESSION, String(INBOX_CONVO_ID))
  })
})

describe('rate limiting', () => {
  it('returns 429 when the per-staff limit is exceeded', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(429)
  })
})

describe('grounding wiring', () => {
  it('passes an optional teamMessageId through to buildTeamHubGrounding as parentMessageId', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('draft'))
    await POST(req({ inboxConversationId: INBOX_CONVO_ID, teamMessageId: 'root1' }), ctx())
    expect(buildTeamHubGrounding).toHaveBeenCalledWith(SESSION, TEAM_CONVO_ID, { parentMessageId: 'root1' })
  })

  it('omits parentMessageId when teamMessageId is not given (whole-conversation grounding)', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('draft'))
    await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(buildTeamHubGrounding).toHaveBeenCalledWith(SESSION, TEAM_CONVO_ID, { parentMessageId: undefined })
  })

  it('propagates a grounding-layer denial without calling the model', async () => {
    ;(buildTeamHubGrounding as jest.Mock).mockResolvedValue({ ok: false, status: 403, error: 'You do not have access to this conversation.' })
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
  })

  it('feeds the fenced grounding transcript into the model prompt', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('draft'))
    await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    const callArgs = (callJadeModel as jest.Mock).mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain(GROUNDING_OK.grounding.fencedTranscript)
  })
})

describe('output safety', () => {
  it('blocks content-safety-flagged output (e.g. cost-leakage language) before returning it', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Our margin on this booking is healthy.'))
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(422)
  })

  it('blocks an unsafe fabricated confirmation', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Great news — your payment has been received!'))
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(422)
  })

  it('surfaces a controlled 502 when the model is unavailable', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue({ ok: false, code: 'MODEL_UNAVAILABLE', message: 'Jade is unavailable right now.' })
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(res.status).toBe(502)
  })

  it('returns exactly {suggestion} on success', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Thanks for your patience — we will confirm shortly.'))
    const res = await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    const body = await res.json()
    expect(body).toEqual({ suggestion: 'Thanks for your patience — we will confirm shortly.' })
  })
})

describe('no-auto-send structural guarantee (both products)', () => {
  it('the route file never calls or imports any Team Hub or Inbox message-send function', () => {
    const fs = require('fs') as typeof import('fs')
    const src = fs.readFileSync(
      require.resolve('@/app/api/admin/team/conversations/[id]/jade-prepare-client-reply/route'),
      'utf8',
    )
    expect(src).not.toMatch(/teamMessage\.create/)
    expect(src).not.toMatch(/sendMessage|autoSend|generateAndSend|notifyMention|notifyThreadReply/i)
    expect(src).not.toMatch(/from ['"].*client-reply-handoff['"]/) // writePendingClientDraft is browser-only — never imported/called server-side (a doc-comment mention of its name is fine)
    expect(src).not.toMatch(/from ['"].*messages\/route['"]/) // no functional IMPORT of the send route (a doc-comment mention of it is fine)
    expect(src).not.toMatch(/chatwoot.*reply|reply.*chatwoot/i)
  })
})

describe('activity logging', () => {
  it('logs team_jade_prepare_client_reply with metadata only — never raw text', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('drafted client reply text'))
    await POST(req({ inboxConversationId: INBOX_CONVO_ID }), ctx())
    expect(logTeamActivity).toHaveBeenCalledWith(
      SESSION, 'team_jade_prepare_client_reply', TEAM_CONVO_ID, expect.stringContaining('status=ok'),
    )
    const detail = (logTeamActivity as jest.Mock).mock.calls[0][3]
    expect(detail).not.toContain('drafted client reply text')
  })
})
