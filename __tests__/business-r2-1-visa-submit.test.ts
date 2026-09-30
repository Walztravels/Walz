/**
 * Walz Business (Release 2.1) — agency visa-workflow intake (visa-submit
 * route): the strict attestation gate, all three intake modes converging on
 * one VisaApplication via TravelRequestService.linkedVisaApplicationId, and
 * cross-org / cross-request IDOR on the SUBMIT surface.
 */
const mockPrisma = {
  organization: { findUnique: jest.fn() },
  organizationMembership: { findUnique: jest.fn() },
  travelRequestService: { findUnique: jest.fn(), update: jest.fn() },
  visaApplication: { create: jest.fn() },
  travelRequestTraveller: { findFirst: jest.fn() },
  travelRequestServiceAttestation: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))
jest.mock('@/lib/business/audit', () => ({ recordBusinessAudit: jest.fn().mockResolvedValue({ id: 'audit_1' }) }))

const storeCaseDocument = jest.fn()
jest.mock('@/lib/intelligence/document-store', () => ({
  storeCaseDocument: (...args: unknown[]) => storeCaseDocument(...args),
}))

const getServerSession = jest.fn()
jest.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => getServerSession(...args) }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { POST as visaSubmit } from '@/app/api/business/organizations/[id]/requests/[requestId]/services/[serviceId]/visa-submit/route'

const ORG_A = 'org_a'
const ORG_B = 'org_b'
const USER = 'user_1'

function member(role: string, over: Record<string, unknown> = {}) {
  return { id: 'mem_1', organizationId: ORG_A, userId: USER, role, status: 'ACTIVE', invitedBy: null, joinedAt: null, lastActivityAt: null, createdAt: new Date(), updatedAt: new Date(), ...over }
}
function visaService(over: Record<string, unknown> = {}) {
  return { id: 'svc_a', travelRequestId: 'req_a', serviceType: 'VISA', linkedVisaApplicationId: null, linkedQuoteId: null, linkedItineraryId: null, linkedTripId: null, travelRequest: { id: 'req_a', organizationId: ORG_A }, ...over }
}
function formDataReq(fields: Record<string, string | File | string[]>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach(item => fd.append(k, item))
    else fd.append(k, v as any)
  }
  return { formData: async () => fd, headers: new Headers() } as any
}
const params = { id: ORG_A, requestId: 'req_a', serviceId: 'svc_a' }

beforeEach(() => {
  jest.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: USER, email: 'u@x.com' } })
  mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'CORPORATE' })
  mockPrisma.organizationMembership.findUnique.mockResolvedValue(member('TRAVEL_MANAGER'))
  mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService())
  mockPrisma.travelRequestTraveller.findFirst.mockResolvedValue(null)
  mockPrisma.visaApplication.create.mockResolvedValue({ id: 'visa_new' })
  mockPrisma.travelRequestServiceAttestation.create.mockResolvedValue({ id: 'att_1' })
  storeCaseDocument.mockResolvedValue({ ok: true, doc: { documentId: 'doc_1', storagePath: 'x', checksum: 'c' } })
})

describe('strict attestation gate — nothing is written without attested === "true"', () => {
  it('missing attestation -> 400, no VisaApplication created, no document stored, no attestation row', async () => {
    const res = await visaSubmit(formDataReq({ mode: 'FORM', destinationIso2: 'GB' } as any), { params })
    expect(res.status).toBe(400)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
    expect(mockPrisma.travelRequestServiceAttestation.create).not.toHaveBeenCalled()
  })

  it('attested="false" (or anything but the literal string "true") is rejected', async () => {
    const res = await visaSubmit(formDataReq({ mode: 'FORM', attested: 'false', formFields: JSON.stringify({ destinationIso2: 'GB' }) }), { params })
    expect(res.status).toBe(400)
  })
})

describe('mode=FORM — creates and links a new VisaApplication', () => {
  it('creates a VisaApplication and links it via TravelRequestService.linkedVisaApplicationId', async () => {
    const res = await visaSubmit(
      formDataReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'gb', visaType: 'tourist', firstName: 'Jane' }) }),
      { params },
    )
    expect(res.status).toBe(201)
    expect(mockPrisma.visaApplication.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ destinationIso2: 'GB', visaType: 'tourist', firstName: 'Jane' }),
    }))
    expect(mockPrisma.travelRequestService.update).toHaveBeenCalledWith({
      where: { id: 'svc_a' },
      data: { linkedVisaApplicationId: 'visa_new' },
    })
    // Attestation is written recording WHO submitted it.
    expect(mockPrisma.travelRequestServiceAttestation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ travelRequestServiceId: 'svc_a', organizationId: ORG_A, membershipId: 'mem_1', visaApplicationId: 'visa_new' }),
    }))
  })

  it('requires destinationIso2 to start a new case', async () => {
    const res = await visaSubmit(formDataReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({}) }), { params })
    expect(res.status).toBe(400)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })
})

describe('mode=CLIENT_DOCS / AGENCY_COMPLETED — documents via storeCaseDocument -> VisaCaseDocument only', () => {
  it('CLIENT_DOCS requires at least one file', async () => {
    const res = await visaSubmit(formDataReq({ mode: 'CLIENT_DOCS', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB' }) }), { params })
    expect(res.status).toBe(400)
    expect(storeCaseDocument).not.toHaveBeenCalled()
  })

  it('stores each uploaded file via storeCaseDocument, linked to the (newly created) VisaApplication', async () => {
    const file = new File(['%PDF-1.4 fake'], 'passport.pdf', { type: 'application/pdf' })
    const res = await visaSubmit(
      formDataReq({ mode: 'CLIENT_DOCS', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB' }), files: [file] }),
      { params },
    )
    expect(res.status).toBe(201)
    expect(storeCaseDocument).toHaveBeenCalledWith(expect.objectContaining({
      applicationId: 'visa_new', documentType: 'client_collected_document', fileName: 'passport.pdf',
    }))
  })

  it('a rejected file (e.g. bad type/size from storeCaseDocument) fails the whole submission with its error', async () => {
    storeCaseDocument.mockResolvedValue({ ok: false, error: 'Only PDF, JPG, PNG or WEBP documents can be analyzed.' })
    const file = new File(['exe'], 'malware.exe', { type: 'application/x-msdownload' })
    const res = await visaSubmit(
      formDataReq({ mode: 'AGENCY_COMPLETED', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB' }), files: [file] }),
      { params },
    )
    expect(res.status).toBe(400)
  })

  it('converges onto an ALREADY-linked VisaApplication rather than creating a second one', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ linkedVisaApplicationId: 'visa_existing' }))
    const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' })
    const res = await visaSubmit(
      formDataReq({ mode: 'AGENCY_COMPLETED', attested: 'true', files: [file] }),
      { params },
    )
    expect(res.status).toBe(201)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
    expect(storeCaseDocument).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'visa_existing' }))
  })
})

describe('IDOR on the SUBMIT surface', () => {
  it('a service belonging to another org (prong 2) is denied before any write', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(
      visaService({ travelRequestId: 'req_other', travelRequest: { id: 'req_other', organizationId: ORG_B } }),
    )
    const res = await visaSubmit(formDataReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB' }) }), { params })
    expect(res.status).toBe(404)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
  })

  it('a REFERRAL_PARTNER org cannot submit at all', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organizationType: 'REFERRAL_PARTNER' })
    const res = await visaSubmit(formDataReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB' }) }), { params })
    expect(res.status).toBe(404)
  })

  it('a non-VISA service is denied', async () => {
    mockPrisma.travelRequestService.findUnique.mockResolvedValue(visaService({ serviceType: 'HOTEL' }))
    const res = await visaSubmit(formDataReq({ mode: 'FORM', attested: 'true', formFields: JSON.stringify({ destinationIso2: 'GB' }) }), { params })
    expect(res.status).toBe(404)
  })
})
