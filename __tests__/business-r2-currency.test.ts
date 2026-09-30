/**
 * Walz Business (Release 2) — organization currency.
 *
 *  - Creation REQUIRES an explicit, supported currency (no silent GBP).
 *  - An existing organization's currency is preserved unless explicitly
 *    changed through the dedicated, audited, reason-required
 *    POST /api/admin/business/organizations/[id]/currency route.
 */
const mockPrisma = {
  organization: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  staff: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

import fs from 'fs'
import path from 'path'
import { getAdminSession } from '@/lib/admin-auth'
import { POST as createOrg } from '@/app/api/admin/business/organizations/route'
import { POST as changeCurrency } from '@/app/api/admin/business/organizations/[id]/currency/route'
import { POST as changeStatus } from '@/app/api/admin/business/organizations/[id]/status/route'
import { recordBusinessAudit } from '@/lib/business/audit'
import { SUPPORTED_ORG_CURRENCIES, parseOrgCurrency } from '@/lib/business/currency'

function postReq(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Parameters<typeof createOrg>[0]
}
const ctx = (id: string) => ({ params: { id } })

const SESSION_WITH_MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const SESSION_VIEW_ONLY = { id: 's2', staffId: 's2', email: 'senior@walztravels.com', role: 'senior_manager', staffRole: 'senior_manager', permissions: {} }

const BASE = { legalName: 'Acme', country: 'CA', businessEmail: 'a@acme.com' }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_WITH_MANAGE)
  mockPrisma.organization.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'org_new', ...data }))
})

describe('supported currency list', () => {
  it('is exactly the 8 currencies established in lib/currency.ts', () => {
    expect([...SUPPORTED_ORG_CURRENCIES]).toEqual(['GBP', 'USD', 'CAD', 'EUR', 'NGN', 'GHS', 'AED', 'ZAR'])
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'currency.ts'), 'utf8')
    for (const code of SUPPORTED_ORG_CURRENCIES) expect(src).toMatch(new RegExp(`\\b${code}:`))
  })

  it('parseOrgCurrency normalizes case/whitespace and rejects anything else', () => {
    expect(parseOrgCurrency(' cad ')).toBe('CAD')
    expect(parseOrgCurrency('JPY')).toBeNull()
    expect(parseOrgCurrency('')).toBeNull()
    expect(parseOrgCurrency(undefined)).toBeNull()
    expect(parseOrgCurrency(42)).toBeNull()
  })
})

describe('creation requires an explicit currency', () => {
  it('rejects creation with NO currency — no silent GBP fallback', async () => {
    const res = await createOrg(postReq(BASE))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.create).not.toHaveBeenCalled()
  })

  it('rejects a blank currency', async () => {
    const res = await createOrg(postReq({ ...BASE, defaultCurrency: '  ' }))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.create).not.toHaveBeenCalled()
  })

  it('rejects an unsupported currency', async () => {
    const res = await createOrg(postReq({ ...BASE, defaultCurrency: 'JPY' }))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.create).not.toHaveBeenCalled()
  })

  it.each([...SUPPORTED_ORG_CURRENCIES])('accepts and stores %s exactly as selected', async code => {
    const res = await createOrg(postReq({ ...BASE, defaultCurrency: code.toLowerCase() }))
    expect(res.status).toBe(201)
    expect(mockPrisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ defaultCurrency: code }),
    }))
  })

  it('records the chosen currency in the creation audit row', async () => {
    await createOrg(postReq({ ...BASE, defaultCurrency: 'CAD' }))
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'organization.create',
      after: expect.objectContaining({ defaultCurrency: 'CAD' }),
    }))
  })

  it('the admin create form has a required currency select with no pre-selected value', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'admin', 'business', 'page.tsx'), 'utf8')
    expect(src).toMatch(/<select\s+required/)
    expect(src).toMatch(/defaultCurrency: ''/)
    expect(src).toMatch(/SUPPORTED_ORG_CURRENCIES\.map/)
  })
})

describe('POST /api/admin/business/organizations/[id]/currency', () => {
  it('rejects unauthenticated with 401', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(null)
    const res = await changeCurrency(postReq({ currency: 'CAD', reason: 'x' }), ctx('org_1'))
    expect(res.status).toBe(401)
  })

  it('denies view-only b2b staff (no b2b.manage) without touching the row', async () => {
    ;(getAdminSession as jest.Mock).mockResolvedValue(SESSION_VIEW_ONLY)
    const res = await changeCurrency(postReq({ currency: 'CAD', reason: 'Contract' }), ctx('org_1'))
    expect(res.status).toBe(403)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.organization.update).not.toHaveBeenCalled()
  })

  it('requires a non-blank reason', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', defaultCurrency: 'GBP' })
    const res = await changeCurrency(postReq({ currency: 'CAD', reason: '   ' }), ctx('org_1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('rejects an unsupported currency', async () => {
    const res = await changeCurrency(postReq({ currency: 'BTC', reason: 'x' }), ctx('org_1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing organization', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null)
    const res = await changeCurrency(postReq({ currency: 'CAD', reason: 'x' }), ctx('missing'))
    expect(res.status).toBe(404)
  })

  it('rejects a no-op change to the same currency', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', defaultCurrency: 'GBP' })
    const res = await changeCurrency(postReq({ currency: 'GBP', reason: 'x' }), ctx('org_1'))
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('changes the currency via CAS on the value read and writes a before/after audit row with the reason', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', defaultCurrency: 'GBP' })
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })
    const res = await changeCurrency(postReq({ currency: 'cad', reason: '  Canadian entity  ' }), ctx('org_1'))
    expect(res.status).toBe(200)
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org_1', defaultCurrency: 'GBP' },
      data: { defaultCurrency: 'CAD' },
    })
    expect(recordBusinessAudit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org_1',
      actorStaffId: 's1',
      action: 'organization.currency_changed',
      before: { defaultCurrency: 'GBP' },
      after: { defaultCurrency: 'CAD', reason: 'Canadian entity' },
    }))
  })

  it('returns 409 (and writes no audit row) when a concurrent edit already changed the currency', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', defaultCurrency: 'GBP' })
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 })
    const res = await changeCurrency(postReq({ currency: 'CAD', reason: 'x' }), ctx('org_1'))
    expect(res.status).toBe(409)
    expect(recordBusinessAudit).not.toHaveBeenCalled()
  })

  it('only writes defaultCurrency — never any other organization field', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1', defaultCurrency: 'GBP' })
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })
    await changeCurrency(postReq({ currency: 'CAD', reason: 'x', status: 'ACTIVE', legalName: 'Hijack' }), ctx('org_1'))
    expect(Object.keys(mockPrisma.organization.updateMany.mock.calls[0][0].data)).toEqual(['defaultCurrency'])
  })
})

describe('existing organization currency is preserved unless explicitly changed', () => {
  it('a status change never touches defaultCurrency', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_accept', status: 'ONBOARDING', defaultCurrency: 'GBP' })
    mockPrisma.organization.update.mockResolvedValue({ id: 'org_accept', status: 'ACTIVE', defaultCurrency: 'GBP' })
    const res = await changeStatus(postReq({ status: 'ACTIVE', reason: 'Go live' }), ctx('org_accept'))
    expect(res.status).toBe(200)
    expect(mockPrisma.organization.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' })
  })

  it('no route other than the dedicated currency route writes defaultCurrency on an existing organization', () => {
    const { execSync } = require('child_process')
    const out: string = execSync(
      `grep -rl "defaultCurrency" app/api --include='*.ts' || true`,
      { cwd: path.join(__dirname, '..'), encoding: 'utf8' },
    )
    const writers = out.trim().split('\n').filter(Boolean).filter(f => {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
      return /organization\.(update|updateMany|upsert)\(/.test(src) && /data:\s*\{[^}]*defaultCurrency/.test(src)
    })
    expect(writers).toEqual(['app/api/admin/business/organizations/[id]/currency/route.ts'])
  })
})
