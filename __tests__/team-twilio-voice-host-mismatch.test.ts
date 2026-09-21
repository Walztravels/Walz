/**
 * P1 REGRESSION — Team Hub calling "application error" incident
 * (owner-authenticated acceptance test, 2026-09-20 ~22:43 UTC, deployment
 * dde17deb93f160620b18ff3869a9db2d93a11605 / dpl_9CjUnYSazr94jd5gtUMRnzpXpzU9).
 *
 * Unlike __tests__/team-twilio-route.test.ts (which mocks @/lib/webhooks/verify
 * entirely to isolate the route's OWN authorization logic), this file uses the
 * REAL, unmocked verifyTwilioSignature/externalWebhookUrl — because the actual
 * incident lives in the interaction between those two functions and the known
 * walztravels.com (apex) → www.walztravels.com 308 redirect configured in
 * next.config.mjs's redirects(), NOT in the route's own DB/membership checks
 * (which are separately and thoroughly covered elsewhere).
 *
 * Root cause (config, not code — see the P1 incident report for full detail):
 *   - app/api/team/twilio/token/route.ts's own header comment instructs
 *     configuring the Team Hub TwiML Application's Voice Request URL to the
 *     APEX host (https://walztravels.com/api/team/twilio/voice).
 *   - next.config.mjs unconditionally 308-redirects that apex host to
 *     www.walztravels.com for EVERY path, including this webhook.
 *   - TWILIO_TEAMHUB_WEBHOOK_URL (which would pin the exact URL used for
 *     signature verification) is optional and — as far as this session could
 *     verify locally — not set anywhere, so lib/webhooks/verify's
 *     externalWebhookUrl() falls back to reconstructing the URL from
 *     x-forwarded-host, which reflects whatever host the request actually
 *     arrived on (www, post-redirect) — NOT the apex host Twilio's signature
 *     was computed against.
 *   - Twilio's own generic "We are sorry, an application error has occurred"
 *     (rather than this app's own "This call could not be connected" TwiML)
 *     is consistent with Twilio never receiving valid TwiML at all — exactly
 *     what happens when the apex redirect intercepts the request before this
 *     route ever runs, or when it does run but signature verification fails
 *     closed as reproduced below.
 *
 * This file proves:
 *   1. TODAY, with TWILIO_TEAMHUB_WEBHOOK_URL unset, a real Twilio-signed
 *      request signed against the apex URL fails signature verification
 *      when it arrives (post-redirect) presenting www as the forwarded host
 *      — reproducing the exact "invalid or missing X-Twilio-Signature"
 *      rejection this session found in production runtime logs.
 *   2. Pinning TWILIO_TEAMHUB_WEBHOOK_URL to the SAME host Twilio actually
 *      signs against (i.e., once the Twilio Console's Voice Request URL is
 *      corrected to www, per the incident report's required config change)
 *      makes verification succeed and produces valid <Dial>/<Conference>
 *      TwiML for both the DM and GROUP flows.
 *
 * No code in lib/webhooks/verify.ts or app/api/team/twilio/voice/route.ts is
 * changed by this fix — both already fail closed correctly today. The gap is
 * purely in what URL Twilio was told to call vs. what this app is told (or
 * left to guess) to verify against.
 */

import { createHmac } from 'crypto'

jest.mock('@/lib/db', () => {
  const mockPrisma = {
    staff: { findUnique: jest.fn() },
    teamConversation: { findUnique: jest.fn() },
    teamConversationMember: { findFirst: jest.fn() },
    teamCallRecord: { findFirst: jest.fn() },
  }
  return { __esModule: true, default: mockPrisma, prisma: mockPrisma, __mockPrisma: mockPrisma }
})

import { POST as voicePost } from '@/app/api/team/twilio/voice/route'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockPrisma: mockPrisma } = jest.requireMock('@/lib/db') as {
  __mockPrisma: {
    staff: { findUnique: jest.Mock }
    teamConversation: { findUnique: jest.Mock }
    teamConversationMember: { findFirst: jest.Mock }
    teamCallRecord: { findFirst: jest.Mock }
  }
}

const AUTH_TOKEN = 'test-team-hub-auth-token'
const APEX_VOICE_URL = 'https://walztravels.com/api/team/twilio/voice'
const WWW_VOICE_URL  = 'https://www.walztravels.com/api/team/twilio/voice'

/** Twilio's own signing algorithm (HMAC-SHA1 of url + sorted-concatenated params, base64) — mirrors __tests__/inbox-0s4-webhook-security.test.ts's helper exactly. */
function twilioSign(url: string, params: Record<string, string>): string {
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('')
  return createHmac('sha1', AUTH_TOKEN).update(data, 'utf8').digest('base64')
}

function realVoiceReq(
  fields: Record<string, string>,
  signedAgainstUrl: string,
  forwardedHost: string,
): Parameters<typeof voicePost>[0] {
  const body = new URLSearchParams(fields).toString()
  const signature = twilioSign(signedAgainstUrl, fields)
  const headers = new Map<string, string>([
    ['x-twilio-signature', signature],
    ['x-forwarded-host', forwardedHost],
    ['x-forwarded-proto', 'https'],
  ])
  return {
    text: async () => body,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
  } as unknown as Parameters<typeof voicePost>[0]
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, TWILIO_AUTH_TOKEN: AUTH_TOKEN }
  delete process.env.TWILIO_TEAMHUB_WEBHOOK_URL
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('P1 REPRODUCTION — Team Hub voice webhook, apex-vs-www host mismatch', () => {
  const DM_FIELDS = { From: 'client:staff-caller1', CalleeStaffId: 'callee1', ConversationId: 'conv-dm-1', CallRecordId: 'call-dm-1' }

  beforeEach(() => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.staff.findUnique
      .mockResolvedValueOnce({ id: 'caller1', isActive: true })
      .mockResolvedValueOnce({ id: 'callee1', isActive: true })
    mockPrisma.teamConversationMember.findFirst
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ id: 'm2' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ participantIds: ['callee1'] })
  })

  it('REPRODUCES THE INCIDENT: fails closed when Twilio signs against the apex URL (per the token route\'s own setup instructions) but the request is reconstructed against www (the redirect target in next.config.mjs) because TWILIO_TEAMHUB_WEBHOOK_URL is unset', async () => {
    expect(process.env.TWILIO_TEAMHUB_WEBHOOK_URL).toBeUndefined()

    const req = realVoiceReq(DM_FIELDS, APEX_VOICE_URL, 'www.walztravels.com')
    const res = await voicePost(req)
    const body = await res.text()

    // Exactly what this session found in production runtime logs for this
    // deployment: 200 OK with the generic fail-closed TwiML, never a <Dial>.
    expect(res.status).toBe(200)
    expect(body).toContain('This call could not be connected')
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
    // The mismatch is caught at signature verification — DB/membership logic
    // (already covered exhaustively elsewhere) never even runs.
    expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('CONFIRMS THE FIX: succeeds once TWILIO_TEAMHUB_WEBHOOK_URL is pinned to the SAME host Twilio actually signs against (i.e., once the Twilio Console Voice Request URL is corrected to www)', async () => {
    process.env.TWILIO_TEAMHUB_WEBHOOK_URL = WWW_VOICE_URL

    // Forwarded host is irrelevant once the URL is pinned by config — Twilio
    // now signs against the same, correctly-configured www URL.
    const req = realVoiceReq(DM_FIELDS, WWW_VOICE_URL, 'www.walztravels.com')
    const res = await voicePost(req)
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('<Dial>')
    expect(body).toContain('<Identity>staff-callee1</Identity>')
  })

  it('the apex URL itself would ALSO work end-to-end if Twilio, the pinned env var, and the actual traffic host were all consistently apex — proving the bug is host CONSISTENCY, not "apex is inherently wrong"', async () => {
    process.env.TWILIO_TEAMHUB_WEBHOOK_URL = APEX_VOICE_URL
    const req = realVoiceReq(DM_FIELDS, APEX_VOICE_URL, 'walztravels.com')
    const res = await voicePost(req)
    const body = await res.text()

    expect(body).toContain('<Dial>')
  })
})

describe('P1 REPRODUCTION — GROUP/CHANNEL conference flow, same host-consistency requirement', () => {
  const GROUP_FIELDS = { From: 'client:staff-caller2', ConversationId: 'conv-group-1', CallRecordId: 'call-group-1' }

  beforeEach(() => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'GROUP' })
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 'caller2', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ conferenceName: 'teamhub-conf-room' })
  })

  it('REPRODUCES THE INCIDENT for a group call too: apex-signed request verified against a www-reconstructed URL fails closed, never reaching <Conference>', async () => {
    const req = realVoiceReq(GROUP_FIELDS, APEX_VOICE_URL, 'www.walztravels.com')
    const res = await voicePost(req)
    const body = await res.text()

    expect(body).toContain('This call could not be connected')
    expect(body).not.toContain('<Conference')
    expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('CONFIRMS THE FIX for group calls: succeeds once TWILIO_TEAMHUB_WEBHOOK_URL matches the host Twilio actually signs against', async () => {
    process.env.TWILIO_TEAMHUB_WEBHOOK_URL = WWW_VOICE_URL
    const req = realVoiceReq(GROUP_FIELDS, WWW_VOICE_URL, 'www.walztravels.com')
    const res = await voicePost(req)
    const body = await res.text()

    expect(body).toContain('<Conference')
    expect(body).toContain('teamhub-conf-room')
  })
})

/**
 * P1 ROOT-CAUSE FOLLOW-UP — the apex→www redirect never let Twilio's request
 * reach app code at all.
 *
 * A second investigation pass pulled real Vercel runtime logs for this exact
 * deployment (dpl_9CjUnYSazr94jd5gtUMRnzpXpzU9) across the full incident day.
 * Two things stood out:
 *   1. `next.config.mjs`'s compiled `.next/routes-manifest.json` shows the
 *      three host-conditioned redirects (walztravels.us / www.walztravels.us
 *      / walztravels.com → www.walztravels.com) as static, regex-matched
 *      entries with `statusCode: 308` — the form Vercel's platform documents
 *      compiling `next.config.js` redirects into and serving from its
 *      edge/CDN layer, in front of both Next.js Middleware and any
 *      serverless/edge function.
 *   2. Runtime logs for the ENTIRE deployment across the whole day contain
 *      zero 308-status log lines and exactly one /api/team/twilio/voice
 *      invocation total (the apex-vs-www signature mismatch reproduced
 *      above, at ~22:43 UTC) — despite /api/team/twilio/token succeeding
 *      multiple times afterwards, which only happens after a staff member
 *      opens the dialer and would normally be followed by a voice-webhook
 *      call. No such follow-up call ever reached the app. That is exactly
 *      what "the edge 308s the apex request and Twilio never gets usable
 *      TwiML back" looks like from the inside: no function trace, because
 *      no function ran.
 *
 * Fix: `next.config.mjs`'s three host-conditioned redirect sources changed
 * from '/:path*' (matches every path, API routes included) to
 * '/:path((?!api/).*)' — Next's own documented pattern
 * (vercel.com/docs/routing/redirects/configuration-redirects) for carving a
 * prefix out of a redirect. This test compiles that exact source string with
 * Next's OWN bundled path-to-regexp (next/dist/compiled/path-to-regexp) —
 * the same compiler Next uses when it builds routes-manifest.json — so it
 * proves the real routing behavior, not just an assumption about the regex.
 */
describe('P1 FIX — apex→www redirect no longer swallows /api/** (next.config.mjs)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pathToRegexp } = require('next/dist/compiled/path-to-regexp') as {
    pathToRegexp: (source: string) => RegExp
  }

  type HostRedirect = {
    source: string
    has?: Array<{ type: string; value?: string }>
    destination: string
    permanent?: boolean
  }

  let hostRedirects: HostRedirect[]

  beforeAll(() => {
    // next.config.mjs is a real ESM module; ts-jest compiles this test file
    // to CommonJS, and TypeScript's own downlevel of a top-level `import()`
    // under `module: commonjs` routes through Jest's require(), which
    // refuses to load ESM. Spawning a plain `node -e` subprocess that does a
    // genuine dynamic import sidesteps that entirely — this is the SAME
    // next.config.mjs file, actually imported and actually executed, not a
    // reimplementation of it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execFileSync } = require('child_process') as typeof import('child_process')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { pathToFileURL } = require('url') as typeof import('url')

    const configUrl = pathToFileURL(path.resolve(__dirname, '../next.config.mjs')).href
    const script = `
      import(${JSON.stringify(configUrl)}).then(async (mod) => {
        const all = await mod.default.redirects()
        const hostRedirects = all.filter((r) => (r.has || []).some((h) => h.type === 'host'))
        process.stdout.write(JSON.stringify(hostRedirects))
      }).catch((e) => { console.error(e); process.exit(1) })
    `
    const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })
    hostRedirects = JSON.parse(out)
  })

  it('found exactly the three apex/legacy-domain → www host redirects this incident concerns', () => {
    expect(hostRedirects).toHaveLength(3)
    const hosts = hostRedirects.map((r) => r.has?.[0]?.value).sort()
    expect(hosts).toEqual(['walztravels.com', 'walztravels.us', 'www.walztravels.us'])
    for (const r of hostRedirects) {
      expect(r.destination).toBe('https://www.walztravels.com/:path*')
      expect(r.permanent).toBe(true)
    }
  })

  it.each(hostConditionsForTest())(
    'the %s → www redirect no longer matches /api/team/twilio/voice or /api/team/twilio/token',
    (hostValue) => {
      const rule = hostRedirects.find((r) => r.has?.[0]?.value === hostValue)!
      const regex = pathToRegexp(rule.source)
      expect(regex.test('/api/team/twilio/voice')).toBe(false)
      expect(regex.test('/api/team/twilio/token')).toBe(false)
      expect(regex.test('/api/admin/quotes/123')).toBe(false)
      expect(regex.test('/api/webhooks/twilio-whatsapp')).toBe(false)
    },
  )

  it.each(hostConditionsForTest())(
    'the %s → www redirect STILL matches ordinary page routes (canonicalization is preserved)',
    (hostValue) => {
      const rule = hostRedirects.find((r) => r.has?.[0]?.value === hostValue)!
      const regex = pathToRegexp(rule.source)
      expect(regex.test('/')).toBe(true)
      expect(regex.test('/hotels')).toBe(true)
      expect(regex.test('/admin/team')).toBe(true)
      expect(regex.test('/blog/some-post')).toBe(true)
    },
  )

  function hostConditionsForTest(): string[] {
    return ['walztravels.com', 'walztravels.us', 'www.walztravels.us']
  }
})
