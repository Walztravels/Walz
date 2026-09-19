/**
 * Inbox SLA Escalation System (INBOX-SLA-1).
 *
 * Behavioral tests exercise the pure/near-pure exported helpers and the
 * full runSlaEscalationSweep() orchestration against mocked Supabase,
 * Prisma, Chatwoot fetch, createStaffNotification and getResend. Source
 * pins cover wiring that isn't reachable behaviorally (the legacy 30-minute
 * reassignment logic staying byte-identical, the vercel.json cadence
 * change, and the migration file).
 *
 * HARD INVARIANT under test throughout: Michael (chatwootAgentId 1) and
 * the Jade bot (chatwootAgentId 5) — and any inactive staff — must NEVER
 * appear in ANY notification recipient list, at any escalation level.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

/** Minimal in-memory fake for the ConversationRoute/RoutingAgent tables —
 *  supports exactly the query shapes lib/inbox/sla-escalation.ts issues:
 *  select().in(), select().eq().eq(), select().eq().maybeSingle(),
 *  update().eq(). Mutations apply to the SAME backing array so repeated
 *  runSlaEscalationSweep() calls observe prior writes (idempotency tests). */
function makeFakeSupabase(store: Record<string, Row[]>) {
  function applyFilters(rows: Row[], filters: Array<[string, string, unknown]>): Row[] {
    return rows.filter(r => filters.every(([col, op, val]) => {
      if (op === 'eq') return r[col] === val
      if (op === 'in') return Array.isArray(val) && val.includes(r[col])
      return true
    }))
  }
  function builder(table: string) {
    let mode: 'select' | 'update' = 'select'
    let patch: Row = {}
    const filters: Array<[string, string, unknown]> = []
    const api: Record<string, unknown> = {
      select: (_cols?: string) => api,
      update: (p: Row) => { mode = 'update'; patch = p; return api },
      eq:     (col: string, val: unknown) => { filters.push([col, 'eq', val]); return api },
      in:     (col: string, val: unknown) => { filters.push([col, 'in', val]); return api },
      maybeSingle: async () => {
        const rows = store[table] ?? []
        const matched = applyFilters(rows, filters)
        return { data: matched[0] ?? null, error: null }
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => exec().then(resolve, reject),
    }
    function exec() {
      const rows = store[table] ?? []
      if (mode === 'update') {
        const matched = applyFilters(rows, filters)
        matched.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: matched, error: null })
      }
      return Promise.resolve({ data: applyFilters(rows, filters), error: null })
    }
    return api
  }
  return { from: jest.fn(builder) }
}

const mockCreateStaffNotification = jest.fn()
const mockGetResend = jest.fn()
const mockStaff = {
  findUnique: jest.fn(),
  findFirst:  jest.fn(),
  findMany:   jest.fn(),
}

let fakeSupabaseInstance: ReturnType<typeof makeFakeSupabase>

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => fakeSupabaseInstance,
}))
jest.mock('@/lib/db', () => ({ __esModule: true, default: { staff: mockStaff } }))
jest.mock('@/lib/notifications/staff', () => ({
  createStaffNotification: (...a: unknown[]) => mockCreateStaffNotification(...a),
}))
jest.mock('@/lib/email-internal', () => ({
  getResend: (...a: unknown[]) => mockGetResend(...a),
}))
jest.mock('@/lib/chatwoot/config', () => ({
  botChatwootOrNull: () => ({ base: 'https://chat.example.com', token: 'tok', accountId: '1' }),
  logChatwootUnconfigured: jest.fn(),
}))

import {
  computeAttendance,
  isRoutableStaff,
  resolveManagerRecipients,
  resolveEscalationGroupRecipients,
  resolveCriticalRecipients,
  resolveAgentStaff,
  recipientsForLevel,
  runSlaEscalationSweep,
  SLA_STAGES,
  toMs,
  type ChatwootMessage,
  type StaffLite,
} from '@/lib/inbox/sla-escalation'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Fixtures ─────────────────────────────────────────────────────────────────

const AGENT: StaffLite = { id: 'staff-agent', name: 'Ama Agent', email: 'ama@walztravels.com', isActive: true, chatwootAgentId: 10, managerId: 'staff-mgr', role: 'sales_rep' }
const MANAGER: StaffLite = { id: 'staff-mgr', name: 'Grace Manager', email: 'grace@walztravels.com', isActive: true, chatwootAgentId: 11, managerId: null, role: 'senior_manager' }
const MICHAEL: StaffLite = { id: 'staff-michael', name: 'Michael (Admin)', email: 'michael@walztravels.com', isActive: true, chatwootAgentId: 1, managerId: null, role: 'super_admin' }
const JADE: StaffLite = { id: 'staff-jade', name: 'Jade', email: 'jade@walztravels.com', isActive: true, chatwootAgentId: 5, managerId: null, role: 'sales_rep' }

function msg(type: number, opts: { minutesAgo: number; private?: boolean; nowMs: number }): ChatwootMessage {
  return {
    message_type: type,
    private: opts.private ?? false,
    created_at: Math.floor((opts.nowMs - opts.minutesAgo * 60_000) / 1000), // seconds, like Chatwoot
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateStaffNotification.mockResolvedValue('notif-id')
  mockGetResend.mockReturnValue({ emails: { send: jest.fn().mockResolvedValue({ id: 'email-1' }) } })
})

// ── computeAttendance / toMs ─────────────────────────────────────────────────

describe('toMs', () => {
  it('treats large numbers as already-ms and small numbers as seconds', () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000)
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000)
  })
})

describe('computeAttendance — unattended definition', () => {
  const NOW = Date.parse('2026-09-18T12:00:00Z')

  it('a lone customer message with no reply is unattended', () => {
    const r = computeAttendance([msg(0, { minutesAgo: 29, nowMs: NOW })])
    expect(r.attendedByReply).toBe(false)
    expect(r.lastCustomerMsgAt).not.toBeNull()
  })

  it('a real public outgoing reply AFTER the customer message counts as attended', () => {
    const r = computeAttendance([
      msg(0, { minutesAgo: 40, nowMs: NOW }),
      msg(1, { minutesAgo: 10, nowMs: NOW, private: false }),
    ])
    expect(r.attendedByReply).toBe(true)
  })

  it('a PRIVATE note after the customer message does NOT count as a customer-facing reply', () => {
    const r = computeAttendance([
      msg(0, { minutesAgo: 40, nowMs: NOW }),
      msg(1, { minutesAgo: 10, nowMs: NOW, private: true }),
    ])
    expect(r.attendedByReply).toBe(false)
  })

  it('a reply BEFORE the latest customer message does not count (customer wrote again after)', () => {
    const r = computeAttendance([
      msg(1, { minutesAgo: 50, nowMs: NOW, private: false }),
      msg(0, { minutesAgo: 20, nowMs: NOW }),
    ])
    expect(r.attendedByReply).toBe(false)
  })

  it('an activity message (type 2) is ignored entirely', () => {
    const r = computeAttendance([
      msg(0, { minutesAgo: 40, nowMs: NOW }),
      msg(2, { minutesAgo: 10, nowMs: NOW }),
    ])
    expect(r.attendedByReply).toBe(false)
  })
})

// ── isRoutableStaff / recipient resolution ──────────────────────────────────

describe('isRoutableStaff — non-routable identity exclusion', () => {
  it('excludes Michael (chatwootAgentId 1) even when active', () => {
    expect(isRoutableStaff(MICHAEL)).toBe(false)
  })
  it('excludes Jade (chatwootAgentId 5) even when active', () => {
    expect(isRoutableStaff(JADE)).toBe(false)
  })
  it('excludes inactive staff', () => {
    expect(isRoutableStaff({ ...MANAGER, isActive: false })).toBe(false)
  })
  it('includes active staff with no chatwootAgentId at all', () => {
    expect(isRoutableStaff({ isActive: true, chatwootAgentId: null })).toBe(true)
  })
  it('includes normal active staff', () => {
    expect(isRoutableStaff(AGENT)).toBe(true)
    expect(isRoutableStaff(MANAGER)).toBe(true)
  })
})

describe('resolveManagerRecipients', () => {
  it('uses Staff.managerId when present and routable', async () => {
    mockStaff.findUnique.mockResolvedValueOnce(MANAGER)
    const result = await resolveManagerRecipients(AGENT)
    expect(result).toEqual([MANAGER])
    expect(mockStaff.findMany).not.toHaveBeenCalled()
  })

  it('falls back to role-based recipients when managerId is null (missing manager)', async () => {
    mockStaff.findMany.mockResolvedValueOnce([MANAGER])
    const result = await resolveManagerRecipients({ ...AGENT, managerId: null })
    expect(mockStaff.findUnique).not.toHaveBeenCalled()
    expect(mockStaff.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: { in: ['general_manager', 'senior_manager'] } },
    }))
    expect(result).toEqual([MANAGER])
  })

  it('falls back to role-based recipients when the resolved manager is inactive', async () => {
    mockStaff.findUnique.mockResolvedValueOnce({ ...MANAGER, isActive: false })
    mockStaff.findMany.mockResolvedValueOnce([{ ...MANAGER, id: 'fallback-mgr' }])
    const result = await resolveManagerRecipients(AGENT)
    expect(result).toEqual([{ ...MANAGER, id: 'fallback-mgr' }])
  })

  it('never returns Michael or Jade even if role-matched', async () => {
    mockStaff.findMany.mockResolvedValueOnce([MICHAEL, JADE, MANAGER])
    const result = await resolveManagerRecipients({ ...AGENT, managerId: null })
    expect(result.map(s => s.id)).toEqual([MANAGER.id])
  })

  it('returns an empty array (never crashes) when no manager is resolvable at all', async () => {
    mockStaff.findMany.mockResolvedValueOnce([])
    const result = await resolveManagerRecipients({ ...AGENT, managerId: null })
    expect(result).toEqual([])
  })
})

describe('resolveEscalationGroupRecipients / resolveCriticalRecipients', () => {
  it('matches RoutingAgent.isEscalation rows to Staff by email, excluding non-routable', async () => {
    fakeSupabaseInstance = makeFakeSupabase({
      RoutingAgent: [
        { email: MANAGER.email, isEscalation: true, active: true },
        { email: MICHAEL.email, isEscalation: true, active: true },
      ],
    })
    mockStaff.findMany.mockResolvedValueOnce([MANAGER, MICHAEL])
    const result = await resolveEscalationGroupRecipients()
    expect(result.map(s => s.id)).toEqual([MANAGER.id])
  })

  it('resolveCriticalRecipients filters super_admin staff through isRoutableStaff', async () => {
    mockStaff.findMany.mockResolvedValueOnce([MICHAEL, { ...MANAGER, role: 'super_admin' }])
    const result = await resolveCriticalRecipients()
    expect(result.map(s => s.id)).toEqual([MANAGER.id])
  })
})

describe('resolveAgentStaff — uses the CURRENT Chatwoot assignee', () => {
  it('resolves via the live chatwootAssigneeId when available', async () => {
    mockStaff.findFirst.mockResolvedValueOnce(MANAGER) // conversation was reassigned to the manager
    const result = await resolveAgentStaff({ assignedTo: 'routing-agent-uuid' }, 11)
    expect(mockStaff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { chatwootAgentId: 11 } }))
    expect(result).toEqual(MANAGER)
  })

  it('falls back to the original RoutingAgent record when no live assignee is available', async () => {
    fakeSupabaseInstance = makeFakeSupabase({
      RoutingAgent: [{ id: 'routing-agent-uuid', email: AGENT.email }],
    })
    mockStaff.findFirst.mockResolvedValueOnce(AGENT)
    const result = await resolveAgentStaff({ assignedTo: 'routing-agent-uuid' }, null)
    expect(result).toEqual(AGENT)
  })
})

describe('recipientsForLevel — cumulative tiers, deduped, never Michael/Jade', () => {
  beforeEach(() => {
    fakeSupabaseInstance = makeFakeSupabase({
      RoutingAgent: [{ email: MANAGER.email, isEscalation: true, active: true }],
    })
  })

  it('level 1 is agent only', async () => {
    const result = await recipientsForLevel(1, AGENT)
    expect(result).toEqual([AGENT])
  })

  it('level 2 adds the manager', async () => {
    mockStaff.findUnique.mockResolvedValueOnce(MANAGER)
    const result = await recipientsForLevel(2, AGENT)
    expect(result.map(s => s.id)).toEqual([AGENT.id, MANAGER.id])
  })

  it('level 4 (critical) never includes Michael even when he is technically a super_admin', async () => {
    mockStaff.findUnique.mockResolvedValueOnce(MANAGER)
    mockStaff.findMany
      .mockResolvedValueOnce([MANAGER])      // escalation group
      .mockResolvedValueOnce([MICHAEL])      // critical/super_admin pool
    const result = await recipientsForLevel(4, AGENT)
    expect(result.some(s => s.id === MICHAEL.id)).toBe(false)
  })

  it('a null agent (unresolvable) still returns manager/escalation recipients, never crashes', async () => {
    mockStaff.findMany.mockResolvedValueOnce([MANAGER]) // role-based fallback (agent has no managerId)
    const result = await recipientsForLevel(2, null)
    expect(result).toEqual([MANAGER])
  })
})

// ── Full sweep orchestration ─────────────────────────────────────────────────

function mockFetchSequence(responses: Array<{ ok: boolean; json: unknown }>) {
  let i = 0
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return { ok: r.ok, json: async () => r.json }
  })
}

/** Chatwoot messages-list response shape, as normalized elsewhere in this
 *  codebase (app/api/admin/conversations/[id]/messages/route.ts). */
function messagesResponse(payload: ChatwootMessage[]) {
  return { ok: true, json: { payload } }
}
function conversationResponse(status: string, assigneeId: number | null) {
  return { ok: true, json: { status, meta: { assignee: assigneeId ? { id: assigneeId } : null } } }
}

function baseRoute(overrides: Row = {}): Row {
  return {
    id: 'route-1',
    chatwootConversationId: '500',
    assignedTo: 'routing-agent-uuid',
    assignedToName: AGENT.name,
    assignedAt: new Date().toISOString(),
    status: 'active',
    firstUnattendedAt: null,
    agentReminderSentAt: null,
    managerEscalatedAt: null,
    adminEscalatedAt: null,
    criticalEscalatedAt: null,
    escalationResolvedAt: null,
    ...overrides,
  }
}

describe('runSlaEscalationSweep — staged thresholds', () => {
  const NOW = Date.parse('2026-09-18T12:00:00Z')

  it('29 minutes unattended → nothing fires', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 29, nowMs: NOW })]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
  })

  it('30 minutes unattended → Level 1 agent reminder fires', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]),
      conversationResponse('open', 10),
    ])
    const result = await runSlaEscalationSweep({ nowMs: NOW })
    expect(mockCreateStaffNotification).toHaveBeenCalledTimes(1)
    expect(mockCreateStaffNotification.mock.calls[0][0]).toEqual(expect.objectContaining({ staffId: AGENT.id }))
    expect(result.stagesFired).toBe(1)
  })

  it('repeated cron tick at the same 30-minute mark does NOT duplicate the Level 1 notification', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW + 5 * 60_000 })
    expect(mockCreateStaffNotification).toHaveBeenCalledTimes(1) // not 2
    expect(route.agentReminderSentAt).not.toBeNull()
  })

  it('59 minutes unattended in a single tick → Level 1 fires, Level 2 does not (60-minute boundary)', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 59, nowMs: NOW })]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    const calledCategories = mockCreateStaffNotification.mock.calls.map(c => c[0].category)
    expect(calledCategories).not.toContain('MANAGEMENT')
  })

  it('60 minutes unattended → Level 2 manager notification fires (agent + manager)', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockStaff.findUnique.mockResolvedValue(MANAGER)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    const staffIds = mockCreateStaffNotification.mock.calls.map(c => c[0].staffId)
    expect(staffIds).toEqual(expect.arrayContaining([AGENT.id, MANAGER.id]))
  })

  it('repeated cron tick past 60 minutes does not duplicate the manager notification', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockStaff.findUnique.mockResolvedValue(MANAGER)
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    const firstManagerCalls = mockCreateStaffNotification.mock.calls.filter(c => c[0].staffId === MANAGER.id).length
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW + 5 * 60_000 })
    const secondManagerCalls = mockCreateStaffNotification.mock.calls.filter(c => c[0].staffId === MANAGER.id).length
    expect(firstManagerCalls).toBe(1)
    expect(secondManagerCalls).toBe(1) // unchanged — no duplicate
  })

  it('90 minutes unattended → Level 3 escalation-group notification fires', async () => {
    fakeSupabaseInstance = makeFakeSupabase({
      ConversationRoute: [baseRoute()],
      RoutingAgent: [{ email: 'escalator@walztravels.com', isEscalation: true, active: true }],
    })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockStaff.findUnique.mockResolvedValue(MANAGER)
    mockStaff.findMany.mockResolvedValueOnce([{ ...MANAGER, id: 'staff-escalator', email: 'escalator@walztravels.com' }])
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 90, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    const staffIds = mockCreateStaffNotification.mock.calls.map(c => c[0].staffId)
    expect(staffIds).toContain('staff-escalator')
  })

  it('agent replies at 45 minutes → no 60-minute manager escalation', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    // Tick at 45min: still unattended relative to the customer message at minutesAgo 45? No —
    // simulate: customer wrote 45min ago, and the agent replied 5 min ago (i.e. AFTER, at the 40min mark).
    mockFetchSequence([
      messagesResponse([
        msg(0, { minutesAgo: 45, nowMs: NOW }),
        msg(1, { minutesAgo: 5, nowMs: NOW, private: false }),
      ]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW }) // attended -> resolved, no stage fires
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
  })

  it('agent replies at 70 minutes → no 90-minute escalation-group notification', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([
        msg(0, { minutesAgo: 70, nowMs: NOW }),
        msg(1, { minutesAgo: 2, nowMs: NOW, private: false }),
      ]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
  })

  it('a private note reply does NOT count — Level 1 still fires at 30 minutes', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([
        msg(0, { minutesAgo: 40, nowMs: NOW }),
        msg(1, { minutesAgo: 10, nowMs: NOW, private: true }), // private note only
      ]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(mockCreateStaffNotification).toHaveBeenCalledTimes(1)
  })

  it('a conversation resolved in Chatwoot stops all escalation', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 90, nowMs: NOW })]), // no reply, but...
      conversationResponse('resolved', 10),                       // ...Chatwoot says resolved
    ])
    const result = await runSlaEscalationSweep({ nowMs: NOW })
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
    expect(result.attendedResolved).toBe(1)
  })

  it('a reassigned conversation notifies the CURRENT assignee, not the stale ConversationRoute.assignedToName', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute({ assignedToName: 'Stale Original Agent' })], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(MANAGER) // now assigned to a different Chatwoot agent id (11)
    mockFetchSequence([
      messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]),
      conversationResponse('open', 11), // reassigned to chatwootAgentId 11
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(mockCreateStaffNotification).toHaveBeenCalledWith(expect.objectContaining({ staffId: MANAGER.id }))
  })

  it('an inactive manager is ignored — falls back safely to role-based recipients', async () => {
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockStaff.findUnique.mockResolvedValue({ ...MANAGER, isActive: false })
    mockStaff.findMany.mockResolvedValueOnce([{ ...MANAGER, id: 'fallback-mgr' }])
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    const staffIds = mockCreateStaffNotification.mock.calls.map(c => c[0].staffId)
    expect(staffIds).toContain('fallback-mgr')
    expect(staffIds).not.toContain(MANAGER.id)
  })

  it('no valid escalation recipient at all → safe no-op, never crashes, signal still logged', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [baseRoute()], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(null) // agent unresolvable
    mockStaff.findMany.mockResolvedValue([])    // no manager pool either
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]), conversationResponse('open', null)])
    await expect(runSlaEscalationSweep({ nowMs: NOW })).resolves.toBeDefined()
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
    expect(warnSpy.mock.calls.some(c => String(c[0]).includes('NO_ELIGIBLE_RECIPIENTS'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('notification failure does not corrupt escalation state — retries on the next tick', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockCreateStaffNotification.mockResolvedValueOnce(null) // simulate failure (createStaffNotification itself never throws — returns null)
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(route.agentReminderSentAt).toBeNull() // NOT marked sent — safe to retry

    mockCreateStaffNotification.mockResolvedValueOnce('notif-2')
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW + 5 * 60_000 })
    expect(route.agentReminderSentAt).not.toBeNull() // now succeeds and is marked
    expect(mockCreateStaffNotification).toHaveBeenCalledTimes(2)
  })

  it('a partial multi-recipient failure does NOT permanently suppress retry for the failed recipient (security fix)', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockStaff.findUnique.mockResolvedValue(MANAGER)
    // Tick 1: agent's notification succeeds, manager's fails (transient).
    mockCreateStaffNotification.mockImplementation(async (opts: { staffId: string }) =>
      opts.staffId === MANAGER.id ? null : 'notif-agent-1')
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(route.managerEscalatedAt).toBeNull() // stage NOT marked sent — must retry, not silently drop the manager
    const tick1ManagerAttempts = mockCreateStaffNotification.mock.calls.filter(c => c[0].staffId === MANAGER.id).length
    expect(tick1ManagerAttempts).toBe(1)

    // Tick 2: manager's notification now succeeds. Agent's sourceId already
    // exists from tick 1, so createStaffNotification would return that
    // existing row rather than erroring — simulate both succeeding.
    mockCreateStaffNotification.mockImplementation(async () => 'notif-2')
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW + 5 * 60_000 })
    expect(route.managerEscalatedAt).not.toBeNull() // now marked sent
    const tick2ManagerAttempts = mockCreateStaffNotification.mock.calls.filter(c => c[0].staffId === MANAGER.id).length
    expect(tick2ManagerAttempts).toBe(2) // one failed attempt (tick 1) + one successful retry (tick 2) — never silently dropped
  })

  it('only Michael/Jade resolvable as manager fallback → they are never notified, but the real agent still is (end-to-end)', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT) // real agent is assigned and routable
    // Agent has no direct managerId here, forcing the role-based fallback pool —
    // which (in this scenario) resolves to ONLY Michael and Jade.
    mockStaff.findFirst.mockResolvedValue({ ...AGENT, managerId: null })
    mockStaff.findMany.mockResolvedValueOnce([MICHAEL, JADE])
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 60, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    // 60 minutes crosses BOTH the 30-min (agent-only) and 60-min (agent+manager)
    // thresholds in this single tick, so the real agent is legitimately notified
    // twice (once per stage) — the point under test is that every recipient
    // across BOTH stages is the real agent, never Michael or Jade.
    const notifiedIds = mockCreateStaffNotification.mock.calls.map(c => c[0].staffId)
    expect(new Set(notifiedIds)).toEqual(new Set([AGENT.id])) // only the real agent — Michael/Jade excluded, not silently substituted
    expect(notifiedIds).not.toContain(MICHAEL.id)
    expect(notifiedIds).not.toContain(JADE.id)
    expect(route.managerEscalatedAt).not.toBeNull() // still marked sent — agent's own success is sufficient
  })

  it('an agent reply that resolves the episode is PERMANENT until a new customer message — a second silence is never re-escalated on its own', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)

    // Tick 1: customer wrote 45min ago, agent replied 40min ago (after) — attended, episode resolved.
    mockFetchSequence([
      messagesResponse([
        msg(0, { minutesAgo: 45, nowMs: NOW }),
        msg(1, { minutesAgo: 40, nowMs: NOW, private: false }),
      ]),
      conversationResponse('open', 10),
    ])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(route.escalationResolvedAt).not.toBeNull()
    expect(route.firstUnattendedAt).toBeNull()

    // Tick 2, much later: the SAME messages (no new customer message, agent never
    // wrote again either) — the agent's earlier reply is still the last word, so
    // attendedByReply is still true. No new episode is ever detected and nothing
    // fires, even though a naive "minutes since original customer message" clock
    // would now be well past every threshold.
    mockFetchSequence([
      messagesResponse([
        msg(0, { minutesAgo: 45, nowMs: NOW }),
        msg(1, { minutesAgo: 40, nowMs: NOW, private: false }),
      ]),
      conversationResponse('open', 10),
    ])
    const result = await runSlaEscalationSweep({ nowMs: NOW + 200 * 60_000 })
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
    expect(result.stagesFired).toBe(0)
  })

  it('email failure does not cause duplicate escalation spam — email is best-effort only', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({ ConversationRoute: [route], RoutingAgent: [] })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockGetResend.mockReturnValue({ emails: { send: jest.fn().mockRejectedValue(new Error('resend down')) } })
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 30, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW })
    expect(route.agentReminderSentAt).not.toBeNull() // in-app success still marks the stage sent
    expect(mockCreateStaffNotification).toHaveBeenCalledTimes(1) // no retry/duplicate triggered by the email failure
  })

  it('cron remains idempotent overall across all four stages in one long-unattended conversation', async () => {
    const route = baseRoute()
    fakeSupabaseInstance = makeFakeSupabase({
      ConversationRoute: [route],
      RoutingAgent: [{ email: 'escalator@walztravels.com', isEscalation: true, active: true }],
    })
    mockStaff.findFirst.mockResolvedValue(AGENT)
    mockStaff.findUnique.mockResolvedValue(MANAGER)
    mockStaff.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if ((where as { email?: { in: string[] } })?.email) return [{ ...MANAGER, id: 'staff-escalator', email: 'escalator@walztravels.com' }]
      if ((where as { role?: string })?.role === 'super_admin') return []
      return [MANAGER]
    })
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 130, nowMs: NOW })]), conversationResponse('open', 10)])
    const result = await runSlaEscalationSweep({ nowMs: NOW })
    expect(result.stagesFired).toBe(4) // all four thresholds crossed in one tick

    const firedCount = mockCreateStaffNotification.mock.calls.length
    mockFetchSequence([messagesResponse([msg(0, { minutesAgo: 130, nowMs: NOW })]), conversationResponse('open', 10)])
    await runSlaEscalationSweep({ nowMs: NOW + 5 * 60_000 })
    expect(mockCreateStaffNotification.mock.calls.length).toBe(firedCount) // no new calls on the repeat tick
  })
})

// ── Source pins ──────────────────────────────────────────────────────────────

describe('source pins — wiring the plan can\'t reach behaviorally', () => {
  const cronRoute = read('app/api/cron/routing-escalation/route.ts')
  const vercelJson = read('vercel.json')
  const migration = read('prisma/migrations/inbox_sla_escalation_columns.sql')
  const schema = read('prisma/schema.prisma')

  it('vercel.json runs routing-escalation every 5 minutes, not once daily', () => {
    const cronsBlock = vercelJson.slice(vercelJson.indexOf('"crons"'))
    const entry = cronsBlock.slice(
      cronsBlock.indexOf('"/api/cron/routing-escalation"'),
      cronsBlock.indexOf('"/api/cron/routing-escalation"') + 120,
    )
    expect(entry).toContain('"*/5 * * * *"')
    expect(entry).not.toContain('"0 8 * * *"')
  })

  it('the legacy 30-minute reassignment logic is untouched — same query, same private note, same isAutoAssignable filter', () => {
    expect(cronRoute).toContain(".eq('status', 'active')")
    expect(cronRoute).toContain(".lt('assignedAt', threshold)")
    expect(cronRoute).toContain('This conversation has been unattended for over 30 minutes. Originally assigned to')
    expect(cronRoute).toContain('isAutoAssignable(a.chatwootAgentId)')
    expect(cronRoute).toContain("status: 'escalated'")
  })

  it('the cron route wires in the new sweep additively (never replacing the legacy response)', () => {
    expect(cronRoute).toContain('runSlaEscalationSweep')
    expect(cronRoute).toContain('escalated, total: stale.length, sla')
  })

  it('the cron route never posts two overlapping 30-minute Chatwoot notes (Level 1 posts no note of its own)', () => {
    const slaLib = read('lib/inbox/sla-escalation.ts')
    expect(slaLib).toContain("postsChatwootNote: false")
    const stagesTable = slaLib.slice(slaLib.indexOf('export const SLA_STAGES'))
    const level1Row = stagesTable.split('\n').find(l => l.includes('level: 1'))
    expect(level1Row).toContain('postsChatwootNote: false')
  })

  it('the migration is additive/nullable and idempotent, matching the inbox_ux41c style', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "firstUnattendedAt"')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "agentReminderSentAt"')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "managerEscalatedAt"')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "adminEscalatedAt"')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "criticalEscalatedAt"')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "escalationResolvedAt"')
    expect(migration).toContain('NEVER prisma db push')
    expect(migration).toContain("SELECT\n  'inbox_sla_escalation_columns' AS migration")
  })

  it('schema.prisma documents the same "NEVER prisma db push" convention for the new columns', () => {
    const block = schema.slice(schema.indexOf('model ConversationRoute'), schema.indexOf('model ConversationRoute') + 2500)
    expect(block).toContain('NEVER prisma db push')
    expect(block).toContain('firstUnattendedAt      DateTime? @db.Timestamptz')
    expect(block).toContain('escalationResolvedAt   DateTime? @db.Timestamptz')
  })

  it('structured log signals use the required literal names', () => {
    const slaLib = read('lib/inbox/sla-escalation.ts')
    for (const sig of ['SLA_AGENT_REMINDER_SENT', 'SLA_MANAGER_ESCALATED', 'SLA_ADMIN_ESCALATED', 'SLA_ESCALATION_RESOLVED']) {
      expect(slaLib).toContain(sig)
    }
  })

  it('SLA_STAGES defines exactly the 30/60/90/120-minute thresholds', () => {
    expect(SLA_STAGES.map(s => s.minutes)).toEqual([30, 60, 90, 120])
  })

  it('never imports any hard-boundary module (client-context, payment-request, quotes, visa-form)', () => {
    const slaLib = read('lib/inbox/sla-escalation.ts')
    expect(slaLib).not.toContain('client-context')
    expect(slaLib).not.toContain('payment-request')
    expect(slaLib).not.toContain('admin/quotes')
    expect(slaLib).not.toContain('visa-form')
  })

  it('never logs message content — only ids, staff identity, levels and durations', () => {
    const slaLib = read('lib/inbox/sla-escalation.ts')
    expect(slaLib).not.toMatch(/console\.(log|warn|error)\(`.*\$\{.*content/i)
  })
})
