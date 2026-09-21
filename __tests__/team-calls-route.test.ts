/**
 * Walz Team Hub V1 — 1:1 call initiation/history (conversations/[id]/calls)
 * and status update (conversations/[id]/calls/[callId]). Authz helpers and
 * lib/team/calls persistence are mocked here (independently covered by
 * team-authz.test.ts and this module's own straightforward logic) so these
 * tests isolate the ROUTES' own logic: V1's DM-only scope, callerId always
 * server-resolved, and — the key IDOR-style check — that conversation
 * membership alone is NOT sufficient to update another party's call status.
 */
const mockPrisma = {
  teamConversation: { findUnique: jest.fn() },
  teamConversationMember: { findMany: jest.fn() },
  teamCallRecord: { findFirst: jest.fn(), findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
  checkConversationMembership: jest.fn(),
}))
jest.mock('@/lib/team/calls', () => ({
  createCallRecord: jest.fn(),
  updateCallRecordStatus: jest.fn(),
  startOrJoinGroupCall: jest.fn(),
}))
jest.mock('@/lib/team/notify', () => ({ notifyCallStarted: jest.fn() }))
// Team Hub V1.1 — missed-call EMAIL candidate scheduler (separate module).
jest.mock('@/lib/team/email-notify', () => ({ scheduleMissedCallEmailCandidates: jest.fn() }))

import { scheduleMissedCallEmailCandidates } from '@/lib/team/email-notify'
import { getAdminSession } from '@/lib/admin-auth'
import { checkConversationMembership } from '@/lib/team/authz'
import { createCallRecord, updateCallRecordStatus, startOrJoinGroupCall } from '@/lib/team/calls'
import { notifyCallStarted } from '@/lib/team/notify'
import { POST as initiateCall, GET as listCalls } from '@/app/api/admin/team/conversations/[id]/calls/route'
import { PATCH as patchCall } from '@/app/api/admin/team/conversations/[id]/calls/[callId]/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const CONVO_ID = 'conv1'

function postReq(body: Record<string, unknown> = {}) {
  return { json: async () => body } as unknown as Parameters<typeof initiateCall>[0]
}
function getReq(url: string) {
  return { url } as unknown as Parameters<typeof listCalls>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
})

describe('POST /conversations/[id]/calls — initiate a call', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
    expect(createCallRecord).not.toHaveBeenCalled()
  })

  it('denies a non-member with the membership check status', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(403)
    expect(createCallRecord).not.toHaveBeenCalled()
  })

  it('404s when the conversation does not exist', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue(null)
    const res = await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(404)
  })

  it('a GROUP/CHANNEL conversation starts/joins a group call via startOrJoinGroupCall, never the DM path', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'GROUP', name: '#reservations' })
    ;(startOrJoinGroupCall as jest.Mock).mockResolvedValue({ callRecordId: 'gcall1', created: true })
    const res = await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ callRecordId: 'gcall1', created: true, type: 'GROUP' })
    expect(createCallRecord).not.toHaveBeenCalled()
    expect(startOrJoinGroupCall).toHaveBeenCalledWith(CONVO_ID, 's1')
  })

  it('notifies current members ONLY when a NEW group call is created, never when joining an already-active one', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'CHANNEL', name: '#reservations' })
    ;(startOrJoinGroupCall as jest.Mock).mockResolvedValueOnce({ callRecordId: 'gcall1', created: true })
    await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(notifyCallStarted).toHaveBeenCalledWith(CONVO_ID, expect.objectContaining({ callRecordId: 'gcall1', starterId: 's1', conversationName: '#reservations' }))

    ;(notifyCallStarted as jest.Mock).mockClear()
    ;(startOrJoinGroupCall as jest.Mock).mockResolvedValueOnce({ callRecordId: 'gcall1', created: false })
    await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(notifyCallStarted).not.toHaveBeenCalled()
  })

  it('rejects a DM conversation with more than 2 currently-active members', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's1' }, { staffId: 's2' }, { staffId: 's3' }])
    const res = await initiateCall(postReq(), { params: { id: CONVO_ID } })
    expect(res.status).toBe(400)
    expect(createCallRecord).not.toHaveBeenCalled()
  })

  it('creates a call record with callerId ALWAYS derived from the session, never the request body', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's1' }, { staffId: 's2' }])
    ;(createCallRecord as jest.Mock).mockResolvedValue({ id: 'call1' })

    const res = await initiateCall(postReq({ callerId: 'attacker-id' } as never), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.callRecordId).toBe('call1')
    expect(json.calleeId).toBe('s2')
    expect(createCallRecord).toHaveBeenCalledWith({ conversationId: CONVO_ID, callerId: 's1', calleeIds: ['s2'] })
  })

  it('SECURITY RE-VERIFICATION (was HIGH): rate-limits repeated call initiation — uses the REAL lib/rate-limit (not mocked here) to prove the limit is genuinely enforced, not just present in source', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.teamConversationMember.findMany.mockResolvedValue([{ staffId: 's1' }, { staffId: 's2' }])
    ;(createCallRecord as jest.Mock).mockResolvedValue({ id: 'call1' })

    let lastStatus = 200
    for (let i = 0; i < 25; i++) {
      const res = await initiateCall(postReq(), { params: { id: CONVO_ID } })
      lastStatus = res.status
      if (lastStatus === 429) break
    }
    expect(lastStatus).toBe(429)
  })
})

describe('GET /conversations/[id]/calls — history', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await listCalls(getReq('http://x/api?'), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('returns operational metadata only, deriving calleeIds from participantIds minus callerId', async () => {
    const now = new Date()
    mockPrisma.teamCallRecord.findMany.mockResolvedValue([
      { id: 'call1', callerId: 's1', participantIds: ['s1', 's2'], status: 'ENDED', startedAt: now, answeredAt: now, endedAt: now, durationSeconds: 42 },
    ])
    const res = await listCalls(getReq('http://x/api?'), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.calls[0]).toEqual(expect.objectContaining({ id: 'call1', callerId: 's1', calleeIds: ['s2'], status: 'ENDED', durationSeconds: 42 }))
  })
})

describe('PATCH /conversations/[id]/calls/[callId] — status update, caller/callee-only', () => {
  beforeEach(() => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
  })

  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(401)
  })

  it('denies a non-member of the conversation', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(403)
  })

  it('404s for a call not in this conversation', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue(null)
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(404)
  })

  it('DENIES a conversation member who is neither the caller nor a callee of THIS call, even though conversation membership passed (IDOR)', async () => {
    // s3 is a valid member of the parent conversation (checkConversationMembership allows
    // above), but this specific call record is only between s1 (caller) and s2 (callee).
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    ;(getAdminSession as jest.Mock).mockResolvedValue({ ...SESSION, id: 's3', staffId: 's3' })
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(403)
    expect(updateCallRecordStatus).not.toHaveBeenCalled()
  })

  it('allows the callee (not just the caller) to update the call status', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    ;(getAdminSession as jest.Mock).mockResolvedValue({ ...SESSION, id: 's2', staffId: 's2' })
    ;(updateCallRecordStatus as jest.Mock).mockResolvedValue({ id: 'call1', status: 'ANSWERED', answeredAt: new Date(), endedAt: null, durationSeconds: null })
    const res = await patchCall(postReq({ status: 'ANSWERED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(200)
    expect(updateCallRecordStatus).toHaveBeenCalledWith('call1', 'ANSWERED')
  })

  it('allows the original caller to update their own call status', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    ;(updateCallRecordStatus as jest.Mock).mockResolvedValue({ id: 'call1', status: 'ENDED', answeredAt: null, endedAt: new Date(), durationSeconds: 0 })
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(200)
  })

  it('rejects an invalid/unknown status value', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    const res = await patchCall(postReq({ status: 'NOT_A_STATUS' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(400)
    expect(updateCallRecordStatus).not.toHaveBeenCalled()
  })

  it('SECURITY RE-VERIFICATION (was HIGH): rejects this route entirely for a GROUP/CHANNEL conversation — this route predates group calling and its "caller or callee of THIS call" check silently collapsed to "are you the original starter" for a group call (participantIds is always empty there), letting a group call\'s own starter PATCH status:ENDED and hide the call from GET .../active for everyone else still connected on the live Twilio conference, while also freeing the DB-level one-active-call-per-conversation slot mid-call', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'GROUP' })
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(400)
    expect(mockPrisma.teamCallRecord.findFirst).not.toHaveBeenCalled()
    expect(updateCallRecordStatus).not.toHaveBeenCalled()
  })

  it('also rejects for a CHANNEL conversation (not just GROUP)', async () => {
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'CHANNEL' })
    const res = await patchCall(postReq({ status: 'ENDED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(400)
    expect(updateCallRecordStatus).not.toHaveBeenCalled()
  })

  // ── Team Hub V1.1 — missed-call email candidate (additive) ────────────
  it('schedules a missed-call email candidate ONLY when the persisted record reaches MISSED', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    ;(updateCallRecordStatus as jest.Mock).mockResolvedValue({ id: 'call1', status: 'MISSED', answeredAt: null, endedAt: new Date(), durationSeconds: null })
    const res = await patchCall(postReq({ status: 'MISSED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(200)
    expect(scheduleMissedCallEmailCandidates).toHaveBeenCalledWith('call1')
  })

  it('schedules nothing for any other terminal status', async () => {
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    for (const status of ['ANSWERED', 'ENDED', 'DECLINED', 'BUSY', 'FAILED']) {
      ;(updateCallRecordStatus as jest.Mock).mockResolvedValue({ id: 'call1', status, answeredAt: null, endedAt: new Date(), durationSeconds: null })
      await patchCall(postReq({ status }), { params: { id: CONVO_ID, callId: 'call1' } })
    }
    expect(scheduleMissedCallEmailCandidates).not.toHaveBeenCalled()
  })

  it('still returns 200 when missed-call email scheduling throws (failure isolation)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue({ id: 'call1', callerId: 's1', participantIds: ['s1', 's2'] })
    ;(updateCallRecordStatus as jest.Mock).mockResolvedValue({ id: 'call1', status: 'MISSED', answeredAt: null, endedAt: new Date(), durationSeconds: null })
    ;(scheduleMissedCallEmailCandidates as jest.Mock).mockRejectedValueOnce(new Error('db down'))
    const res = await patchCall(postReq({ status: 'MISSED' }), { params: { id: CONVO_ID, callId: 'call1' } })
    expect(res.status).toBe(200)
    warn.mockRestore()
  })
})
