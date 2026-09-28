/**
 * GET /api/admin/performance/documents/[docId]/pdf — authorization matrix
 * (mission brief §7/§12). No public/anonymous access exists anywhere in
 * this route; every request requires an authenticated admin session.
 */
const mockPrisma = {
  staffPerformanceDocument: { findUnique: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))
jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  StyleSheet: { create: (s: unknown) => s },
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  Image: 'Image',
}))

import { getAdminSession } from '@/lib/admin-auth'
import { GET } from '@/app/api/admin/performance/documents/[docId]/pdf/route'

const ctx = { params: { docId: 'doc1' } }
function getReq() {
  return {} as unknown as Parameters<typeof GET>[0]
}

const BASE_DOC = {
  id: 'doc1',
  caseId: 'case1',
  staffId: 's2',
  version: 1,
  status: 'DRAFT',
  warningType: 'FIRST_WRITTEN_WARNING',
  employeeNameSnapshot: 'Jane Doe',
  jobTitleSnapshot: 'Sales Agent',
  departmentSnapshot: 'sales',
  createdAt: new Date('2026-09-01'),
  reviewDate: new Date('2026-09-29'),
  issuedByName: null,
  draftContent: 'Dear Jane,\n\nDraft body.',
  issuedContent: null,
  acknowledgedAt: null,
  acknowledgementText: null,
  openedAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...BASE_DOC })
  mockPrisma.staffPerformanceDocument.update.mockResolvedValue({})
})

describe('GET /api/admin/performance/documents/[docId]/pdf', () => {
  it('401s unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await GET(getReq(), ctx)).status).toBe(401)
  })

  it('404s an unknown document', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue(null)
    expect((await GET(getReq(), ctx)).status).toBe(404)
  })

  it('super_admin may preview a DRAFT document', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' })
    const res = await GET(getReq(), ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('the document owner CANNOT preview their own DRAFT (only a Super Admin may, before issuance)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's2', staffId: 's2', staffRole: 'sales_agent', name: 'Jane Doe' })
    const res = await GET(getReq(), ctx)
    expect(res.status).toBe(403)
  })

  it('a third, unrelated staff member gets 403 regardless of document status', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's3', staffId: 's3', staffRole: 'sales_rep', name: 'Someone Else' })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...BASE_DOC, status: 'ISSUED', issuedContent: 'Issued body.' })
    const res = await GET(getReq(), ctx)
    expect(res.status).toBe(403)
  })

  it('the owner CAN view their own ISSUED document, and it records openedAt exactly once', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's2', staffId: 's2', staffRole: 'sales_agent', name: 'Jane Doe' })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...BASE_DOC, status: 'ISSUED', issuedContent: 'Issued body.' })
    const res = await GET(getReq(), ctx)
    expect(res.status).toBe(200)
    expect(mockPrisma.staffPerformanceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { openedAt: expect.any(Date) } }),
    )
  })

  it('does not re-stamp openedAt on a second view', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's2', staffId: 's2', staffRole: 'sales_agent', name: 'Jane Doe' })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...BASE_DOC, status: 'ISSUED', issuedContent: 'Issued body.', openedAt: new Date() })
    await GET(getReq(), ctx)
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })

  it('uses the frozen issuedContent for an ISSUED document, never the (possibly stale) draftContent', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' })
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({
      ...BASE_DOC, status: 'ISSUED', draftContent: 'STALE DRAFT', issuedContent: 'FROZEN ISSUED CONTENT',
    })
    const res = await GET(getReq(), ctx)
    expect(res.status).toBe(200)
  })

  it('sets Cache-Control to never-store (confidential document)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' })
    const res = await GET(getReq(), ctx)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
  })
})
