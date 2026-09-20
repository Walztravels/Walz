/**
 * Walz Team Hub V1 — lib/team/authz.ts. Release-blocking per owner
 * decision 8: checkConversationMembership must have ZERO role-based
 * bypass, including for super_admin — reading conversation content is
 * strictly membership-gated, never a permission-gated administrative
 * shortcut. This is a deliberate divergence from lib/inbox/authz.ts's own
 * `inbox_view_all` bypass, and is the single most important behavior this
 * file tests.
 */
const mockPrisma = {
  teamConversation: { findUnique: jest.fn() },
  teamConversationMember: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  currentStaffId, isSuperAdmin, checkTeamHubAdminAction, checkConversationMembership,
  checkCanManageMembership, canEditMessage, canDeleteMessage, computeDmKey,
} from '@/lib/team/authz'

function session(overrides: Partial<{ id: string; staffId?: string; role: string; staffRole: string; permissions: Record<string, boolean> }> = {}) {
  return {
    id: 's1', email: 'staff@walztravels.com', name: 'Staff', roleTitle: 'Agent',
    sendingEmail: 'staff@walztravels.com', signatureTagline: null,
    role: 'staff', staffRole: 'staff', permissions: {},
    branch: 'nigeria', department: 'general', isActive: true,
    ...overrides,
  } as never
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('currentStaffId', () => {
  it('prefers the legacy staffId field when present', () => {
    expect(currentStaffId(session({ staffId: 'legacy-1', id: 'session-1' }))).toBe('legacy-1')
  })
  it('falls back to id when staffId is absent', () => {
    expect(currentStaffId(session({ id: 'session-1' }))).toBe('session-1')
  })
})

describe('isSuperAdmin', () => {
  it('true for role super_admin', () => { expect(isSuperAdmin(session({ role: 'super_admin' }))).toBe(true) })
  it('true for staffRole super_admin (legacy alias)', () => { expect(isSuperAdmin(session({ role: 'staff', staffRole: 'super_admin' }))).toBe(true) })
  it('false for an ordinary staff role', () => { expect(isSuperAdmin(session({ role: 'staff', staffRole: 'staff' }))).toBe(false) })
})

describe('checkTeamHubAdminAction — administrative actions ONLY', () => {
  it('super_admin always passes', () => {
    expect(checkTeamHubAdminAction(session({ role: 'super_admin' }), 'team_hub_admin').allowed).toBe(true)
  })
  it('passes for a staff member with the specific permission', () => {
    expect(checkTeamHubAdminAction(session({ permissions: { team_hub_channel_manage: true } }), 'team_hub_channel_manage').allowed).toBe(true)
  })
  it('denies an ordinary staff member without the permission', () => {
    const result = checkTeamHubAdminAction(session(), 'team_hub_admin')
    expect(result.allowed).toBe(false)
  })
})

describe('checkConversationMembership — RELEASE-BLOCKING: zero role-based bypass', () => {
  it('denies super_admin who is not an actual member — no bypass exists', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)
    const result = await checkConversationMembership(session({ role: 'super_admin' }), 'c1')
    expect(result.allowed).toBe(false)
    if (result.allowed) throw new Error('unreachable')
    expect(result.status).toBe(403)
  })

  it('denies a staff member holding team_hub_admin who is not an actual member — admin permission is not a content-access bypass', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)
    const result = await checkConversationMembership(session({ permissions: { team_hub_admin: true } }), 'c1')
    expect(result.allowed).toBe(false)
  })

  it('allows an ordinary staff member who IS an actual member', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue({
      id: 'm1', conversationId: 'c1', staffId: 's1', role: 'member', lastReadMessageId: null, lastReadAt: null, leftAt: null,
    })
    const result = await checkConversationMembership(session(), 'c1')
    expect(result.allowed).toBe(true)
    if (!result.allowed) throw new Error('unreachable')
    expect(result.member?.staffId).toBe('s1')
  })

  it('scopes the membership lookup by BOTH conversationId AND staffId together (IDOR-safe), and excludes departed members (leftAt not null)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)
    await checkConversationMembership(session(), 'c1')
    expect(mockPrisma.teamConversationMember.findFirst).toHaveBeenCalledWith({
      where: { conversationId: 'c1', staffId: 's1', leftAt: null },
    })
  })

  it('returns 404 for a nonexistent conversation without leaking whether a member row exists', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    const result = await checkConversationMembership(session(), 'nonexistent')
    expect(result.allowed).toBe(false)
    if (result.allowed) throw new Error('unreachable')
    expect(result.status).toBe(404)
    expect(mockPrisma.teamConversationMember.findFirst).not.toHaveBeenCalled()
  })

  it('fails closed (denies) on a database error rather than throwing or guessing', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockRejectedValue(new Error('db down'))
    const result = await checkConversationMembership(session(), 'c1')
    expect(result.allowed).toBe(false)
  })
})

describe('checkCanManageMembership — owner decision 5', () => {
  it('allows a Team Hub channel manager even without a membership row', async () => {
    const result = await checkCanManageMembership(session({ permissions: { team_hub_channel_manage: true } }), 'c1')
    expect(result.allowed).toBe(true)
    expect(mockPrisma.teamConversation.findUnique).not.toHaveBeenCalled() // short-circuits before the membership check
  })

  it('allows a conversation-level admin (channel creator/owner)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue({
      id: 'm1', conversationId: 'c1', staffId: 's1', role: 'admin', lastReadMessageId: null, lastReadAt: null, leftAt: null,
    })
    const result = await checkCanManageMembership(session(), 'c1')
    expect(result.allowed).toBe(true)
  })

  it('denies an ordinary member (role="member") from managing membership', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue({
      id: 'm1', conversationId: 'c1', staffId: 's1', role: 'member', lastReadMessageId: null, lastReadAt: null, leftAt: null,
    })
    const result = await checkCanManageMembership(session(), 'c1')
    expect(result.allowed).toBe(false)
  })

  it('denies a non-member entirely (no admin permission, no membership row)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)
    const result = await checkCanManageMembership(session(), 'c1')
    expect(result.allowed).toBe(false)
  })
})

describe('canEditMessage / canDeleteMessage — owner decisions 6-7', () => {
  it('the author can edit their own message', () => {
    expect(canEditMessage(session({ id: 's1' }), 's1')).toBe(true)
  })
  it('a non-author cannot edit someone else\'s message, even an admin', () => {
    expect(canEditMessage(session({ id: 's1', permissions: { team_hub_admin: true } }), 's2')).toBe(false)
  })
  it('the author can delete their own message ("author")', () => {
    expect(canDeleteMessage(session({ id: 's1' }), 's1')).toBe('author')
  })
  it('a Team Hub admin can delete someone else\'s message ("admin") — moderation only, never edit', () => {
    expect(canDeleteMessage(session({ id: 's1', permissions: { team_hub_admin: true } }), 's2')).toBe('admin')
  })
  it('an ordinary staff member cannot delete someone else\'s message', () => {
    expect(canDeleteMessage(session({ id: 's1' }), 's2')).toBeNull()
  })
})

describe('computeDmKey — deterministic, order-independent', () => {
  it('produces the same key regardless of argument order', () => {
    expect(computeDmKey('a', 'b')).toBe(computeDmKey('b', 'a'))
  })
  it('produces a distinct key for a different pair', () => {
    expect(computeDmKey('a', 'b')).not.toBe(computeDmKey('a', 'c'))
  })
})
