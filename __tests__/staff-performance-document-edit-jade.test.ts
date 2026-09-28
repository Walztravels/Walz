/**
 * PATCH /api/admin/performance/documents/[docId] (edit draft — immutability
 * once issued) and POST .../jade (Jade assistance — protected facts,
 * draft-only, never auto-saved).
 */
const mockPrisma = {
  staffPerformanceDocument: { findUnique: jest.fn(), update: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/history', () => ({ logPerformanceHistory: jest.fn() }))
jest.mock('@/lib/performance/jade', () => ({
  callJadeAssist: jest.fn(),
}))

import { getAdminSession } from '@/lib/admin-auth'
import { callJadeAssist } from '@/lib/performance/jade'
import { PATCH } from '@/app/api/admin/performance/documents/[docId]/route'
import { POST as jadeAssist } from '@/app/api/admin/performance/documents/[docId]/jade/route'

const SUPER_ADMIN = { id: 'admin1', staffId: 'admin1', staffRole: 'super_admin', name: 'Super Admin' }
const DRAFT_DOC = {
  id: 'doc1',
  caseId: 'case1',
  status: 'DRAFT',
  version: 1,
  draftContent: 'Dear Jane,...',
  employeeNameSnapshot: 'Jane Doe',
  jobTitleSnapshot: 'Sales Agent',
  departmentSnapshot: 'sales',
  warningType: 'FIRST_WRITTEN_WARNING',
  reviewPeriodStart: new Date('2026-05-01'),
  reviewPeriodEnd: new Date('2026-08-29'),
  salesInPeriod: 0,
  lastSaleDate: null,
  reviewDate: new Date('2026-09-29'),
  warningHistorySummary: 'No prior formal performance warning has been recorded for this staff member.',
}
const ctx = { params: { docId: 'doc1' } }
function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof PATCH>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SUPER_ADMIN)
  mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC })
  mockPrisma.staffPerformanceDocument.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...DRAFT_DOC, ...data }),
  )
})

describe('PATCH /api/admin/performance/documents/[docId]', () => {
  it('allows editing while DRAFT', async () => {
    const res = await PATCH(req({ draftContent: 'Updated content' }), ctx)
    expect(res.status).toBe(200)
    expect(mockPrisma.staffPerformanceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ draftContent: 'Updated content' }) }),
    )
  })

  it('refuses to edit an ISSUED document — issuance must be immutable (mission brief §7)', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC, status: 'ISSUED' })
    const res = await PATCH(req({ draftContent: 'tampered' }), ctx)
    expect(res.status).toBe(409)
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })

  it('refuses to edit an APPROVED document too', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC, status: 'APPROVED' })
    const res = await PATCH(req({ draftContent: 'tampered' }), ctx)
    expect(res.status).toBe(409)
  })
})

describe('POST /api/admin/performance/documents/[docId]/jade', () => {
  it('403s a non-super-admin', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 'x', staffRole: 'sales_rep' })
    const res = await jadeAssist(req({ action: 'REWRITE_PROFESSIONALLY' }), ctx)
    expect(res.status).toBe(403)
    expect(callJadeAssist).not.toHaveBeenCalled()
  })

  it('refuses to assist once the document is no longer DRAFT', async () => {
    mockPrisma.staffPerformanceDocument.findUnique.mockResolvedValue({ ...DRAFT_DOC, status: 'ISSUED' })
    const res = await jadeAssist(req({ action: 'REWRITE_PROFESSIONALLY' }), ctx)
    expect(res.status).toBe(409)
    expect(callJadeAssist).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized action (Jade never sends/approves/selects an outcome — those verbs are not valid actions)', async () => {
    for (const bad of ['SEND_WARNING', 'APPROVE_WARNING', 'TERMINATE', 'SCHEDULE_DISCIPLINARY']) {
      const res = await jadeAssist(req({ action: bad }), ctx)
      expect(res.status).toBe(400)
    }
    expect(callJadeAssist).not.toHaveBeenCalled()
  })

  it('passes protected facts separately from any instruction, sourced from the document snapshot (never client-supplied)', async () => {
    ;(callJadeAssist as jest.Mock).mockResolvedValue({ ok: true, text: 'Rewritten.', factsCheck: { ok: true, missing: [] } })
    await jadeAssist(req({ action: 'REWRITE_PROFESSIONALLY', instruction: 'shorter please' }), ctx)
    const call = (callJadeAssist as jest.Mock).mock.calls[0][0]
    expect(call.facts.employeeName).toBe('Jane Doe')
    expect(call.facts.salesInPeriod).toBe(0)
    expect(call.instruction).toBe('shorter please')
    // The facts object never contains an "instruction" field mixed in.
    expect(call.facts.instruction).toBeUndefined()
  })

  it('never writes Jade output back into the document — the client must explicitly accept it via PATCH', async () => {
    ;(callJadeAssist as jest.Mock).mockResolvedValue({ ok: true, text: 'Rewritten.', factsCheck: { ok: true, missing: [] } })
    await jadeAssist(req({ action: 'REWRITE_PROFESSIONALLY' }), ctx)
    expect(mockPrisma.staffPerformanceDocument.update).not.toHaveBeenCalled()
  })

  it('surfaces a facts-check warning without blocking the response', async () => {
    ;(callJadeAssist as jest.Mock).mockResolvedValue({ ok: true, text: 'Rewritten.', factsCheck: { ok: false, missing: ['sales count'] } })
    const res = await jadeAssist(req({ action: 'MAKE_CONCISE' }), ctx)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.factsCheck.ok).toBe(false)
  })

  it('returns 502 when the provider fails, never a silent fallback masquerading as success', async () => {
    ;(callJadeAssist as jest.Mock).mockResolvedValue({ ok: false, error: 'provider down' })
    const res = await jadeAssist(req({ action: 'SUMMARIZE_EVIDENCE' }), ctx)
    expect(res.status).toBe(502)
  })
})
