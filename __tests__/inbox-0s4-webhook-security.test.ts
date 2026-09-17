/**
 * INBOX-0S.4 — Webhook authentication & idempotency.
 *
 * Unit tests exercise the real crypto (HMAC vectors computed here with
 * node:crypto) and the idempotency ledger against a stub client; source
 * pins prove the routes are wired to them, fail closed, keep retries
 * duplicate-safe, and no longer log payloads or secrets.
 */

import { createHmac } from 'crypto'
import fs from 'fs'
import path from 'path'

import {
  verifyChatwootRequest, verifyMetaSignature, verifyTwilioSignature,
  externalWebhookUrl, maskId,
} from '@/lib/webhooks/verify'
import { claimWebhookEvent, releaseWebhookEvent } from '@/lib/webhooks/idempotency'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Chatwoot ─────────────────────────────────────────────────────────────────

describe('Chatwoot webhook verification', () => {
  const base = { rawBody: '{"event":"message_created"}', headerToken: null, queryToken: null, headerSig: null }

  it('FAILS CLOSED: no secret configured → unconfigured, never accepted', () => {
    expect(verifyChatwootRequest({ ...base, tokenSecret: undefined, hmacSecret: undefined })).toBe('unconfigured')
    expect(verifyChatwootRequest({ ...base, tokenSecret: '  ', hmacSecret: '' })).toBe('unconfigured')
  })

  it('valid token accepted via query param or header', () => {
    expect(verifyChatwootRequest({ ...base, queryToken: 's3cret', tokenSecret: 's3cret', hmacSecret: undefined })).toBe('ok')
    expect(verifyChatwootRequest({ ...base, headerToken: 's3cret', tokenSecret: 's3cret', hmacSecret: undefined })).toBe('ok')
  })

  it('a WRONG token is invalid — it no longer falls through to allow', () => {
    expect(verifyChatwootRequest({ ...base, headerToken: 'wrong', tokenSecret: 's3cret', hmacSecret: undefined })).toBe('invalid')
    expect(verifyChatwootRequest({ ...base, tokenSecret: 's3cret', hmacSecret: undefined })).toBe('invalid')  // absent token
  })

  it('HMAC signature verifies against the raw body', () => {
    const secret = 'hmac-secret'
    const sig = 'sha256=' + createHmac('sha256', secret).update(base.rawBody).digest('hex')
    expect(verifyChatwootRequest({ ...base, headerSig: sig, tokenSecret: undefined, hmacSecret: secret })).toBe('ok')
    expect(verifyChatwootRequest({ ...base, headerSig: sig.replace(/.$/, '0'), tokenSecret: undefined, hmacSecret: secret })).toBe('invalid')
    expect(verifyChatwootRequest({ ...base, rawBody: base.rawBody + ' ', headerSig: sig, tokenSecret: undefined, hmacSecret: secret })).toBe('invalid')
  })

  it('the AgentBot endpoint fails closed too — token verified before the body is read (0S.4A review)', () => {
    const s = read('app/api/chatwoot/bot/route.ts')
    expect(s).toContain('verifyChatwootRequest')
    expect(s).toContain("req.nextUrl.searchParams.get(\"token\")")
    expect(s).toContain('failing closed')
    expect(s).toContain('{ status: 401 }')
    // auth precedes body parse and every side effect
    expect(s.indexOf('verifyChatwootRequest({')).toBeLessThan(s.indexOf('req.json()'))
    expect(s.indexOf('verifyChatwootRequest({')).toBeLessThan(s.indexOf('claimWebhookEvent(', s.indexOf('export async function POST')))
  })

  it('the meta GET handshake no longer logs verify-token characters', () => {
    const s = read('app/api/webhooks/meta/route.ts')
    expect(s).not.toContain("token?.slice(0, 6)")
    expect(s).toContain('tokenPresent')
  })

  it('the route rejects unconfigured/invalid with 401 and never logs the raw body', () => {
    const s = read('app/api/webhooks/chatwoot/route.ts')
    expect(s).toContain("verifyChatwootRequest")
    expect(s).toContain("failing closed")
    expect(s).toContain("{ status: 401 }")
    expect(s).not.toContain('return true // no secret configured')
    expect(s).not.toContain('rawBody.slice(0, 2000)')
    expect(s).not.toMatch(/console\.\w+\([^)]*rawBody/)
  })
})

// ── Meta ─────────────────────────────────────────────────────────────────────

describe('Meta signature verification', () => {
  const body = JSON.stringify({ object: 'instagram', entry: [] })
  const secret = 'meta-app-secret'
  const good = 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')

  it('valid X-Hub-Signature-256 accepted; tampered body or signature rejected', () => {
    expect(verifyMetaSignature(body, good, secret)).toBe(true)
    expect(verifyMetaSignature(body + ' ', good, secret)).toBe(false)
    expect(verifyMetaSignature(body, good.replace(/.$/, '0'), secret)).toBe(false)
    expect(verifyMetaSignature(body, null, secret)).toBe(false)
    expect(verifyMetaSignature(body, 'sha1=abc', secret)).toBe(false)
    expect(verifyMetaSignature(body, good, '')).toBe(false)
  })

  it.each([
    ['app/api/webhooks/meta/route.ts', 'META_APP_SECRET'],
    ['app/api/webhooks/whatsapp/route.ts', 'WHATSAPP_APP_SECRET'],
  ])('%s enforces the signature and fails closed on a missing secret', (file, envName) => {
    const s = read(file)
    expect(s).toContain('verifyMetaSignature')
    expect(s).toContain("x-hub-signature-256")
    expect(s).toContain(envName)
    expect(s).toContain('failing closed')
    expect(s).toContain("{ status: 503 }")   // missing secret
    expect(s).toContain("{ status: 401 }")   // invalid signature
  })

  it('GET verification is preserved on both Meta-family webhooks', () => {
    expect(read('app/api/webhooks/meta/route.ts')).toContain('META_VERIFY_TOKEN')
    expect(read('app/api/webhooks/whatsapp/route.ts')).toContain('WHATSAPP_WEBHOOK_SECRET')
  })

  it('the full webhook body is never logged', () => {
    const meta = read('app/api/webhooks/meta/route.ts')
    expect(meta).not.toContain('JSON.stringify(body, null, 2)')
    expect(meta).not.toContain('JSON.stringify(msg)')
  })
})

// ── Twilio ───────────────────────────────────────────────────────────────────

describe('Twilio signature verification', () => {
  const authToken = 'tw-auth-token'
  const url = 'https://www.walztravels.com/api/webhooks/twilio-whatsapp'
  const params = { From: 'whatsapp:+2348012345678', Body: 'Hello', MessageSid: 'SM123' }
  const sign = (u: string, p: Record<string, string>) =>
    createHmac('sha1', authToken).update(u + Object.keys(p).sort().map(k => k + p[k]).join(''), 'utf8').digest('base64')

  it('valid signature accepted; tampered params, URL or token rejected', () => {
    expect(verifyTwilioSignature(url, params, sign(url, params), authToken)).toBe(true)
    expect(verifyTwilioSignature(url, { ...params, Body: 'changed' }, sign(url, params), authToken)).toBe(false)
    expect(verifyTwilioSignature(url + '?x=1', params, sign(url, params), authToken)).toBe(false)
    expect(verifyTwilioSignature(url, params, sign(url, params), 'other-token')).toBe(false)
    expect(verifyTwilioSignature(url, params, null, authToken)).toBe(false)
    expect(verifyTwilioSignature(url, params, sign(url, params), '')).toBe(false)
  })

  it('the external URL comes from configuration first, forwarded headers second — never guessed', () => {
    const headers = new Map([['x-forwarded-host', 'www.walztravels.com'], ['x-forwarded-proto', 'https']])
    const h = { get: (n: string) => headers.get(n) ?? null }
    expect(externalWebhookUrl('https://configured.example/hook', h, '/x')).toBe('https://configured.example/hook')
    expect(externalWebhookUrl(undefined, h, '/api/webhooks/twilio-whatsapp'))
      .toBe('https://www.walztravels.com/api/webhooks/twilio-whatsapp')
    expect(externalWebhookUrl(undefined, { get: () => null }, '/x')).toBeNull()
  })

  it.each([
    'app/api/webhooks/twilio-whatsapp/route.ts',
    'app/api/webhooks/twilio-whatsapp/status/route.ts',
  ])('%s verifies X-Twilio-Signature and fails closed without an auth token', (file) => {
    const s = read(file)
    expect(s).toContain('verifyTwilioSignature')
    expect(s).toContain('x-twilio-signature')
    expect(s).toContain('failing closed')
    expect(s).toContain("{ status: 403 }")
  })
})

// ── Idempotency ledger ───────────────────────────────────────────────────────

type Row = { provider: string; event_id: string }
function stubSupabase(seed: Row[] = [], failWith?: string) {
  const rows = [...seed]
  return {
    rows,
    from(_t: string) {
      return {
        upsert(v: Record<string, unknown>, _o: { onConflict: string; ignoreDuplicates: boolean }) {
          return {
            select: async (_c: string) => {
              if (failWith) return { data: null, error: { message: failWith } }
              const exists = rows.some(r => r.provider === v.provider && r.event_id === v.event_id)
              if (exists) return { data: [], error: null }
              rows.push({ provider: v.provider as string, event_id: v.event_id as string })
              return { data: [{ id: rows.length }], error: null }
            },
          }
        },
        delete() {
          return {
            eq: (_c1: string, p: string) => ({
              eq: async (_c2: string, e: string) => {
                const i = rows.findIndex(r => r.provider === p && r.event_id === e)
                if (i >= 0) rows.splice(i, 1)
                return { error: null }
              },
            }),
          }
        },
      }
    },
  }
}

describe('webhook idempotency ledger', () => {
  it('an identical provider message delivered twice yields one claim, one record', async () => {
    const db = stubSupabase()
    expect(await claimWebhookEvent(db, 'meta', 'mid.123')).toBe('claimed')
    expect(await claimWebhookEvent(db, 'meta', 'mid.123')).toBe('duplicate')
    expect(db.rows).toHaveLength(1)
  })

  it('concurrent duplicate attempts cannot both claim (unique key decides one winner)', async () => {
    const db = stubSupabase()
    const results = await Promise.all([
      claimWebhookEvent(db, 'chatwoot', 'cw_msg_9'),
      claimWebhookEvent(db, 'chatwoot', 'cw_msg_9'),
    ])
    expect(results.filter(r => r === 'claimed')).toHaveLength(1)
    expect(db.rows).toHaveLength(1)
  })

  it('providers are separate namespaces; release makes a retry claimable again', async () => {
    const db = stubSupabase()
    expect(await claimWebhookEvent(db, 'meta', 'id1')).toBe('claimed')
    expect(await claimWebhookEvent(db, 'twilio', 'id1')).toBe('claimed')
    await releaseWebhookEvent(db, 'meta', 'id1')
    expect(await claimWebhookEvent(db, 'meta', 'id1')).toBe('claimed')
  })

  it('a missing ledger degrades to unavailable — traffic is never blocked on the migration', async () => {
    const db = stubSupabase([], 'relation "webhook_events" does not exist')
    expect(await claimWebhookEvent(db, 'meta', 'x')).toBe('unavailable')
  })
})

// ── Route idempotency wiring ─────────────────────────────────────────────────

describe('retries cannot duplicate messages or Jade replies', () => {
  it('chatwoot claims the message id BEFORE routing/silencing side effects', () => {
    const s = read('app/api/webhooks/chatwoot/route.ts')
    const fn = s.slice(s.indexOf('async function onMessageCreated'))
    const claim = fn.indexOf('claimWebhookEvent')
    expect(claim).toBeGreaterThan(-1)
    expect(claim).toBeLessThan(fn.indexOf('routeConversation'))
    expect(claim).toBeLessThan(fn.indexOf('payload.message_type === 1'))
    // and the mirror insert is DB-conflict-safe via unique-violation handling
    // (a PARTIAL unique index cannot be an ON CONFLICT arbiter via PostgREST)
    expect(fn).toContain("mirrorErr.code !== '23505'")
    expect(fn).not.toContain("onConflict: 'external_id'")
  })

  it("a duplicate 'open' status event cannot re-send the welcome-back message", () => {
    const s = read('app/api/webhooks/chatwoot/route.ts')
    const openBranch = s.slice(s.indexOf("payload.status === 'open'"), s.indexOf('async function onConversationCreated'))
    expect(openBranch).toContain('session.agentActive !== true) return')
    expect(openBranch.indexOf('agentActive !== true')).toBeLessThan(openBranch.indexOf('cwSendMessage'))
  })

  it('meta claims each mid before processing and releases the claim on failure (retry-safe 500)', () => {
    const s = read('app/api/webhooks/meta/route.ts')
    expect(s).toContain('claimWebhookEvent')
    expect(s).toContain('releaseWebhookEvent')
    expect(s).toContain('messaging.message.mid')
    expect(s).toContain('msg.id ?? msg.mid')
    expect(s).toContain("{ status: 500 }")
    expect(s.indexOf('claimWebhookEvent')).toBeLessThan(s.indexOf('handleFacebookMessage(messaging)'))
  })

  it('twilio dedupes by MessageSid with a P2002 backstop, and 500s only transient failures', () => {
    const s = read('app/api/webhooks/twilio-whatsapp/route.ts')
    expect(s).toContain('twilioSid: waSid')
    expect(s).toContain("'P2002'")
    expect(s).toContain("{ status: 500 }")
    expect(s.indexOf('duplicate MessageSid skipped')).toBeLessThan(s.indexOf('routeInboundWhatsApp('))
  })

  it('whatsapp cloud gates the Jade reply on winning the insert race (23505 = lost)', () => {
    const s = read('app/api/webhooks/whatsapp/route.ts')
    expect(s).toContain("insErr.code !== '23505'")
    expect(s).not.toContain("onConflict: 'external_id'")
    expect(s).toContain('if (!inserted?.length) continue')
    expect(s.indexOf('if (!inserted?.length) continue')).toBeLessThan(s.indexOf('maybeJadeReply'))
  })

  it('unread counts use the atomic RPC (with pre-migration fallback), not blind read-modify-write', () => {
    for (const f of ['app/api/webhooks/chatwoot/route.ts', 'app/api/webhooks/whatsapp/route.ts']) {
      const s = read(f)
      expect(s).toContain("rpc('increment_lead_unread'")
    }
  })

  it('round-robin assignment is compare-and-swap, not read-then-write', () => {
    const s = read('lib/conversation-router.ts')
    expect(s).toContain(".eq('roundRobinPosition', next.roundRobinPosition)")
    expect(s).toContain("select('id')")
  })
})

// ── Log hygiene ──────────────────────────────────────────────────────────────

describe('webhook logs carry no payloads, secrets, or bare identifiers', () => {
  const FILES = [
    'app/api/webhooks/chatwoot/route.ts',
    'app/api/webhooks/meta/route.ts',
    'app/api/webhooks/whatsapp/route.ts',
    'app/api/webhooks/twilio-whatsapp/route.ts',
    'app/api/webhooks/twilio-whatsapp/status/route.ts',
    'lib/webhooks/verify.ts',
    'lib/webhooks/idempotency.ts',
  ]
  it('no secret or token value is ever interpolated into a log', () => {
    for (const f of FILES) {
      const s = read(f)
      // No console call may interpolate a secret-bearing expression.
      expect(s).not.toMatch(/console\.\w+\([^)]*(SECRET|TOKEN)\s*[}\)]?\s*[,+]?[^)]*\$\{/)
      expect(s).not.toMatch(/console\.\w+\([^)]*process\.env\./)
    }
  })
  it('phone numbers and PSIDs are masked in chatwoot webhook diagnostics', () => {
    const s = read('app/api/webhooks/chatwoot/route.ts')
    expect(s).toContain('maskId(senderPhone)')
    expect(s).toContain('maskId(phoneNorm)')
    expect(s).toContain('maskId(igSourceId)')
  })
  it('maskId keeps only a 4-char tail', () => {
    expect(maskId('+2348012345678')).toBe('…5678')
    expect(maskId('abc')).toBe('****')
    expect(maskId(null)).toBe('(none)')
  })
})
