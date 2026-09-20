/**
 * lib/team/calls.ts — GROUP/CHANNEL calling helpers. Covers the
 * DB-level-guarantee concurrency race (owner requirement: two concurrent
 * "Start Call" presses must never create two active calls) and the
 * join/leave lifecycle (STARTED→ACTIVE, last-leaver→ENDED).
 */
const mockPrisma = {
  teamCallRecord: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  teamCallParticipant: { create: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import {
  startOrJoinGroupCall, getActiveGroupCall, joinGroupCall, leaveGroupCall,
} from '@/lib/team/calls'

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
})

describe('getActiveGroupCall', () => {
  it('returns null when no non-terminal call exists', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue(null)
    expect(await getActiveGroupCall('conv1')).toBeNull()
  })

  it('scopes to STARTED/ACTIVE only and returns participant count of currently-active (leftAt:null) rows', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({
      id: 'call1', callerId: 's1', caller: { name: 'Priscilla' }, startedAt: new Date(),
      participants: [{ id: 'p1' }, { id: 'p2' }],
    })
    const result = await getActiveGroupCall('conv1')
    expect(result).toEqual(expect.objectContaining({ id: 'call1', callerName: 'Priscilla', participantCount: 2 }))
    const call = mockPrisma.teamCallRecord.findFirst.mock.calls[0][0]
    expect(call.where.status).toEqual({ in: ['STARTED', 'ACTIVE'] })
    expect(call.include.participants.where).toEqual({ leftAt: null })
  })
})

describe('startOrJoinGroupCall — CONCURRENCY RE-VERIFICATION (owner requirement: DB-level guarantee)', () => {
  it('creates a new ACTIVE call and adds the starter as a participant when none is active', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce(null) // pre-check: none active
    mockPrisma.teamCallRecord.create.mockResolvedValue({ id: 'call1' })
    mockPrisma.teamCallParticipant.create.mockResolvedValue({})
    mockPrisma.teamCallRecord.update.mockResolvedValue({})

    const result = await startOrJoinGroupCall('conv1', 's1')
    expect(result).toEqual({ callRecordId: 'call1', created: true })
    expect(mockPrisma.teamCallRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ conversationId: 'conv1', callerId: 's1', status: 'STARTED' }),
    }))
    // conferenceName generated server-side and never derived from conversationId/callRecordId alone
    const createArgs = mockPrisma.teamCallRecord.create.mock.calls[0][0].data
    expect(typeof createArgs.conferenceName).toBe('string')
    expect(createArgs.conferenceName.length).toBeGreaterThan(10)
    expect(mockPrisma.teamCallParticipant.create).toHaveBeenCalledWith({ data: { callRecordId: 'call1', staffId: 's1' } })
    expect(mockPrisma.teamCallRecord.update).toHaveBeenCalledWith({ where: { id: 'call1' }, data: { status: 'ACTIVE' } })
  })

  it('returns the existing active call WITHOUT creating a new one when a pre-check finds one already active', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({
      id: 'existing-call', callerId: 's2', caller: { name: 'Joe' }, startedAt: new Date(), participants: [],
    })
    const result = await startOrJoinGroupCall('conv1', 's1')
    expect(result).toEqual({ callRecordId: 'existing-call', created: false })
    expect(mockPrisma.teamCallRecord.create).not.toHaveBeenCalled()
  })

  it('SECURITY/CONCURRENCY RE-VERIFICATION: when two requests race past the pre-check simultaneously, the DB unique-violation loser joins the winner\'s call instead of erroring or creating a duplicate', async () => {
    mockPrisma.teamCallRecord.findFirst
      .mockResolvedValueOnce(null) // pre-check sees nothing active (raced)
      .mockResolvedValueOnce({ id: 'winner-call', callerId: 's2', caller: { name: 'Joe' }, startedAt: new Date(), participants: [] }) // re-fetch after losing the race
    mockPrisma.teamCallRecord.create.mockRejectedValue({ code: 'P2002', message: 'Unique constraint failed' })

    const result = await startOrJoinGroupCall('conv1', 's1')
    expect(result).toEqual({ callRecordId: 'winner-call', created: false })
  })

  it('propagates a genuine (non-race) error rather than swallowing it', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce(null)
    mockPrisma.teamCallRecord.create.mockRejectedValue(new Error('db is down'))
    await expect(startOrJoinGroupCall('conv1', 's1')).rejects.toThrow('db is down')
  })
})

describe('joinGroupCall', () => {
  it('upserts the participant row, clearing leftAt on a rejoin', async () => {
    await joinGroupCall('call1', 's2')
    expect(mockPrisma.teamCallParticipant.upsert).toHaveBeenCalledWith({
      where: { callRecordId_staffId: { callRecordId: 'call1', staffId: 's2' } },
      update: { leftAt: null, joinedAt: expect.any(Date) },
      create: { callRecordId: 'call1', staffId: 's2' },
    })
  })

  it('collapses STARTED to ACTIVE on join, but only if it was still STARTED (updateMany with a status guard, not an unconditional update)', async () => {
    await joinGroupCall('call1', 's2')
    expect(mockPrisma.teamCallRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'call1', status: 'STARTED' },
      data: { status: 'ACTIVE' },
    })
  })
})

describe('leaveGroupCall', () => {
  it('stamps leftAt only on the caller own currently-active participant row', async () => {
    mockPrisma.teamCallParticipant.count.mockResolvedValue(1) // someone else still on the call
    await leaveGroupCall('call1', 's2')
    expect(mockPrisma.teamCallParticipant.updateMany).toHaveBeenCalledWith({
      where: { callRecordId: 'call1', staffId: 's2', leftAt: null },
      data: { leftAt: expect.any(Date) },
    })
  })

  it('does NOT end the call while other participants remain', async () => {
    mockPrisma.teamCallParticipant.count.mockResolvedValue(1)
    await leaveGroupCall('call1', 's2')
    expect(mockPrisma.teamCallRecord.updateMany).not.toHaveBeenCalled()
  })

  it('ends the call cleanly (ENDED + endedAt) when the last participant leaves', async () => {
    mockPrisma.teamCallParticipant.count.mockResolvedValue(0)
    await leaveGroupCall('call1', 's2')
    expect(mockPrisma.teamCallRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'call1', status: { in: ['STARTED', 'ACTIVE'] } },
      data: { status: 'ENDED', endedAt: expect.any(Date) },
    })
  })

  it('is idempotent — leaving a call you were never in (or already left) does not throw', async () => {
    mockPrisma.teamCallParticipant.count.mockResolvedValue(0)
    await expect(leaveGroupCall('call1', 'never-joined')).resolves.toBeUndefined()
  })
})
