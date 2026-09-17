/**
 * Intelligence Hub search UX patch — client/case selector for Financial
 * DNA + staff selector for Staff Performance. Staff never handle raw
 * database ids; currency/empty-state display bugs fixed; engines untouched.
 */

import fs from 'fs'
import path from 'path'

const calls: Record<string, unknown[]> = { visa: [], user: [], staff: [] }
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    visaApplication: { findMany: jest.fn(async (args: unknown) => { calls.visa.push(args); return mockApps }) },
    user: { findMany: jest.fn(async (args: unknown) => { calls.user.push(args); return mockUsers }) },
    staff: { findMany: jest.fn(async (args: unknown) => { calls.staff.push(args); return mockStaff }) },
  },
}))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => mockSession) }))

import { NextRequest } from 'next/server'
import { GET as clientSearch } from '@/app/api/admin/intelligence/client-search/route'
import { GET as staffSearch } from '@/app/api/admin/staff/search/route'

let mockSession: { id: string; email: string } | null = { id: 's1', email: 'admin@walztravels.com' }
const APP = {
  id: 'app-dd6gug', referenceNumber: 'WALZ-DD6GUG',
  firstName: 'Oladejo', middleName: null, lastName: 'Ibraheem',
  email: 'Oladejo.ibraheem000@aol.com', destinationIso2: 'br',
  status: 'info_required', visaType: 'tourist',
  userId: 'cmt4iq4nd0000k2hrarfoiws1', serviceFeeCurrency: 'USD',
}
let mockApps: unknown[] = [APP]
let mockUsers: unknown[] = []
let mockStaff: unknown[] = [{ id: 'staff-1', name: 'Sarah Williams', email: 'sarah@walztravels.com', role: 'sales_rep', roleTitle: 'Visa Consultant', isActive: true }]

const req = (url: string) => new NextRequest(new Request(`https://x.test${url}`))
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('client-search API', () => {
  beforeEach(() => { mockSession = { id: 's1', email: 'admin@walztravels.com' }; mockApps = [APP]; mockUsers = [] })

  it('finds by WALZ reference, name and email (case-insensitive contains)', async () => {
    for (const q of ['WALZ-DD6GUG', 'Oladejo', 'Oladejo.ibraheem000@aol.com']) {
      const res = await clientSearch(req(`/api/admin/intelligence/client-search?q=${encodeURIComponent(q)}`))
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.results[0]).toMatchObject({
        referenceNumber: 'WALZ-DD6GUG',
        clientName: 'Oladejo Ibraheem',
        destinationIso2: 'br', status: 'info_required',
      })
    }
    const where = JSON.stringify(calls.visa[0])
    expect(where).toContain('insensitive')
  })
  it('selecting a result resolves the internal userId automatically', async () => {
    const res = await clientSearch(req('/api/admin/intelligence/client-search?q=WALZ-DD6GUG'))
    const data = await res.json()
    expect(data.results[0].userId).toBe('cmt4iq4nd0000k2hrarfoiws1')
    expect(data.results[0].applicationId).toBe('app-dd6gug')
  })
  it('requires 2+ characters and authentication', async () => {
    const short = await clientSearch(req('/api/admin/intelligence/client-search?q=W'))
    expect((await short.json()).results).toEqual([])
    mockSession = null
    const unauth = await clientSearch(req('/api/admin/intelligence/client-search?q=WALZ'))
    expect(unauth.status).toBe(401)
  })
  it('returns only minimal display fields — no financial or document data', async () => {
    const res = await clientSearch(req('/api/admin/intelligence/client-search?q=WALZ-DD6GUG'))
    const row = (await res.json()).results[0]
    expect(Object.keys(row).sort()).toEqual(
      ['applicationId', 'clientName', 'currency', 'destinationIso2', 'email', 'referenceNumber', 'status', 'userId', 'visaType'])
    const src = read('app/api/admin/intelligence/client-search/route.ts')
    expect(src).not.toMatch(/monthlyIncome|bank|passportNumber|evidence/i)
  })
})

describe('staff-search API', () => {
  beforeEach(() => { mockSession = { id: 's1', email: 'admin@walztravels.com' } })

  it('finds by full name, partial name and email', async () => {
    for (const q of ['Sarah Williams', 'Sar', 'sarah@walztravels.com']) {
      const res = await staffSearch(req(`/api/admin/staff/search?q=${encodeURIComponent(q)}`))
      const data = await res.json()
      expect(data.results[0]).toEqual({
        id: 'staff-1', name: 'Sarah Williams', email: 'sarah@walztravels.com',
        role: 'Visa Consultant', status: 'Active',
      })
    }
  })
  it('orders active first, alphabetical; caps at 20; 401 unauthenticated', async () => {
    const args = JSON.stringify(calls.staff[0])
    expect(args).toContain('"isActive":"desc"')
    expect(args).toContain('"name":"asc"')
    expect(args).toContain('"take":20')
    mockSession = null
    expect((await staffSearch(req('/api/admin/staff/search?q=sar'))).status).toBe(401)
  })
  it('exposes no sensitive fields', async () => {
    const src = read('app/api/admin/staff/search/route.ts')
    expect(src).not.toMatch(/password|webAuthn|permissions|salary|payroll|token/i)
  })
})

describe('UI: staff never handle raw ids', () => {
  const dnaPage   = read('app/admin/intelligence/dna/page.tsx')
  const staffPage = read('app/admin/intelligence/staff-performance/page.tsx')

  it('Financial DNA uses the case selector, not a User ID input', () => {
    expect(dnaPage).toContain('IntelligenceCaseSelector')
    expect(dnaPage).not.toContain('User ID')
    expect(dnaPage).not.toContain('clxyz123')
    expect(dnaPage).toContain('selectedCase.userId')      // resolved internally
  })
  it('no-userId case shows the explicit linkage message, no fabrication', () => {
    expect(dnaPage).toContain('Financial DNA currently requires a client-linked account')
    expect(dnaPage).toContain('has not yet been linked to a client profile')
    expect(dnaPage).toContain('!selectedCase?.userId')    // compute disabled
    const selector = read('components/admin/intelligence/IntelligenceCaseSelector.tsx')
    expect(selector).not.toMatch(/user\.create|prisma/)
  })
  it('Staff Performance uses the staff selector and a month picker', () => {
    expect(staffPage).toContain('StaffSelector')
    expect(staffPage).not.toContain('Staff ID')
    expect(staffPage).not.toContain('placeholder="staff_')
    expect(staffPage).toContain('type="month"')
    expect(staffPage).toContain("new Date().toISOString().slice(0, 7)")   // defaults to current month
    expect(staffPage).toContain('selectedStaff.id')       // resolved internally
    expect(staffPage).not.toContain('font-mono truncate max-w-[100px]">{m.staffId}')   // raw id off the table
  })
  it('no-activity period gets an explicit empty state, never zero-faked metrics', () => {
    expect(staffPage).toContain('No recorded performance activity for ')
  })
})

describe('currency & empty-state display fixes', () => {
  const dnaPage = read('app/admin/intelligence/dna/page.tsx')
  it('applicant values use the STORED currency — NGN renders ₦, never a USD/GBP default', () => {
    expect(dnaPage).toContain("NGN: '\\u20a6'")
    expect(dnaPage).toContain('money(r.latestBalance, r.latestCurrency)')
    expect(dnaPage).not.toContain('£{r.latestBalance')
    expect(dnaPage).toContain('currency not specified')
  })
  it('zero analyses shows Not available, not an observed £0', () => {
    expect(dnaPage).toContain("r.analysisCount > 0 && r.latestBalance != null")
    expect(dnaPage).toContain('Not available')
  })
  it('null analysis date shows Never analysed, not Invalid Date', () => {
    expect(dnaPage).toContain('Never analysed')
    expect(dnaPage).toContain('Number.isNaN(Date.parse(r.updatedAt))')
    expect(dnaPage).not.toContain('lastAnalysisAt')
  })
  it('unknown currency is stored honestly, never defaulted to a symbol', () => {
    const route = read('app/api/admin/intelligence/dna/route.ts')
    expect(route).toContain("latestCurrency ?? ''")
    expect(route).not.toContain("?? 'NGN'")
  })
})

describe('active case follows staff across the hub', () => {
  it('doc-auth writes the shared store; the selector adopts it', () => {
    const docAuth  = read('app/admin/intelligence/doc-auth/page.tsx')
    const selector = read('components/admin/intelligence/IntelligenceCaseSelector.tsx')
    const store    = read('lib/intelligence/active-case-client.ts')
    expect(docAuth).toContain('setSharedCase(')
    expect(docAuth).toContain('getSharedCase()')
    expect(selector).toContain('getActiveCase()')
    expect(selector).toContain('Change client')
    expect(store).toContain('sessionStorage')
  })
})

describe('engines untouched (regression pins)', () => {
  it('Financial DNA calculation engine and readiness formula unchanged', () => {
    const dna = read('lib/intelligence/financial-dna.ts')
    expect(dna).toContain("FINANCIAL_DNA_VERSION = 'int1.1'")
    const readiness = read('lib/intelligence/readiness.ts')
    expect(readiness).toContain("READINESS_VERSION = 'int3.1'")
    const staffMetrics = read('lib/intelligence/staff-metrics.ts')
    expect(staffMetrics).toContain("STAFF_METRICS_VERSION = 'int8.1'")
  })
})
