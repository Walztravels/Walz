/**
 * Walz Team Hub V1 — app/api/admin/team/conversations/route.ts (GET list /
 * POST create DM|GROUP|CHANNEL). lib/team/conversations.ts's own creation
 * logic is independently unit-tested in team-conversations.test.ts — this
 * file isolates the ROUTE's own responsibilities: request validation, and
 * the discrete-notification wiring added for Team Hub V1 (notify the
 * OTHER participant of a brand-new DM, never a pre-existing one or the
 * creator; notify every OTHER initial group/channel member, never the
 * creator).
 */
const mockPrisma = {
  staff: { findUnique: jest.fn(), findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
}))
jest.mock('@/lib/team/conversations', () => ({
  createOrGetDm: jest.fn(),
  createGroup: jest.fn(),
  createChannel: jest.fn(),
  listConversationsForStaff: jest.fn(),
}))
jest.mock('@/lib/team/activity', () => ({ logTeamActivity: jest.fn() }))
jest.mock('@/lib/team/notify', () => ({
  notifyNewDirectMessage: jest.fn(),
  notifyChannelInvite: jest.fn(),
}))
// Team Hub V1.1 — invite EMAIL candidate scheduler (separate module; the
// notify wrappers above are untouched by that feature).
jest.mock('@/lib/team/email-notify', () => ({ scheduleInviteEmailCandidates: jest.fn() }))

import { scheduleInviteEmailCandidates } from '@/lib/team/email-notify'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { createOrGetDm, createGroup, createChannel, listConversationsForStaff } from '@/lib/team/conversations'
import { notifyNewDirectMessage, notifyChannelInvite } from '@/lib/team/notify'
import { GET as listConversations, POST as createConversation } from '@/app/api/admin/team/conversations/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof createConversation>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
})

describe('GET conversation list', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await listConversations()
    expect(res.status).toBe(401)
  })

  it('returns the joined/discoverable split for the caller', async () => {
    ;(listConversationsForStaff as jest.Mock).mockResolvedValue({ joined: [{ id: 'c1' }], discoverablePublic: [] })
    const res = await listConversations()
    const json = await res.json()
    expect(json.joined).toEqual([{ id: 'c1' }])
    expect(listConversationsForStaff).toHaveBeenCalledWith('s1')
  })
})

describe('POST create — validation', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await createConversation(postReq({ type: 'DM', staffId: 's2' }))
    expect(res.status).toBe(401)
  })

  it('rate-limits rapid creation', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await createConversation(postReq({ type: 'DM', staffId: 's2' }))
    expect(res.status).toBe(429)
  })

  it('rejects an unknown conversation type', async () => {
    const res = await createConversation(postReq({ type: 'BOGUS' } as never))
    expect(res.status).toBe(400)
  })
})

describe('POST create DM — notifyNewDirectMessage wiring', () => {
  beforeEach(() => {
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 's2', isActive: true })
  })

  it('rejects a DM target that does not exist or is inactive', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue(null)
    const res = await createConversation(postReq({ type: 'DM', staffId: 's2' }))
    expect(res.status).toBe(400)
    expect(notifyNewDirectMessage).not.toHaveBeenCalled()
  })

  it('rejects starting a DM with oneself before ever notifying', async () => {
    const res = await createConversation(postReq({ type: 'DM', staffId: 's1' }))
    expect(res.status).toBe(400)
    expect(notifyNewDirectMessage).not.toHaveBeenCalled()
  })

  it('notifies the OTHER participant when a brand-new DM is created', async () => {
    ;(createOrGetDm as jest.Mock).mockResolvedValue({ conversationId: 'dm-1', created: true })
    const res = await createConversation(postReq({ type: 'DM', staffId: 's2' }))
    expect(res.status).toBe(200)
    expect(notifyNewDirectMessage).toHaveBeenCalledWith('s2', expect.objectContaining({ conversationId: 'dm-1', senderName: 'Staff One' }))
  })

  it('does NOT notify when the DM already existed (created: false)', async () => {
    ;(createOrGetDm as jest.Mock).mockResolvedValue({ conversationId: 'dm-1', created: false })
    const res = await createConversation(postReq({ type: 'DM', staffId: 's2' }))
    expect(res.status).toBe(200)
    expect(notifyNewDirectMessage).not.toHaveBeenCalled()
  })
})

describe('POST create GROUP — notifyChannelInvite wiring', () => {
  it('notifies every OTHER member, never the creator', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([{ id: 's2' }, { id: 's3' }])
    ;(createGroup as jest.Mock).mockResolvedValue('group-1')
    const res = await createConversation(postReq({ type: 'GROUP', name: 'Ops Squad', memberStaffIds: ['s2', 's3'] }))
    expect(res.status).toBe(200)
    expect(notifyChannelInvite).toHaveBeenCalledTimes(2)
    expect(notifyChannelInvite).toHaveBeenCalledWith('s2', expect.objectContaining({ conversationId: 'group-1', channelName: 'Ops Squad', inviterName: 'Staff One' }))
    expect(notifyChannelInvite).toHaveBeenCalledWith('s3', expect.objectContaining({ conversationId: 'group-1', channelName: 'Ops Squad' }))
    expect(notifyChannelInvite).not.toHaveBeenCalledWith('s1', expect.anything())
  })

  it('schedules invite email candidates for the same members, never the creator', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([{ id: 's2' }, { id: 's3' }])
    ;(createGroup as jest.Mock).mockResolvedValue('group-1')
    await createConversation(postReq({ type: 'GROUP', name: 'Ops Squad', memberStaffIds: ['s2', 's3'] }))
    expect(scheduleInviteEmailCandidates).toHaveBeenCalledWith('group-1', ['s2', 's3'], 'Staff One')
  })

  it('still creates the group when invite email scheduling throws (failure isolation)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockPrisma.staff.findMany.mockResolvedValue([{ id: 's2' }])
    ;(createGroup as jest.Mock).mockResolvedValue('group-1')
    ;(scheduleInviteEmailCandidates as jest.Mock).mockRejectedValueOnce(new Error('db down'))
    const res = await createConversation(postReq({ type: 'GROUP', name: 'Ops Squad', memberStaffIds: ['s2'] }))
    expect(res.status).toBe(200)
    warn.mockRestore()
  })

  it('rejects a group with no other members before ever calling createGroup', async () => {
    const res = await createConversation(postReq({ type: 'GROUP', name: 'Solo', memberStaffIds: [] }))
    expect(res.status).toBe(400)
    expect(createGroup).not.toHaveBeenCalled()
  })
})

describe('POST create CHANNEL — notifyChannelInvite wiring', () => {
  it('notifies each OTHER initial PRIVATE-channel member, never the creator', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([{ id: 's2' }])
    ;(createChannel as jest.Mock).mockResolvedValue('chan-1')
    const res = await createConversation(postReq({
      type: 'CHANNEL', name: 'Leadership', visibility: 'PRIVATE', initialMemberStaffIds: ['s2'],
    }))
    expect(res.status).toBe(200)
    expect(notifyChannelInvite).toHaveBeenCalledWith('s2', expect.objectContaining({ conversationId: 'chan-1', channelName: 'Leadership', inviterName: 'Staff One' }))
  })

  it('schedules invite email candidates for PRIVATE-channel initial members', async () => {
    mockPrisma.staff.findMany.mockResolvedValue([{ id: 's2' }])
    ;(createChannel as jest.Mock).mockResolvedValue('chan-1')
    await createConversation(postReq({
      type: 'CHANNEL', name: 'Leadership', visibility: 'PRIVATE', initialMemberStaffIds: ['s2'],
    }))
    expect(scheduleInviteEmailCandidates).toHaveBeenCalledWith('chan-1', ['s2'], 'Staff One')
  })

  it('sends no invite notification for a PUBLIC channel (no initial members — self-joinable)', async () => {
    ;(createChannel as jest.Mock).mockResolvedValue('chan-2')
    const res = await createConversation(postReq({ type: 'CHANNEL', name: 'General', visibility: 'PUBLIC' }))
    expect(res.status).toBe(200)
    expect(notifyChannelInvite).not.toHaveBeenCalled()
    expect(scheduleInviteEmailCandidates).toHaveBeenCalledWith('chan-2', [], 'Staff One')
  })

  it('never schedules an invite email candidate for a brand-new DM (the first MESSAGE is what triggers a DM email)', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 's2', isActive: true })
    ;(createOrGetDm as jest.Mock).mockResolvedValue({ conversationId: 'dm-1', created: true })
    await createConversation(postReq({ type: 'DM', staffId: 's2' }))
    expect(scheduleInviteEmailCandidates).not.toHaveBeenCalled()
  })
})
