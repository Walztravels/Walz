/**
 * Staff Updates — acknowledgement HTTP surfaces:
 *   GET/POST /api/admin/announcements/[id]/ack           (self only — identity from session)
 *   GET      /api/admin/announcements/[id]/ack/report    (super_admin only)
 *
 * Identity for the ack routes always comes from getAdminSession(), never
 * from the request body/params — these tests specifically probe that a
 * caller cannot acknowledge on another staff member's behalf, cannot
 * acknowledge an announcement that doesn't target them, and cannot pull
 * the aggregate report without being super_admin.
 */

const mockPrisma = {
  staffAnnouncement:            { findUnique: jest.fn() },
  announcementAcknowledgement:  { findUnique: jest.fn(), upsert: jest.fn(), findMany: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))

const resolveAnnouncementRecipients = jest.fn()
jest.mock('@/lib/staff-updates/audience', () => {
  const actual = jest.requireActual('@/lib/staff-updates/audience')
  return { ...actual, resolveAnnouncementRecipients: (...args: unknown[]) => resolveAnnouncementRecipients(...args) }
})

import { NextRequest } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { GET as ackGet, POST as ackPost } from '@/app/api/admin/announcements/[id]/ack/route'
import { GET as reportGet } from '@/app/api/admin/announcements/[id]/ack/report/route'

const STAFF_SESSION = { id: 's1', role: 'sales_rep', department: 'sales', name: 'Ada', email: 'ada@walztravels.com' }
const OTHER_SESSION = { id: 's2', role: 'sales_rep', department: 'sales', name: 'Bo', email: 'bo@walztravels.com' }
const ADMIN_SESSION = { id: 'admin-1', role: 'super_admin', department: 'general', name: 'Super Admin', email: 'admin@walztravels.com' }

const PUBLISHED_ANN = {
  id: 'ann-1', status: 'PUBLISHED', title: 'Critical Update', priority: 'URGENT',
  audience: 'EVERYONE', audienceRoles: [], audienceStaffIds: [],
}

function postReq(body: unknown) {
  return new NextRequest('https://walztravels.com/api/admin/announcements/ann-1/ack', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}
function getReq(path = 'https://walztravels.com/api/admin/announcements/ann-1/ack') {
  return new NextRequest(path)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.staffAnnouncement.findUnique.mockResolvedValue(PUBLISHED_ANN)
  mockPrisma.announcementAcknowledgement.findUnique.mockResolvedValue(null)
  mockPrisma.announcementAcknowledgement.upsert.mockImplementation(({ create }: any) => ({
    readAt: create.readAt ?? null, acknowledgedAt: create.acknowledgedAt ?? null,
  }))
})

describe('GET /ack', () => {
  it('401s when not authenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await ackGet(getReq(), { params: { id: 'ann-1' } })).status).toBe(401)
  })

  it("returns the caller's own status — never anyone else's — with no ack recorded yet as nulls", async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    const res = await ackGet(getReq(), { params: { id: 'ann-1' } })
    expect(mockPrisma.announcementAcknowledgement.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { announcementId_staffId: { announcementId: 'ann-1', staffId: 's1' } },
    }))
    expect(await res.json()).toEqual({ readAt: null, acknowledgedAt: null })
  })
})

describe('POST /ack', () => {
  it('401s when not authenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await ackPost(postReq({ action: 'read' }), { params: { id: 'ann-1' } })).status).toBe(401)
  })

  it('400s on an invalid action value', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    const res = await ackPost(postReq({ action: 'delete_everything' }), { params: { id: 'ann-1' } })
    expect(res.status).toBe(400)
  })

  it('404s for a non-existent announcement', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue(null)
    expect((await ackPost(postReq({ action: 'read' }), { params: { id: 'ann-1' } })).status).toBe(404)
  })

  it('409s for a DRAFT/unpublished announcement — nothing to acknowledge yet', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, status: 'DRAFT' })
    expect((await ackPost(postReq({ action: 'read' }), { params: { id: 'ann-1' } })).status).toBe(409)
  })

  it('403s when the caller is not actually targeted by the announcement audience', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({
      ...PUBLISHED_ANN, audience: 'SPECIFIC_STAFF', audienceStaffIds: ['someone-else'],
    })
    expect((await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })).status).toBe(403)
    expect(mockPrisma.announcementAcknowledgement.upsert).not.toHaveBeenCalled()
  })

  it('IDOR: always upserts against the SESSION staffId — nothing in the request body can override whose row is written', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    // Attacker-controlled body tries to smuggle another staffId — ignored entirely.
    await ackPost(postReq({ action: 'read', staffId: 'someone-else', targetStaffId: 'someone-else' }), { params: { id: 'ann-1' } })
    expect(mockPrisma.announcementAcknowledgement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { announcementId_staffId: { announcementId: 'ann-1', staffId: 's1' } },
    }))
  })

  it('"read" sets readAt only; "acknowledge" sets both readAt and acknowledgedAt', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    await ackPost(postReq({ action: 'read' }), { params: { id: 'ann-1' } })
    expect(mockPrisma.announcementAcknowledgement.upsert.mock.calls[0][0].update).toEqual({ readAt: expect.any(Date) })

    jest.clearAllMocks()
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue(PUBLISHED_ANN)
    await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })
    expect(mockPrisma.announcementAcknowledgement.upsert.mock.calls[0][0].update).toEqual({
      readAt: expect.any(Date), acknowledgedAt: expect.any(Date),
    })
  })

  it('the acknowledgement response never claims agreement — this route has no such field or wording', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    const res = await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['acknowledgedAt', 'readAt'])
  })

  it('HIGH priority — acknowledgement is available (200, upsert called)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, priority: 'HIGH' })
    const res = await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })
    expect(res.status).toBe(200)
    expect(mockPrisma.announcementAcknowledgement.upsert).toHaveBeenCalled()
  })

  it('URGENT ("Critical") priority — acknowledgement is available (200, upsert called)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, priority: 'URGENT' })
    const res = await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })
    expect(res.status).toBe(200)
    expect(mockPrisma.announcementAcknowledgement.upsert).toHaveBeenCalled()
  })

  it('NORMAL priority — acknowledgement is rejected (400): read tracking only, no acknowledgement requirement', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, priority: 'NORMAL' })
    const res = await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })
    expect(res.status).toBe(400)
    expect(mockPrisma.announcementAcknowledgement.upsert).not.toHaveBeenCalled()
  })

  it('NORMAL priority — "read" still works fine (read tracking applies to every priority)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, priority: 'NORMAL' })
    const res = await ackPost(postReq({ action: 'read' }), { params: { id: 'ann-1' } })
    expect(res.status).toBe(200)
    expect(mockPrisma.announcementAcknowledgement.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { readAt: expect.any(Date) },
    }))
  })

  it('staff cannot acknowledge for another staff member — the OTHER_SESSION identity never appears in any write', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION) // acting as s1
    await ackPost(postReq({ action: 'acknowledge' }), { params: { id: 'ann-1' } })
    const allCalls = JSON.stringify(mockPrisma.announcementAcknowledgement.upsert.mock.calls)
    expect(allCalls).not.toContain(OTHER_SESSION.id)
    expect(allCalls).toContain('"s1"')
  })
})

describe('GET /ack/report', () => {
  beforeEach(() => {
    resolveAnnouncementRecipients.mockResolvedValue([
      { id: 's1', name: 'Ada', email: 'ada@walztravels.com', role: 'sales_rep', department: 'sales' },
      { id: 's2', name: 'Bo',  email: 'bo@walztravels.com',  role: 'sales_rep', department: 'sales' },
    ])
    mockPrisma.announcementAcknowledgement.findMany.mockResolvedValue([
      { staffId: 's1', readAt: new Date('2026-09-01'), acknowledgedAt: new Date('2026-09-01') },
    ])
  })

  it('401s when not authenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    expect((await reportGet(getReq(), { params: { id: 'ann-1' } })).status).toBe(401)
  })

  it('403s for a non-super_admin caller — including a plain "admin" role', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ ...STAFF_SESSION, role: 'admin' })
    expect((await reportGet(getReq(), { params: { id: 'ann-1' } })).status).toBe(403)
    ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_SESSION)
    expect((await reportGet(getReq(), { params: { id: 'ann-1' } })).status).toBe(403)
  })

  it('super_admin gets acknowledged/outstanding counts computed against the authoritative recipient set (URGENT)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
    const res = await reportGet(getReq(), { params: { id: 'ann-1' } })
    const body = await res.json()
    expect(body.totalTargeted).toBe(2)
    expect(body.acknowledgedCount).toBe(1)
    expect(body.outstandingCount).toBe(1)
    expect(body.outstanding).toEqual([expect.objectContaining({ id: 's2' })])
  })

  it('the report also works for HIGH priority — outstanding HIGH recipients are included, not just Critical/URGENT', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, priority: 'HIGH' })
    const res = await reportGet(getReq(), { params: { id: 'ann-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.priority).toBe('HIGH')
    expect(body.totalTargeted).toBe(2)
    expect(body.outstandingCount).toBe(1)
    expect(body.outstanding).toEqual([expect.objectContaining({ id: 's2' })])
  })

  it('400s for a NORMAL priority announcement — the outstanding report only applies to HIGH/URGENT', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue({ ...PUBLISHED_ANN, priority: 'NORMAL' })
    const res = await reportGet(getReq(), { params: { id: 'ann-1' } })
    expect(res.status).toBe(400)
    expect(resolveAnnouncementRecipients).not.toHaveBeenCalled()
  })

  it('404s for a non-existent announcement', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(ADMIN_SESSION)
    mockPrisma.staffAnnouncement.findUnique.mockResolvedValue(null)
    expect((await reportGet(getReq(), { params: { id: 'ann-1' } })).status).toBe(404)
  })
})
