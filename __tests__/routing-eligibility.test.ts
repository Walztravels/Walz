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

describe('escalation cron never reassigns anyone — automatic reassignment disabled (approved policy, 2026-09-18)', () => {
  // SLA policy update: the cron's original 30-minute auto-reassignment
  // (which is what put Michael on conversation #483 in the first place) is
  // no longer a guarded selection — it has been removed outright. Notify
  // only through 30/60/90/120 minutes; ownership never changes here.
  it('the cron never calls the Chatwoot /assignments endpoint at all', () => {
    const s = cron()
    // A code comment is allowed to mention the endpoint by name (explaining
    // why it's no longer called) — what must be absent is an actual fetch()
    // call built against that URL shape, or the request body it needs.
    expect(s).not.toMatch(/fetch\(\s*`[^`]*\/assignments/)
    expect(s).not.toContain('assignee_id')
  })

  it('the cron no longer selects, fetches, or reasons about escalation agents for reassignment purposes', () => {
    const s = cron()
    expect(s).not.toContain("from('RoutingAgent')")
    expect(s).not.toContain('find(a => isAutoAssignable(a.chatwootAgentId))')
    expect(s).not.toContain('find(a => a.chatwootAgentId)')   // the original defective selector — also gone
    expect(s).not.toContain('NO_ELIGIBLE_ESCALATION_AGENT')   // dead signal from the removed reassignment branch
  })

  it('the 30-minute private note (historical evidence) is still posted', () => {
    const s = cron()
    expect(s).toContain('Escalation: This conversation has been unattended')
    expect(s).toContain('private:       true')
  })

  it('isAutoAssignable and the non-routable rule remain intact and in use elsewhere (not deleted, just no longer called from this route)', () => {
    expect(isAutoAssignable(1)).toBe(false)
    expect(isAutoAssignable(5)).toBe(false)
    const router_s = router()
    const slaLib = read('lib/inbox/sla-escalation.ts')
    expect(router_s).toContain('isAutoAssignable(a.chatwootAgentId)')
    expect(slaLib).toContain('isAutoAssignable')
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
