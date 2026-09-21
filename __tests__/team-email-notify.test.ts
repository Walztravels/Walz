/**
 * Walz Team Hub V1.1 — lib/team/email-notify.ts (candidate CREATION).
 *
 * Verifies the scheduling layer that sits ALONGSIDE lib/team/notify.ts:
 * correct debounce timestamp, correct dedup key (this feature's own
 * (staffId, sourceId, kind) — never StaffNotification's), mention-beats-
 * thread-reply priority, no candidate for ordinary channel messages,
 * preference suppression, and total failure isolation.
 */

const mockPrisma = {
  teamEmailNotificationCandidate: { upsert: jest.fn() },
  teamEmailNotificationPreference: { findMany: jest.fn() },
  teamConversation: { findUnique: jest.fn() },
  teamConversationMember: { findMany: jest.fn() },
  teamCallRecord: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  scheduleMessageEmailCandidates,
  scheduleMissedCallEmailCandidates,
  scheduleInviteEmailCandidates,
  loadTeamEmailPreferences,
  isKindEnabled,
  EMAIL_DEBOUNCE_MS,
  DEFAULT_TEAM_EMAIL_PREFERENCES,
} from '@/lib/team/email-notify'

/** Every upsert's `create` payload, in call order. */
function created(): Array<Record<string, unknown>> {
  return mockPrisma.teamEmailNotificationCandidate.upsert.mock.calls.map(c => c[0].create)
}
function whereKeys(): Array<Record<string, unknown>> {
  return mockPrisma.teamEmailNotificationCandidate.upsert.mock.calls.map(c => c[0].where.staffId_sourceId_kind)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.teamEmailNotificationCandidate.upsert.mockResolvedValue({ id: 'cand-1' })
  mockPrisma.teamEmailNotificationPreference.findMany.mockResolvedValue([]) // no rows = all on
  mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'CHANNEL' })
  mockPrisma.teamConversationMember.findMany.mockResolvedValue([])
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('preference defaults', () => {
  it('a staff member with no preference row gets every category (all on)', async () => {
    const prefs = await loadTeamEmailPreferences(['s1', 's2'])
    expect(prefs.get('s1')).toEqual(DEFAULT_TEAM_EMAIL_PREFERENCES)
    expect(prefs.get('s2')).toEqual({ directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: true })
  })

  it('one toggle governs both mentions and thread replies; channel chatter has no kind at all', () => {
    const prefs = { ...DEFAULT_TEAM_EMAIL_PREFERENCES, mentionsAndThreads: false }
    expect(isKindEnabled(prefs, 'MENTION')).toBe(false)
    expect(isKindEnabled(prefs, 'THREAD_REPLY')).toBe(false)
    expect(isKindEnabled(prefs, 'DM')).toBe(true)
    // There is no kind for ordinary channel/group messages.
    expect(isKindEnabled(prefs, 'CHANNEL_MESSAGE' as never)).toBe(false)
  })
})

describe('scheduleMessageEmailCandidates', () => {
  it('schedules a mention candidate with the debounce window and this feature OWN dedup key', async () => {
    const before = Date.now()
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: null,
    })
    const rows = created()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      staffId: 's1', kind: 'MENTION', conversationId: 'conv-1', sourceId: 'msg-1',
      actorName: 'Ada', status: 'PENDING',
    })
    const due = (rows[0].scheduledSendAt as Date).getTime()
    const eventAt = (rows[0].eventAt as Date).getTime()
    expect(due - eventAt).toBe(EMAIL_DEBOUNCE_MS)
    expect(due).toBeGreaterThanOrEqual(before + EMAIL_DEBOUNCE_MS)
    // The dedup key is (staffId, sourceId, kind) on THIS table.
    expect(whereKeys()[0]).toEqual({ staffId: 's1', sourceId: 'msg-1', kind: 'MENTION' })
  })

  it('never re-arms the debounce or resurrects a resolved candidate (update is a no-op)', async () => {
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: null,
    })
    expect(mockPrisma.teamEmailNotificationCandidate.upsert.mock.calls[0][0].update).toEqual({})
  })

  it('MENTION beats THREAD_REPLY for the same message — exactly one candidate, worded as a mention', async () => {
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: 's1', // the mentioned person IS the thread parent author
    })
    const rows = created()
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('MENTION')
  })

  it('still schedules a thread reply when the parent author was not mentioned', async () => {
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: 's2',
    })
    const rows = created()
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.staffId === 's1')!.kind).toBe('MENTION')
    expect(rows.find(r => r.staffId === 's2')!.kind).toBe('THREAD_REPLY')
  })

  it('creates NO candidate for an ordinary top-level channel message', async () => {
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: [], threadParentAuthorId: null,
    })
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()
  })

  it('creates a DM candidate for the other live member of a DM conversation', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's9' }])
    await scheduleMessageEmailCandidates({
      conversationId: 'dm-1', messageId: 'msg-7', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: [], threadParentAuthorId: null,
    })
    const rows = created()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ staffId: 's9', kind: 'DM', sourceId: 'msg-7' })
    // Membership is read live, excluding the author.
    expect(mockPrisma.teamConversationMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversationId: 'dm-1', leftAt: null, staffId: { not: 'author' } }),
    }))
  })

  it('a mention inside a DM stays a MENTION, not a DM', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's9' }])
    await scheduleMessageEmailCandidates({
      conversationId: 'dm-1', messageId: 'msg-7', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s9'], threadParentAuthorId: null,
    })
    const rows = created()
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('MENTION')
  })

  it('never schedules a candidate for the author themselves (self-mention)', async () => {
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['author'], threadParentAuthorId: 'author',
    })
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()
  })

  it('a preference toggled OFF suppresses candidate creation entirely', async () => {
    mockPrisma.teamEmailNotificationPreference.findMany.mockResolvedValue([
      { staffId: 's1', directMessages: true, mentionsAndThreads: false, missedCalls: true, invites: true },
    ])
    await scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: null,
    })
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()
  })

  it('never throws when the database is unavailable (the message send must still succeed)', async () => {
    mockPrisma.teamConversation.findUnique.mockRejectedValue(new Error('db down'))
    await expect(scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: null,
    })).resolves.toBeUndefined()
  })

  it('never throws when a single candidate write fails', async () => {
    mockPrisma.teamEmailNotificationCandidate.upsert.mockRejectedValue(new Error('unique violation'))
    await expect(scheduleMessageEmailCandidates({
      conversationId: 'conv-1', messageId: 'msg-1', authorStaffId: 'author', authorName: 'Ada',
      mentionedStaffIds: ['s1'], threadParentAuthorId: null,
    })).resolves.toBeUndefined()
  })
})

describe('scheduleMissedCallEmailCandidates', () => {
  it('schedules for the callee(s) only, sourced from the persisted MISSED status', async () => {
    mockPrisma.teamCallRecord.findUnique.mockResolvedValue({
      id: 'call-1', status: 'MISSED', conversationId: 'dm-1', callerId: 'caller',
      participantIds: ['caller', 'callee'], caller: { name: 'Bo' },
    })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 'callee' }])
    await scheduleMissedCallEmailCandidates('call-1')
    const rows = created()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ staffId: 'callee', kind: 'MISSED_CALL', sourceId: 'call-1', actorName: 'Bo' })
  })

  it('schedules nothing for any non-MISSED status (never infers "missed" from anything else)', async () => {
    for (const status of ['ANSWERED', 'ENDED', 'DECLINED', 'BUSY', 'FAILED', 'RINGING', 'ACTIVE']) {
      mockPrisma.teamCallRecord.findUnique.mockResolvedValue({
        id: 'call-1', status, conversationId: 'dm-1', callerId: 'caller',
        participantIds: ['caller', 'callee'], caller: { name: 'Bo' },
      })
      await scheduleMissedCallEmailCandidates('call-1')
    }
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()
  })

  it('skips a callee who is no longer a live member of the conversation', async () => {
    mockPrisma.teamCallRecord.findUnique.mockResolvedValue({
      id: 'call-1', status: 'MISSED', conversationId: 'dm-1', callerId: 'caller',
      participantIds: ['caller', 'callee'], caller: { name: 'Bo' },
    })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([]) // left the conversation
    await scheduleMissedCallEmailCandidates('call-1')
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()
  })

  it('respects the missed-calls preference toggle and never throws', async () => {
    mockPrisma.teamCallRecord.findUnique.mockResolvedValue({
      id: 'call-1', status: 'MISSED', conversationId: 'dm-1', callerId: 'caller',
      participantIds: ['caller', 'callee'], caller: { name: 'Bo' },
    })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 'callee' }])
    mockPrisma.teamEmailNotificationPreference.findMany.mockResolvedValue([
      { staffId: 'callee', directMessages: true, mentionsAndThreads: true, missedCalls: false, invites: true },
    ])
    await expect(scheduleMissedCallEmailCandidates('call-1')).resolves.toBeUndefined()
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()

    mockPrisma.teamCallRecord.findUnique.mockRejectedValue(new Error('db down'))
    await expect(scheduleMissedCallEmailCandidates('call-1')).resolves.toBeUndefined()
  })
})

describe('scheduleInviteEmailCandidates', () => {
  it('keys the candidate on the conversationId, mirroring notifyChannelInvite own sourceId convention', async () => {
    await scheduleInviteEmailCandidates('conv-9', ['s1', 's2'], 'Chi')
    expect(created()).toEqual([
      expect.objectContaining({ staffId: 's1', kind: 'INVITE', sourceId: 'conv-9', conversationId: 'conv-9', actorName: 'Chi' }),
      expect.objectContaining({ staffId: 's2', kind: 'INVITE', sourceId: 'conv-9' }),
    ])
  })

  it('does nothing for an empty invite list, honours the toggle, and never throws', async () => {
    await scheduleInviteEmailCandidates('conv-9', [], 'Chi')
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()

    mockPrisma.teamEmailNotificationPreference.findMany.mockResolvedValue([
      { staffId: 's1', directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: false },
    ])
    await scheduleInviteEmailCandidates('conv-9', ['s1'], 'Chi')
    expect(mockPrisma.teamEmailNotificationCandidate.upsert).not.toHaveBeenCalled()

    mockPrisma.teamEmailNotificationPreference.findMany.mockRejectedValue(new Error('db down'))
    await expect(scheduleInviteEmailCandidates('conv-9', ['s1'], 'Chi')).resolves.toBeUndefined()
  })
})
