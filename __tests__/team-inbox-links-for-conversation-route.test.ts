/**
 * GET /api/admin/team/inbox-links/for-conversation — the new CASE 1/2/3
 * reverse lookup for the Floating Ask Team Workspace (given an INBOX
 * conversation id, find the most recent NON-RESOLVED TeamInboxDiscussionLink
 * on ANY Team conversation the caller is still a member of).
 *
 * Same LOGICAL-AND discipline as the sibling inbox-link routes: real Inbox
 * authorization on the target conversation AND real Team Hub membership on
 * each candidate link's own conversation, checked independently. This test
 * file also stands in for the spec's TAMPER scenario at the data layer: a
 * candidate link on a conversation the caller is NOT a member of must never
 * be returned, even if it is the most recent one.
 */

const mockPrisma = {
  teamInboxDiscussionLink: { findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/inbox/authz', () => ({ checkInboxPermission: jest.fn(), checkConversationAccess: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({ checkConversationMembership: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { checkConversationMembership } from '@/lib/team/authz'
import { GET } from '@/app/api/admin/team/inbox-links/for-conversation/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }

function req(inboxConversationId: string | number) {
  return new Request(`http://x/api/admin/team/inbox-links/for-conversation?inboxConversationId=${inboxConversationId}`)
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: true })
  ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
})

it('rejects unauthenticated with 401', async () => {
  ;(getAdminSession as jest.Mock).mockResolvedValue(null)
  const res = await GET(req(42))
  expect(res.status).toBe(401)
})

it('requires inboxConversationId', async () => {
  const res = await GET(new Request('http://x/api/admin/team/inbox-links/for-conversation'))
  expect(res.status).toBe(400)
})

it('denies when the caller has no real Inbox authorization on the target conversation, even if a link exists', async () => {
  ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'nope' })
  mockPrisma.teamInboxDiscussionLink.findMany.mockResolvedValue([
    { messageId: 'm1', status: 'OPEN', message: { conversationId: 'team-1' } },
  ])
  const res = await GET(req(42))
  expect(res.status).toBe(403)
  expect(checkConversationMembership).not.toHaveBeenCalled()
})

it('returns link:null when there is no non-resolved link at all (CASE 3 territory)', async () => {
  mockPrisma.teamInboxDiscussionLink.findMany.mockResolvedValue([])
  const res = await GET(req(42))
  const data = await res.json()
  expect(res.status).toBe(200)
  expect(data.link).toBeNull()
})

it('returns the most recent link the caller IS a member of (CASE 2 territory)', async () => {
  mockPrisma.teamInboxDiscussionLink.findMany.mockResolvedValue([
    { messageId: 'm-newest', status: 'OPEN', message: { conversationId: 'team-newest' } },
  ])
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: {} })
  const res = await GET(req(42))
  const data = await res.json()
  expect(data.link).toEqual({ teamConversationId: 'team-newest', messageId: 'm-newest', status: 'OPEN' })
})

it('TAMPER-equivalent: skips a candidate link whose Team conversation the caller is NOT (or no longer) a member of, and falls through to an older one they ARE a member of', async () => {
  mockPrisma.teamInboxDiscussionLink.findMany.mockResolvedValue([
    { messageId: 'm-newest', status: 'OPEN', message: { conversationId: 'team-not-mine' } },
    { messageId: 'm-older', status: 'ANSWERED', message: { conversationId: 'team-mine' } },
  ])
  ;(checkConversationMembership as jest.Mock).mockImplementation(async (_s: unknown, conversationId: string) =>
    conversationId === 'team-mine' ? { allowed: true, member: {} } : { allowed: false, status: 403, error: 'not a member' },
  )
  const res = await GET(req(42))
  const data = await res.json()
  expect(res.status).toBe(200)
  expect(data.link.teamConversationId).toBe('team-mine')
})

it('TAMPER: when the caller is a member of NONE of the candidate conversations, returns link:null rather than leaking any of them', async () => {
  mockPrisma.teamInboxDiscussionLink.findMany.mockResolvedValue([
    { messageId: 'm1', status: 'OPEN', message: { conversationId: 'not-mine-1' } },
    { messageId: 'm2', status: 'OPEN', message: { conversationId: 'not-mine-2' } },
  ])
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'not a member' })
  const res = await GET(req(42))
  const data = await res.json()
  expect(res.status).toBe(200)
  expect(data.link).toBeNull()
})

it('never considers a RESOLVED link — the Prisma query itself excludes status RESOLVED', async () => {
  mockPrisma.teamInboxDiscussionLink.findMany.mockResolvedValue([])
  await GET(req(42))
  const args = mockPrisma.teamInboxDiscussionLink.findMany.mock.calls[0][0]
  expect(args.where.status).toEqual({ not: 'RESOLVED' })
  expect(args.where.chatwootConversationId).toBe(42)
})
