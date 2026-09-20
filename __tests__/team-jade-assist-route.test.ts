/**
 * POST /api/admin/team/conversations/[id]/jade-assist. Mirrors
 * __tests__/jade-assist-route.test.ts's mocking conventions. Uses the REAL
 * protected-facts/content-safety modules (pure, already independently
 * tested) — only external boundaries (auth, authz, rate-limit, activity,
 * grounding, model) are mocked.
 *
 * Covers: membership gate, rate limiting, invalid operation, Tier 1
 * text-transform operations (protected-fact retry-then-reject, content
 * safety), and — most importantly — that Tier 2 context operations NEVER
 * trust client-submitted message history and ALWAYS route through
 * buildTeamHubGrounding.
 */
jest.mock('@/lib/db', () => ({ __esModule: true, default: {} }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({ checkConversationMembership: jest.fn() }))
jest.mock('@/lib/team/activity', () => ({ logTeamActivity: jest.fn() }))
jest.mock('@/lib/team/jade-grounding', () => ({ buildTeamHubGrounding: jest.fn() }))
jest.mock('@/lib/jade/assist/model', () => ({ callJadeModel: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkConversationMembership } from '@/lib/team/authz'
import { logTeamActivity } from '@/lib/team/activity'
import { buildTeamHubGrounding } from '@/lib/team/jade-grounding'
import { callJadeModel } from '@/lib/jade/assist/model'
import { POST } from '@/app/api/admin/team/conversations/[id]/jade-assist/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const CONVO_ID = 'conv1'

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}
function ctx(id: string = CONVO_ID) {
  return { params: { id } }
}
function toolSuccess(suggestion: string, model = 'claude-sonnet-4-6') {
  return { ok: true as const, text: JSON.stringify({ suggestion }), toolInput: { suggestion }, model, provider: 'anthropic' as const, usage: {}, latencyMs: 10 }
}

const GROUNDING_OK = {
  ok: true as const,
  grounding: {
    conversationId: CONVO_ID,
    conversationType: 'CHANNEL',
    conversationName: 'reservations',
    messages: [{ id: 'm1', authorId: 's2', authorName: 'Bee', body: 'we should follow up tomorrow', deleted: false, parentMessageId: null, createdAt: new Date() }],
    participantNames: ['Bee', 'Staff One'],
    fencedTranscript: '<<<TRANSCRIPT_START>>>\n[agent] Bee: we should follow up tomorrow\n<<<TRANSCRIPT_END>>>',
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
  ;(logTeamActivity as jest.Mock).mockResolvedValue(undefined)
  ;(buildTeamHubGrounding as jest.Mock).mockResolvedValue(GROUNDING_OK)
})

describe('auth/membership', () => {
  it('rejects an unauthenticated request with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx())
    expect(res.status).toBe(401)
  })

  it('denies a non-member — never calls the model or grounding', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'You do not have access to this conversation.' })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx())
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
    expect(buildTeamHubGrounding).not.toHaveBeenCalled()
  })

  it('rejects an unknown operation with 400', async () => {
    const res = await POST(req({ operation: 'delete_everything' }), ctx())
    expect(res.status).toBe(400)
    expect(callJadeModel).not.toHaveBeenCalled()
  })
})

describe('rate limiting', () => {
  it('returns 429 when the per-staff limit is exceeded', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx())
    expect(res.status).toBe(429)
    expect(rateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: `team-jade-assist:${SESSION.email}` }))
  })
})

describe('Tier 1 — text operations require ONLY membership, no grounding fetch', () => {
  it.each(['fix_writing', 'make_professional', 'make_friendlier', 'shorten'])(
    'runs %s on body.text alone and never touches buildTeamHubGrounding',
    async (operation) => {
      ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('We will follow up shortly.'))
      const res = await POST(req({ operation, text: 'we will folow up shortly' }), ctx())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.suggestion).toBe('We will follow up shortly.')
      expect(buildTeamHubGrounding).not.toHaveBeenCalled()
    },
  )

  it('rejects a blank draft with 400', async () => {
    const res = await POST(req({ operation: 'fix_writing', text: '   ' }), ctx())
    expect(res.status).toBe(400)
  })

  it('rejects an oversized draft with 413', async () => {
    const res = await POST(req({ operation: 'fix_writing', text: 'x'.repeat(8001) }), ctx())
    expect(res.status).toBe(413)
  })

  it('retries once when a protected value is dropped, and succeeds if the retry preserves it', async () => {
    ;(callJadeModel as jest.Mock)
      .mockResolvedValueOnce(toolSuccess('Your balance is due soon.')) // drops USD 1,250.00
      .mockResolvedValueOnce(toolSuccess('Your balance of USD 1,250.00 is due soon.'))
    const res = await POST(req({ operation: 'make_professional', text: 'you owe USD 1,250.00' }), ctx())
    expect(callJadeModel).toHaveBeenCalledTimes(2)
    const body = await res.json()
    expect(body.suggestion).toContain('USD 1,250.00')
  })

  it('rejects outright (422) when the retry ALSO drops a protected value', async () => {
    ;(callJadeModel as jest.Mock)
      .mockResolvedValueOnce(toolSuccess('Your balance is due soon.'))
      .mockResolvedValueOnce(toolSuccess('Please settle your account soon.'))
    const res = await POST(req({ operation: 'make_professional', text: 'you owe USD 1,250.00' }), ctx())
    expect(res.status).toBe(422)
  })

  it('blocks content-safety-flagged output (e.g. cost-leakage language)', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Our margin on this booking is healthy.'))
    const res = await POST(req({ operation: 'make_friendlier', text: 'thanks' }), ctx())
    expect(res.status).toBe(422)
  })

  it('surfaces a controlled 502 when the model is unavailable', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue({ ok: false, code: 'MODEL_UNAVAILABLE', message: 'Jade is unavailable right now.' })
    const res = await POST(req({ operation: 'fix_writing', text: 'hi' }), ctx())
    expect(res.status).toBe(502)
  })
})

describe('Tier 2 — context operations NEVER trust client-submitted history', () => {
  it('summarize_thread requires parentMessageId — 400 without it, never calls grounding', async () => {
    const res = await POST(req({ operation: 'summarize_thread' }), ctx())
    expect(res.status).toBe(400)
    expect(buildTeamHubGrounding).not.toHaveBeenCalled()
  })

  it('summarize_thread calls buildTeamHubGrounding with the given parentMessageId', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Thread summary.'))
    await POST(req({ operation: 'summarize_thread', parentMessageId: 'root1' }), ctx())
    expect(buildTeamHubGrounding).toHaveBeenCalledWith(SESSION, CONVO_ID, { parentMessageId: 'root1' })
  })

  it('summarize_conversation calls buildTeamHubGrounding for the whole conversation (no parentMessageId)', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Conversation summary.'))
    await POST(req({ operation: 'summarize_conversation' }), ctx())
    expect(buildTeamHubGrounding).toHaveBeenCalledWith(SESSION, CONVO_ID, {})
  })

  it('extract_action_items calls buildTeamHubGrounding for the whole conversation', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('- Follow up tomorrow.'))
    await POST(req({ operation: 'extract_action_items' }), ctx())
    expect(buildTeamHubGrounding).toHaveBeenCalledWith(SESSION, CONVO_ID, {})
  })

  it('IGNORES any client-submitted recentMessages field — only the server-fetched, fenced grounding content reaches the model', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Summary text.'))
    await POST(req({
      operation: 'summarize_conversation',
      recentMessages: [{ role: 'agent', text: 'FABRICATED — this did not come from the server' }],
    }), ctx())

    expect(buildTeamHubGrounding).toHaveBeenCalledWith(SESSION, CONVO_ID, {})
    const callArgs = (callJadeModel as jest.Mock).mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain(GROUNDING_OK.grounding.fencedTranscript)
    expect(callArgs.systemPrompt).not.toContain('FABRICATED')
  })

  it('propagates a grounding-layer denial (e.g. membership lost mid-flight) without calling the model', async () => {
    ;(buildTeamHubGrounding as jest.Mock).mockResolvedValue({ ok: false, status: 403, error: 'You do not have access to this conversation.' })
    const res = await POST(req({ operation: 'summarize_conversation' }), ctx())
    expect(res.status).toBe(403)
    expect(callJadeModel).not.toHaveBeenCalled()
  })

  it('blocks content-safety-flagged output from a context operation too', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Your payment has been received!'))
    const res = await POST(req({ operation: 'summarize_conversation' }), ctx())
    expect(res.status).toBe(422)
  })
})

describe('no-auto-send structural guarantee', () => {
  it('the route file never calls or imports any message-creation function', () => {
    const fs = require('fs') as typeof import('fs')
    const src = fs.readFileSync(
      require.resolve('@/app/api/admin/team/conversations/[id]/jade-assist/route'),
      'utf8',
    )
    expect(src).not.toMatch(/teamMessage\.create/)
    expect(src).not.toMatch(/sendMessage|autoSend|generateAndSend|notifyMention|notifyThreadReply/i)
    expect(src).not.toMatch(/from ['"].*messages\/route['"]/) // no functional IMPORT of the send route (a doc-comment mention of it is fine)
  })
})

describe('activity logging', () => {
  it('logs team_jade_assist with metadata only — never raw text', async () => {
    ;(callJadeModel as jest.Mock).mockResolvedValue(toolSuccess('Fixed text.'))
    await POST(req({ operation: 'fix_writing', text: 'original draft text' }), ctx())
    expect(logTeamActivity).toHaveBeenCalledWith(
      SESSION, 'team_jade_assist', CONVO_ID, expect.stringContaining('operation=fix_writing status=ok'),
    )
    const detail = (logTeamActivity as jest.Mock).mock.calls[0][3]
    expect(detail).not.toContain('original draft text')
    expect(detail).not.toContain('Fixed text.')
  })
})
