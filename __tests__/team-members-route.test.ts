/**
 * Walz Team Hub V1 — POST /api/admin/team/conversations/[id]/members (add
 * a member). GET is already covered in team-mentions-search.test.ts. This
 * file isolates the authorization gate (checkCanManageMembership — never
 * an ordinary member) and the Team Hub V1 notifyChannelInvite wiring added
 * on a successful add.
 */
const mockPrisma = {
  staff: { findUnique: jest.fn() },
  teamConversationMember: { upsert: jest.fn() },
  teamConversation: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  checkConversationMembership: jest.fn(),
  checkCanManageMembership: jest.fn(),
}))
jest.mock('@/lib/team/activity', () => ({ logTeamActivity: jest.fn() }))
jest.mock('@/lib/team/notify', () => ({ notifyChannelInvite: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { checkCanManageMembership } from '@/lib/team/authz'
import { notifyChannelInvite } from '@/lib/team/notify'
import { POST as addMember } from '@/app/api/admin/team/conversations/[id]/members/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const CONVO_ID = 'conv1'

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof addMember>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkCanManageMembership as jest.Mock).mockResolvedValue({ allowed: true })
  mockPrisma.staff.findUnique.mockResolvedValue({ id: 's2', isActive: true })
  mockPrisma.teamConversation.findUnique.mockResolvedValue({ name: 'Leadership' })
})

describe('POST add member', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await addMember(postReq({ staffId: 's2' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('denies an ordinary member (not creator/admin/channel manager)', async () => {
    ;(checkCanManageMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await addMember(postReq({ staffId: 's2' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(403)
    expect(mockPrisma.teamConversationMember.upsert).not.toHaveBeenCalled()
    expect(notifyChannelInvite).not.toHaveBeenCalled()
  })

  it('rejects an inactive/nonexistent target staff member before notifying', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue(null)
    const res = await addMember(postReq({ staffId: 's2' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(400)
    expect(notifyChannelInvite).not.toHaveBeenCalled()
  })

  it('adds the member and notifies them with the conversation name and inviter', async () => {
    const res = await addMember(postReq({ staffId: 's2' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.teamConversationMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId_staffId: { conversationId: CONVO_ID, staffId: 's2' } },
    }))
    expect(notifyChannelInvite).toHaveBeenCalledWith('s2', {
      conversationId: CONVO_ID, channelName: 'Leadership', inviterName: 'Staff One',
    })
  })

  it('falls back to a generic channel name when the conversation has none (e.g. a GROUP with no name)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ name: null })
    const res = await addMember(postReq({ staffId: 's2' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(notifyChannelInvite).toHaveBeenCalledWith('s2', expect.objectContaining({ channelName: 'a conversation' }))
  })
})
