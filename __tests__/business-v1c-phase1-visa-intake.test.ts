/**
 * Walz Business (V1-C Phase 1) — lib/business/visa-intake.ts::submitVisaIntake()
 * at the unit level (the visa-submit route's own byte-identical parity is
 * separately proven by running __tests__/business-r2-1-visa-submit.test.ts
 * UNMODIFIED against the refactored route).
 *
 * Covers: the discriminated `submittedBy` type accepts BOTH the 'member'
 * shape in use today and the 'anonymous_link' shape no caller constructs yet
 * (forward-compatibility without another refactor), and that this shared
 * function never itself writes TravelRequestServiceAttestation (that stays
 * in the route) regardless of which `submittedBy.kind` is passed.
 */
const mockPrisma = {
  travelRequestTraveller: { findFirst: jest.fn() },
  visaApplication: { create: jest.fn() },
  travelRequestService: { update: jest.fn() },
  travelRequestServiceAttestation: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

const storeCaseDocument = jest.fn()
jest.mock('@/lib/intelligence/document-store', () => ({
  storeCaseDocument: (...args: unknown[]) => storeCaseDocument(...args),
}))

import { submitVisaIntake, isVisaIntakeMode } from '@/lib/business/visa-intake'

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.travelRequestTraveller.findFirst.mockResolvedValue(null)
  mockPrisma.visaApplication.create.mockResolvedValue({ id: 'visa_new' })
  storeCaseDocument.mockResolvedValue({ ok: true, doc: { documentId: 'doc_1' } })
})

describe('isVisaIntakeMode', () => {
  it('accepts only the three known modes', () => {
    expect(isVisaIntakeMode('FORM')).toBe(true)
    expect(isVisaIntakeMode('CLIENT_DOCS')).toBe(true)
    expect(isVisaIntakeMode('AGENCY_COMPLETED')).toBe(true)
    expect(isVisaIntakeMode('OTHER')).toBe(false)
    expect(isVisaIntakeMode(123)).toBe(false)
  })
})

describe('submitVisaIntake — the member path (what the existing route uses)', () => {
  it('creates a VisaApplication and links it, with no attestation write (that stays in the route)', async () => {
    const result = await submitVisaIntake({
      organizationId: 'org_a', travelRequestId: 'req_a', serviceId: 'svc_a',
      linkedVisaApplicationId: null, mode: 'FORM',
      formFields: { destinationIso2: 'gb', visaType: 'tourist' },
      files: [], uploadedBy: 'staff@x.com',
      submittedBy: { kind: 'member', membershipId: 'mem_1' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.visaApplicationId).toBe('visa_new')
    expect(mockPrisma.travelRequestService.update).toHaveBeenCalledWith({ where: { id: 'svc_a' }, data: { linkedVisaApplicationId: 'visa_new' } })
    expect(mockPrisma.travelRequestServiceAttestation.create).not.toHaveBeenCalled()
  })

  it('rejects a missing destinationIso2', async () => {
    const result = await submitVisaIntake({
      organizationId: 'org_a', travelRequestId: 'req_a', serviceId: 'svc_a',
      linkedVisaApplicationId: null, mode: 'FORM', formFields: {}, files: [], uploadedBy: 'staff@x.com',
      submittedBy: { kind: 'member', membershipId: 'mem_1' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('CLIENT_DOCS with zero files is rejected', async () => {
    const result = await submitVisaIntake({
      organizationId: 'org_a', travelRequestId: 'req_a', serviceId: 'svc_a',
      linkedVisaApplicationId: 'visa_existing', mode: 'CLIENT_DOCS', formFields: {}, files: [], uploadedBy: 'staff@x.com',
      submittedBy: { kind: 'member', membershipId: 'mem_1' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('converges onto an already-linked VisaApplication without creating a second one', async () => {
    const file = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' })
    const result = await submitVisaIntake({
      organizationId: 'org_a', travelRequestId: 'req_a', serviceId: 'svc_a',
      linkedVisaApplicationId: 'visa_existing', mode: 'AGENCY_COMPLETED', formFields: {}, files: [file], uploadedBy: 'staff@x.com',
      submittedBy: { kind: 'member', membershipId: 'mem_1' },
    })
    expect(result.ok).toBe(true)
    expect(mockPrisma.visaApplication.create).not.toHaveBeenCalled()
    expect(storeCaseDocument).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'visa_existing' }))
  })
})

describe('submitVisaIntake — the anonymous_link shape (no caller exists yet; type/behavior forward-compat only)', () => {
  it('accepts the anonymous_link discriminated shape and behaves identically on the shared domain logic (no attestation write here either way)', async () => {
    const result = await submitVisaIntake({
      organizationId: 'org_a', travelRequestId: 'req_a', serviceId: 'svc_a',
      linkedVisaApplicationId: null, mode: 'FORM',
      formFields: { destinationIso2: 'FR' },
      files: [], uploadedBy: 'traveller:trav_1',
      submittedBy: { kind: 'anonymous_link', businessTravellerId: 'trav_1', linkTokenId: 'tok_1' },
    })
    expect(result.ok).toBe(true)
    expect(mockPrisma.travelRequestServiceAttestation.create).not.toHaveBeenCalled()
  })
})
