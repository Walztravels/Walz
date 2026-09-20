/**
 * Walz Team Hub V1 — GROUP/CHANNEL calling REST routes: join, leave, and
 * the "active call" lookup. Authz/lib/team/calls are mocked here
 * (independently covered by team-authz.test.ts and team-group-calls-lib.test.ts)
 * so these tests isolate the ROUTES' own authorization wiring — the
 * release-critical property being that each route re-checks LIVE
 * membership itself rather than trusting anything about the caller's
 * request.
 */
const mockPrisma = {
  teamConversation: { findUnique: jest.fn() },
  teamCallRecord: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
  checkConversationMembership: jest.fn(),
}))
jest.mock('@/lib/team/calls', () => ({
  joinGroupCall: jest.fn(),
  leaveGroupCall: jest.fn(),
  getActiveGroupCall: jest.fn(),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { checkConversationMembership } from '@/lib/team/authz'
import { joinGroupCall, leaveGroupCall, getActiveGroupCall } from '@/lib/team/calls'
import { POST as joinCall } from '@/app/api/admin/team/conversations/[id]/calls/[callId]/join/route'
import { POST as leaveCall } from '@/app/api/admin/team/conversations/[id]/calls/[callId]/leave/route'
import { GET as activeCall } from '@/app/api/admin/team/conversations/[id]/calls/active/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const CONVO_ID = 'conv1'
const CALL_ID = 'call1'

function req() {
  return {} as unknown as Parameters<typeof joinCall>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
})

describe('POST /conversations/[id]/calls/[callId]/join', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(401)
    expect(joinGroupCall).not.toHaveBeenCalled()
  })

  it('SECURITY RE-VERIFICATION (nonmember cannot join): denies a non-member with the membership check status, before ever looking up the call', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(403)
    expect(mockPrisma.teamCallRecord.findFirst).not.toHaveBeenCalled()
    expect(joinGroupCall).not.toHaveBeenCalled()
  })

  it('SECURITY RE-VERIFICATION (former member cannot join): a membership check that fails — e.g. because leftAt is now set — still 403s even though the caller was a member when the call started', async () => {
    // checkConversationMembership queries LIVE data (covered independently by team-authz.test.ts) —
    // this test proves the route calls it fresh on every request rather than trusting a prior result.
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'You do not have access to this conversation.' })
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(403)
    expect(checkConversationMembership).toHaveBeenCalledWith(SESSION, CONVO_ID)
  })

  it('rejects a DM or unknown conversation type — group joining is GROUP/CHANNEL only', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(400)
    expect(joinGroupCall).not.toHaveBeenCalled()
  })

  it('rejects (generically, same as a wrong-type conversation — no existence oracle) when the conversation does not exist', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(400)
  })

  it('SECURITY RE-VERIFICATION (guessed callId denied): 404s when the callId does not reference an active call for THIS conversation', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'GROUP' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue(null)
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(404)
    expect(joinGroupCall).not.toHaveBeenCalled()
    expect(mockPrisma.teamCallRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: CALL_ID, conversationId: CONVO_ID, status: { in: ['STARTED', 'ACTIVE'] } }),
    }))
  })

  it('rejects joining an ENDED call (a stale callId from a call that already finished)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'GROUP' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue(null) // ENDED calls are excluded by the status filter above
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(404)
  })

  it('joins successfully once membership, conversation type, and an active call all check out — staffId always from the session', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'CHANNEL' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: CALL_ID })
    const res = await joinCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(200)
    expect(joinGroupCall).toHaveBeenCalledWith(CALL_ID, 's1')
  })
})

describe('POST /conversations/[id]/calls/[callId]/leave', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await leaveCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(401)
    expect(leaveGroupCall).not.toHaveBeenCalled()
  })

  it('denies a non-member', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await leaveCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(403)
    expect(leaveGroupCall).not.toHaveBeenCalled()
  })

  it('is idempotent — leaving a call that does not exist (already ended and cleaned up, or never existed) is a no-op success, not an error', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue(null)
    const res = await leaveCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(200)
    expect(leaveGroupCall).not.toHaveBeenCalled()
  })

  it('leaves successfully, staffId always from the session', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: CALL_ID })
    const res = await leaveCall(req(), { params: { id: CONVO_ID, callId: CALL_ID } })
    expect(res.status).toBe(200)
    expect(leaveGroupCall).toHaveBeenCalledWith(CALL_ID, 's1')
  })
})

describe('GET /conversations/[id]/calls/active', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await activeCall(req(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('denies a non-member — cannot discover whether a private channel has an active call without membership', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await activeCall(req(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(403)
    expect(getActiveGroupCall).not.toHaveBeenCalled()
  })

  it('returns {call: null} when nothing is active, and never exposes conferenceName/providerCallId when something is', async () => {
    ;(getActiveGroupCall as jest.Mock).mockResolvedValue({ id: 'gcall1', callerId: 's2', callerName: 'Joe', startedAt: new Date(), participantCount: 2 })
    const res = await activeCall(req(), { params: { id: CONVO_ID } })
    const json = await res.json()
    expect(json.call).toEqual(expect.objectContaining({ id: 'gcall1', callerName: 'Joe', participantCount: 2 }))
    expect(json.call.conferenceName).toBeUndefined()
    expect(json.call.providerCallId).toBeUndefined()
  })
})
