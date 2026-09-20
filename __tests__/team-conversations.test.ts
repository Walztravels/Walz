/**
 * Walz Team Hub V1 — lib/team/conversations.ts. Covers DM dedup/race
 * safety, group/channel creation, public-channel self-join eligibility,
 * and membership-filtered listing (private-channel discovery denial).
 */
const mockTx = {
  teamConversation: { create: jest.fn() },
  teamConversationMember: { createMany: jest.fn() },
}
const mockPrisma = {
  teamConversation: { findUnique: jest.fn(), findMany: jest.fn() },
  teamConversationMember: { upsert: jest.fn() },
  $transaction: jest.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import { createOrGetDm, createGroup, createChannel, joinPublicChannel, listConversationsForStaff } from '@/lib/team/conversations'

beforeEach(() => {
  jest.clearAllMocks()
  mockTx.teamConversationMember.createMany.mockResolvedValue({ count: 2 })
})

describe('createOrGetDm', () => {
  it('returns the existing DM without creating a new one', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'existing-dm' })
    const result = await createOrGetDm('a', 'b', 'a')
    expect(result).toEqual({ conversationId: 'existing-dm', created: false })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('creates a new DM with the deterministic dmKey when none exists', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    mockTx.teamConversation.create.mockResolvedValue({ id: 'new-dm' })
    const result = await createOrGetDm('b', 'a', 'a') // note: reversed order
    expect(result).toEqual({ conversationId: 'new-dm', created: true })
    const createArgs = mockTx.teamConversation.create.mock.calls[0][0]
    expect(createArgs.data.dmKey).toBe('a:b') // sorted regardless of call order
    expect(createArgs.data.type).toBe('DM')
  })

  it('creates exactly two membership rows for the DM', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    mockTx.teamConversation.create.mockResolvedValue({ id: 'new-dm' })
    await createOrGetDm('a', 'b', 'a')
    const memberArgs = mockTx.teamConversationMember.createMany.mock.calls[0][0].data
    expect(memberArgs).toHaveLength(2)
    expect(memberArgs.map((m: { staffId: string }) => m.staffId).sort()).toEqual(['a', 'b'])
  })

  it('rejects creating a DM with oneself', async () => {
    await expect(createOrGetDm('a', 'a', 'a')).rejects.toThrow(/yourself/i)
  })

  it('race safety: on a unique-constraint violation, re-fetches and returns the winner instead of throwing', async () => {
    mockPrisma.teamConversation.findUnique
      .mockResolvedValueOnce(null) // initial check — nothing yet
      .mockResolvedValueOnce({ id: 'winner-dm' }) // re-fetch after the race loss
    mockTx.teamConversation.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
    const result = await createOrGetDm('a', 'b', 'a')
    expect(result).toEqual({ conversationId: 'winner-dm', created: false })
  })

  it('propagates a genuine (non-race) error rather than swallowing it', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    mockTx.teamConversation.create.mockRejectedValue(new Error('connection refused'))
    await expect(createOrGetDm('a', 'b', 'a')).rejects.toThrow('connection refused')
  })
})

describe('createGroup', () => {
  it('makes the creator an admin and other members plain members', async () => {
    mockTx.teamConversation.create.mockResolvedValue({ id: 'group-1' })
    await createGroup({ name: 'December Lagos Campaign', memberStaffIds: ['b', 'c'], createdBy: 'a' })
    const memberArgs = mockTx.teamConversationMember.createMany.mock.calls[0][0].data
    expect(memberArgs.find((m: { staffId: string }) => m.staffId === 'a').role).toBe('admin')
    expect(memberArgs.find((m: { staffId: string }) => m.staffId === 'b').role).toBe('member')
  })

  it('deduplicates the creator if they appear in memberStaffIds too', async () => {
    mockTx.teamConversation.create.mockResolvedValue({ id: 'group-1' })
    await createGroup({ name: 'X', memberStaffIds: ['a', 'b'], createdBy: 'a' })
    const memberArgs = mockTx.teamConversationMember.createMany.mock.calls[0][0].data
    expect(memberArgs).toHaveLength(2)
  })
})

describe('createChannel', () => {
  it('creates a PUBLIC joinable channel with a slug', async () => {
    mockTx.teamConversation.create.mockResolvedValue({ id: 'chan-1' })
    await createChannel({ name: '#Reservations Team!', visibility: 'PUBLIC', joinable: true, createdBy: 'a' })
    const createArgs = mockTx.teamConversation.create.mock.calls[0][0].data
    expect(createArgs.visibility).toBe('PUBLIC')
    expect(createArgs.joinable).toBe(true)
    expect(createArgs.slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('a PRIVATE channel is never joinable regardless of the input flag', async () => {
    mockTx.teamConversation.create.mockResolvedValue({ id: 'chan-2' })
    await createChannel({ name: 'Management', visibility: 'PRIVATE', joinable: true, createdBy: 'a', initialMemberStaffIds: ['b'] })
    const createArgs = mockTx.teamConversation.create.mock.calls[0][0].data
    expect(createArgs.joinable).toBe(false)
  })

  it('creator is always an admin member', async () => {
    mockTx.teamConversation.create.mockResolvedValue({ id: 'chan-3' })
    await createChannel({ name: 'General', visibility: 'PUBLIC', joinable: true, createdBy: 'a' })
    const memberArgs = mockTx.teamConversationMember.createMany.mock.calls[0][0].data
    expect(memberArgs).toEqual([{ conversationId: 'chan-3', staffId: 'a', role: 'admin' }])
  })
})

describe('joinPublicChannel — owner decision 5 self-service join eligibility', () => {
  it('allows joining a PUBLIC, joinable channel', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', type: 'CHANNEL', visibility: 'PUBLIC', joinable: true })
    const result = await joinPublicChannel('c1', 'staff-1')
    expect(result.ok).toBe(true)
    expect(mockPrisma.teamConversationMember.upsert).toHaveBeenCalled()
  })

  it('rejects joining a PRIVATE channel via self-service', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', type: 'CHANNEL', visibility: 'PRIVATE', joinable: false })
    const result = await joinPublicChannel('c1', 'staff-1')
    expect(result.ok).toBe(false)
    expect(mockPrisma.teamConversationMember.upsert).not.toHaveBeenCalled()
  })

  it('rejects joining a PUBLIC but membership-controlled (joinable=false) channel via self-service', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', type: 'CHANNEL', visibility: 'PUBLIC', joinable: false })
    const result = await joinPublicChannel('c1', 'staff-1')
    expect(result.ok).toBe(false)
  })

  it('rejects self-service join on a DM/GROUP entirely (join only applies to channels)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ id: 'c1', type: 'GROUP', visibility: null, joinable: false })
    const result = await joinPublicChannel('c1', 'staff-1')
    expect(result.ok).toBe(false)
  })

  it('rejects joining a nonexistent channel', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    const result = await joinPublicChannel('nope', 'staff-1')
    expect(result.ok).toBe(false)
  })
})

describe('listConversationsForStaff — private-channel discovery denial', () => {
  it('scopes "joined" conversations to an active (leftAt: null) membership row', async () => {
    mockPrisma.teamConversation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await listConversationsForStaff('staff-1')
    const joinedQuery = mockPrisma.teamConversation.findMany.mock.calls[0][0]
    expect(joinedQuery.where.members.some).toEqual({ staffId: 'staff-1', leftAt: null })
  })

  it('discoverable list is scoped to PUBLIC channels only — never PRIVATE — filtered in the query itself', async () => {
    mockPrisma.teamConversation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await listConversationsForStaff('staff-1')
    const discoverableQuery = mockPrisma.teamConversation.findMany.mock.calls[1][0]
    expect(discoverableQuery.where.type).toBe('CHANNEL')
    expect(discoverableQuery.where.visibility).toBe('PUBLIC')
    expect(discoverableQuery.where.members.none).toEqual({ staffId: 'staff-1', leftAt: null })
  })

  it('never queries for PRIVATE channels in the discoverable list, structurally', async () => {
    mockPrisma.teamConversation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    await listConversationsForStaff('staff-1')
    const allCallArgs = mockPrisma.teamConversation.findMany.mock.calls.map(c => JSON.stringify(c[0]))
    expect(allCallArgs.some(args => args.includes('PRIVATE'))).toBe(false)
  })
})
