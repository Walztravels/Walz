/**
 * WhatsApp Broadcast V1 — audience resolution against a mocked Prisma.
 *
 * Asserts the REAL query shape (which Lead columns the filter touches) and
 * the REAL arithmetic of the preview breakdown, including the case this
 * feature exists to get right: a database full of leads resolving to ZERO
 * eligible recipients because nobody has recorded consent.
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

let leadStore: MockLead[] = []
let consentStore: Array<{ normalizedNumber: string; status: string }> = []
const leadFindMany = jest.fn()

const mockPrisma = {
  lead: {
    findMany: jest.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
      leadFindMany(args)
      let rows = leadStore
      const w = args.where ?? {}
      if (w.service) rows = rows.filter(r => r.service === w.service)
      if (w.branch) rows = rows.filter(r => r.branch === w.branch)
      return rows.slice(0, args.take ?? rows.length).map(r => ({ ...r }))
    }),
  },
  whatsAppConsent: {
    findMany: jest.fn(async (args: { where: { normalizedNumber: { in: string[] } } }) =>
      consentStore.filter(c => args.where.normalizedNumber.in.includes(c.normalizedNumber)).map(c => ({ ...c })),
    ),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma, prisma: mockPrisma }))

import { resolveAudience, MAX_AUDIENCE_SIZE } from '@/lib/whatsapp/broadcast/audience'

function lead(over: Partial<MockLead> = {}): MockLead {
  return {
    id: 'lead-1', name: 'Ada', whatsapp: '+2348012345678', service: 'Visa Processing',
    branch: 'nigeria', destination: 'London', travelDate: 'July 2026',
    marketingOptOut: false, ...over,
  }
}

const subscribed = (n: string) => ({ normalizedNumber: n, status: 'SUBSCRIBED' })

beforeEach(() => {
  jest.clearAllMocks()
  leadStore = []
  consentStore = []
})

describe('audience resolution — filter to real query', () => {
  it('translates service + branch into an indexed Lead query and bounds it', async () => {
    leadStore = [lead()]
    await resolveAudience({ filter: { service: 'Visa Processing', branch: 'nigeria' } })

    const args = leadFindMany.mock.calls[0][0]
    expect(args.where).toEqual({ service: 'Visa Processing', branch: 'nigeria' })
    expect(args.take).toBe(MAX_AUDIENCE_SIZE)
    // Country is NOT pushed into the DB query — Lead has no country column.
    expect(Object.keys(args.where)).not.toContain('country')
  })

  it('an empty filter queries with no predicate', async () => {
    leadStore = [lead()]
    await resolveAudience({ filter: {} })
    expect(leadFindMany.mock.calls[0][0].where).toEqual({})
  })

  it('applies the derived country filter after normalization', async () => {
    leadStore = [
      lead({ id: 'ng', whatsapp: '+2348012345678' }),
      lead({ id: 'gh', whatsapp: '+233554324622' }),
    ]
    consentStore = [subscribed('+2348012345678'), subscribed('+233554324622')]

    const { breakdown } = await resolveAudience({ filter: { country: 'GH' } })
    expect(breakdown.totalMatched).toBe(2)
    expect(breakdown.countryFiltered).toBe(1)
    expect(breakdown.eligible).toBe(1)
    expect(breakdown.finalSendCount).toBe(1)
  })
})

describe('audience resolution — the honest zero', () => {
  it('a database full of leads with no consent yields ZERO eligible', async () => {
    leadStore = Array.from({ length: 25 }, (_, i) =>
      lead({ id: `lead-${i}`, whatsapp: `+23480123456${String(i).padStart(2, '0')}` }))
    consentStore = []   // nothing in the product writes consent yet

    const { breakdown, recipients } = await resolveAudience({ filter: {} })

    expect(breakdown.totalMatched).toBe(25)
    expect(breakdown.missingConsent).toBe(25)
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.finalSendCount).toBe(0)
    // Every one of them is RECORDED as skipped, not silently dropped.
    expect(recipients).toHaveLength(25)
    expect(recipients.every(r => r.status === 'SKIPPED_NO_CONSENT')).toBe(true)
    expect(recipients.every(r => r.waId === null)).toBe(true)
  })

  it('the breakdown buckets are mutually exclusive and add up', async () => {
    leadStore = [
      lead({ id: 'ok',        whatsapp: '+2348011111111' }),
      lead({ id: 'optout',    whatsapp: '+2348022222222', marketingOptOut: true }),
      lead({ id: 'noconsent', whatsapp: '+2348033333333' }),
      lead({ id: 'nonumber',  whatsapp: null }),
      lead({ id: 'national',  whatsapp: '08044444444' }),  // unconvertible
    ]
    consentStore = [subscribed('+2348011111111'), subscribed('+2348022222222')]

    const { breakdown } = await resolveAudience({ filter: {} })

    expect(breakdown.totalMatched).toBe(5)
    expect(breakdown.eligible).toBe(1)
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.missingConsent).toBe(1)
    expect(breakdown.invalidNumber).toBe(2)
    expect(
      breakdown.eligible + breakdown.optedOut + breakdown.missingConsent + breakdown.invalidNumber,
    ).toBe(breakdown.totalMatched - breakdown.duplicatesRemoved - breakdown.countryFiltered)
  })
})

describe('duplicate-recipient handling', () => {
  it('collapses several Lead rows that share ONE phone number', async () => {
    // Lead is unique only on (source, sourceId) — the same human really
    // does appear more than once in this schema.
    leadStore = [
      lead({ id: 'homepage', whatsapp: '+2348012345678' }),
      lead({ id: 'whatsapp', whatsapp: '00234 801 234 5678' }),
      lead({ id: 'csv',      whatsapp: '+234-801-234-5678' }),
    ]
    consentStore = [subscribed('+2348012345678')]

    const { breakdown, recipients } = await resolveAudience({ filter: {} })

    expect(breakdown.totalMatched).toBe(3)
    expect(breakdown.duplicatesRemoved).toBe(2)
    expect(breakdown.eligible).toBe(1)
    expect(breakdown.finalSendCount).toBe(1)
    // Exactly one recipient row, so the DB unique index is never contended.
    expect(recipients.filter(r => r.normalizedNumber === '+2348012345678')).toHaveLength(1)
  })

  it('does NOT collapse rows that merely lack a number', async () => {
    leadStore = [lead({ id: 'a', whatsapp: null }), lead({ id: 'b', whatsapp: null })]
    const { breakdown, recipients } = await resolveAudience({ filter: {} })
    expect(breakdown.duplicatesRemoved).toBe(0)
    expect(breakdown.invalidNumber).toBe(2)
    // Both rows survive — NULL is DISTINCT under the unique index.
    expect(recipients).toHaveLength(2)
  })

  it('an opted-out duplicate cannot be revived by a later consented row', async () => {
    leadStore = [
      lead({ id: 'first', whatsapp: '+2348012345678', marketingOptOut: true }),
      lead({ id: 'second', whatsapp: '+2348012345678', marketingOptOut: false }),
    ]
    consentStore = [subscribed('+2348012345678')]
    const { breakdown } = await resolveAudience({ filter: {} })
    // The first (most recent) row wins dedup, and it is opted out.
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.optedOut).toBe(1)
  })

  it('an OLDER duplicate opted out still excludes the resolved lead even when the newer (winning) duplicate is not', async () => {
    // Reverse of the case above: here the row that WINS dedup (first /
    // most recent) is itself NOT opted out — only an older duplicate for
    // the same number is. Without OR-merging marketingOptOut across every
    // duplicate sharing the number, the newer row's own (unset) flag would
    // silently win and the opt-out would be lost.
    leadStore = [
      lead({ id: 'newer', whatsapp: '+2348012345678', marketingOptOut: false }),
      lead({ id: 'older', whatsapp: '+2348012345678', marketingOptOut: true }),
    ]
    consentStore = [subscribed('+2348012345678')]
    const { breakdown, recipients } = await resolveAudience({ filter: {} })
    expect(breakdown.eligible).toBe(0)
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.duplicatesRemoved).toBe(1)
    // Exactly one recipient row is written (for the winning 'newer' lead
    // id), and it correctly carries the merged opt-out outcome.
    expect(recipients).toHaveLength(1)
    expect(recipients[0].leadId).toBe('newer')
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
  })
})

describe('audience resolution — template parameter snapshotting', () => {
  const template = {
    contentSid: 'HX98c6c9a03dc7155b1b743e09de56b9b2',
    variables: {
      '1': { type: 'lead_field' as const, field: 'name' as const, fallback: 'there' },
      '2': { type: 'static' as const, value: 'July' },
    },
  }

  it('freezes resolved variable VALUES onto each eligible recipient', async () => {
    leadStore = [lead({ id: 'a', name: 'Ada', whatsapp: '+2348011111111' })]
    consentStore = [subscribed('+2348011111111')]

    const { recipients } = await resolveAudience({ filter: {}, template })
    expect(recipients[0].templateParamsSnapshot).toEqual({ '1': 'Ada', '2': 'July' })
    expect(recipients[0].waId).toBe('2348011111111')   // no leading '+'
    expect(recipients[0].status).toBe('QUEUED')
  })

  it('applies the fallback rather than sending an empty placeholder', async () => {
    leadStore = [lead({ id: 'a', name: null, whatsapp: '+2348011111111' })]
    consentStore = [subscribed('+2348011111111')]
    const { recipients } = await resolveAudience({ filter: {}, template })
    expect(recipients[0].templateParamsSnapshot).toEqual({ '1': 'there', '2': 'July' })
  })

  it('an unresolvable variable FAILS that recipient — never a half-rendered send', async () => {
    const noFallback = { ...template, variables: { '1': { type: 'lead_field' as const, field: 'destination' as const } } }
    leadStore = [lead({ id: 'a', destination: null, whatsapp: '+2348011111111' })]
    consentStore = [subscribed('+2348011111111')]

    const { breakdown, recipients } = await resolveAudience({ filter: {}, template: noFallback })
    expect(breakdown.templateUnresolvable).toBe(1)
    expect(breakdown.eligible).toBe(0)
    expect(recipients[0].status).toBe('FAILED')
    expect(recipients[0].templateParamsSnapshot).toEqual({})
  })

  it('skipped recipients carry no parameters and no waId', async () => {
    leadStore = [lead({ id: 'a', whatsapp: '+2348011111111', marketingOptOut: true })]
    const { recipients } = await resolveAudience({ filter: {}, template })
    expect(recipients[0].status).toBe('SKIPPED_OPT_OUT')
    expect(recipients[0].templateParamsSnapshot).toEqual({})
    expect(recipients[0].waId).toBeNull()
  })
})

describe('audience resolution — consent lookup', () => {
  it('loads consent in ONE batched query keyed on the number, not per-lead', async () => {
    leadStore = [
      lead({ id: 'a', whatsapp: '+2348011111111' }),
      lead({ id: 'b', whatsapp: '+2348022222222' }),
      lead({ id: 'c', whatsapp: '+2348033333333' }),
    ]
    await resolveAudience({ filter: {} })
    expect(mockPrisma.whatsAppConsent.findMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.whatsAppConsent.findMany.mock.calls[0][0].where.normalizedNumber.in.sort())
      .toEqual(['+2348011111111', '+2348022222222', '+2348033333333'])
  })

  it('skips the consent query entirely when no lead has a usable number', async () => {
    leadStore = [lead({ id: 'a', whatsapp: null })]
    await resolveAudience({ filter: {} })
    expect(mockPrisma.whatsAppConsent.findMany).not.toHaveBeenCalled()
  })

  it('a consent row that is OPTED_OUT is counted as opted out, not missing', async () => {
    leadStore = [lead({ id: 'a', whatsapp: '+2348011111111' })]
    consentStore = [{ normalizedNumber: '+2348011111111', status: 'OPTED_OUT' }]
    const { breakdown } = await resolveAudience({ filter: {} })
    expect(breakdown.optedOut).toBe(1)
    expect(breakdown.missingConsent).toBe(0)
  })
})

describe('preview sample never leaks a full number', () => {
  it('masks every sampled number', async () => {
    leadStore = [lead({ id: 'a', whatsapp: '+2348012345678' })]
    const { sample } = await resolveAudience({ filter: {} })
    expect(sample[0].maskedNumber).toBe('+234••••78')
    expect(sample[0].maskedNumber).not.toContain('2348012345678')
  })
})
