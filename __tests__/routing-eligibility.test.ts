/**
 * Assignment-integrity P1 (2026-09-18) — regression protection.
 *
 * The owner's TEST identity ("Michael"/Walz Admin, Chatwoot agent id 1)
 * received live conversations through the escalation system even with
 * RoutingAgent.active=false (conversation #483, escalation cron,
 * 2026-09-18 08:00Z — log-proven). These tests pin the explicit
 * non-routable identity rule and both fixed selection paths.
 */

import fs from 'fs'
import path from 'path'

import { isAutoAssignable, nonRoutableAgentIds } from '@/lib/inbox/assignable'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const router = () => read('lib/conversation-router.ts')
const cron = () => read('app/api/cron/routing-escalation/route.ts')

describe('non-routable identity rule (explicit — never depends on active=false)', () => {
  const OLD_ENV = process.env.CHATWOOT_NON_ROUTABLE_AGENT_IDS
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.CHATWOOT_NON_ROUTABLE_AGENT_IDS
    else process.env.CHATWOOT_NON_ROUTABLE_AGENT_IDS = OLD_ENV
  })

  it('Michael (id 1) and the Jade bot (id 5) are never auto-assignable — even with no env set', () => {
    delete process.env.CHATWOOT_NON_ROUTABLE_AGENT_IDS
    expect(isAutoAssignable(1)).toBe(false)
    expect(isAutoAssignable(5)).toBe(false)
  })

  it('real staff agent ids pass', () => {
    for (const id of [3, 4, 8]) expect(isAutoAssignable(id)).toBe(true)
  })

  it('the env csv EXTENDS the exclusion set and can never re-enable a default', () => {
    process.env.CHATWOOT_NON_ROUTABLE_AGENT_IDS = '9, 12'
    expect(isAutoAssignable(9)).toBe(false)
    expect(isAutoAssignable(12)).toBe(false)
    expect(isAutoAssignable(1)).toBe(false)   // default still excluded
    expect(nonRoutableAgentIds().has(5)).toBe(true)
  })

  it('null/invalid ids are not assignable', () => {
    expect(isAutoAssignable(null)).toBe(false)
    expect(isAutoAssignable(undefined)).toBe(false)
    expect(isAutoAssignable(0)).toBe(false)
    expect(isAutoAssignable(-1)).toBe(false)
  })
})

describe('normal routing never selects Michael', () => {
  it('the round-robin pool filters through isAutoAssignable', () => {
    const s = router()
    const pool = s.slice(s.indexOf('async function getActiveRoutingAgents'), s.indexOf('async function getEscalationAgents'))
    expect(pool).toContain('isAutoAssignable(a.chatwootAgentId)')
  })

  it("Glory/Anita/Priscilla routing is untouched: the pool's base query and CAS bump are byte-identical", () => {
    const s = router()
    // base query unchanged
    expect(s).toContain(".eq('active', true)")
    expect(s).toContain(".eq('isEscalation', false)")
    expect(s).toContain(".order('roundRobinPosition', { ascending: true })")
    // CAS round-robin unchanged (also pinned by the 0S.4 suite)
    expect(s).toContain(".eq('roundRobinPosition', next.roundRobinPosition)")
    expect(s).toContain('roundRobinPosition: next.roundRobinPosition + agents.length')
    // specialism / whatsapp branches unchanged
    expect(s).toContain('getAgentBySpecialism')
  })
})

describe('escalation routing never selects Michael', () => {
  it('getEscalationAgents now requires active=true AND filters non-routable identities', () => {
    const s = router()
    const esc = s.slice(s.indexOf('async function getEscalationAgents'), s.indexOf('async function getNextRoundRobin'))
    expect(esc).toContain(".eq('isEscalation', true)")
    expect(esc).toContain(".eq('active', true)")
    expect(esc).toContain('isAutoAssignable(a.chatwootAgentId)')
  })

  it('the final applyRouting guard blocks ANY non-routable decision before the assignment POST', () => {
    const s = router()
    const guard = s.indexOf('blocked automatic assignment to non-routable agent id')
    const post = s.indexOf('/assignments')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(post)
    expect(s).toContain('dec = { ...dec, chatwootId: null }')   // conversation left unassigned
  })
})

describe('escalation cron never assigns to Michael', () => {
  it('the cron selects only eligible escalation agents (active + auto-assignable)', () => {
    const s = cron()
    expect(s).toContain(".eq('active', true)")
    expect(s).toContain('find(a => isAutoAssignable(a.chatwootAgentId))')
    expect(s).not.toContain('find(a => a.chatwootAgentId)')   // the defective selector is gone
  })

  it('no eligible escalation target → note preserved, NO_ELIGIBLE_ESCALATION_AGENT emitted, no reassignment', () => {
    const s = cron()
    const note = s.indexOf('Escalation: This conversation has been unattended')
    const signal = s.indexOf('NO_ELIGIBLE_ESCALATION_AGENT')
    const assignPost = s.indexOf('/assignments')
    expect(note).toBeGreaterThan(-1)              // escalation evidence still posted
    expect(signal).toBeGreaterThan(-1)            // operational signal
    expect(note).toBeLessThan(signal)             // note happens regardless of eligibility
    expect(signal).toBeLessThan(assignPost)       // the skip branch precedes the POST
    // the POST remains guarded on an eligible agent
    expect(s).toContain('if (esc?.chatwootAgentId) {')
  })
})

describe('empty pools leave the conversation Unassigned (no fallback identity)', () => {
  it('routeConversation still returns null when no agents exist, and callers no-op on null', () => {
    const s = router()
    expect(s).toContain('return null')
    const webhook = read('app/api/webhooks/chatwoot/route.ts')
    expect(webhook).toContain('if (decision)')                     // webhook caller no-ops
    const handoff = read('lib/jade/human-handoff.ts')
    expect(handoff).toContain('if (dec')                           // handoff caller no-ops
  })
})

describe('deliberate manual assignment is preserved', () => {
  it('the staff assign endpoint does not consult the non-routable rule', () => {
    const s = read('app/api/admin/conversations/[id]/assign/route.ts')
    expect(s).not.toContain('isAutoAssignable')
    expect(s).toContain('validateAssigneeId(body.assignee_id)')    // existing gate unchanged
  })
})
