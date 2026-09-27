/**
 * P1 INCIDENT (2026-09-27) — "Jade not responding on WhatsApp" — route-level
 * regression coverage for app/api/chatwoot/bot/route.ts.
 *
 * TWO fixes landed for this incident, in order:
 *  1. First diagnosis: CHATWOOT_WEBHOOK_TOKEN was missing from Vercel
 *     Production, so this route's (then) bearer-token check always failed
 *     closed.
 *  2. Second, corrected diagnosis (this file): the bearer-token check was
 *     ALWAYS the wrong mechanism — Chatwoot's real Agent Bot "Webhook
 *     Secret" signs each request with HMAC-SHA256 over
 *     `${timestamp}.${rawBody}`, sent as X-Chatwoot-Signature/
 *     X-Chatwoot-Timestamp/X-Chatwoot-Delivery headers. It was never going
 *     to send a literal token value no matter what env var held it. The
 *     route now verifies Chatwoot's actual documented signature contract
 *     (lib/webhooks/verify.ts) via CHATWOOT_AGENTBOT_WEBHOOK_SECRET, and no
 *     longer accepts ?token=/x-chatwoot-token at all for this endpoint.
 *
 * This file mounts the REAL POST handler (matching the precedent already
 * established in __tests__/whatsapp-broadcast-v12.test.ts) and signs every
 * fixture request exactly the way Chatwoot documents, rather than trusting
 * a shortcut — no test here depends on the retired ?token= mechanism.
 */

import { createHmac } from 'crypto'

const ORIGINAL_ENV = process.env
const SECRET = 'jade-agentbot-webhook-secret-for-tests'

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

/** Signs a raw body exactly the way Chatwoot documents: sha256=HMAC(secret, `${ts}.${rawBody}`). */
function sign(secret: string, rawBody: string, ts: number) {
  return 'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
}

type SignOpts = { secret?: string | null; tsOffsetSeconds?: number; tamperBodyAfterSigning?: boolean; omitSignature?: boolean; omitTimestamp?: boolean }

function chatwootPost(payload: Record<string, unknown>, opts: SignOpts = {}) {
  const rawBody = JSON.stringify(payload)
  const ts = Math.floor(Date.now() / 1000) + (opts.tsOffsetSeconds ?? 0)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.secret !== null) {
    const sig = sign(opts.secret ?? SECRET, rawBody, ts)
    if (!opts.omitSignature) headers['x-chatwoot-signature'] = sig
    if (!opts.omitTimestamp) headers['x-chatwoot-timestamp'] = String(ts)
    headers['x-chatwoot-delivery'] = 'test-delivery-id'
  }
  const sentBody = opts.tamperBodyAfterSigning ? rawBody + ' ' : rawBody
  return new NextRequest(new URL('https://walz.test/api/chatwoot/bot'), {
    method: 'POST',
    headers,
    body: sentBody,
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

async function post(body: Record<string, unknown>, opts: SignOpts = {}) {
  const { POST } = await import('@/app/api/chatwoot/bot/route')
  const res = await POST(chatwootPost(body, opts) as never)
  if (capturedBackground) await capturedBackground.catch(() => {})
  return res
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CHATWOOT_AGENTBOT_WEBHOOK_SECRET: SECRET, ANTHROPIC_API_KEY: 'test-key' }
  delete (process.env as Record<string, string | undefined>).CHATWOOT_WEBHOOK_TOKEN
  capturedBackground = null
  claimResult = 'claimed'
  isLatestIncomingResult = true
  anthropicReply = { text: 'Sure, I can help with that! ✈️' }
  getConversationHistoryResult = []
  getConversationResult = { meta: { sender: { id: 1, name: 'Test Client', phone_number: '+2348011111111' } } }
})

afterAll(() => { process.env = ORIGINAL_ENV })

describe('POST /api/chatwoot/bot — auth: real Chatwoot signature verification, no ?token= fallback', () => {
  it('with NO CHATWOOT_AGENTBOT_WEBHOOK_SECRET configured, the route 401s and Jade is never invoked', async () => {
    delete (process.env as Record<string, string | undefined>).CHATWOOT_AGENTBOT_WEBHOOK_SECRET
    const res = await post(incomingMessagePayload())
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('a request signed with the WRONG secret is rejected', async () => {
    const res = await post(incomingMessagePayload(), { secret: 'not-the-real-secret' })
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('a body modified in transit after signing is rejected', async () => {
    const res = await post(incomingMessagePayload(), { tamperBodyAfterSigning: true })
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('a timestamp modified after signing is rejected — a stale replay of a past signature cannot be re-dated', async () => {
    // Sign with a valid, in-window timestamp, but the request that actually
    // arrives claims a DIFFERENT (still in-window) one — the signature no
    // longer matches the claimed signed material.
    const rawBody = JSON.stringify(incomingMessagePayload())
    const trueTs = Math.floor(Date.now() / 1000)
    const sig = sign(SECRET, rawBody, trueTs)
    const req = new NextRequest(new URL('https://walz.test/api/chatwoot/bot'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatwoot-signature': sig,
        'x-chatwoot-timestamp': String(trueTs + 5),
      },
      body: rawBody,
    })
    const { POST } = await import('@/app/api/chatwoot/bot/route')
    const res = await POST(req as never)
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('a missing signature header is rejected', async () => {
    const res = await post(incomingMessagePayload(), { omitSignature: true })
    expect(res.status).toBe(401)
  })

  it('a missing timestamp header is rejected even with an otherwise-correct signature', async () => {
    const res = await post(incomingMessagePayload(), { omitTimestamp: true })
    expect(res.status).toBe(401)
  })

  it('an expired timestamp (outside the 5-minute replay window) is rejected even with a correctly-computed signature', async () => {
    const res = await post(incomingMessagePayload(), { tsOffsetSeconds: -10 * 60 })
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('a malformed signature header is rejected safely, not with a crash', async () => {
    const req = new NextRequest(new URL('https://walz.test/api/chatwoot/bot'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-chatwoot-signature': 'not-a-real-signature',
        'x-chatwoot-timestamp': String(Math.floor(Date.now() / 1000)),
      },
      body: JSON.stringify(incomingMessagePayload()),
    })
    const { POST } = await import('@/app/api/chatwoot/bot/route')
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('the retired ?token= query parameter is now completely ignored — a request with only a token and no signature is rejected', async () => {
    const rawBody = JSON.stringify(incomingMessagePayload())
    const req = new NextRequest(new URL(`https://walz.test/api/chatwoot/bot?token=${SECRET}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    })
    const { POST } = await import('@/app/api/chatwoot/bot/route')
    const res = await POST(req as never)
    expect(res.status).toBe(401)
    expect(messagesCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/chatwoot/bot — once correctly signed, the happy path works exactly once', () => {
  it('a normal inbound WhatsApp message, correctly signed → Jade invoked exactly once → reply sent exactly once, to the conversation it came from', async () => {
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
  it('the SAME Chatwoot message id delivered twice (Chatwoot at-least-once retry), each independently signed, results in exactly one Jade reply, not two', async () => {
    const payload = incomingMessagePayload({ id: 5003 })

    const first = await post(payload)
    expect(first.status).toBe(200)
    expect(sendReply).toHaveBeenCalledTimes(1)

    // Simulate the ledger now reporting this event id as already claimed —
    // a genuine Chatwoot retry would arrive as a freshly-signed request
    // (new timestamp/signature) for the SAME underlying message id.
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

describe('POST /api/chatwoot/bot — human handoff policy is unchanged by this patch', () => {
  it('a conversation where a human already replied without the jade_ai marker silences Jade for this turn (open/human takeover)', async () => {
    getConversationHistoryResult = [
      { message_type: 0, content: 'Hi', private: false },
      { message_type: 1, content: 'This is Sarah from Walz, taking over from here', private: false, content_attributes: {} },
    ]
    const res = await post(incomingMessagePayload({ content: 'ok thanks' }))
    expect(res.status).toBe(200)
    expect(messagesCreate).not.toHaveBeenCalled()
    expect(sendReply).not.toHaveBeenCalled()
  })

  it('a conversation where the only prior outgoing messages are Jade’s own (jade_ai marker present) still replies normally (pending / Jade may resume)', async () => {
    getConversationHistoryResult = [
      { message_type: 0, content: 'Hi', private: false },
      { message_type: 1, content: 'Hello! How can I help?', private: false, content_attributes: { jade_ai: true } },
    ]
    const res = await post(incomingMessagePayload({ content: 'What about hotels?' }))
    expect(res.status).toBe(200)
    expect(sendReply).toHaveBeenCalledTimes(1)
  })
})
