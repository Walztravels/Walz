/**
 * Walz Team Hub V1 — GET /api/admin/team/unread-count. Verifies the
 * sidebar badge endpoint never issues an N+1 per-conversation query (a
 * single bounded findMany + a single count() with an OR clause), excludes
 * the caller's own messages and tombstoned messages, and falls back to
 * joinedAt when a membership has never bumped its read cursor.
 */
const mockPrisma = {
  teamConversationMember: { findMany: jest.fn() },
  teamMessage: { count: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { GET as unreadCount } from '@/app/api/admin/team/unread-count/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
})

describe('GET unread-count', () => {
  it('returns 401 without querying the database when unauthenticated (security review finding: this previously returned 200/{unreadCount:0})', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await unreadCount()
    expect(res.status).toBe(401)
    expect(mockPrisma.teamConversationMember.findMany).not.toHaveBeenCalled()
  })

  it('returns 0 without a count() call when the staff member has no memberships', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([])
    const res = await unreadCount()
    const json = await res.json()
    expect(json.unreadCount).toBe(0)
    expect(mockPrisma.teamMessage.count).not.toHaveBeenCalled()
  })

  it('scopes membership lookup to the caller own active memberships', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([])
    await unreadCount()
    expect(mockPrisma.teamConversationMember.findMany).toHaveBeenCalledWith({
      where: { staffId: 's1', leftAt: null },
      select: { conversationId: true, lastReadAt: true, joinedAt: true },
    })
  })

  it('issues exactly one count() call with an OR clause covering every joined conversation (no N+1)', async () => {
    const joinedAt = new Date('2024-01-01')
    const lastReadAt = new Date('2024-02-01')
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([
      { conversationId: 'c1', lastReadAt, joinedAt },
      { conversationId: 'c2', lastReadAt: null, joinedAt },
    ])
    mockPrisma.teamMessage.count.mockResolvedValue(7)
    const res = await unreadCount()
    const json = await res.json()
    expect(json.unreadCount).toBe(7)
    expect(mockPrisma.teamMessage.count).toHaveBeenCalledTimes(1)
    const args = mockPrisma.teamMessage.count.mock.calls[0][0]
    expect(args.where.deletedAt).toBeNull()
    expect(args.where.authorId).toEqual({ not: 's1' })
    expect(args.where.OR).toEqual([
      { conversationId: 'c1', createdAt: { gt: lastReadAt } },
      { conversationId: 'c2', createdAt: { gt: joinedAt } }, // falls back to joinedAt when never read
    ])
  })
})
