/**
 * Agent B — Currency plumbing (route → searchActivities).
 *
 * app/api/admin/travel-search/activities/route.ts previously called
 * searchActivities({ destination, adults, dateFrom, dateTo }) with no
 * currency at all. It now reads an optional `currency` query param (this
 * route is a GET endpoint using req.nextUrl.searchParams — NOT a JSON
 * body — so the frontend must send it as `?currency=...`, not as a body
 * field) and forwards it straight through.
 */

const mockGetAdminSession = jest.fn()
const mockSearchActivities = jest.fn()

jest.mock('@/lib/admin-auth', () => ({ getAdminSession: mockGetAdminSession }))
jest.mock('@/lib/admin/permissions', () => ({ hasPermission: () => true }))
jest.mock('@/lib/activities', () => ({ searchActivities: mockSearchActivities }))

import { GET } from '@/app/api/admin/travel-search/activities/route'

const SESSION = { email: 'staff@walztravels.com', role: 'staff', name: 'Staff', permissions: {} }

function makeReq(qs: string) {
  return { nextUrl: new URL(`https://admin.walztravels.com/api/admin/travel-search/activities${qs}`) } as unknown as Parameters<typeof GET>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAdminSession.mockResolvedValue(SESSION)
  mockSearchActivities.mockResolvedValue({ activities: [], total: 0, suppliers: {} })
})

describe('GET /api/admin/travel-search/activities — currency plumbing', () => {
  it('forwards a currency query param through to searchActivities', async () => {
    await GET(makeReq('?destination=Dubai&adults=2&currency=USD'))
    expect(mockSearchActivities).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'Dubai', adults: 2, currency: 'USD' }),
    )
  })

  it('omitting currency forwards undefined rather than inventing a default at the route layer', async () => {
    await GET(makeReq('?destination=Dubai&adults=2'))
    expect(mockSearchActivities).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'Dubai', adults: 2, currency: undefined }),
    )
  })

  it('still requires destination regardless of currency', async () => {
    const res = await GET(makeReq('?currency=GBP'))
    expect(res.status).toBe(400)
    expect(mockSearchActivities).not.toHaveBeenCalled()
  })
})
