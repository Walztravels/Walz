/**
 * INBOX-0S.4A — Jade takeover/resume lifecycle regression protection.
 *
 * Written BEFORE the 0S.4 webhook security changes and kept green through
 * them: webhook authentication/idempotency work must not alter how Jade
 * is silenced or resumed. These pins encode PRODUCTION-INTENDED behavior:
 *
 *   status → 'pending'  = human takeover: Jade silenced (agentActive true,
 *                         markHandover, IG/FB Prisma silence)
 *   status → 'open'     = intentional resume: markResumed + the
 *                         "Welcome back — I'm Jade" client message
 *   human agent message = silences Jade and buffers the reply
 *   private note        = never mirrored, never silences, never triggers Jade
 *   Jade's own message  = never misread as a human takeover
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const hook = () => read('app/api/webhooks/chatwoot/route.ts')

describe('HUMAN TAKEOVER — status → pending silences Jade', () => {
  it('pending saves the session with agentActive true and marks the handover', () => {
    const s = hook()
    const pendingBranch = s.slice(s.indexOf("payload.status === 'pending'"), s.indexOf("payload.status === 'open'"))
    expect(pendingBranch).toContain('agentActive:         true')
    expect(pendingBranch).toContain('await markHandover(convKey)')
    // IG/FB leads silenced in Prisma too (takeovers before first reply)
    expect(pendingBranch).toContain('jadeSilencedAt: new Date(), jadeResumedAt: null')
  })
})

describe("HUMAN RESUME — status → open retains the intentional resume behavior", () => {
  it('open marks the session resumed, sends the welcome-back message, clears agentActive', () => {
    const s = hook()
    const openBranch = s.slice(s.indexOf("payload.status === 'open'"), s.indexOf('async function onConversationCreated'))
    expect(openBranch).toContain('await markResumed(convKey)')
    expect(openBranch).toContain("Welcome back — I'm Jade")
    expect(openBranch).toContain('agentActive: false')
  })
  it('the resume message goes out stamped as Jade (jade_ai), via the bot token path', () => {
    const s = hook()
    const send = s.slice(s.indexOf('async function cwSendMessage'), s.indexOf('export async function POST'))
    expect(send).toContain('content_attributes: { jade_ai: true }')
    expect(send).toContain('CHATWOOT_BOT_TOKEN')
  })
})

describe('AGENT MESSAGE — a genuine human outbound message silences Jade', () => {
  it('outgoing non-bot messages from a human write agentActive true and buffer the reply', () => {
    const s = hook()
    const branch = s.slice(s.indexOf('payload.message_type === 1'), s.indexOf('// Deduplicate by external_id'))
    expect(branch).toContain('agentActive:         true')
    expect(branch).toContain('agentMessages:       pendingMessages')
    expect(branch).toContain("jade_silenced_at")                    // legacy website path
    expect(branch).toContain('jadeSilencedAt: new Date(), jadeResumedAt: null')  // IG/FB Prisma path
  })
})

describe('PRIVATE NOTE — never mirrored, never silences, never reaches a client', () => {
  it('private messages exit onMessageCreated before ANY other handling', () => {
    const s = hook()
    const fn = s.slice(s.indexOf('async function onMessageCreated'))
    const privateGuard = fn.indexOf('if (payload.private) return')
    expect(privateGuard).toBeGreaterThan(-1)
    // The guard must precede routing, the human-agent silence block and mirroring.
    expect(privateGuard).toBeLessThan(fn.indexOf('routeConversation'))
    expect(privateGuard).toBeLessThan(fn.indexOf('payload.message_type === 1'))
    expect(privateGuard).toBeLessThan(fn.indexOf("from('messages')"))
  })
})

describe("JADE MESSAGE — Jade's own echo is never misidentified as a human takeover", () => {
  it('all three Jade identifications are checked before the silence path runs', () => {
    const s = hook()
    const branch = s.slice(s.indexOf('const isJade'), s.indexOf('// Deduplicate by external_id'))
    expect(branch).toContain("payload.sender?.type === 'agent_bot'")
    expect(branch).toContain('payload.content_attributes?.jade_ai === true')
    expect(branch).toContain('payload.sender?.id === JADE_AGENT_ID')
    // Jade-identified messages take the skip path, not the silence path.
    expect(branch).toContain('if (isJade)')
    expect(branch.indexOf('if (isJade)')).toBeLessThan(branch.indexOf('agentActive:         true'))
  })
  it('bot-typed senders are excluded before the human-agent branch is even entered', () => {
    expect(hook()).toContain("payload.message_type === 1 && payload.sender?.type !== 'bot'")
  })
})

describe('lifecycle storage helpers stay intact', () => {
  it('markHandover/markResumed still write handoverAt/resumedAt on JadeSession', () => {
    const s = read('lib/jade-session.ts')
    expect(s).toContain("update({ handoverAt: new Date().toISOString() })")
    expect(s).toContain("update({ resumedAt: new Date().toISOString() })")
  })
  it('the bot route still defers to humans via the jade_ai content-attribute test', () => {
    const s = read('app/api/chatwoot/bot/route.ts')
    expect(s).toContain('outgoing.some((m) => !m.content_attributes?.jade_ai)')
    expect(s).toContain('deferring — human agent has replied')
  })
})
