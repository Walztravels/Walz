/**
 * "My mentions" feed and @mention-autocomplete-via-membership-search.
 * Both are security-sensitive: the mentions feed must re-check CURRENT
 * membership (not just trust the historical mention row), and the
 * autocomplete search must be scoped by the SAME membership filter as the
 * plain member list — never a separate, broader staff search — so it can
 * never leak who is in a private conversation the requester isn't in.
 */
const mockPrisma = {
  teamMention: { findMany: jest.fn() },
  teamConversationMember: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
  checkConversationMembership: jest.fn(),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { checkConversationMembership } from '@/lib/team/authz'
import { GET as myMentions } from '@/app/api/admin/team/mentions/route'
import { GET as listMembers } from '@/app/api/admin/team/conversations/[id]/members/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
})

describe('GET my mentions', () => {
  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await myMentions()
    expect(res.status).toBe(401)
  })

  it('scopes the query to the caller own current membership, never a stale mention row alone', async () => {
    mockPrisma.teamMention.findMany.mockResolvedValue([])
    await myMentions()
    const call = mockPrisma.teamMention.findMany.mock.calls[0][0]
    expect(call.where.mentionedStaffId).toBe('s1')
    expect(call.where.message.conversation.members.some).toEqual({ staffId: 's1', leftAt: null })
  })
})

describe('GET members with ?q= (mention autocomplete)', () => {
  function req(url: string) {
    return { url } as unknown as Parameters<typeof listMembers>[0]
  }

  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await listMembers(req('http://x/api?q=jo'), { params: { id: 'conv1' } })
    expect(res.status).toBe(401)
  })

  it('denies a non-member — autocomplete cannot be used to probe a conversation the caller cannot see', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await listMembers(req('http://x/api?q=jo'), { params: { id: 'conv1' } })
    expect(res.status).toBe(403)
    expect(mockPrisma.teamConversationMember.findMany).not.toHaveBeenCalled()
  })

  it('filters the SAME membership-scoped query by name when q is present', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([])
    await listMembers(req('http://x/api?q=jo'), { params: { id: 'conv1' } })
    const call = mockPrisma.teamConversationMember.findMany.mock.calls[0][0]
    expect(call.where.conversationId).toBe('conv1')
    expect(call.where.leftAt).toBeNull()
    expect(call.where.staff.name.contains).toBe('jo')
  })
})
