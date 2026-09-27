/**
 * P1 INCIDENT (2026-09-27) — "Jade not responding on WhatsApp" — route-level
 * regression coverage for app/api/chatwoot/bot/route.ts.
 *
 * Root cause of the incident itself was NOT a code bug: CHATWOOT_WEBHOOK_TOKEN
 * is missing from Vercel Production (confirmed via live 401s in production
 * runtime logs, a direct read of this route's own auth check, and this
 * session's project_inbox_0s_programme memory, which already flagged this
 * exact gap as "STILL OUTSTANDING" on 2026-09-18). No code change accompanies
 * this file — the fix is a configuration step only the owner can perform
 * (generate a shared secret, set it as the ?token= on BOTH Chatwoot's
 * outgoing webhook URLs — the AgentBot bot config AND the account webhook —
 * and set the same value as CHATWOOT_WEBHOOK_TOKEN in Vercel Production).
 *
 * What THIS file adds: `__tests__/inbox-0s4-webhook-security.test.ts` and
 * `__tests__/inbox-0s4-jade-lifecycle.test.ts` already pin this route's
 * *source text* (auth-check wording, dedupe-ordering, takeover/resume
 * wording) but neither ever imports or invokes the actual POST handler —
 * confirmed by grepping every test file for an import of this route module
 * (zero hits before this file). That means "does a correctly-configured
 * request actually make Jade reply exactly once, to the right conversation,
 * without duplicating on a retry or on a model failure" was never actually
 * exercised end-to-end. This file closes that gap using the same
 * import-the-real-POST-handler pattern __tests__/whatsapp-broadcast-v12.test.ts
 * already established for a different route (see its line ~129).
 */

const ORIGINAL_ENV = process.env

let capturedBackground: Promise<unknown> | null = null
jest.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => { capturedBackground = p },
}))

const sendReply = jest.fn(async () => ({}))
const handoffToHuman = jest.fn(async () => ({}))
const markAsRead = jest.fn(async () => ({}))
const updateContactMemory = jest.fn(async () => ({}))
let isLatestIncomingResult = true
let getConversationHistoryResult: Array<Record<string, unknown>> = []
let getConversationResult: Record<string, unknown> = { meta: { sender: { id: 1, name: 'Test Client', phone_number: '+2348011111111' } } }

jest.mock('@/lib/jade/chatwoot-client', () => ({
  getConversationHistory: jest.fn(async () => getConversationHistoryResult),
  sendReply: (...args: unknown[]) => sendReply(...args),
  handoffToHuman: (...args: unknown[]) => handoffToHuman(...args),
  getConversation: jest.fn(async () => getConversationResult),
  updateContactMemory: (...args: unknown[]) => updateContactMemory(...args),
  isLatestIncoming: jest.fn(async () => isLatestIncomingResult),
  markAsRead: (...args: unknown[]) => markAsRead(...args),
}))

jest.mock('@/lib/jade/tools', () => ({
  JADE_TOOLS: [],
  executeTool: jest.fn(async () => 'not used in this suite'),
}))

jest.mock('@/lib/jade/prompt', () => ({
  buildSystemPrompt: jest.fn(() => 'system prompt'),
}))

jest.mock('@/lib/jade/human-handoff', () => ({
  isExplicitHumanRequest: jest.fn(() => false),
  requestHumanHandoff: jest.fn(async () => ({ alreadyRequested: false })),
}))

let claimResult: 'claimed' | 'duplicate' | 'unavailable' = 'claimed'
jest.mock('@/lib/webhooks/idempotency', () => ({
  claimWebhookEvent: jest.fn(async () => claimResult),
}))

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: jest.fn(() => ({})),
}))

// Anthropic — module-scope `new Anthropic(...)` in the route means the mock
// class itself is what matters, not a per-call factory.
let anthropicReply: { text: string } | 'THROW' = { text: 'Sure, I can help with that! ✈️' }
const messagesCreate = jest.fn(async () => {
  if (anthropicReply === 'THROW') throw new Error('model unavailable')
  return {
    content: [{ type: 'text', text: anthropicReply.text }],
    stop_reason: 'end_turn',
  }
})
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: (...args: unknown[]) => messagesCreate(...args) },
  })),
}))

import { NextRequest } from 'next/server'

const TOKEN = 'test-shared-secret'

function chatwootPost(body: Record<string, unknown>, token: string | null = TOKEN) {
  const url = token
    ? `https://walz.test/api/chatwoot/bot?token=${token}`
    : 'https://walz.test/api/chatwoot/bot'
  return new NextRequest(new URL(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function incomingMessagePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'message_created',
    message_type: 'incoming',
    private: false,
    id: 5001,
    content: 'Hi, do you have flights to Dubai next month?',
    conversation: { id: 26001, status: 'open', channel: 'Channel::TwilioSms' },
    sender: { id: 1, name: 'Test Client', phone_number: '+2348011111111' },
    ...overrides,
  }
}

async function post(body: Record<string, unknown>, token: string | null = TOKEN) {
  const { POST } = await import('@/app/api/chatwoot/bot/route')
  const res = await POST(chatwootPost(body, token) as never)
  if (capturedBackground) await capturedBackground.catch(() => {})
  return res
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CHATWOOT_WEBHOOK_TOKEN: TOKEN, ANTHROPIC_API_KEY: 'test-key' }
  capturedBackground = null
  claimResult = 'claimed'
  isLatestIncomingResult = true
  anthropicReply = { text: 'Sure, I can help with that! ✈️' }
  getConversationHistoryResult = []
  getConversationResult = { meta: { sender: { id: 1, name: 'Test Client', phone_number: '+2348011111111' } } }
})

afterAll(() => { process.env = ORIGINAL_ENV })

describe('POST /api/chatwoot/bot — reproduces the P1 auth gap directly through the real route', () => {
  it('with NO CHATWOOT_WEBHOOK_TOKEN configured (today’s actual production state), the route 401s and Jade is never invoked — this is the exact incident', async () => {
    delete (process.env as Record<string, string | undefined>).CHATWOOT_WEBHOOK_TOKEN
    const res = await post(incomingMessagePayload())
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('a token that does not match the configured secret is also rejected — not just "unconfigured"', async () => {
    const res = await post(incomingMessagePayload(), 'wrong-token')
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/chatwoot/bot — once correctly configured, the happy path works exactly once', () => {
  it('a normal inbound WhatsApp message → Jade invoked exactly once → reply sent exactly once, to the conversation it came from', async () => {
    const res = await post(incomingMessagePayload({ conversation: { id: 26001, status: 'open', channel: 'Channel::TwilioSms' } }))
    expect(res.status).toBe(200)
    expect(messagesCreate).toHaveBeenCalledTimes(1)
    expect(sendReply).toHaveBeenCalledTimes(1)
    expect(sendReply).toHaveBeenCalledWith(26001, expect.any(String))
  })

  it('a message from a DIFFERENT Chatwoot inbox/conversation (Nigeria WhatsApp, inbox 27) still replies to ITS OWN conversation id — no cross-inbox leakage', async () => {
    const res = await post(incomingMessagePayload({
      id: 5002,
      conversation: { id: 27055, status: 'open', channel: 'Channel::TwilioSms' },
    }))
    expect(res.status).toBe(200)
    expect(sendReply).toHaveBeenCalledTimes(1)
    expect(sendReply).toHaveBeenCalledWith(27055, expect.any(String))
  })

  it('follow-up messages in the same conversation are folded into one Anthropic call with prior history as context', async () => {
    getConversationHistoryResult = [
      { message_type: 0, content: 'Hi', private: false },
      { message_type: 1, content: 'Hello! How can I help?', private: false, content_attributes: { jade_ai: true } },
    ]
    const res = await post(incomingMessagePayload({ content: 'Actually, what about Nairobi instead?' }))
    expect(res.status).toBe(200)
    expect(messagesCreate).toHaveBeenCalledTimes(1)
    const call = messagesCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    expect(call.messages.length).toBeGreaterThanOrEqual(2)
    expect(call.messages[call.messages.length - 1]).toMatchObject({ role: 'user', content: 'Actually, what about Nairobi instead?' })
  })
})

describe('POST /api/chatwoot/bot — duplicate delivery cannot produce a duplicate reply', () => {
  it('the SAME Chatwoot message id delivered twice (Chatwoot at-least-once retry) results in exactly one Jade reply, not two', async () => {
    const payload = incomingMessagePayload({ id: 5003 })

    const first = await post(payload)
    expect(first.status).toBe(200)
    expect(sendReply).toHaveBeenCalledTimes(1)

    // Simulate the ledger now reporting this event id as already claimed.
    claimResult = 'duplicate'
    const second = await post(payload)
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.skipped).toBe('duplicate')
    expect(sendReply).toHaveBeenCalledTimes(1) // still 1, not 2
    expect(messagesCreate).toHaveBeenCalledTimes(1) // Anthropic was never called a second time
  })
})

describe('POST /api/chatwoot/bot — provider failure fails in a controlled way, never duplicated', () => {
  it('when the model call throws, Jade sends exactly one fallback message and one human handoff — not a crash, not a duplicate, not silence', async () => {
    anthropicReply = 'THROW'
    const res = await post(incomingMessagePayload())
    expect(res.status).toBe(200) // the outer route already ACKed before the background work ran
    expect(sendReply).toHaveBeenCalledTimes(1)
    expect(sendReply).toHaveBeenCalledWith(26001, expect.stringContaining('glitch'))
    expect(handoffToHuman).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/chatwoot/bot — human takeover / resume (route-level, not just source-pinned)', () => {
  it('a conversation where a human already replied without the jade_ai marker silences Jade for this turn', async () => {
    getConversationHistoryResult = [
      { message_type: 0, content: 'Hi', private: false },
      { message_type: 1, content: 'This is Sarah from Walz, taking over from here', private: false, content_attributes: {} },
    ]
    const res = await post(incomingMessagePayload({ content: 'ok thanks' }))
    expect(res.status).toBe(200)
    expect(messagesCreate).not.toHaveBeenCalled()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('a conversation where the only prior outgoing messages are Jade’s own (jade_ai marker present) still replies normally', async () => {
    getConversationHistoryResult = [
      { message_type: 0, content: 'Hi', private: false },
      { message_type: 1, content: 'Hello! How can I help?', private: false, content_attributes: { jade_ai: true } },
    ]
    const res = await post(incomingMessagePayload({ content: 'What about hotels?' }))
    expect(res.status).toBe(200)
    expect(sendReply).toHaveBeenCalledTimes(1)
  })
})
