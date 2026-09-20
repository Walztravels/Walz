/**
 * Walz Team Hub V1 — lib/team/notify.ts. Verifies each wrapper calls the
 * EXISTING createStaffNotification with the right sourceType/sourceId/data
 * for deep-linking + dedup, and that a failure inside it never throws past
 * the wrapper (the caller's main request must never break because a
 * notification couldn't be written).
 */
const mockCreateStaffNotification = jest.fn()
jest.mock('@/lib/notifications/staff', () => ({
  createStaffNotification: (...args: unknown[]) => mockCreateStaffNotification(...args),
}))
const mockPrisma = { teamConversationMember: { findMany: jest.fn() } }
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  notifyNewDirectMessage,
  notifyMention,
  notifyChannelInvite,
  notifyThreadReply,
  notifyCallStarted,
} from '@/lib/team/notify'

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateStaffNotification.mockResolvedValue('notif-1')
})

describe('notifyNewDirectMessage', () => {
  it('dedupes on the conversationId (fires once per brand-new DM, not per message)', async () => {
    await notifyNewDirectMessage('recipient-1', { conversationId: 'conv-1', senderName: 'Ada', preview: 'hey there' })
    expect(mockCreateStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'recipient-1', sourceType: 'team_dm', sourceId: 'conv-1',
      data: { conversationId: 'conv-1' },
    }))
  })

  it('never throws when the underlying create fails', async () => {
    mockCreateStaffNotification.mockRejectedValue(new Error('db down'))
    await expect(notifyNewDirectMessage('r1', { conversationId: 'c1', senderName: 'Ada', preview: 'hi' })).resolves.toBeUndefined()
  })

  it('truncates a long preview into the body', async () => {
    await notifyNewDirectMessage('r1', { conversationId: 'c1', senderName: 'Ada', preview: 'x'.repeat(500) })
    const body = mockCreateStaffNotification.mock.calls[0][0].body as string
    expect(body.length).toBeLessThanOrEqual(140)
  })
})

describe('notifyMention', () => {
  it('dedupes on the messageId and carries conversationId+messageId for deep-linking', async () => {
    await notifyMention('mentioned-1', { conversationId: 'conv-1', messageId: 'msg-1', authorName: 'Bo', preview: 'see this' })
    expect(mockCreateStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'mentioned-1', sourceType: 'team_mention', sourceId: 'msg-1',
      data: { conversationId: 'conv-1', messageId: 'msg-1' },
    }))
  })

  it('never throws when the underlying create fails', async () => {
    mockCreateStaffNotification.mockRejectedValue(new Error('db down'))
    await expect(notifyMention('m1', { conversationId: 'c1', messageId: 'msg1', authorName: 'Bo', preview: 'hi' })).resolves.toBeUndefined()
  })
})

describe('notifyChannelInvite', () => {
  it('dedupes on the conversationId and includes the inviter/channel name in the body', async () => {
    await notifyChannelInvite('invited-1', { conversationId: 'conv-1', channelName: '#general', inviterName: 'Chi' })
    expect(mockCreateStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'invited-1', sourceType: 'team_channel_invite', sourceId: 'conv-1',
      data: { conversationId: 'conv-1' },
    }))
    expect(mockCreateStaffNotification.mock.calls[0][0].body).toContain('#general')
  })

  it('never throws when the underlying create fails', async () => {
    mockCreateStaffNotification.mockRejectedValue(new Error('db down'))
    await expect(notifyChannelInvite('i1', { conversationId: 'c1', channelName: '#x', inviterName: 'Chi' })).resolves.toBeUndefined()
  })
})

describe('notifyThreadReply', () => {
  it('dedupes on the (new reply) messageId and notifies the PARENT message author', async () => {
    await notifyThreadReply('parent-author-1', { conversationId: 'conv-1', messageId: 'reply-msg-1', replierName: 'Dee', preview: 'agreed' })
    expect(mockCreateStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'parent-author-1', sourceType: 'team_thread_reply', sourceId: 'reply-msg-1',
      data: { conversationId: 'conv-1', messageId: 'reply-msg-1' },
    }))
  })

  it('never throws when the underlying create fails', async () => {
    mockCreateStaffNotification.mockRejectedValue(new Error('db down'))
    await expect(notifyThreadReply('p1', { conversationId: 'c1', messageId: 'm1', replierName: 'Dee', preview: 'hi' })).resolves.toBeUndefined()
  })
})

describe('notifyCallStarted', () => {
  it('SECURITY RE-VERIFICATION: queries LIVE membership itself and excludes the starter — never trusts a caller-supplied recipient list', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 'member-2' }, { staffId: 'member-3' }])
    await notifyCallStarted('conv-1', { callRecordId: 'call-1', starterId: 'starter-1', starterName: 'Priscilla', conversationName: '#reservations' })
    expect(mockPrisma.teamConversationMember.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', leftAt: null, staffId: { not: 'starter-1' } },
      select: { staffId: true },
    })
    expect(mockCreateStaffNotification).toHaveBeenCalledTimes(2)
    expect(mockCreateStaffNotification).toHaveBeenCalledWith(expect.objectContaining({
      staffId: 'member-2', sourceType: 'team_call_started', sourceId: 'call-1',
      title: expect.stringContaining('#reservations'),
    }))
  })

  it('never notifies the starter (excluded at the query level, not filtered after the fact)', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([]) // the query itself already excludes starter-1
    await notifyCallStarted('conv-1', { callRecordId: 'call-1', starterId: 'starter-1', starterName: 'Priscilla', conversationName: null })
    expect(mockCreateStaffNotification).not.toHaveBeenCalled()
  })

  it('dedupes on callRecordId (one notification per call start, not per participant-per-call)', async () => {
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 'm1' }, { staffId: 'm2' }])
    await notifyCallStarted('conv-1', { callRecordId: 'call-1', starterId: 's1', starterName: 'Priscilla', conversationName: null })
    for (const call of mockCreateStaffNotification.mock.calls) {
      expect(call[0].sourceId).toBe('call-1')
    }
  })

  it('never throws when the membership query or the underlying create fails', async () => {
    mockPrisma.teamConversationMember.findMany.mockRejectedValue(new Error('db down'))
    await expect(notifyCallStarted('conv-1', { callRecordId: 'call-1', starterId: 's1', starterName: 'P', conversationName: null })).resolves.toBeUndefined()
  })
})
