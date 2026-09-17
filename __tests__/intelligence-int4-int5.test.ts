/**
 * INT-4 (Diaspora aggregates) + INT-5 (Revenue rules engine).
 *
 * Diaspora: aggregate-only, k-anonymous, deterministic backfill from
 * Walz history — never individual nationality profiling. Revenue:
 * deterministic rules, idempotent via dedupeKey, values only when
 * genuinely calculable (the flat £500 constant is gone), scheduled.
 */

import fs from 'fs'
import path from 'path'

const upserts: unknown[] = []
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    visaApplication: { findMany: jest.fn(async () => mockApps) },
    diasporaIntelligence: { upsert: jest.fn(async (args: unknown) => { upserts.push(args); return {} }) },
  },
}))

let mockApps: Array<{ nationality: string | null; destinationIso2: string; status: string; createdAt: Date }> = []

import {
  backfillDiasporaIntelligence, normalizeNationality,
  DIASPORA_MIN_GROUP_SIZE, ALL_PASSPORTS,
} from '@/lib/intelligence/diaspora-aggregate'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const rules     = read('lib/intelligence/revenue-rules.ts')
const cron      = read('app/api/cron/revenue-opportunities/route.ts')
const vercel    = read('vercel.json')
const revRoute  = read('app/api/admin/intelligence/revenue/route.ts')
const diaspora  = read('lib/intelligence/diaspora-aggregate.ts')
const sql       = read('prisma/migrations/int5_revenue_rules.sql')

const app = (nationality: string | null, status = 'approved', daysAgo = 10) => ({
  nationality, destinationIso2: 'gb', status,
  createdAt: new Date(Date.now() - daysAgo * 86_400_000),
})

describe('diaspora aggregation (INT-4)', () => {
  beforeEach(() => { upserts.length = 0 })

  it('normalizes free-text nationalities into stable groups', () => {
    expect(normalizeNationality(' nigerian ')).toBe('Nigeria')
    expect(normalizeNationality('Nigeria')).toBe('Nigeria')
    expect(normalizeNationality('ghanaian')).toBe('Ghana')
    expect(normalizeNationality(null)).toBeNull()
    expect(normalizeNationality('  ')).toBeNull()
  })
  it('suppresses nationality groups under k and always writes the destination rollup', async () => {
    mockApps = [
      ...Array.from({ length: 6 }, () => app('Nigerian')),
      ...Array.from({ length: 2 }, () => app('Ghanaian')),   // below k=5 → suppressed
    ]
    const r = await backfillDiasporaIntelligence()
    expect(DIASPORA_MIN_GROUP_SIZE).toBe(5)
    expect(r.suppressedGroups).toBe(1)
    expect(r.nationalityRows).toBe(1)          // Nigeria only
    expect(r.destinationRows).toBe(1)          // ALL|gb rollup carries everyone
    const keys = upserts.map(u => (u as { create: { passportCountry: string } }).create.passportCountry)
    expect(keys).toContain(ALL_PASSPORTS)
    expect(keys).toContain('Nigeria')
    expect(keys).not.toContain('Ghana')
  })
  it('approvalRate stays a 0–1 fraction over DECIDED cases only', async () => {
    mockApps = [
      ...Array.from({ length: 4 }, () => app('Nigerian', 'approved')),
      app('Nigerian', 'refused'),
      app('Nigerian', 'under_review'),          // undecided — excluded from the rate
    ]
    await backfillDiasporaIntelligence()
    const nigeria = upserts.map(u => (u as { create: { passportCountry: string; approvalRate: number } }).create)
      .find(c => c.passportCountry === 'Nigeria')!
    expect(nigeria.approvalRate).toBe(0.8)     // 4 of 5 decided
  })
  it('is deterministic and never profiles individuals', () => {
    expect(diaspora).not.toMatch(/Math\.random|anthropic|messages\.create/i)
    expect(diaspora).toContain('k-anonymity')
    // Only draft-filtered aggregate reads; no per-person outputs.
    expect(diaspora).toContain('isDraft: false')
  })
})

describe('revenue rules engine (INT-5)', () => {
  it('the flat £500 fabricated value is gone; values only when calculable', () => {
    expect(rules).not.toContain('estimatedValue: 500')
    expect(cron).not.toContain('estimatedValue: 500')
    expect(rules).toContain('0 = not calculable; never invented')
    // Quote-backed values are real amounts:
    expect(rules).toContain('Number(q.totalMinor) / 100')
  })
  it('covers the required detections', () => {
    for (const key of ['VISA_NO_FLIGHT:', 'QUOTE_FOLLOWUP:', 'FLIGHT_QUOTE_STALE:', 'TRIP_HOTEL_GAP:', 'TRIP_TRANSFER_GAP:', 'TRIP_ACTIVITY_GAP:', 'TRIP_ESIM_GAP:', 'PREMIUM_ITIN:']) {
      expect(rules).toContain(key)
    }
  })
  it('generation is idempotent — dedupeKey with unique-violation skip and pre-migration fallback', () => {
    expect(rules).toContain('dedupeKey: c.dedupeKey')
    expect(rules).toContain("/unique/i.test(msg)")
    expect(rules).toContain('findFirst')          // pre-migration existence check
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "RevenueOpportunity_dedupeKey_unique"')
    expect(sql).toContain('WHERE "dedupeKey" IS NOT NULL')
  })
  it('the cron is real and SCHEDULED — the unregistered random generator era is over', () => {
    expect(cron).toContain('generateRevenueOpportunities')
    expect(cron).not.toContain('Math.random')
    expect(cron).toContain('CRON_SECRET')
    expect(vercel).toContain('"path": "/api/cron/revenue-opportunities"')
  })
  it('detection never contacts clients automatically', () => {
    expect(rules).not.toMatch(/resend|sendWhatsApp|twilio|emails\.send/i)
    expect(rules).toContain('Nothing here contacts a client')
  })
  it('email-union join covers public-web bookings with null userId', () => {
    expect(rules).toContain('contactEmail')
    expect(rules).toContain("mode: 'insensitive'")
  })
  it('staff can trigger a run from the admin route', () => {
    expect(revRoute).toContain("action === 'generate'")
  })
})
