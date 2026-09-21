/**
 * Admin-wide Floating Team Hub — SECURITY test (scenario 17): the floating
 * window's "last active conversation" is persisted ONLY in React context
 * (see FloatingTeamHubContext.tsx's header comment — never in
 * localStorage), but even so, a staff member could still tamper with it
 * in-memory (devtools, a malicious extension, replaying an old React state)
 * to a conversation id they are not a member of. This proves that doing so
 * gains nothing: the floating window loads a selected conversation through
 * the EXACT SAME route the full page already uses
 * (GET /api/admin/team/conversations/[id] — see
 * app/admin/team/hooks/useSelectedConversation.ts), which independently
 * re-authorizes via checkConversationMembership on every request, with NO
 * role-based bypass (see __tests__/team-authz.test.ts's own
 * "RELEASE-BLOCKING: zero role-based bypass" suite for the exhaustive
 * version of this invariant) — a non-member gets a bare 403 and the
 * response body never includes conversation content of any kind.
 *
 * This file does not re-implement or re-mock lib/team/authz.ts's internals
 * (that's team-authz.test.ts's job) — it runs the ROUTE HANDLER itself
 * end-to-end against a mocked Prisma, exactly mirroring
 * __tests__/team-conversations-route.test.ts's mocking shape, so the
 * assertion is about what the HTTP response actually contains, not just
 * what the authz helper returns internally.
 */
const mockPrisma = {
  teamConversation: { findUnique: jest.fn() },
  teamConversationMember: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/activity', () => ({ logTeamActivity: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { GET as getConversation } from '@/app/api/admin/team/conversations/[id]/route'

const ATTACKER_SESSION = { id: 'attacker-1', staffId: 'attacker-1', email: 'attacker@walztravels.com', role: 'staff', name: 'Attacker', permissions: {} }

function req() {
  return {} as unknown as Parameters<typeof getConversation>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(ATTACKER_SESSION)
})

describe('Floating Team Hub tamper scenario — a locally-held conversation id the staff member is not a member of', () => {
  it('is rejected with 403 by the exact route the floating window uses to load a persisted/tampered selection', async () => {
    // The conversation exists (it's real — just not one this staff member belongs to).
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'private-conv-99', archived: false })
    // No membership row for this staff member on this conversation.
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)

    const res = await getConversation(req(), { params: { id: 'private-conv-99' } })

    expect(res.status).toBe(403)
  })

  it('never renders any private content in the rejection — no conversation, no members, no messages', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({
      id: 'private-conv-99', archived: false, name: 'Executive Compensation Planning',
    })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)

    const res = await getConversation(req(), { params: { id: 'private-conv-99' } })
    const body = await res.json()

    expect(body).not.toHaveProperty('conversation')
    expect(JSON.stringify(body)).not.toMatch(/Executive Compensation Planning/)
    expect(Object.keys(body)).toEqual(['error'])
  })

  it('scopes the membership check to BOTH this conversation AND this exact staff id (IDOR-safe) — a tampered id cannot borrow another staff member\'s membership', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'private-conv-99', archived: false })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue(null)

    await getConversation(req(), { params: { id: 'private-conv-99' } })

    expect(mockPrisma.teamConversationMember.findFirst).toHaveBeenCalledWith({
      where: { conversationId: 'private-conv-99', staffId: 'attacker-1', leftAt: null },
    })
  })

  it('control: the SAME route succeeds and returns content once a real membership row exists', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({
      id: 'conv-1', type: 'GROUP', name: 'Ops', description: null, slug: null, visibility: 'PRIVATE', joinable: false, archived: false,
      members: [{ staffId: 'attacker-1', role: 'member', staff: { id: 'attacker-1', name: 'Attacker', roleTitle: null, department: null } }],
    })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue({
      id: 'm1', conversationId: 'conv-1', staffId: 'attacker-1', role: 'member', lastReadMessageId: null, lastReadAt: null, leftAt: null,
    })

    const res = await getConversation(req(), { params: { id: 'conv-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.conversation.id).toBe('conv-1')
  })

  it('rejects with 401 (before even reaching authz) when the session itself is gone', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await getConversation(req(), { params: { id: 'private-conv-99' } })
    expect(res.status).toBe(401)
    expect(mockPrisma.teamConversation.findUnique).not.toHaveBeenCalled()
  })
})
