/**
 * Email content (mission brief §8, exact subject/body) and the separate
 * /approve endpoint (marks APPROVED without sending anything).
 */
import { PERFORMANCE_EMAIL_SUBJECT, buildPerformanceNoticeEmailHtml } from '@/lib/performance/email'

describe('Performance notice email content', () => {
  const input = {
    toEmail: 'jane@walztravels.com',
    employeeName: 'Jane Doe',
    reviewDateDisplay: '29 September 2026',
    reviewUrl: 'https://app.walztravels.com/admin/my-performance/doc1',
  }

  it('subject matches the brief exactly', () => {
    expect(PERFORMANCE_EMAIL_SUBJECT).toBe('CONFIDENTIAL: Performance Review — Walz Travels')
  })

  it('body contains the required elements from the brief', () => {
    const html = buildPerformanceNoticeEmailHtml(input)
    expect(html).toContain('Dear Jane Doe,')
    expect(html).toContain('A performance review document has been issued to you by Walz Travels')
    expect(html).toContain('Review date: 29 September 2026')
    expect(html).toContain('If you believe any information contained in the notice is inaccurate')
    expect(html).toContain('Regards')
    expect(html).toContain(input.reviewUrl)
  })

  it('never includes sensitive performance detail in the email body', () => {
    const html = buildPerformanceNoticeEmailHtml(input)
    expect(html.toLowerCase()).not.toMatch(/sales|revenue|warning type|pip duration/)
  })
})

const mockPrisma = {
  staffPerformanceDocument: { findUnique: jest.fn(), updateMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { POST as approve } from '@/app/api/admin/performance/documents/[docId]/approve/route'

const ctx = { params: { docId: 'doc1' } }
function req() {
  return {} as unknown as Parameters<typeof approve>[0]
}

describe('POST /api/admin/performance/documents/[docId]/approve', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' })
  })

  it('marks a DRAFT document APPROVED without sending anything', async () => {
    mockPrisma.staffPerformanceDocument.findUnique
      .mockResolvedValueOnce({ id: 'doc1', status: 'DRAFT', caseId: 'case1', version: 1 })
      .mockResolvedValueOnce({ id: 'doc1', status: 'APPROVED' })
    mockPrisma.staffPerformanceDocument.updateMany.mockResolvedValue({ count: 1 })
    const res = await approve(req(), ctx)
    expect(res.status).toBe(200)
  })

  it('409s a document that is not currently DRAFT', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ id: 'doc1', status: 'ISSUED' })
    const res = await approve(req(), ctx)
    expect(res.status).toBe(409)
    expect(mockPrisma.staffPerformanceDocument.updateMany).not.toHaveBeenCalled()
  })

  it('403s a non-super-admin', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'x', staffRole: 'sales_rep' })
    const res = await approve(req(), ctx)
    expect(res.status).toBe(403)
  })
})
