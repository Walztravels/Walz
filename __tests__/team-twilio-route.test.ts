/**
 * Walz Team Hub V1 — internal 1:1 calling: Twilio Access Token issuance
 * (app/api/team/twilio/token) and the TwiML voice webhook
 * (app/api/team/twilio/voice). Both are COMPLETELY ISOLATED from the
 * existing client-calling routes under app/api/twilio/** — these tests
 * assert that isolation directly (never falls back to the client app SID,
 * identity is always server-derived).
 *
 * The 'twilio' SDK and @/lib/db are mocked per this codebase's existing
 * convention (see __tests__/team-messages-route.test.ts).
 */

jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
}))
// Signature verification is independently covered by lib/webhooks/verify's
// own tests (__tests__/inbox-0s4-webhook-security.test.ts) — mocked here so
// the voice-webhook tests can isolate THIS route's own authorization logic
// (ConversationId/CallRecordId/membership), matching how checkConversationMembership
// is mocked in other route tests for the same reason.
const mockVerifyTwilioSignature = jest.fn(() => true)
jest.mock('@/lib/webhooks/verify', () => ({
  verifyTwilioSignature: (...args: unknown[]) => mockVerifyTwilioSignature(...args),
  externalWebhookUrl: () => 'https://walztravels.com/api/team/twilio/voice',
}))

const mockAddGrant = jest.fn()
const mockToJwt = jest.fn(() => 'fake.jwt.token')
const MockVoiceGrant = jest.fn().mockImplementation((opts: Record<string, unknown>) => ({ ...opts }))
const MockAccessToken = jest.fn().mockImplementation(() => ({ addGrant: mockAddGrant, toJwt: mockToJwt })) as unknown as {
  new (...args: unknown[]): { addGrant: typeof mockAddGrant; toJwt: typeof mockToJwt }
} & { VoiceGrant: typeof MockVoiceGrant }
MockAccessToken.VoiceGrant = MockVoiceGrant

jest.mock('twilio', () => {
  const jwtNs = { AccessToken: MockAccessToken }
  return { __esModule: true, default: { jwt: jwtNs }, jwt: jwtNs }
})

const mockPrisma = {
  staff: { findUnique: jest.fn() },
  teamConversation: { findUnique: jest.fn() },
  teamConversationMember: { findFirst: jest.fn() },
  teamCallRecord: { findFirst: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

import { getAdminSession } from '@/lib/admin-auth'
import { POST as tokenPost } from '@/app/api/team/twilio/token/route'
import { POST as voicePost } from '@/app/api/team/twilio/voice/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }

const ORIGINAL_ENV = process.env

function fullyConfiguredEnv() {
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_TEAMHUB_TWIML_APP_SID = 'TEST_TWIML_APP_SID'
  process.env.TWILIO_API_KEY_SID = 'SK_test'
  process.env.TWILIO_API_KEY_SECRET = 'secret'
}

function voiceReq(fields: Record<string, string>) {
  const body = new URLSearchParams(fields).toString()
  return {
    text: async () => body,
    headers: { get: (name: string) => (name === 'x-twilio-signature' ? 'sig' : null) },
  } as unknown as Parameters<typeof voicePost>[0]
}

const VALID_CALL_RECORD = { participantIds: ['s2'] }

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('POST /api/team/twilio/token', () => {
  it('denies unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    fullyConfiguredEnv()
    const res = await tokenPost({} as never)
    expect(res.status).toBe(401)
    expect(MockAccessToken).not.toHaveBeenCalled()
  })

  it('returns 500 (never a fallback) when TWILIO_TEAMHUB_TWIML_APP_SID is unset, even if the client app SID is set', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test'
    process.env.TWILIO_API_KEY_SID = 'SK_test'
    process.env.TWILIO_API_KEY_SECRET = 'secret'
    delete process.env.TWILIO_TEAMHUB_TWIML_APP_SID
    process.env.TWILIO_TWIML_APP_SID = 'CLIENT_APP_SID_MUST_NEVER_BE_USED'

    const res = await tokenPost({} as never)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/not yet configured/i)
    expect(MockAccessToken).not.toHaveBeenCalled()
  })

  it('identity is always "staff-<sessionStaffId>", never client-suppliable', async () => {
    fullyConfiguredEnv()
    const res = await tokenPost({} as never)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.identity).toBe('staff-s1')
    expect(MockAccessToken).toHaveBeenCalledWith('AC_test', 'SK_test', 'secret', expect.objectContaining({ identity: 'staff-s1' }))
  })

  it('grants outgoingApplicationSid = TWILIO_TEAMHUB_TWIML_APP_SID, never the client-calling app SID', async () => {
    fullyConfiguredEnv()
    process.env.TWILIO_TWIML_APP_SID = 'CLIENT_APP_SID_MUST_NEVER_BE_USED'
    await tokenPost({} as never)
    expect(MockVoiceGrant).toHaveBeenCalledWith(expect.objectContaining({ outgoingApplicationSid: 'TEST_TWIML_APP_SID' }))
  })
})

describe('POST /api/team/twilio/voice — TwiML webhook', () => {
  const ACTIVE_STAFF = { id: 'ignored', isActive: true }
  const FULL_FIELDS = { From: 'client:staff-s1', CalleeStaffId: 's2', ConversationId: 'conv1', CallRecordId: 'call1' }

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token'
    mockVerifyTwilioSignature.mockReturnValue(true)
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'DM' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValue(VALID_CALL_RECORD)
  })

  it('SECURITY RE-VERIFICATION (was: no auth at all — confirmed live via curl): fails closed when TWILIO_AUTH_TOKEN is not configured, even with an otherwise-valid request', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
  })

  it('SECURITY RE-VERIFICATION: fails closed when the X-Twilio-Signature does not verify', async () => {
    mockVerifyTwilioSignature.mockReturnValue(false)
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
    expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('fails closed (does not throw) on a malformed/unparseable body', async () => {
    const badReq = { text: async () => { throw new Error('boom') }, headers: { get: () => null } } as unknown as Parameters<typeof voicePost>[0]
    const res = await voicePost(badReq)
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
  })

  it('fails closed (hangup, no leaked reason) when From is not a Team Hub client identity', async () => {
    const res = await voicePost(voiceReq({ ...FULL_FIELDS, From: 'client:someone@walztravels.com' }))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
    expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('fails closed when CalleeStaffId is missing for a DM call', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true }) // caller
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' }) // caller is a member
    const res = await voicePost(voiceReq({ From: 'client:staff-s1', ConversationId: 'conv1', CallRecordId: 'call1' }))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
  })

  it('fails closed when caller or callee is inactive', async () => {
    mockPrisma.staff.findUnique
      .mockResolvedValueOnce({ ...ACTIVE_STAFF, id: 's1', isActive: true })   // caller
      .mockResolvedValueOnce({ ...ACTIVE_STAFF, id: 's2', isActive: false }) // callee — inactive
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' }) // caller is a member
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
  })

  it('SECURITY RE-VERIFICATION (was CRITICAL): fails closed when ConversationId is omitted entirely, even though caller and callee are both active — the bypass this test exists to close let any active staff member ring any other active staff member with zero shared conversation, zero TeamCallRecord, and zero audit trail', async () => {
    const res = await voicePost(voiceReq({ From: 'client:staff-s1', CalleeStaffId: 's2', CallRecordId: 'call1' })) // deliberately NO ConversationId
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
    // the staff-active/membership checks must never even be reached without a ConversationId
    expect(mockPrisma.staff.findUnique).not.toHaveBeenCalled()
  })

  it('fails closed when CallRecordId is missing', async () => {
    const res = await voicePost(voiceReq({ From: 'client:staff-s1', CalleeStaffId: 's2', ConversationId: 'conv1' }))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
  })

  it('fails closed when either party is not an active member of the conversation-scoped call', async () => {
    mockPrisma.staff.findUnique
      .mockResolvedValueOnce({ id: 's1', isActive: true })
      .mockResolvedValueOnce({ id: 's2', isActive: true })
    mockPrisma.teamConversationMember.findFirst
      .mockResolvedValueOnce({ id: 'm1' }) // caller is a member
      .mockResolvedValueOnce(null)         // callee is NOT a member
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
  })

  it('SECURITY RE-VERIFICATION (was HIGH): fails closed when CallRecordId does not reference a real, matching TeamCallRecord — this was the second, unchecked path straight to <Dial> that bypassed the DM-only restriction, the call-initiation rate limit, and the audit trail entirely, independent of the POST /calls REST route', async () => {
    mockPrisma.staff.findUnique
      .mockResolvedValueOnce({ id: 's1', isActive: true })
      .mockResolvedValueOnce({ id: 's2', isActive: true })
    mockPrisma.teamConversationMember.findFirst
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ id: 'm2' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce(null) // no such call record exists
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
    expect(mockPrisma.teamCallRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'call1', conversationId: 'conv1', callerId: 's1' }),
    }))
  })

  it('SECURITY RE-VERIFICATION (was HIGH): fails closed when a matching call record exists but was created for a DIFFERENT callee — a forged CalleeStaffId cannot ride along on someone else\'s legitimate call record', async () => {
    mockPrisma.staff.findUnique
      .mockResolvedValueOnce({ id: 's1', isActive: true })
      .mockResolvedValueOnce({ id: 's2', isActive: true })
    mockPrisma.teamConversationMember.findFirst
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ id: 'm2' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce({ participantIds: ['s3'] }) // record is for a different callee
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Dial>')
  })

  it('dials <Client>staff-<calleeId></Client> once every check passes, including a real matching TeamCallRecord', async () => {
    mockPrisma.staff.findUnique
      .mockResolvedValueOnce({ id: 's1', isActive: true })
      .mockResolvedValueOnce({ id: 's2', isActive: true })
    mockPrisma.teamConversationMember.findFirst
      .mockResolvedValueOnce({ id: 'm1' })
      .mockResolvedValueOnce({ id: 'm2' })
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Dial>')
    expect(body).toContain('<Identity>staff-s2</Identity>')
    expect(body).not.toContain('<Conference')
  })

  it('fails closed (does not throw) if a DB check errors', async () => {
    mockPrisma.staff.findUnique.mockRejectedValueOnce(new Error('db down'))
    const res = await voicePost(voiceReq(FULL_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
  })

  it('SECURITY RE-VERIFICATION: is rate-limited independently of the REST /calls route — uses the REAL lib/rate-limit to prove it', async () => {
    mockPrisma.staff.findUnique.mockResolvedValue({ id: 'ignored', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValue({ id: 'm' })

    let sawDial = false
    let sawHangupAfterDial = false
    for (let i = 0; i < 35; i++) {
      const res = await voicePost(voiceReq({ ...FULL_FIELDS, From: 'client:staff-rate-limit-test' }))
      const body = await res.text()
      if (body.includes('<Dial>')) sawDial = true
      else if (sawDial && body.includes('<Hangup/>')) sawHangupAfterDial = true
    }
    // Once the (real, unmocked) limiter for this From-keyed bucket trips, every
    // subsequent otherwise-identical request must fail closed instead of dialing.
    expect(sawDial).toBe(true)
    expect(sawHangupAfterDial).toBe(true)
  })
})

describe('POST /api/team/twilio/voice — GROUP/CHANNEL conference dialing', () => {
  // No CalleeStaffId for group calls — any current member may join, there is no fixed callee.
  const GROUP_FIELDS = { From: 'client:staff-s1', ConversationId: 'conv1', CallRecordId: 'call1' }

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token'
    mockVerifyTwilioSignature.mockReturnValue(true)
    mockPrisma.teamConversation.findUnique.mockResolvedValue({ type: 'GROUP' })
  })

  it('dials <Conference> (never <Client>) once caller is an active member and the call record is active, for both GROUP and CHANNEL types', async () => {
    for (const type of ['GROUP', 'CHANNEL']) {
      mockPrisma.teamConversation.findUnique.mockResolvedValueOnce({ type })
      mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true })
      mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' })
      mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce({ conferenceName: 'teamhub-secret-room' })

      const res = await voicePost(voiceReq(GROUP_FIELDS))
      const body = await res.text()
      expect(body).toContain('<Conference')
      expect(body).toContain('teamhub-secret-room')
      expect(body).not.toContain('<Client>')
      expect(body).toContain('record="do-not-record"') // SECURITY: no recording, ever
    }
  })

  it('SECURITY RE-VERIFICATION: guessing/knowing a CallRecordId alone is NOT sufficient — fails closed when the caller is not a current member, even with a genuinely active call record', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce(null) // caller is NOT (or no longer) a member
    const res = await voicePost(voiceReq(GROUP_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Conference')
    // the call-record lookup (and therefore the conference name) must never even be reached
    expect(mockPrisma.teamCallRecord.findFirst).not.toHaveBeenCalled()
  })

  it('SECURITY RE-VERIFICATION (former member cannot join): fails closed for a staff member who WAS a member when the call started but has since left — membership is re-checked fresh at join time, not cached from call-start', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce(null) // leftAt is now set — findFirst with leftAt:null finds nothing
    const res = await voicePost(voiceReq(GROUP_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Conference')
  })

  it('fails closed for an inactive staff member even if still conversation-listed', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: false })
    const res = await voicePost(voiceReq(GROUP_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(mockPrisma.teamConversationMember.findFirst).not.toHaveBeenCalled()
  })

  it('SECURITY RE-VERIFICATION (guessed call/room identifier denied): fails closed when CallRecordId does not match any ACTIVE call for this conversation (ended, failed, or entirely fictional)', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce(null) // no such active call record
    const res = await voicePost(voiceReq(GROUP_FIELDS))
    const body = await res.text()
    expect(body).toContain('<Hangup/>')
    expect(body).not.toContain('<Conference')
    expect(mockPrisma.teamCallRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'call1', conversationId: 'conv1', status: { in: ['STARTED', 'ACTIVE'] } }),
    }))
  })

  it('the conference name is resolved SERVER-SIDE from the call record — never accepted as a client-supplied field', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce({ conferenceName: 'teamhub-real-room' })
    // Attacker supplies a forged/guessed ConferenceName field — must be ignored entirely.
    const res = await voicePost(voiceReq({ ...GROUP_FIELDS, ConferenceName: 'attacker-supplied-room' } as never))
    const body = await res.text()
    expect(body).toContain('teamhub-real-room')
    expect(body).not.toContain('attacker-supplied-room')
  })

  it('does not require CalleeStaffId at all for a group call', async () => {
    mockPrisma.staff.findUnique.mockResolvedValueOnce({ id: 's1', isActive: true })
    mockPrisma.teamConversationMember.findFirst.mockResolvedValueOnce({ id: 'm1' })
    mockPrisma.teamCallRecord.findFirst.mockResolvedValueOnce({ conferenceName: 'teamhub-room' })
    const res = await voicePost(voiceReq(GROUP_FIELDS)) // no CalleeStaffId
    const body = await res.text()
    expect(body).toContain('<Conference')
  })
})
