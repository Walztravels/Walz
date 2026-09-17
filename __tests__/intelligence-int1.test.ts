/**
 * INT-1 — Financial DNA on the existing Bank Statement Analyzer.
 *
 * Reads stored analyses (both schemas), aggregates deterministically with
 * evidence attribution, converts currency only through a real FX rate
 * (fail-closed), and retires the placeholder scoring. No second analyzer,
 * no model calls, no random values, no approval probability.
 */

import fs from 'fs'
import path from 'path'

jest.mock('@/lib/db', () => ({ __esModule: true, default: {} }))
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: jest.fn() }))
jest.mock('@/lib/analyzeBankStatement', () => ({
  EMBASSY_DB: { uk: { tripCost: 3000, currency: 'GBP', min: 1200000 } },
}))
const mockRate = jest.fn()
jest.mock('@/lib/fx', () => ({ getStandardRate: (...a: unknown[]) => mockRate(...a) }))

import { normalizeSnapshot, computeFinancialDna, type FinancialSnapshot } from '@/lib/intelligence/financial-dna'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const lib   = read('lib/intelligence/financial-dna.ts')
const route = read('app/api/admin/intelligence/dna/route.ts')
const page  = read('app/admin/intelligence/dna/page.tsx')

const V2 = {
  status: 'PASS', currency: 'NGN', closingBalance: 14_200_000, lowestBalance: 2_000_000,
  averageMonthlyBalance: 8_000_000, estimatedMonthlyIncome: 850_000, salaryCreditsDetected: true,
  suspiciousTransactions: [{ date: 'x', description: 'y', amount: 3_500_000, reason: 'large', severity: 'high' }],
  largeUnexplainedWithdrawals: [],
}

describe('normalizeSnapshot', () => {
  it('accepts both analyzer schemas via the shared field intersection', () => {
    const s = normalizeSnapshot(V2, 'app1', 'analysis_result')
    expect(s).toMatchObject({ currency: 'NGN', closingBalance: 14_200_000, estimatedMonthlyIncome: 850_000, suspiciousCount: 1 })
    const legacy = normalizeSnapshot({ ...V2, analysisEngine: 'claude', finalVerdict: 'x' }, 'app2', 'analysis')
    expect(legacy?.closingBalance).toBe(14_200_000)
  })
  it('rejects error rows, fallback rows and UNKNOWN currency — never scored', () => {
    expect(normalizeSnapshot({ error: 'boom', analysable: false }, 'a', 'analysis_result')).toBeNull()
    expect(normalizeSnapshot({ ...V2, analysisEngine: 'none' }, 'a', 'analysis')).toBeNull()
    expect(normalizeSnapshot({ ...V2, currency: 'UNKNOWN' }, 'a', 'analysis')).toBeNull()
    expect(normalizeSnapshot(null, 'a', 'analysis')).toBeNull()
  })
})

describe('computeFinancialDna', () => {
  const snapshot = normalizeSnapshot(V2, 'app1', 'analysis_result') as FinancialSnapshot
  beforeEach(() => mockRate.mockReset())

  it('every output carries its evidence basis', async () => {
    mockRate.mockResolvedValue({ rawRate: 2000, rateSource: 'STANDARD_MARKET' })
    const dna = await computeFinancialDna({
      declaredIncomeRaw: 'NGN 850,000', snapshots: [snapshot],
      tripCost: { amount: 3000, currency: 'GBP', tier: 'destination benchmark (EMBASSY_DB.uk)' },
    })
    expect(dna.declaredMonthlyIncome).toMatchObject({ value: 850000, basis: expect.stringContaining('visa_application.monthlyIncome') })
    expect(dna.observedMonthlyIncome).toMatchObject({ value: 850000, basis: expect.stringContaining('bank_analysis.estimatedMonthlyIncome') })
    expect(dna.incomeConsistency.deltaPct).toBe(0)
    expect(dna.closingBalance).toMatchObject({ value: 14_200_000, sourceId: 'app1' })
    // GBP 3000 × 2000 = NGN 6,000,000 → 14.2M / 6M = 2.37×, FX attributed.
    expect(dna.fundingCoverage.ratio).toBeCloseTo(2.37, 2)
    expect(dna.fundingCoverage.fxSource).toBe('STANDARD_MARKET')
    expect(dna.fundingCoverage.fxPair).toBe('GBP/NGN')
    expect(dna.reviewItems.some(r => r.item.includes('flagged for review'))).toBe(true)
  })
  it('FX unavailable → coverage is null with a reason, never guessed', async () => {
    mockRate.mockResolvedValue(null)
    const dna = await computeFinancialDna({
      declaredIncomeRaw: null, snapshots: [snapshot],
      tripCost: { amount: 3000, currency: 'GBP', tier: 't' },
    })
    expect(dna.fundingCoverage.ratio).toBeNull()
    expect(dna.fundingCoverage.note).toContain('unavailable')
  })
  it('missing inputs produce reasons, not zeros', async () => {
    const dna = await computeFinancialDna({ declaredIncomeRaw: null, snapshots: [], tripCost: null })
    expect(dna.declaredMonthlyIncome.value).toBeNull()
    expect(dna.observedMonthlyIncome).toMatchObject({ value: null, reason: expect.stringContaining('No stored bank statement') })
    expect(dna.tripCost).toMatchObject({ value: null })
    expect(dna.fundingCoverage.ratio).toBeNull()
  })
  it('income mismatch beyond 10% becomes a review item with evidence', async () => {
    const dna = await computeFinancialDna({
      declaredIncomeRaw: 'NGN 2,000,000', snapshots: [snapshot], tripCost: null,
    })
    expect(dna.incomeConsistency.deltaPct).toBeGreaterThan(10)
    expect(dna.reviewItems.some(r => r.evidence.includes('visa_application.monthlyIncome'))).toBe(true)
  })
  it('balance trend needs two same-currency snapshots', async () => {
    const older: FinancialSnapshot = { ...snapshot, closingBalance: 10_000_000 }
    const dna = await computeFinancialDna({ declaredIncomeRaw: null, snapshots: [snapshot, older], tripCost: null })
    expect(dna.balanceTrend.direction).toBe('up')
    expect(dna.balanceTrend.deltaPct).toBe(42)
  })
})

describe('INT-1 architecture', () => {
  it('no second analyzer: DNA never calls a model and never re-analyzes', () => {
    expect(lib).not.toMatch(/anthropic|messages\.create|openai/i)
    expect(route).not.toMatch(/anthropic|messages\.create/i)
  })
  it('placeholder scoring is gone — no random, no fake peak/lowest formulas', () => {
    expect(route).not.toContain('Math.random')
    expect(route).not.toContain('50 + (successCount / analysisCount)')
    expect(route).not.toContain('averageScore + 10')
    expect(route).toContain('averageScore: 0, peakScore: 0, lowestScore: 0')
    expect(route).toContain('scoreHistory:    dna')
  })
  it('reads both stored schemas and the legacy per-application store', () => {
    expect(lib).toContain("'analysis_result'")
    expect(lib).toContain("normalizeSnapshot(row.analysis, row.application_id, 'analysis')")
    expect(lib).toContain("from('visa_applications')")
  })
  it('no approval-probability language anywhere', () => {
    for (const src of [lib, route, page]) {
      expect(src.toLowerCase()).not.toContain('approval probability')
      expect(src.toLowerCase()).not.toContain('chance of approval')
    }
    expect(page).toContain('never a chance-of-approval figure')
  })
  it('trip cost precedence is quote → itinerary → portal → destination benchmark', () => {
    const i = (s: string) => lib.indexOf(s)
    expect(i("tier: 'quote.totalMinor")).toBeGreaterThan(-1)
    expect(i("tier: 'quote.totalMinor")).toBeLessThan(i("tier: 'itinerary.totalPrice'"))
    expect(i("tier: 'itinerary.totalPrice'")).toBeLessThan(i("tier: 'portal_application.amount'"))
    expect(i("tier: 'portal_application.amount'")).toBeLessThan(i('tier: `destination benchmark'))
  })
})
