/**
 * Attachment upload/retrieval and message search. Covers: size cap, MIME
 * allowlist, message+attachment created atomically (rollback on storage
 * failure), retrieval re-verifies CURRENT membership + dual-scoped lookup
 * (IDOR-safe — an attachment id alone is never sufficient), and search's
 * membership filter living INSIDE the query.
 */
const mockPrisma = {
  teamMessage: { create: jest.fn(), delete: jest.fn(() => Promise.resolve({})), findFirst: jest.fn(), findMany: jest.fn() },
  teamMessageAttachment: { create: jest.fn(), findFirst: jest.fn() },
  teamConversation: { update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn() }))
jest.mock('@/lib/team/authz', () => ({
  currentStaffId: jest.fn((s: { staffId?: string; id: string }) => s.staffId ?? s.id),
  checkConversationMembership: jest.fn(),
}))
jest.mock('@/lib/team/attachments', () => ({
  isAllowedAttachmentType: jest.fn(),
  sanitizeFilename: jest.fn((n: string) => n),
  buildAttachmentStorageKey: jest.fn(() => 'conv1/msg1/123-file.png'),
  uploadAttachment: jest.fn(),
  getAttachmentSignedUrl: jest.fn(),
  MAX_ATTACHMENT_BYTES: 25 * 1024 * 1024,
  SIGNED_URL_TTL_S: 3600,
}))

import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import { checkConversationMembership } from '@/lib/team/authz'
import { isAllowedAttachmentType, uploadAttachment, getAttachmentSignedUrl } from '@/lib/team/attachments'
import { POST as uploadRoute } from '@/app/api/admin/team/conversations/[id]/attachments/route'
import { GET as retrievalRoute } from '@/app/api/admin/team/conversations/[id]/messages/[messageId]/attachments/[attachmentId]/route'
import { GET as searchRoute } from '@/app/api/admin/team/search/route'

const SESSION = { id: 's1', staffId: 's1', email: 'staff@walztravels.com', role: 'staff', name: 'Staff One', permissions: {} }
const CONVO_ID = 'conv1'

function fakeFile(name: string, type: string, size: number): File {
  const buf = new Uint8Array(size)
  return new File([buf], name, { type })
}
function uploadReq(fields: Record<string, unknown>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v as never)
  return { formData: async () => fd } as unknown as Parameters<typeof uploadRoute>[0]
}
function getReq(url: string) {
  return { url } as unknown as Parameters<typeof searchRoute>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION)
  ;(rateLimit as jest.Mock).mockReturnValue({ allowed: true, remaining: 10, resetAt: 0 })
  ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: true, member: { role: 'member' } })
  ;(isAllowedAttachmentType as jest.Mock).mockReturnValue(true)
})

describe('POST attachment upload', () => {
  beforeEach(() => {
    mockPrisma.teamMessage.create.mockResolvedValue({ id: 'msg1', body: '', parentMessageId: null, createdAt: new Date() })
    mockPrisma.teamMessageAttachment.create.mockResolvedValue({ id: 'att1', filename: 'file.png', contentType: 'image/png', sizeBytes: 100 })
    mockPrisma.teamConversation.update.mockResolvedValue({})
  })

  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await uploadRoute(uploadReq({ file: fakeFile('a.png', 'image/png', 10) }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(401)
  })

  it('denies a non-member', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await uploadRoute(uploadReq({ file: fakeFile('a.png', 'image/png', 10) }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(403)
  })

  it('rejects when no file is present', async () => {
    const res = await uploadRoute(uploadReq({}), { params: { id: CONVO_ID } })
    expect(res.status).toBe(400)
  })

  it('rejects an oversized file before touching storage', async () => {
    const res = await uploadRoute(uploadReq({ file: fakeFile('a.png', 'image/png', 26 * 1024 * 1024) }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(413)
    expect(uploadAttachment).not.toHaveBeenCalled()
  })

  it('rejects a disallowed MIME type before touching storage', async () => {
    ;(isAllowedAttachmentType as jest.Mock).mockReturnValue(false)
    const res = await uploadRoute(uploadReq({ file: fakeFile('a.exe', 'application/x-msdownload', 10) }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(415)
    expect(uploadAttachment).not.toHaveBeenCalled()
  })

  it('creates the message before uploading, then rolls it back if storage fails', async () => {
    ;(uploadAttachment as jest.Mock).mockRejectedValueOnce(new Error('storage down'))
    const res = await uploadRoute(uploadReq({ file: fakeFile('a.png', 'image/png', 10) }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(500)
    expect(mockPrisma.teamMessage.delete).toHaveBeenCalledWith({ where: { id: 'msg1' } })
    expect(mockPrisma.teamMessageAttachment.create).not.toHaveBeenCalled()
  })

  it('succeeds: creates message + attachment together, derives authorId from session', async () => {
    const res = await uploadRoute(uploadReq({ file: fakeFile('a.png', 'image/png', 10), body: 'here you go' }), { params: { id: CONVO_ID } })
    expect(res.status).toBe(200)
    expect(mockPrisma.teamMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ authorId: 's1', conversationId: CONVO_ID }) }))
    expect(mockPrisma.teamMessageAttachment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ messageId: 'msg1', uploadedBy: 's1' }) }))
  })
})

describe('GET attachment retrieval', () => {
  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await retrievalRoute({} as never, { params: { id: CONVO_ID, messageId: 'm1', attachmentId: 'a1' } })
    expect(res.status).toBe(401)
  })

  it('re-verifies CURRENT membership before anything else', async () => {
    ;(checkConversationMembership as jest.Mock).mockResolvedValue({ allowed: false, status: 403, error: 'denied' })
    const res = await retrievalRoute({} as never, { params: { id: CONVO_ID, messageId: 'm1', attachmentId: 'a1' } })
    expect(res.status).toBe(403)
    expect(mockPrisma.teamMessageAttachment.findFirst).not.toHaveBeenCalled()
  })

  it('404s when the attachment does not belong to that message/conversation (IDOR-safe dual scoping)', async () => {
    mockPrisma.teamMessageAttachment.findFirst.mockResolvedValue(null)
    const res = await retrievalRoute({} as never, { params: { id: CONVO_ID, messageId: 'm1', attachmentId: 'a1' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.teamMessageAttachment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'a1', messageId: 'm1', message: { conversationId: CONVO_ID } },
    }))
  })

  it('mints a fresh signed URL for an authorized attachment', async () => {
    mockPrisma.teamMessageAttachment.findFirst.mockResolvedValue({ id: 'a1', storageKey: 'k', filename: 'f.png', contentType: 'image/png' })
    ;(getAttachmentSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/x')
    const res = await retrievalRoute({} as never, { params: { id: CONVO_ID, messageId: 'm1', attachmentId: 'a1' } })
    const json = await res.json()
    expect(json.signedUrl).toBe('https://signed.example/x')
  })
})

describe('GET search', () => {
  it('rejects unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await searchRoute(getReq('http://x/api?q=hello'))
    expect(res.status).toBe(401)
  })

  it('returns empty for a too-short query without hitting the DB', async () => {
    const res = await searchRoute(getReq('http://x/api?q=a'))
    const json = await res.json()
    expect(json.results).toEqual([])
    expect(mockPrisma.teamMessage.findMany).not.toHaveBeenCalled()
  })

  it('scopes the query by CURRENT membership INSIDE the where clause', async () => {
    mockPrisma.teamMessage.findMany.mockResolvedValue([])
    await searchRoute(getReq('http://x/api?q=flight'))
    const call = mockPrisma.teamMessage.findMany.mock.calls[0][0]
    expect(call.where.conversation.members.some).toEqual({ staffId: 's1', leftAt: null })
    expect(call.where.deletedAt).toBeNull()
  })

  it('SECURITY RE-VERIFICATION (was HIGH): is rate-limited — search previously had no limit at all, an unbounded scraping/enumeration vector', async () => {
    ;(rateLimit as jest.Mock).mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await searchRoute(getReq('http://x/api?q=flight'))
    expect(res.status).toBe(429)
    expect(mockPrisma.teamMessage.findMany).not.toHaveBeenCalled()
  })

  it('escapes LIKE metacharacters so "%"/"_" in a query match literally rather than as wildcards', async () => {
    mockPrisma.teamMessage.findMany.mockResolvedValue([])
    await searchRoute(getReq(`http://x/api?q=${encodeURIComponent('50%')}`))
    const call = mockPrisma.teamMessage.findMany.mock.calls[0][0]
    expect(call.where.body.contains).toBe('50\\%')
  })
})
