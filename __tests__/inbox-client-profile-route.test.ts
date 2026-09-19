/**
 * Client Profile route (Client Action Centre — shared layer) — behavioral.
 *
 * Executes the actual POST handler (mirrors the pattern used by
 * inbox-ux42-create-quote.test.ts) to prove, not just source-pin, that a
 * browser-supplied identity field in the body has ZERO effect on which
 * record gets updated — conversationId comes ONLY from the URL path, and
 * updateClientProfile is called with exactly {session, conversationId,
 * name, email, phone}, nothing else, regardless of what else the body
 * carries.
 */

const mockGetSession = jest.fn()
const mockUpdateProfile = jest.fn()

jest.mock('@/lib/admin-auth', () => ({ getAdminSession: (...a: unknown[]) => mockGetSession(...a) }))
jest.mock('@/lib/inbox/authz', () => ({
  checkInboxPermission: () => ({ allowed: true }),
  checkConversationAccess: async () => ({ allowed: true }),
}))
jest.mock('@/lib/action-centre/client-profile', () => ({
  updateClientProfile: (...a: unknown[]) => mockUpdateProfile(...a),
}))

import { POST } from '@/app/api/admin/inbox/conversations/[id]/client-profile/route'

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ email: 'staff@walztravels.com', role: 'staff', permissions: {} })
  mockUpdateProfile.mockResolvedValue({ ok: true, fields: { name: 'Real Name' } })
})

describe('client-profile route — browser id immunity', () => {
  it('a bogus foreign userId/clientAccountId/id in the body is never forwarded — identity comes only from the URL conversationId', async () => {
    const res = await POST(
      req({ name: 'Real Name', userId: 'someone-elses-user-id', clientAccountId: 'evil', id: 'evil2', conversationId: 999 }),
      { params: { id: '318' } },
    )
    expect(res.status).toBe(200)
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1)
    const call = mockUpdateProfile.mock.calls[0][0]
    expect(call.conversationId).toBe(318)   // from the URL path, NOT the body's 999
    expect(call.name).toBe('Real Name')
    expect(call).not.toHaveProperty('userId')
    expect(call).not.toHaveProperty('clientAccountId')
    expect(call).not.toHaveProperty('id')
    expect(Object.keys(call).sort()).toEqual(['conversationId', 'email', 'name', 'phone', 'session'])
  })

  it('an invalid conversation id in the URL is rejected before updateClientProfile is ever called', async () => {
    const res = await POST(req({ name: 'x' }), { params: { id: 'not-a-number' } })
    expect(res.status).toBe(400)
    expect(mockUpdateProfile).not.toHaveBeenCalled()
  })

  it('maps CONTACT_CONFLICT to 409 with the conflicts payload', async () => {
    mockUpdateProfile.mockResolvedValue({
      ok: false, code: 'CONTACT_CONFLICT', error: 'mismatch',
      conflicts: [{ field: 'email', existing: 'a@x.com', attempted: 'b@x.com' }],
    })
    const res = await POST(req({ email: 'b@x.com' }), { params: { id: '318' } })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.conflicts).toEqual([{ field: 'email', existing: 'a@x.com', attempted: 'b@x.com' }])
  })

  it('maps NO_LINKED_RECORD to 409 and CLIENT_IDENTITY_REQUIRED to 403', async () => {
    mockUpdateProfile.mockResolvedValue({ ok: false, code: 'NO_LINKED_RECORD', error: 'x' })
    expect((await POST(req({ email: 'a@x.com' }), { params: { id: '318' } })).status).toBe(409)
    mockUpdateProfile.mockResolvedValue({ ok: false, code: 'CLIENT_IDENTITY_REQUIRED', error: 'x' })
    expect((await POST(req({ email: 'a@x.com' }), { params: { id: '318' } })).status).toBe(403)
  })
})
