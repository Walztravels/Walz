/**
 * Walz Team Hub V1 — message send/list (cursor pagination, mentions,
 * threads), edit/delete, read-cursor bump, and reactions. Authz helpers
 * are mocked here (already independently unit-tested in
 * team-authz.test.ts) so these tests isolate the ROUTE's own logic:
 * author identity always server-resolved, cross-conversation thread-parent
 * rejection, mention validation against real membership, tombstone
 * rendering, and idempotent reaction toggling.
 */
const mockPrisma = {
  teamMessage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  teamConversation: { update: jest.fn() },
  teamConversationMember: { findMany: jest.fn(), update: jest.fn() },
  teamMention: { createMany: jest.fn() },
  teamMessageReaction: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
  checkConversationMembership: jest.fn(),
  canEditMessage: jest.fn(),
  canDeleteMessage: jest.fn(),
}))
jest.mock('@/lib/team/activity', () => ({ logTeamActivity: jest.fn() }))
jest.mock('@/lib/team/notify', () => ({ notifyMention: jest.fn(), notifyThreadReply: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkConversationMembership, canEditMessage, canDeleteMessage } from '@/lib/team/authz'
import { notifyMention, notifyThreadReply } from '@/lib/team/notify'
import { GET as listMessages, POST as sendMessage } from '@/app/api/admin/team/conversations/[id]/messages/route'
import { PATCH as editMessage, DELETE as deleteMessage } from '@/app/api/admin/team/conversations/[id]/messages/[messageId]/route'
import { POST as bumpRead } from '@/app/api/admin/team/conversations/[id]/read/route'
import { POST as toggleReaction } from '@/app/api/admin/team/conversations/[id]/messages/[messageId]/reactions/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const CONVO_ID = 'conv1'

function getReq(url: string) {
  return { url } as unknown as Parameters<typeof listMessages>[0]
}
function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof sendMessage>[0]
}
function ctx(id: string) {
  return { params: { id: CONVO_ID, messageId: id } }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member', lastReadAt: null } })
})

describe('GET messages — pagination and rendering', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await listMessages(getReq('http://x/api?'), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('propagates a membership denial without querying messages', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await listMessages(getReq('http://x/api?'), { params: { id: CONVO_ID } })
    expect(res.status).toBe(403)
    expect(mockPrisma.teamMessage.findMany).not.toHaveBeenCalled()
  })

  it('renders a tombstoned message with body:null and deleted:true', async () => {
    mockPrisma.teamMessage.findMany.mockResolvedValue([
      { id: 'm1', authorId: 's2', author: { id: 's2', name: 'Other' }, body: 'secret', deletedAt: new Date(), editedAt: null, parentMessageId: null, reactions: [], attachments: [], mentions: [], _count: { replies: 0 }, createdAt: new Date() },
    ])
    const res = await listMessages(getReq('http://x/api?'), { params: { id: CONVO_ID } })
    const json = await res.json()
    expect(json.messages[0].body).toBeNull()
    expect(json.messages[0].deleted).toBe(true)
  })

  it('scopes to a thread when parentMessageId is given, and to the top-level feed otherwise', async () => {
    mockPrisma.teamMessage.findMany.mockResolvedValue([])
    await listMessages(getReq('http://x/api?parentMessageId=root1'), { params: { id: CONVO_ID } })
    expect(mockPrisma.teamMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ parentMessageId: 'root1' }) }))

    await listMessages(getReq('http://x/api?'), { params: { id: CONVO_ID } })
    expect(mockPrisma.teamMessage.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ parentMessageId: null }) }))
  })

  it('caps an oversized limit at MAX_PAGE_SIZE', async () => {
    mockPrisma.teamMessage.findMany.mockResolvedValue([])
    await listMessages(getReq('http://x/api?limit=999'), { params: { id: CONVO_ID } })
    expect(mockPrisma.teamMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }))
  })
})

describe('POST send message — identity, validation, mentions, threads', () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
    mockPrisma.teamMessage.create.mockResolvedValue({ id: 'm-new', authorId: 's1', body: 'hi', parentMessageId: null, createdAt: new Date() })
    mockPrisma.teamConversation.update.mockResolvedValue({})
  })

  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await sendMessage(postReq({ body: 'hi' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('rejects when not a member', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await sendMessage(postReq({ body: 'hi' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(403)
  })

  it('rate-limits rapid sends', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await sendMessage(postReq({ body: 'hi' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(429)
  })

  it('rejects an empty or whitespace-only body', async () => {
    const res = await sendMessage(postReq({ body: '   ' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(400)
  })

  it('rejects an oversized body', async () => {
    const res = await sendMessage(postReq({ body: 'x'.repeat(8001) }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(413)
  })

  it('ALWAYS derives authorId from the session, never from the request body', async () => {
    await sendMessage(postReq({ body: 'hi', authorId: 'attacker-id' } as never), { params: { id: CONVO_ID } })
    expect(mockPrisma.teamMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ authorId: 's1' }) }))
  })

  it('rejects a parentMessageId belonging to a different conversation', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue(null) // scoped lookup by (id, conversationId) finds nothing
    const res = await sendMessage(postReq({ body: 'reply', parentMessageId: 'foreign-msg' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(400)
    expect(mockPrisma.teamMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-msg', conversationId: CONVO_ID } }))
  })

  it('accepts a parentMessageId that DOES belong to this conversation', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'root1' })
    const res = await sendMessage(postReq({ body: 'reply', parentMessageId: 'root1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.teamMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ parentMessageId: 'root1' }) }))
  })

  it('validates mentions against CURRENT conversation membership, silently dropping non-members rather than erroring the send', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's2' }]) // only s2 is actually a member
    const res = await sendMessage(postReq({ body: 'hi @s2 @s3', mentionedStaffIds: ['s2', 's3'] }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.message.mentionedStaffIds).toEqual(['s2'])
    expect(mockPrisma.teamMention.createMany).toHaveBeenCalledWith({ data: [{ messageId: 'm-new', mentionedStaffId: 's2' }] })
  })

  it('creates no mention rows when mentionedStaffIds is empty', async () => {
    const res = await sendMessage(postReq({ body: 'hi' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.teamMention.createMany).not.toHaveBeenCalled()
  })

  it('notifies each validly-mentioned staff member, excluding a self-mention', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's1' }, { staffId: 's2' }])
    const res = await sendMessage(postReq({ body: 'hi @s1 @s2', mentionedStaffIds: ['s1', 's2'] }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(notifyMention).toHaveBeenCalledTimes(1)
    expect(notifyMention).toHaveBeenCalledWith('s2', expect.objectContaining({ conversationId: CONVO_ID, messageId: 'm-new', authorName: 'Staff One' }))
  })

  it('sends no mention notification when there are no valid mentions', async () => {
    const res = await sendMessage(postReq({ body: 'hi' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(notifyMention).not.toHaveBeenCalled()
  })

  it('notifies the parent message author of a thread reply when they are a CURRENT member, unless replying to their own message', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'root1', authorId: 's2' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's2' }]) // explicit: s2 IS a current member
    const res = await sendMessage(postReq({ body: 'reply', parentMessageId: 'root1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(notifyThreadReply).toHaveBeenCalledWith('s2', expect.objectContaining({ conversationId: CONVO_ID, messageId: 'm-new', replierName: 'Staff One' }))
  })

  it('does not notify a thread reply when the parent message was authored by the sender themself', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'root1', authorId: 's1' })
    const res = await sendMessage(postReq({ body: 'reply', parentMessageId: 'root1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(notifyThreadReply).not.toHaveBeenCalled()
  })

  it('SECURITY RE-VERIFICATION (was CRITICAL): does NOT notify a thread reply when the parent author has LEFT the conversation — this previously leaked a preview of new conversation content to a departed staff member via their still-visible notification title/body', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'root1', authorId: 's2' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([]) // explicit: s2 is NOT a current member (left)
    const res = await sendMessage(postReq({ body: 'reply', parentMessageId: 'root1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(notifyThreadReply).not.toHaveBeenCalled()
    // the membership query itself must have been scoped to include the parent author as a candidate
    expect(mockPrisma.teamConversationMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ staffId: { in: expect.arrayContaining(['s2']) }, leftAt: null }),
    }))
  })
})

describe('PATCH edit message — author-only', () => {
  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await editMessage(postReq({ body: 'x' }), ctx('m1'))
    expect(res.status).toBe(401)
  })

  it('404s for a nonexistent or already-deleted message', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue(null)
    const res = await editMessage(postReq({ body: 'x' }), ctx('m1'))
    expect(res.status).toBe(404)
  })

  it('denies editing a message authored by someone else', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', authorId: 's2', deletedAt: null })
    ;(canEditMessage as jest.Mock).mockReturnValue(false)
    const res = await editMessage(postReq({ body: 'x' }), ctx('m1'))
    expect(res.status).toBe(403)
    expect(mockPrisma.teamMessage.update).not.toHaveBeenCalled()
  })

  it('allows the author to edit and stamps editedAt without touching authorId', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', authorId: 's1', deletedAt: null })
    ;(canEditMessage as jest.Mock).mockReturnValue(true)
    mockPrisma.teamMessage.update.mockResolvedValue({ id: 'm1', body: 'edited', editedAt: new Date() })
    const res = await editMessage(postReq({ body: 'edited' }), ctx('m1'))
    expect(res.status).toBe(200)
    const call = mockPrisma.teamMessage.update.mock.calls[0][0]
    expect(call.data.body).toBe('edited')
    expect(call.data.editedAt).toBeInstanceOf(Date)
    expect(call.data.authorId).toBeUndefined()
  })
})

describe('DELETE message — soft delete, author-or-admin', () => {
  it('is idempotent for an already-deleted message', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', authorId: 's1', deletedAt: new Date() })
    const res = await deleteMessage(postReq({}), ctx('m1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.teamMessage.update).not.toHaveBeenCalled()
  })

  it('denies a non-author, non-admin delete', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', authorId: 's2', deletedAt: null })
    ;(canDeleteMessage as jest.Mock).mockReturnValue(null)
    const res = await deleteMessage(postReq({}), ctx('m1'))
    expect(res.status).toBe(403)
  })

  it('soft-deletes via deletedAt/deletedBy — never a hard row delete', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', authorId: 's1', deletedAt: null })
    ;(canDeleteMessage as jest.Mock).mockReturnValue('author')
    const res = await deleteMessage(postReq({}), ctx('m1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.teamMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: 's1' }),
    }))
  })

  it('logs an admin-moderation delete to ActivityLog', async () => {
    const { logTeamActivity } = jest.requireMock('@/lib/team/activity')
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', authorId: 's2', deletedAt: null })
    ;(canDeleteMessage as jest.Mock).mockReturnValue('admin')
    await deleteMessage(postReq({}), ctx('m1'))
    expect(logTeamActivity).toHaveBeenCalled()
  })
})

describe('POST read-cursor bump', () => {
  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await bumpRead(postReq({ messageId: 'm1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('404s for a message not in this conversation', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue(null)
    const res = await bumpRead(postReq({ messageId: 'm1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(404)
  })

  it('is a no-op when the cursor is already at or past this message (stale multi-tab bump)', async () => {
    const now = new Date()
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member', lastReadAt: now } })
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ createdAt: new Date(now.getTime() - 1000) })
    const res = await bumpRead(postReq({ messageId: 'm1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.teamConversationMember.update).not.toHaveBeenCalled()
  })

  it('advances the cursor for a newer message, scoped to the caller own membership row', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ createdAt: new Date() })
    const res = await bumpRead(postReq({ messageId: 'm1' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.teamConversationMember.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { conversationId_staffId: { conversationId: CONVO_ID, staffId: 's1' } },
    }))
  })
})

describe('POST reaction toggle', () => {
  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await toggleReaction(postReq({ emoji: '👍' }), ctx('m1'))
    expect(res.status).toBe(401)
  })

  it('404s for a message not in this conversation or already deleted', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue(null)
    const res = await toggleReaction(postReq({ emoji: '👍' }), ctx('m1'))
    expect(res.status).toBe(404)
  })

  it('adds a reaction that does not yet exist', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', deletedAt: null })
    mockPrisma.teamMessageReaction.findUnique.mockResolvedValue(null)
    const res = await toggleReaction(postReq({ emoji: '👍' }), ctx('m1'))
    const json = await res.json()
    expect(json.action).toBe('added')
    expect(mockPrisma.teamMessageReaction.create).toHaveBeenCalledWith({ data: { messageId: 'm1', staffId: 's1', emoji: '👍' } })
  })

  it('removes an existing identical reaction (idempotent toggle)', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', deletedAt: null })
    mockPrisma.teamMessageReaction.findUnique.mockResolvedValue({ id: 'r1' })
    const res = await toggleReaction(postReq({ emoji: '👍' }), ctx('m1'))
    const json = await res.json()
    expect(json.action).toBe('removed')
    expect(mockPrisma.teamMessageReaction.delete).toHaveBeenCalledWith({ where: { id: 'r1' } })
  })
})
