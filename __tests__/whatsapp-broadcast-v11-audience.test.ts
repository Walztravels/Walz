/**
 * WhatsApp Broadcast V1.1 — multi-source audience resolution.
 *
 * Covers, against a mocked Prisma:
 *  - each source resolving independently (Lead / VisaApplication / manual)
 *    and all three combined;
 *  - cross-source de-duplication by canonical normalized number, with
 *    provenance preserved and opt-out OR-merged across contributors;
 *  - the SELECTABLE-vs-ELIGIBLE split (selection carries no eligibility;
 *    eligibility is computed here and only here);
 *  - manual-number normalization, validation and duplicate detection;
 *  - equivalence with V1's untouched single-source resolver for a
 *    filter-only selection.
 */

interface MockLead {
  id: string
  name: string | null
  whatsapp: string | null
  service: string | null
  branch: string | null
  destination: string | null
  travelDate: string | null
  marketingOptOut: boolean
}

interface MockVisa {
  id: string
  referenceNumber: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  destinationIso2: string
  visaType: string
  status: string
  arrivalDate: Date | null
  marketingOptOut: boolean
  assignedTo?: string | null
  branch?: string
  createdAt?: Date
}

let leadStore: MockLead[] = []
let visaStore: MockVisa[] = []
let consentStore: Array<{ normalizedNumber: string; status: string }> = []
const leadFindMany = jest.fn()
const visaFindMany = jest.fn()

function matchWhere<T extends Record<string, unknown>>(rows: T[], where: Record<string, unknown>): T[] {
  return rows.filter(r =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in (v as object)) {
        return ((v as { in: unknown[] }).in ?? []).includes(r[k])
      }
      if (v && typeof v === 'object' && ('gte' in (v as object) || 'lte' in (v as object))) {
        const d = r[k] as Date | undefined
        if (!d) return false
        const g = (v as { gte?: Date }).gte
        const l = (v as { lte?: Date }).lte
        return (!g || d >= g) && (!l || d <= l)
      }
      return r[k] === v
    }),
  )
}

const mockPrisma = {
  lead: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      leadFindMany(args)
      return matchWhere(leadStore, args.where ?? {}).slice(0, args.take ?? undefined).map(r => ({ ...r }))
    }),
  },
  visaApplication: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      visaFindMany(args)
      return matchWhere(visaStore, args.where ?? {}).slice(0, args.take ?? undefined).map(r => ({ ...r }))
    }),
  },
  whatsAppConsent: {
    findMany: jest.fn(async (args: { where: { normalizedNumber: { in: string[] } } }) =>
      consentStore.filter(c => args.where.normalizedNumber.in.includes(c.normalizedNumber)).map(c => ({ ...c })),
    ),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

import { resolveMultiSourceAudience, buildVisaWhere } from '@/lib/whatsapp/broadcast/audience-multi'
import { resolveAudience } from '@/lib/whatsapp/broadcast/audience'
import { parseAudienceSelection, hasMultiSourceSelection } from '@/lib/whatsapp/broadcast/selection'
import { parseManualNumbers, splitManualNumberBlob } from '@/lib/whatsapp/broadcast/manual-numbers'

function lead(over: Partial<MockLead> = {}): MockLead {
  return {
    id: 'lead-1', name: 'Ada', whatsapp: '+2348012345678', service: 'Visa Processing',
    branch: 'nigeria', destination: 'London', travelDate: 'July 2026',
    marketingOptOut: false, ...over,
  }
}

function visa(over: Partial<MockVisa> = {}): MockVisa {
  return {
    id: 'visa-1', referenceNumber: 'WALZ-AAA111', firstName: 'Ada', lastName: 'Obi',
    phone: '+2348012345678', destinationIso2: 'GB', visaType: 'tourist',
    status: 'under_review', arrivalDate: new Date('2026-07-01'),
    marketingOptOut: false, assignedTo: 'glory', branch: 'nigeria',
    createdAt: new Date('2026-01-01'), ...over,
  }
}

const subscribed = (n: string) => ({ normalizedNumber: n, status: 'SUBSCRIBED' })

beforeEach(() => {
  jest.clearAllMocks()
  leadStore = []
  visaStore = []
  consentStore = []
})

// ── Each source, independently ──────────────────────────────────────────

describe('single-source resolution', () => {
  it('resolves explicitly selected Leads by id', async () => {
    leadStore = [lead({ id: 'l1', whatsapp: '+2348011111111' }), lead({ id: 'l2', whatsapp: '+2348022222222' })]
    consentStore = [subscribed('+2348011111111')]

    const { breakdown, recipients } = await resolveMultiSourceAudience({ selection: { leadIds: ['l1', 'l2'] } })

    expect(leadFindMany.mock.calls[0][0].where).toEqual({ id: { in: ['l1', 'l2'] } })
    expect(breakdown.totalSelected).toBe(2)
    expect(breakdown.eligible).toBe(1)
    expect(breakdown.missingConsent).toBe(1)
    expect(breakdown.bySource.LEAD).toBe(2)
    expect(recipients.find(r => r.normalizedNumber === '+2348011111111')?.status).toBe('QUEUED')
    expect(recipients.find(r => r.normalizedNumber === '+2348022222222')?.status).toBe('SKIPPED_NO_CONSENT')
  })

  it('resolves VisaApplications DIRECTLY — no Lead is created or queried for them', async () => {
    visaStore = [visa({ id: 'v1', phone: '+2348033333333' })]
    consentStore = [subscribed('+2348033333333')]

    const { breakdown, recipients } = await resolveMultiSourceAudience({
      selection: { visaApplicationIds: ['v1'] },
    })

    // Not one Lead query was issued for a visa-only selection.
    expect(leadFindMany).not.toHaveBeenCalled()
    expect(breakdown.eligible).toBe(1)
    expect(breakdown.bySource.VISA_APPLICATION).toBe(1)
    const r = recipients[0]
    expect(r.sourceType).toBe('VISA_APPLICATION')
    expect(r.visaApplicationId).toBe('v1')
    expect(r.leadId).toBeNull()
  })

  it('reads the applicant number from VisaApplication.phone and honours its marketingOptOut', async () => {
    visaStore = [visa({ id: 'v1', phone: '+2348044444444', marketingOptOut: true })]
    consentStore = [subscribed('+2348044444444')]

    const { breakdown, recipients } = await resolveMultiSourceAudience({ selection: { visaApplicationIds: ['v1'] } })

    // A SUBSCRIBED consent row does NOT override the application's opt-out.
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.optedOut).toBe(1)
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
    expect(recipients[0].exclusionReason).toMatch(/opted out/i)
  })

  it('resolves manual numbers with no record of any kind created', async () => {
    consentStore = [subscribed('+2348055555555')]

    const { breakdown, recipients } = await resolveMultiSourceAudience({
      selection: { manualEntries: [{ number: '+234 805 555 5555', displayName: 'Walk-in' }] },
    })

    expect(leadFindMany).not.toHaveBeenCalled()
    expect(visaFindMany).not.toHaveBeenCalled()
    expect(breakdown.eligible).toBe(1)
    expect(recipients[0].sourceType).toBe('MANUAL')
    expect(recipients[0].leadId).toBeNull()
    expect(recipients[0].visaApplicationId).toBeNull()
    expect(recipients[0].displayName).toBe('Walk-in')
    expect(recipients[0].normalizedNumber).toBe('+2348055555555')
  })

  it('gives a manual number NO consent shortcut — unknown number is NO_CONSENT', async () => {
    const { breakdown, recipients } = await resolveMultiSourceAudience({
      selection: { manualEntries: [{ number: '+2348066666666' }] },
    })
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.missingConsent).toBe(1)
    expect(recipients[0].status).toBe('SKIPPED_NO_CONSENT')
  })

  it('applies the real visa filter dimensions to the query', () => {
    expect(
      buildVisaWhere({
        destinationIso2: 'GB', visaType: 'tourist', status: 'approved',
        assignedTo: 'glory', branch: 'nigeria',
        createdFrom: '2026-01-01', createdTo: '2026-06-01',
      }),
    ).toEqual({
      destinationIso2: 'GB', visaType: 'tourist', status: 'approved',
      assignedTo: 'glory', branch: 'nigeria',
      createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-06-01') },
    })
  })
})

// ── Combined + dedup + provenance ───────────────────────────────────────

describe('cross-source de-duplication', () => {
  it('collapses one human contributed by all three sources into ONE recipient', async () => {
    const number = '+2348012345678'
    leadStore = [lead({ id: 'l1', whatsapp: number })]
    visaStore = [visa({ id: 'v1', phone: number })]
    consentStore = [subscribed(number)]

    const { breakdown, recipients } = await resolveMultiSourceAudience({
      selection: {
        leadIds: ['l1'],
        visaApplicationIds: ['v1'],
        manualEntries: [{ number: '0' + number.slice(4), displayName: 'x' }, { number }],
      },
    })

    const forNumber = recipients.filter(r => r.normalizedNumber === number)
    expect(forNumber).toHaveLength(1)
    expect(breakdown.finalSendCount).toBe(1)
    // Three contributors, two collapsed away.
    expect(breakdown.duplicatesRemoved).toBe(2)

    // Provenance keeps every origin on the single surviving row.
    const types = forNumber[0].sourceProvenance.map(p => p.type)
    expect(types).toEqual(['LEAD', 'VISA_APPLICATION', 'MANUAL'])
    expect(forNumber[0].leadId).toBe('l1')
    expect(forNumber[0].visaApplicationId).toBe('v1')
    // Highest-priority contributor wins the primary attribution.
    expect(forNumber[0].sourceType).toBe('LEAD')
  })

  it('de-duplicates by NUMBER, not by database id or by name', async () => {
    const number = '+2348012345678'
    leadStore = [
      lead({ id: 'l1', name: 'Ada Obi', whatsapp: number }),
      lead({ id: 'l2', name: 'A. Obi', whatsapp: '234 801 234 5678' }),
    ]
    consentStore = [subscribed(number)]

    const { breakdown, recipients } = await resolveMultiSourceAudience({ selection: { leadIds: ['l1', 'l2'] } })

    expect(recipients.filter(r => r.normalizedNumber === number)).toHaveLength(1)
    expect(breakdown.duplicatesRemoved).toBe(1)
    expect(breakdown.finalSendCount).toBe(1)
  })

  it('OR-merges opt-out across contributors — a manual retype cannot launder an opt-out', async () => {
    const number = '+2348012345678'
    leadStore = [lead({ id: 'l1', whatsapp: number, marketingOptOut: true })]
    consentStore = [subscribed(number)]

    const { breakdown, recipients } = await resolveMultiSourceAudience({
      selection: { leadIds: ['l1'], manualEntries: [{ number, displayName: 'try again' }] },
    })

    expect(breakdown.eligible).toBe(0)
    expect(breakdown.optedOut).toBe(1)
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
  })

  it('OR-merges an opt-out carried only by the VisaApplication side', async () => {
    const number = '+2348012345678'
    leadStore = [lead({ id: 'l1', whatsapp: number, marketingOptOut: false })]
    visaStore = [visa({ id: 'v1', phone: number, marketingOptOut: true })]
    consentStore = [subscribed(number)]

    const { breakdown } = await resolveMultiSourceAudience({
      selection: { leadIds: ['l1'], visaApplicationIds: ['v1'] },
    })
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.finalSendCount).toBe(0)
  })

  it('merges template fields across sources, richest-source-first', async () => {
    const number = '+2348012345678'
    leadStore = [lead({ id: 'l1', whatsapp: number, name: null, destination: 'Paris' })]
    visaStore = [visa({ id: 'v1', phone: number, firstName: 'Ada', lastName: 'Obi' })]
    consentStore = [subscribed(number)]

    const { recipients } = await resolveMultiSourceAudience({
      selection: { leadIds: ['l1'], visaApplicationIds: ['v1'] },
      template: {
        name: 'x', language: 'en',
        params: [{ type: 'lead_field', field: 'name' }, { type: 'lead_field', field: 'destination' }],
      },
    })

    // Lead wins `destination`; the Lead's null `name` falls through to the
    // visa applicant's real name rather than failing the send.
    expect(recipients[0].templateParamsSnapshot).toEqual(['Ada Obi', 'Paris'])
  })
})

// ── SELECTABLE vs ELIGIBLE ──────────────────────────────────────────────

describe('SELECTABLE vs ELIGIBLE_TO_SEND', () => {
  it('a selection can name opted-out and unconsented people — selection is not gated', async () => {
    leadStore = [
      lead({ id: 'l1', whatsapp: '+2348011111111', marketingOptOut: true }),
      lead({ id: 'l2', whatsapp: '+2348022222222' }),
      lead({ id: 'l3', whatsapp: '+2348033333333' }),
    ]
    consentStore = [subscribed('+2348033333333')]

    const { breakdown, recipients } = await resolveMultiSourceAudience({
      selection: { leadIds: ['l1', 'l2', 'l3'] },
    })

    // All three were selectable and all three are accounted for…
    expect(breakdown.totalSelected).toBe(3)
    expect(recipients).toHaveLength(3)
    // …but eligibility was computed separately and only one survives.
    expect(breakdown.eligible).toBe(1)
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.missingConsent).toBe(1)
  })

  it('the selection shape cannot carry an eligibility claim or a number', () => {
    const parsed = parseAudienceSelection({
      leadIds: ['l1'],
      // Everything a tampered client might try to smuggle in:
      eligible: true,
      recipientCount: 9999,
      consentStatus: 'SUBSCRIBED',
      ignoreConsent: true,
      skipConsent: true,
      bypassConsent: true,
      normalizedNumber: '+2348012345678',
      recipients: [{ normalizedNumber: '+2348012345678', status: 'QUEUED' }],
    })
    expect(parsed).toEqual({ leadIds: ['l1'] })
    expect(Object.keys(parsed)).toEqual(['leadIds'])
  })

  it('every excluded recipient carries a human-readable reason, not just a bucket', async () => {
    leadStore = [
      lead({ id: 'l1', whatsapp: '+2348011111111', marketingOptOut: true }),
      lead({ id: 'l2', whatsapp: '+2348022222222' }),
      lead({ id: 'l3', whatsapp: null }),
    ]

    const { breakdown, recipients } = await resolveMultiSourceAudience({ selection: { leadIds: ['l1', 'l2', 'l3'] } })

    for (const r of recipients) {
      expect(typeof r.exclusionReason).toBe('string')
      expect((r.exclusionReason ?? '').length).toBeGreaterThan(20)
    }
    const reasons = breakdown.exclusions.map(x => x.reason)
    expect(reasons).toContain('Opted out')
    expect(reasons).toContain('No recorded consent')
    expect(reasons).toContain('Invalid or missing number')
    for (const x of breakdown.exclusions) expect(x.description.length).toBeGreaterThan(30)
  })

  it('"select all" is never implicit — a filter alone contributes nobody', async () => {
    leadStore = [lead({ id: 'l1' })]
    const sel = parseAudienceSelection({ leadFilter: { service: 'Visa Processing' } })
    expect(hasMultiSourceSelection(sel)).toBe(false)

    const { breakdown } = await resolveMultiSourceAudience({ selection: sel })
    expect(breakdown.totalSelected).toBe(0)
    expect(leadFindMany).not.toHaveBeenCalled()
  })

  it('an explicitly resolved filter with useLeadFilter DOES contribute', async () => {
    leadStore = [lead({ id: 'l1', service: 'Visa Processing' }), lead({ id: 'l2', service: 'Flight Booking' })]
    const sel = parseAudienceSelection({ leadFilter: { service: 'Visa Processing' }, useLeadFilter: true })

    const { breakdown } = await resolveMultiSourceAudience({ selection: sel })
    expect(breakdown.bySource.LEAD).toBe(1)
    expect(leadFindMany.mock.calls[0][0].where).toEqual({ service: 'Visa Processing' })
  })

  it('an individually ticked lead is never dropped by the bulk country filter', async () => {
    leadStore = [
      lead({ id: 'l1', whatsapp: '+233201234567' }),   // Ghana
      lead({ id: 'l2', whatsapp: '+2348012345678' }),  // Nigeria
    ]
    const { breakdown } = await resolveMultiSourceAudience({
      selection: { leadIds: ['l1'], leadFilter: { country: 'NG' }, useLeadFilter: true },
    })
    // l2 comes in via the filter; l1 was ticked by hand and survives.
    expect(breakdown.bySource.LEAD).toBe(2)
    expect(breakdown.countryFiltered).toBe(0)
  })

  it('drops filter-sourced leads outside the chosen country and says so', async () => {
    leadStore = [lead({ id: 'l1', whatsapp: '+233201234567' }), lead({ id: 'l2', whatsapp: '+2348012345678' })]
    const { breakdown } = await resolveMultiSourceAudience({
      selection: { leadFilter: { country: 'NG' }, useLeadFilter: true },
    })
    expect(breakdown.countryFiltered).toBe(1)
    expect(breakdown.bySource.LEAD).toBe(1)
    expect(breakdown.exclusions.map(x => x.reason)).toContain('Outside the chosen country')
  })
})

// ── Manual number parsing ───────────────────────────────────────────────

describe('manual number normalization and validation', () => {
  it('splits newline, comma, semicolon and tab separated pastes', () => {
    const out = splitManualNumberBlob('+2348011111111\n+2348022222222, +2348033333333;+2348044444444\t+2348055555555')
    expect(out.map(e => e.number)).toEqual([
      '+2348011111111', '+2348022222222', '+2348033333333', '+2348044444444', '+2348055555555',
    ])
  })

  it('reads an optional display name after | or :', () => {
    expect(splitManualNumberBlob('+2348011111111 | Ada Obi')[0]).toEqual({ number: '+2348011111111', displayName: 'Ada Obi' })
    expect(splitManualNumberBlob('+2348011111111: Kwame')[0]).toEqual({ number: '+2348011111111', displayName: 'Kwame' })
  })

  it('normalizes to E.164 and reports invalid and duplicate entries separately', () => {
    const r = parseManualNumbers([
      { number: ' +234 801 111 1111 ' },
      { number: '2348011111111' },          // same person, different form
      { number: '08011111111' },            // local format — not convertible
      { number: 'hello' },
      { number: '1234' },
      { number: '' },
    ])

    expect(r.valid.map(v => v.normalizedNumber)).toEqual(['+2348011111111'])
    expect(r.duplicates).toHaveLength(1)
    expect(r.duplicates[0].firstSeenAs).toBe('+234 801 111 1111')
    expect(r.invalid).toHaveLength(4)   // local format, 'hello', '1234', empty
    expect(r.invalid.find(i => i.raw === '08011111111')?.reason).toMatch(/Local format/)
    expect(r.invalid.find(i => i.raw === '1234')?.reason).toMatch(/short/i)
    // Every entry lands in exactly one bucket.
    expect(r.valid.length + r.invalid.length + r.duplicates.length).toBe(r.totalEntries)
  })

  it('rejected manual entries never reach the audience, and are counted with a reason', async () => {
    const { breakdown, recipients, manual } = await resolveMultiSourceAudience({
      selection: { manualEntries: [{ number: '08011111111' }, { number: 'nope' }] },
    })
    expect(recipients).toHaveLength(0)
    expect(breakdown.manualRejected).toBe(2)
    expect(manual.invalid).toHaveLength(2)
    expect(breakdown.exclusions.map(x => x.reason)).toContain('Manual entries rejected')
  })
})

// ── Equivalence with V1 ─────────────────────────────────────────────────

describe('V1 equivalence', () => {
  it('a filter-only selection resolves to the same recipients as V1s untouched resolver', async () => {
    leadStore = [
      lead({ id: 'l1', whatsapp: '+2348011111111' }),
      lead({ id: 'l2', whatsapp: '+2348022222222', marketingOptOut: true }),
      lead({ id: 'l3', whatsapp: null }),
      lead({ id: 'l4', whatsapp: '+2348011111111' }),   // duplicate number
    ]
    consentStore = [subscribed('+2348011111111')]

    const v1 = await resolveAudience({ filter: { service: 'Visa Processing' } })
    const v11 = await resolveMultiSourceAudience({
      selection: { leadFilter: { service: 'Visa Processing' }, useLeadFilter: true },
    })

    const key = (r: { normalizedNumber: string | null; status: string }) => `${r.normalizedNumber}:${r.status}`
    expect(v11.recipients.map(key).sort()).toEqual(v1.recipients.map(key).sort())
    expect(v11.breakdown.finalSendCount).toBe(v1.breakdown.finalSendCount)
    expect(v11.breakdown.optedOut).toBe(v1.breakdown.optedOut)
    expect(v11.breakdown.missingConsent).toBe(v1.breakdown.missingConsent)
    expect(v11.breakdown.invalidNumber).toBe(v1.breakdown.invalidNumber)
    expect(v11.breakdown.duplicatesRemoved).toBe(v1.breakdown.duplicatesRemoved)
  })
})
