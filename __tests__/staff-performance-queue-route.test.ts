/**
 * GET /api/admin/performance/queue — Super Admin only (mission brief §12).
 */
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/performance/queue', () => ({ buildPerformanceQueue: jest.fn() }))

import { getAdminSession } from '@/lib/admin-auth'
import { buildPerformanceQueue } from '@/lib/performance/queue'
import { GET } from '@/app/api/admin/performance/queue/route'

function getReq(url = 'http://localhost/api/admin/performance/queue') {
  return { url } as unknown as Parameters<typeof GET>[0]
}

describe('GET /api/admin/performance/queue', () => {
  beforeEach(() => jest.clearAllMocks())

  it('401s when unauthenticated', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await GET(getReq())
    expect(res.status).toBe(401)
    expect(buildPerformanceQueue).not.toHaveBeenCalled()
  })

  it('403s a non-super-admin (this is sensitive HR data — no manager access without an explicit permission)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's1', staffRole: 'operations_manager' })
    const res = await GET(getReq())
    expect(res.status).toBe(403)
    expect(buildPerformanceQueue).not.toHaveBeenCalled()
  })

  it('200s for super_admin and defaults to filter ALL', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's1', staffRole: 'super_admin' })
    ;(buildPerformanceQueue as jest.Mock).mockResolvedValue([{ staffId: 's2' }])
    const res = await GET(getReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(buildPerformanceQueue).toHaveBeenCalledWith('ALL')
    expect(json.rows).toHaveLength(1)
  })

  it('rejects an invalid filter value by falling back to ALL (never crashes on bad input)', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's1', staffRole: 'super_admin' })
    ;(buildPerformanceQueue as jest.Mock).mockResolvedValue([])
    await GET(getReq('http://localhost/api/admin/performance/queue?filter=DROP TABLE'))
    expect(buildPerformanceQueue).toHaveBeenCalledWith('ALL')
  })

  it('passes through a valid named filter', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue({ id: 's1', staffRole: 'super_admin' })
    ;(buildPerformanceQueue as jest.Mock).mockResolvedValue([])
    await GET(getReq('http://localhost/api/admin/performance/queue?filter=120'))
    expect(buildPerformanceQueue).toHaveBeenCalledWith('120')
  })
})
