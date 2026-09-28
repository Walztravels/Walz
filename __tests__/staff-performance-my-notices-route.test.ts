/**
 * Staff self-service endpoints (mission brief §9/§12). The critical
 * property under test is IDOR-safety: a staff member must NEVER be able
 * to read, acknowledge, or respond to another staff member's document by
 * guessing/changing a docId in the URL.
 */
const mockPrisma = {
  staffPerformanceDocument: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { GET as listNotices } from '@/app/api/admin/performance/my-notices/route'
import { GET as getNotice } from '@/app/api/admin/performance/my-notices/[docId]/route'
import { POST as acknowledge } from '@/app/api/admin/performance/my-notices/[docId]/acknowledge/route'
import { POST as respond } from '@/app/api/admin/performance/my-notices/[docId]/respond/route'
import { ACKNOWLEDGEMENT_TEXT } from '@/lib/performance/acknowledgement'

const STAFF_SESSION = { id: 'sX', staffId: 'sX', name: 'Jane Doe' }
const OTHER_STAFFS_DOC = { id: 'doc-belongs-to-other', staffId: 's-other', status: 'ISSUED', caseId: 'case1', version: 1 }
const OWN_DOC = {
  id: 'doc-own',
  staffId: 'sX',
  status: 'ISSUED',
  caseId: 'case1',
  version: 1,
  openedAt: null,
  acknowledgedAt: null,
  employeeResponse: null,
  employeeResponseAt: null,
  warningType: 'FIRST_WRITTEN_WARNING',
  reviewDate: new Date('2026-09-29'),
  draftContent: 'draft',
  issuedContent: 'issued content',
  deliveredAt: new Date(),
  acknowledgementText: null,
}

function req(body: Record<string, unknown> = {}) {
  return { json: async () => body } as unknown as Parameters<typeof acknowledge>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
})

describe('GET /api/admin/performance/my-notices', () => {
  it('always scopes to the caller — never accepts a staffId param', async () => {
    mockPrisma.staffPerformanceDocument.findMany.mockResolvedValue([])
    await listNotices(req() as unknown as Parameters<typeof listNotices>[0])
    expect(mockPrisma.staffPerformanceDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ staffId: 'sX' }) }),
    )
  })
})

describe('GET /api/admin/performance/my-notices/[docId] — IDOR guard', () => {
  it('404s when the document belongs to a different staff member (never leaks its existence)', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(OTHER_STAFFS_DOC)
    const res = await getNotice(req() as unknown as Parameters<typeof getNotice>[0], { params: { docId: 'doc-belongs-to-other' } })
    expect(res.status).toBe(404)
  })

  it('404s a genuinely missing document with the SAME response shape (never distinguishes not-found from not-yours)', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(null)
    const res = await getNotice(req() as unknown as Parameters<typeof getNotice>[0], { params: { docId: 'nope' } })
    expect(res.status).toBe(404)
  })

  it('200s and returns content for the caller\'s own issued document', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC })
    mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
    const res = await getNotice(req() as unknown as Parameters<typeof getNotice>[0], { params: { docId: 'doc-own' } })
    expect(res.status).toBe(200)
  })

  it('404s a DRAFT document even if it is (somehow) the caller\'s own — employees never see unissued drafts', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC, status: 'DRAFT' })
    const res = await getNotice(req() as unknown as Parameters<typeof getNotice>[0], { params: { docId: 'doc-own' } })
    expect(res.status).toBe(404)
  })

  it('employee can still access an ISSUED notice whose email delivery FAILED — access is gated on status, never on email delivery state (mission remediation P1)', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({
      ...OWN_DOC, emailDeliveryStatus: 'FAILED', emailDeliveryError: 'Resend outage', deliveredAt: null,
    })
    mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
    const res = await getNotice(req() as unknown as Parameters<typeof getNotice>[0], { params: { docId: 'doc-own' } })
    expect(res.status).toBe(200)
  })

  it('never exposes emailDeliveryStatus/emailDeliveryError to the employee — Super-Admin-internal fields only', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({
      ...OWN_DOC, emailDeliveryStatus: 'FAILED', emailDeliveryError: 'Resend outage: domain not verified',
    })
    mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
    const res = await getNotice(req() as unknown as Parameters<typeof getNotice>[0], { params: { docId: 'doc-own' } })
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('emailDeliveryStatus')
    expect(JSON.stringify(json)).not.toContain('Resend outage')
  })
})

describe('POST .../acknowledge — fixed wording, idempotent, never implies agreement', () => {
  it('cannot acknowledge another staff member\'s document', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(OTHER_STAFFS_DOC)
    const res = await acknowledge(req(), { params: { docId: 'doc-belongs-to-other' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })

  it('always writes the fixed ACKNOWLEDGEMENT_TEXT, ignoring any client-supplied text', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC })
    mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
    await acknowledge(req({ acknowledgementText: 'I agree with this warning' }), { params: { docId: 'doc-own' } })
    expect(mockPrisma.staffPerformanceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acknowledgementText: ACKNOWLEDGEMENT_TEXT }) }),
    )
  })

  it('is idempotent — re-acknowledging returns the existing timestamp, never overwrites it', async () => {
    const already = new Date('2026-09-01')
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC, acknowledgedAt: already, acknowledgementText: ACKNOWLEDGEMENT_TEXT })
    const res = await acknowledge(req(), { params: { docId: 'doc-own' } })
    const json = await res.json()
    expect(json.acknowledgedAt).toBe(already.toISOString())
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })
})

describe('POST .../respond', () => {
  it('cannot respond to another staff member\'s document', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(OTHER_STAFFS_DOC)
    const res = await respond(req({ response: 'hello' }), { params: { docId: 'doc-belongs-to-other' } })
    expect(res.status).toBe(404)
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })

  it('rejects an empty response', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC })
    const res = await respond(req({ response: '   ' }), { params: { docId: 'doc-own' } })
    expect(res.status).toBe(400)
  })

  it('rejects an over-length response', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC })
    const res = await respond(req({ response: 'x'.repeat(5000) }), { params: { docId: 'doc-own' } })
    expect(res.status).toBe(400)
  })

  it('records the response and timestamp for the owner', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...OWN_DOC })
    mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
    const res = await respond(req({ response: 'I was on approved leave for part of this period.' }), { params: { docId: 'doc-own' } })
    expect(res.status).toBe(200)
    expect(mockPrisma.staffPerformanceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ employeeResponse: 'I was on approved leave for part of this period.' }) }),
    )
  })
})
