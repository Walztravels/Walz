/**
 * Walz Business (Release 2.1 remediation) — B6: real server-side length
 * validation on every R2.1-introduced free-text field. Every case here
 * asserts REJECTION (400 + clear error), never silent truncation — and
 * that generous, internationalization-safe bounds never reject a
 * legitimate long name/address/business name.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn(), updateMany: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  organizationBrandSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  businessTraveller: { create: jest.fn() },
  travelRequestService: { findUnique: jest.fn(), update: jest.fn() },
  travelRequestTraveller: { findFirst: jest.fn() },
  visaApplication: { create: jest.fn() },
  travelRequestServiceAttestation: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn() }))
jest.mock('@/lib/intelligence/document-store', () => ({ storeCaseDocument: jest.fn(), signedDocumentUrl: jest.fn() }))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { getAdminSession } from '@/lib/admin-auth'
import { checkLength, isValidIso2, FIELD_LIMITS } from '@/lib/business/validation'
import { issueOrganizationInvitation } from '@/lib/business/invitations'
import { POST as orgTypeTransition } from '@/app/api/admin/business/organizations/[id]/organization-type/route'
import { PATCH as brandPatch } from '@/app/api/business/organizations/[id]/brand-settings/route'
import { POST as travellersPost } from '@/app/api/business/organizations/[id]/travellers/route'
import { POST as visaSubmit } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-submit/route'

const ORG_A = 'org_a'
const USER = 'user_1'
const STAFF_MANAGE = { id: 's1', staffId: 's1', email: 'ops@walztravels.com', role: 'operations_manager', staffRole: 'operations_manager', permissions: {} }
const postReq = (body: unknown) => ({ json: async () => body }) as any
function formReq(fields: Record<string, string | File | (string | File)[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach(item => fd.append(k, item as any))
    else fd.append(k, v as any)
  }
  return { formData: async () => fd, headers: new Headers() } as any
}
function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function visaService(over: Record<string, unknown> = {}) {
  return { id: 'svc_a', travelRequestId: 'req_a', serviceType: 'VISA', linkedVisaApplicationId: null, linkedQuoteId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_a', organizationId: ORG_A }, ...over }
}

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  ;(getAdminSession as jest.Mock).mockResolvedValue(STAFF_MANAGE)
  mockPrisma.organization.findUnique.mockResolvedValue({ id: ORG_A, organizationType: 'CORPORATE' })
  mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 })
  mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('ADMIN'))
  mockPrisma.organizationBrandSettings.findUnique.mockResolvedValue(null)
  mockPrisma.organizationBrandSettings.upsert.mockImplementation(({ create }: any) => Promise.resolve(create))
  mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
  mockPrisma.travelRequestTraveller.findFirst.mockResolvedValue(null)
  mockPrisma.visaApplication.create.mockResolvedValue({ id: 'visa_new' })
  mockPrisma.businessTraveller.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'bt_new', ...data }))
  mockPrisma.travelRequestServiceAttestation.create.mockResolvedValue({ id: 'att_1' })
})

describe('checkLength / isValidIso2 unit behavior', () => {
  it('rejects below min, accepts within bounds, rejects above max', () => {
    expect(checkLength('', 'name', 100, 1).ok).toBe(false)
    expect(checkLength('a'.repeat(100), 'name', 100, 1).ok).toBe(true)
    expect(checkLength('a'.repeat(101), 'name', 100, 1).ok).toBe(false)
  })

  it('generous bounds never reject a legitimate long international name', () => {
    // A real-world long compound name well under the 150-char cap.
    const longName = 'María de los Ángeles Fernández-González y Rodríguez'
    expect(checkLength(longName, 'firstName', FIELD_LIMITS.PERSON_NAME, 1).ok).toBe(true)
  })

  it('isValidIso2 accepts exactly 2 uppercase letters, rejects everything else', () => {
    expect(isValidIso2('GB')).toBe(true)
    expect(isValidIso2('US')).toBe(true)
    expect(isValidIso2('GBR')).toBe(false)
    expect(isValidIso2('G')).toBe(false)
    expect(isValidIso2('g1')).toBe(false)
    expect(isValidIso2('')).toBe(false)
  })
})

describe('issueOrganizationInvitation — email length', () => {
  it('rejects an over-length email (never silently truncates it into a different, wrong address)', async () => {
    const overLong = 'a'.repeat(260) + '@example.com'
    const result = await issueOrganizationInvitation({ organizationId: ORG_A, email: overLong, role: 'ADMIN', invitedByStaffId: 's1' })
    expect(result.ok).toBe(false)
  })
})

describe('organization-type route — reason length', () => {
  it('rejects an over-length reason (4001 chars) with a clear error, never truncates the audit record', async () => {
    const res = await orgTypeTransition(
      postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'x'.repeat(FIELD_LIMITS.REASON + 1) }),
      { params: { id: ORG_A } },
    )
    expect(res.status).toBe(400)
    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled()
  })

  it('accepts a reason right at the cap', async () => {
    const res = await orgTypeTransition(
      postReq({ organizationType: 'TRAVEL_AGENCY', reason: 'x'.repeat(FIELD_LIMITS.REASON) }),
      { params: { id: ORG_A } },
    )
    expect(res.status).toBe(200)
  })
})

describe('brand-settings PATCH — per-field caps, rejection not truncation', () => {
  it('rejects an over-length displayName (201 chars) — does NOT store a truncated 200-char value', async () => {
    const res = await brandPatch(postReq({ displayName: 'x'.repeat(FIELD_LIMITS.DISPLAY_NAME + 1) }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
    expect(mockPrisma.organizationBrandSettings.upsert).not.toHaveBeenCalled()
  })

  it('accepts a long but legitimate business display name under the cap', async () => {
    const res = await brandPatch(postReq({ displayName: 'The Very Distinguished International Travel & Tourism Company Limited' }), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
  })

  it('rejects an over-length supportEmail', async () => {
    const res = await brandPatch(postReq({ supportEmail: 'a'.repeat(260) + '@example.com' }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
  })

  it('rejects an over-length brandColor', async () => {
    const res = await brandPatch(postReq({ brandColor: '#' + 'a'.repeat(40) }), { params: { id: ORG_A } })
    expect(res.status).toBe(400)
  })

  it('accepts a long logoUrl within the generous URL cap', async () => {
    const longUrl = 'https://cdn.example.com/' + 'a'.repeat(1900) + '.png'
    expect(longUrl.length).toBeLessThan(FIELD_LIMITS.URL)
    const res = await brandPatch(postReq({ logoUrl: longUrl }), { params: { id: ORG_A } })
    expect(res.status).toBe(200)
  })
})

describe('travellers POST — name/email/phone caps', () => {
  it('rejects an over-length firstName', async () => {
    const res = await travellersPost(
      postReq({ firstName: 'x'.repeat(FIELD_LIMITS.PERSON_NAME + 1), lastName: 'Doe', email: 'a@b.com' }),
      { params: { id: ORG_A } },
    )
    expect(res.status).toBe(400)
    expect(mockPrisma.businessTraveller.create).not.toHaveBeenCalled()
  })

  it('accepts a long legitimate international name within the cap', async () => {
    const res = await travellersPost(
      postReq({ firstName: 'María de los Ángeles', lastName: 'Fernández-González y Rodríguez', email: 'a@b.com' }),
      { params: { id: ORG_A } },
    )
    expect(res.status).toBe(201)
  })

  it('rejects an over-length phone', async () => {
    const res = await travellersPost(
      postReq({ firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '1'.repeat(FIELD_LIMITS.PHONE + 1) }),
      { params: { id: ORG_A } },
    )
    expect(res.status).toBe(400)
  })
})

describe('visa-submit — formFields caps + strict ISO2 (reject, never truncate)', () => {
  const params = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' }

  it('rejects a 3-letter destination code rather than silently truncating it to 2 letters (which would name the WRONG country)', async () => {
    const res = await visaSubmit(
      formReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GBR' }) }),
      { params },
    )
    expect(res.status).toBe(400)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })

  it('rejects an over-length visaType', async () => {
    const res = await visaSubmit(
      formReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB', visaType: 'x'.repeat(FIELD_LIMITS.VISA_TYPE + 1) }) }),
      { params },
    )
    expect(res.status).toBe(400)
  })

  it('rejects an over-length firstName in the form fields', async () => {
    const res = await visaSubmit(
      formReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB', firstName: 'x'.repeat(FIELD_LIMITS.PERSON_NAME + 1) }) }),
      { params },
    )
    expect(res.status).toBe(400)
  })

  it('accepts a valid 2-letter code and normal-length fields', async () => {
    const res = await visaSubmit(
      formReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'gb', firstName: 'Jane', lastName: 'Doe' }) }),
      { params },
    )
    expect(res.status).toBe(201)
  })
})
