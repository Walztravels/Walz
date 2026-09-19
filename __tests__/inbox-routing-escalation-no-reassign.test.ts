/**
 * Routing-escalation cron — reassignment-disabled regression protection
 * (SLA policy correction, 2026-09-18).
 *
 * The cron's original 30-minute auto-reassignment behavior — POSTing to
 * Chatwoot's /assignments endpoint to hand the conversation to a different
 * agent — conflicted with the approved SLA policy: 30/60/90/120 minutes are
 * notify-only, and reassignment is a separate, not-yet-approved policy.
 * That behavior has been removed from app/api/cron/routing-escalation/
 * route.ts. These tests exercise the actual GET handler end-to-end (not
 * just source pins — see __tests__/routing-eligibility.test.ts for those)
 * to prove ownership never changes at any threshold and the 5-minute cron
 * cadence cannot cause the legacy block to re-fire for the same
 * conversation.
 */

import type { NextRequest } from 'next/server'

const mockRunSlaSweep = jest.fn()
jest.mock('@/lib/inbox/sla-escalation', () => ({
  runSlaEscalationSweep: (...a: unknown[]) => mockRunSlaSweep(...a),
}))

type Row = Record<string, unknown>

/** Minimal in-memory fake for ConversationRoute — supports exactly the
 *  query shapes the cron issues: select().eq().lt(), update().in(). */
function makeSupabaseMock(routes: Row[]) {
  function builder() {
    let mode: 'select' | 'update' = 'select'
    let patch: Row = {}
    const filters: Array<(r: Row) => boolean> = []
    const api: Record<string, unknown> = {
      select: () => api,
      update: (p: Row) => { mode = 'update'; patch = p; return api },
      eq:     (col: string, val: unknown) => { filters.push(r => r[col] === val); return api },
      lt:     (col: string, val: unknown) => { filters.push(r => (r[col] as string) < (val as string)); return api },
      in:     (col: string, vals: unknown[]) => { filters.push(r => (vals as unknown[]).includes(r[col])); return api },
      then:   (resolve: (v: unknown) => unknown) => exec().then(resolve),
    }
    function exec() {
      const matched = routes.filter(r => filters.every(f => f(r)))
      if (mode === 'update') matched.forEach(r => Object.assign(r, patch))
      return Promise.resolve({ data: matched, error: null })
    }
    return api
  }
  return { from: jest.fn(() => builder()) }
}

let fakeSupabase: ReturnType<typeof makeSupabaseMock>
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => fakeSupabase }))
jest.mock('@/lib/chatwoot/config', () => ({
  botChatwootOrNull: () => ({ base: 'https://chat.example.com', token: 'tok', accountId: '1' }),
  logChatwootUnconfigured: jest.fn(),
}))

import { GET } from '@/app/api/cron/routing-escalation/route'

function authedRequest() {
  return new Request('http://x/api/cron/routing-escalation', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }) as unknown as NextRequest
}

function baseRoute(overrides: Row = {}): Row {
  return {
    id: 'route-1',
    chatwootConversationId: '900',
    assignedTo: 'routing-agent-uuid',
    assignedToName: 'Ama Agent',
    assignedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    status: 'active',
    messagePreview: 'Hi, need help',
    ...overrides,
  }
}

describe('routing-escalation cron — reassignment disabled (approved SLA policy)', () => {
  const OLD_SECRET = process.env.CRON_SECRET
  beforeAll(() => { process.env.CRON_SECRET = 'test-secret' })
  afterAll(() => {
    if (OLD_SECRET === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = OLD_SECRET
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockRunSlaSweep.mockResolvedValue({ processed: 0, attendedResolved: 0, stagesFired: 0, errors: 0 })
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) }))
  })

  it('rejects unauthenticated requests before touching anything', async () => {
    const res = await GET(new Request('http://x/api/cron/routing-escalation') as unknown as NextRequest)
    expect(res.status).toBe(401)
    expect(global.fetch as jest.Mock).not.toHaveBeenCalled()
  })

  it('30 minutes unattended → private note posted, assignee UNCHANGED, no /assignments call', async () => {
    const route = baseRoute()
    fakeSupabase = makeSupabaseMock([route])
    await GET(authedRequest())

    const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]))
    expect(calls.some(u => u.includes('/messages'))).toBe(true)     // historical evidence preserved
    expect(calls.some(u => u.includes('/assignments'))).toBe(false) // no reassignment call, ever
    expect(route.assignedTo).toBe('routing-agent-uuid')             // same assignee
    expect(route.assignedToName).toBe('Ama Agent')                  // same assignee
    expect(route.status).toBe('escalated')                          // status flip (visibility) preserved
  })

  it('repeated 5-minute ticks after the status flip do not re-post the note or touch the assignee', async () => {
    const route = baseRoute()
    fakeSupabase = makeSupabaseMock([route])
    await GET(authedRequest())
    ;(global.fetch as jest.Mock).mockClear()

    // Second tick 5 minutes later: route.status is now 'escalated', so the
    // `.eq('status','active')` filter excludes it — the legacy block never
    // re-executes for this conversation. Proves the 5-minute cadence cannot
    // cause the legacy (now notify-only) path to fire repeatedly.
    await GET(authedRequest())
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0)
    expect(route.assignedTo).toBe('routing-agent-uuid')
    expect(route.assignedToName).toBe('Ama Agent')
  })

  it('the SLA sweep (60/90/120-minute notification stages) still runs even when the legacy 30-minute bucket is empty', async () => {
    fakeSupabase = makeSupabaseMock([]) // nothing crosses the legacy 30-min bucket this tick
    await GET(authedRequest())
    expect(mockRunSlaSweep).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock)).not.toHaveBeenCalled() // no note, no assignment call, nothing to reassign
  })

  it('the cron never queries the RoutingAgent table at all — there is nothing left to select an escalation agent from', () => {
    // Source-level guarantee, verified alongside the behavioral tests above:
    // even a stale RoutingAgent row for Michael/Jade cannot matter, because
    // this route no longer reads that table for reassignment purposes.
    const fs = jest.requireActual('fs') as typeof import('fs')
    const path = jest.requireActual('path') as typeof import('path')
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/cron/routing-escalation/route.ts'), 'utf8')
    expect(src).not.toContain("from('RoutingAgent')")
  })

  it('multiple stale conversations in one tick: every assignee stays exactly as it was, only status changes', async () => {
    const routeA = baseRoute({ id: 'route-a', chatwootConversationId: '901', assignedTo: 'agent-a', assignedToName: 'Agent A' })
    const routeB = baseRoute({ id: 'route-b', chatwootConversationId: '902', assignedTo: 'agent-b', assignedToName: 'Agent B' })
    fakeSupabase = makeSupabaseMock([routeA, routeB])
    await GET(authedRequest())

    expect(routeA.assignedTo).toBe('agent-a')
    expect(routeA.assignedToName).toBe('Agent A')
    expect(routeB.assignedTo).toBe('agent-b')
    expect(routeB.assignedToName).toBe('Agent B')
    expect(routeA.status).toBe('escalated')
    expect(routeB.status).toBe('escalated')
    const calls = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]))
    expect(calls.every(u => !u.includes('/assignments'))).toBe(true)
  })
})
