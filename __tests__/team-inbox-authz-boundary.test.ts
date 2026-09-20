/**
 * Team Hub ↔ Inbox authorization boundary — release-blocking rule (Ask
 * Team / clarification-link feature).
 *
 * Team Hub conversation membership must NEVER be treated as equivalent to,
 * or a substitute for, real Inbox authorization (checkInboxPermission +
 * checkConversationAccess), and vice versa. Covers:
 *   - GET /api/admin/inbox/conversations/[id]/team-context: a staff member
 *     who is a Team Hub conversation member but is DENIED by the real,
 *     unmodified Inbox RBAC must be denied here too.
 *   - The context card is withheld (`available:false`) unless identity
 *     resolution is EXACTLY LINKED or VERIFIED — HEURISTIC and UNRESOLVED
 *     are both denied/withheld.
 *   - POST/GET/PATCH /api/admin/team/conversations/[id]/inbox-link: the
 *     cross-product AND — denied if Team Hub membership fails even when
 *     Inbox access succeeds, denied if Inbox access fails even when Team
 *     Hub membership succeeds, allowed only when BOTH succeed. Neither
 *     check is ever skipped or inferred from the other.
 */

const mockPrisma = {
  teamMessage: { findFirst: jest.fn() },
  teamInboxDiscussionLink: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/inbox/authz', () => ({ checkInboxPermission: jest.fn(), checkConversationAccess: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
  checkConversationMembership: jest.fn(),
}))
jest.mock('@/lib/inbox/client-context', () => ({ resolveClientActionContext: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { checkConversationMembership } from '@/lib/team/authz'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { GET as teamContext } from '@/app/api/admin/inbox/conversations/[id]/team-context/route'
import { POST as createLink, GET as getLink, PATCH as patchLink } from '@/app/api/admin/team/conversations/[id]/inbox-link/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const TEAM_CONV_ID = 'team-conv-1'
const INBOX_CONV_ID = 42

function req(body: Record<string, unknown> = {}) {
  return { json: async () => body, url: `http://x/api?inboxConversationId=${INBOX_CONV_ID}` } as unknown as Parameters<typeof createLink>[0]
}
function ctx() {
  return { params: { id: TEAM_CONV_ID } }
}
function baseContext(resolution: 'LINKED' | 'VERIFIED' | 'HEURISTIC' | 'UNRESOLVED') {
  return {
    conversationId: INBOX_CONV_ID,
    contact: { name: 'Ada Client', email: null, phone: null },
    supabaseLead: null, prismaLead: null, user: null, clientAccount: null,
    application: { id: 'app1', walzRef: 'WLZ-1', applicationType: 'UK Tourist Visa', status: 'In Progress' },
    link: null, heuristicCandidates: null,
    resolution, ambiguityReasons: [],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: true })
  ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
})

describe('GET team-context — withheld unless identity resolution is exactly LINKED or VERIFIED', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    expect(res.status).toBe(401)
  })

  it('denies a Team Hub conversation MEMBER whose real Inbox access is denied — membership is never a substitute for Inbox authz', async () => {
    // The route never even consults Team Hub membership — it has no
    // knowledge of it at all — but this proves the point structurally:
    // resolveClientActionContext's own checkConversationAccess failure is
    // what gates this route, regardless of any Team Hub state.
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({
      ok: false, status: 403, error: 'You do not have access to this conversation.',
    })
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    expect(res.status).toBe(403)
  })

  it('withholds the card (available:false) for HEURISTIC resolution', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: baseContext('HEURISTIC') })
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    const json = await res.json()
    expect(json).toEqual({ available: false })
  })

  it('withholds the card (available:false) for UNRESOLVED resolution', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: baseContext('UNRESOLVED') })
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    const json = await res.json()
    expect(json).toEqual({ available: false })
  })

  it('returns the minimal card for LINKED resolution', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: baseContext('LINKED') })
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    const json = await res.json()
    expect(json).toEqual({
      available: true,
      clientDisplayName: 'Ada Client',
      area: 'UK Tourist Visa',
      conversationId: INBOX_CONV_ID,
      identityResolution: 'LINKED',
    })
  })

  it('returns the minimal card for VERIFIED resolution', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: baseContext('VERIFIED') })
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    const json = await res.json()
    expect(json.available).toBe(true)
    expect(json.identityResolution).toBe('VERIFIED')
  })

  it('never leaks more than clientDisplayName/area/conversationId/identityResolution', async () => {
    ;(resolveClientActionContext as jest.Mock).mockResolvedValue({ ok: true, context: baseContext('LINKED') })
    const res = await teamContext(new Request('http://x'), { params: { id: String(INBOX_CONV_ID) } })
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['area', 'available', 'clientDisplayName', 'conversationId', 'identityResolution'])
  })
})

describe('POST inbox-link — cross-product AND of Team Hub membership and Inbox authorization', () => {
  beforeEach(() => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue({ id: 'm1', conversationId: TEAM_CONV_ID })
    mockPrisma.teamInboxDiscussionLink.findUnique.mockResolvedValue(null)
    mockPrisma.teamInboxDiscussionLink.create.mockResolvedValue({
      id: 'link1', messageId: 'm1', chatwootConversationId: INBOX_CONV_ID, status: 'OPEN',
      createdAt: new Date(), updatedAt: new Date(),
    })
  })

  it('denies when Team Hub membership fails — even though Inbox access succeeds', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no membership' })
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
    const res = await createLink(req({ messageId: 'm1', inboxConversationId: INBOX_CONV_ID }), ctx())
    expect(res.status).toBe(403)
    expect(mockPrisma.teamInboxDiscussionLink.create).not.toHaveBeenCalled()
  })

  it('denies when Inbox access fails — even though Team Hub membership succeeds', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no inbox access' })
    const res = await createLink(req({ messageId: 'm1', inboxConversationId: INBOX_CONV_ID }), ctx())
    expect(res.status).toBe(403)
    expect(mockPrisma.teamInboxDiscussionLink.create).not.toHaveBeenCalled()
  })

  it('denies when inbox_view permission itself is missing — even with Team Hub membership', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
    ;(checkInboxPermission as jest.Mock).mockReturnValue({ allowed: false, status: 403, error: 'no permission' })
    const res = await createLink(req({ messageId: 'm1', inboxConversationId: INBOX_CONV_ID }), ctx())
    expect(res.status).toBe(403)
    expect(mockPrisma.teamInboxDiscussionLink.create).not.toHaveBeenCalled()
    expect(checkConversationAccess).not.toHaveBeenCalled()
  })

  it('allows creation ONLY when both Team Hub membership AND Inbox access succeed', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: true })
    const res = await createLink(req({ messageId: 'm1', inboxConversationId: INBOX_CONV_ID }), ctx())
    expect(res.status).toBe(200)
    expect(mockPrisma.teamInboxDiscussionLink.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ messageId: 'm1', chatwootConversationId: INBOX_CONV_ID, status: 'OPEN', linkedBy: 's1' }),
    }))
  })

  it('rejects a messageId belonging to a different Team Hub conversation', async () => {
    mockPrisma.teamMessage.findFirst.mockResolvedValue(null)
    const res = await createLink(req({ messageId: 'foreign-msg', inboxConversationId: INBOX_CONV_ID }), ctx())
    expect(res.status).toBe(404)
    expect(checkInboxPermission).not.toHaveBeenCalled() // never even reaches the Inbox gate for a foreign message
  })

  it('is idempotent — a second call for the same messageId returns the existing link, not a duplicate', async () => {
    mockPrisma.teamInboxDiscussionLink.findUnique.mockResolvedValue({
      id: 'link1', messageId: 'm1', chatwootConversationId: INBOX_CONV_ID, status: 'OPEN',
      createdAt: new Date(), updatedAt: new Date(),
    })
    const res = await createLink(req({ messageId: 'm1', inboxConversationId: INBOX_CONV_ID }), ctx())
    expect(res.status).toBe(200)
    expect(mockPrisma.teamInboxDiscussionLink.create).not.toHaveBeenCalled()
  })
})

describe('GET inbox-link — same cross-product AND applies to reads', () => {
  it('denies when Team Hub membership fails', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no membership' })
    const res = await getLink(req(), ctx())
    expect(res.status).toBe(403)
  })

  it('denies when Inbox access fails, even with Team Hub membership', async () => {
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no inbox access' })
    const res = await getLink(req(), ctx())
    expect(res.status).toBe(403)
  })

  it('returns the link when both checks pass', async () => {
    mockPrisma.teamInboxDiscussionLink.findFirst.mockResolvedValue({
      id: 'link1', messageId: 'm1', chatwootConversationId: INBOX_CONV_ID, status: 'OPEN',
      createdAt: new Date(), updatedAt: new Date(),
    })
    const res = await getLink(req(), ctx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.link.inboxConversationId).toBe(INBOX_CONV_ID)
  })
})

describe('PATCH inbox-link — status transitions re-verify Inbox authz on the link\'s own conversation id', () => {
  beforeEach(() => {
    mockPrisma.teamInboxDiscussionLink.findFirst.mockResolvedValue({
      id: 'link1', messageId: 'm1', chatwootConversationId: INBOX_CONV_ID, status: 'OPEN',
      createdAt: new Date(), updatedAt: new Date(),
    })
    mockPrisma.teamInboxDiscussionLink.update.mockResolvedValue({
      id: 'link1', messageId: 'm1', chatwootConversationId: INBOX_CONV_ID, status: 'RESOLVED',
      createdAt: new Date(), updatedAt: new Date(),
    })
  })

  it('rejects an invalid status', async () => {
    const res = await patchLink(req({ messageId: 'm1', status: 'BOGUS' }), ctx())
    expect(res.status).toBe(400)
  })

  it('denies when Team Hub membership fails', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no membership' })
    const res = await patchLink(req({ messageId: 'm1', status: 'RESOLVED' }), ctx())
    expect(res.status).toBe(403)
  })

  it('denies when Inbox access on the link\'s conversation fails, even with Team Hub membership', async () => {
    ;(checkConversationAccess as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'no inbox access' })
    const res = await patchLink(req({ messageId: 'm1', status: 'RESOLVED' }), ctx())
    expect(res.status).toBe(403)
    expect(mockPrisma.teamInboxDiscussionLink.update).not.toHaveBeenCalled()
  })

  it('allows an explicit RESOLVED transition when both checks pass', async () => {
    const res = await patchLink(req({ messageId: 'm1', status: 'RESOLVED' }), ctx())
    expect(res.status).toBe(200)
    expect(mockPrisma.teamInboxDiscussionLink.update).toHaveBeenCalledWith({ where: { messageId: 'm1' }, data: { status: 'RESOLVED' } })
  })
})
