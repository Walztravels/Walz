import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getStandardRate } from '@/lib/fx'
import { EMBASSY_DB } from '@/lib/analyzeBankStatement'
import { normalizeAmount } from '@/lib/intelligence/evidence'

/**
 * Financial DNA (INT-1) — evidence-based financial aggregation.
 *
 * Reads what the EXISTING Bank Statement Analyzer already stored (both
 * the live analyse-v2 `analysis_result` shape and the legacy `analysis`
 * shape) plus the application's declared income and the best available
 * trip-cost source. It never re-analyzes a statement, never calls a
 * model, and never invents values: every output carries its evidence
 * basis, and anything not computable says so with a reason instead of
 * defaulting. No approval probabilities, ever.
 */

export const FINANCIAL_DNA_VERSION = 'int1.1'

/** One normalized statement analysis, whichever schema produced it. */
export interface FinancialSnapshot {
  applicationId: string
  source: 'analysis_result' | 'analysis' | 'visa_applications'
  currency: string | null
  closingBalance: number | null
  lowestBalance: number | null
  averageMonthlyBalance: number | null
  estimatedMonthlyIncome: number | null
  salaryCreditsDetected: boolean | null
  suspiciousCount: number
  largeWithdrawalCount: number
  status: string | null
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalize either analyzer schema into a FinancialSnapshot; null when the
 *  blob is unusable (error rows, fallback rows, unknown currency). */
export function normalizeSnapshot(
  raw: unknown,
  applicationId: string,
  source: FinancialSnapshot['source'],
): FinancialSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (a.analysable === false || a.error) return null
  if (a.analysisEngine === 'none') return null          // legacy makeFallback rows
  const currency = typeof a.currency === 'string' && /^[A-Z]{3}$/.test(a.currency) && a.currency !== 'UNK'
    ? a.currency : null
  if (typeof a.currency === 'string' && a.currency === 'UNKNOWN') return null
  const closing = num(a.closingBalance)
  const income  = num(a.estimatedMonthlyIncome)
  if (closing === null && income === null) return null  // nothing usable
  return {
    applicationId, source, currency,
    closingBalance:         closing,
    lowestBalance:          num(a.lowestBalance),
    averageMonthlyBalance:  num(a.averageMonthlyBalance),
    estimatedMonthlyIncome: income,
    salaryCreditsDetected:  typeof a.salaryCreditsDetected === 'boolean' ? a.salaryCreditsDetected : null,
    suspiciousCount:        Array.isArray(a.suspiciousTransactions) ? a.suspiciousTransactions.length : 0,
    largeWithdrawalCount:   Array.isArray(a.largeUnexplainedWithdrawals) ? a.largeUnexplainedWithdrawals.length : 0,
    status:                 typeof a.status === 'string' ? a.status : null,
  }
}

export interface Attributed<T> {
  value: T
  basis: string          // where this came from, e.g. bank_analysis.closingBalance
  sourceId?: string      // application id / quote id the evidence sits on
  currency?: string | null
}

export interface FinancialDna {
  version: string
  computedAt: string
  snapshotsUsed: number
  declaredMonthlyIncome: Attributed<number> | { value: null; reason: string }
  observedMonthlyIncome: Attributed<number> | { value: null; reason: string }
  incomeConsistency: { deltaPct: number | null; note: string }
  closingBalance: Attributed<number> | { value: null; reason: string }
  lowestBalance:  Attributed<number> | { value: null; reason: string }
  averageBalance: Attributed<number> | { value: null; reason: string }
  balanceTrend: { direction: 'up' | 'down' | 'stable' | null; deltaPct: number | null; note: string }
  tripCost: (Attributed<number> & { tier: string }) | { value: null; reason: string }
  fundingCoverage: {
    ratio: number | null
    note: string
    fxRate?: number
    fxSource?: string
    fxPair?: string
  }
  reviewItems: Array<{ item: string; evidence: string }>
}

/** Pure computation — deterministic given the same inputs. */
export async function computeFinancialDna(input: {
  declaredIncomeRaw: string | null
  snapshots: FinancialSnapshot[]           // newest first
  tripCost: { amount: number; currency: string; tier: string; sourceId?: string } | null
}): Promise<FinancialDna> {
  const latest = input.snapshots[0] ?? null
  const reviewItems: FinancialDna['reviewItems'] = []

  const declaredParsed = input.declaredIncomeRaw ? normalizeAmount(input.declaredIncomeRaw) : null
  const declared: FinancialDna['declaredMonthlyIncome'] = declaredParsed
    ? { value: Number(declaredParsed.value), currency: declaredParsed.currency, basis: 'visa_application.monthlyIncome (declared by applicant — a claim, not verified)' }
    : { value: null, reason: input.declaredIncomeRaw ? 'Declared income could not be parsed as an amount.' : 'No income declared on the application.' }

  const observed: FinancialDna['observedMonthlyIncome'] = latest?.estimatedMonthlyIncome != null
    ? { value: latest.estimatedMonthlyIncome, currency: latest.currency, basis: `bank_analysis.estimatedMonthlyIncome (${latest.source})`, sourceId: latest.applicationId }
    : { value: null, reason: 'No stored bank statement analysis with an income estimate.' }

  let incomeConsistency: FinancialDna['incomeConsistency'] = { deltaPct: null, note: 'Not comparable — one side is missing.' }
  if (declared.value != null && observed.value != null) {
    const dc = (declared as Attributed<number>).currency, oc = (observed as Attributed<number>).currency
    if (dc && oc && dc !== oc) {
      incomeConsistency = { deltaPct: null, note: `Declared (${dc}) and observed (${oc}) incomes are in different currencies.` }
    } else {
      const deltaPct = Math.round(Math.abs(declared.value - observed.value) / Math.max(declared.value, observed.value) * 100)
      incomeConsistency = {
        deltaPct,
        note: deltaPct <= 10 ? 'Declared income is consistent with observed recurring income.'
            : `Declared and observed incomes differ by ${deltaPct}%.`,
      }
      if (deltaPct > 10) reviewItems.push({
        item: `Declared income differs from observed recurring income by ${deltaPct}%.`,
        evidence: 'visa_application.monthlyIncome vs bank_analysis.estimatedMonthlyIncome',
      })
    }
  }

  const bal = (field: 'closingBalance' | 'lowestBalance' | 'averageMonthlyBalance', label: string): FinancialDna['closingBalance'] =>
    latest && latest[field] != null
      ? { value: latest[field] as number, currency: latest.currency, basis: `bank_analysis.${field} (${latest.source})`, sourceId: latest.applicationId }
      : { value: null, reason: `No stored analysis provides ${label}.` }

  const closing = bal('closingBalance', 'a closing balance')
  const lowest  = bal('lowestBalance', 'a lowest balance')
  const average = bal('averageMonthlyBalance', 'an average balance')

  let balanceTrend: FinancialDna['balanceTrend'] = { direction: null, deltaPct: null, note: 'Fewer than two usable statement analyses.' }
  const balances = input.snapshots.filter(s => s.closingBalance != null && s.currency === latest?.currency)
  if (balances.length >= 2) {
    const newest = balances[0].closingBalance as number
    const oldest = balances[balances.length - 1].closingBalance as number
    const deltaPct = oldest !== 0 ? Math.round(((newest - oldest) / Math.abs(oldest)) * 100) : null
    balanceTrend = {
      direction: deltaPct == null ? null : deltaPct > 5 ? 'up' : deltaPct < -5 ? 'down' : 'stable',
      deltaPct,
      note: `Across ${balances.length} analyses (same currency).`,
    }
  }

  const tripCost: FinancialDna['tripCost'] = input.tripCost
    ? { value: input.tripCost.amount, currency: input.tripCost.currency, basis: input.tripCost.tier, tier: input.tripCost.tier, sourceId: input.tripCost.sourceId }
    : { value: null, reason: 'No quote, itinerary, portal amount or destination benchmark available.' }

  // Funding coverage — deterministic, FX-attributed, fail-closed.
  let fundingCoverage: FinancialDna['fundingCoverage'] = { ratio: null, note: 'Not computable — closing balance or trip cost missing.' }
  if (closing.value != null && tripCost.value != null) {
    const balCur = (closing as Attributed<number>).currency
    const cost   = tripCost as Attributed<number> & { tier: string }
    if (!balCur) {
      fundingCoverage = { ratio: null, note: 'Statement currency unknown — coverage cannot be computed safely.' }
    } else if (balCur === cost.currency) {
      fundingCoverage = { ratio: Number((closing.value / cost.value!).toFixed(2)), note: 'Same-currency comparison.' }
    } else {
      const rate = await getStandardRate(cost.currency as string, balCur, 60 * 60 * 1000).catch(() => null)
      if (!rate) {
        fundingCoverage = { ratio: null, note: `FX rate ${cost.currency}→${balCur} unavailable — coverage not computed (never guessed).` }
      } else {
        const costInBalCur = cost.value! * Number(rate.rawRate)
        fundingCoverage = {
          ratio: Number((closing.value / costInBalCur).toFixed(2)),
          note: `Trip cost converted ${cost.currency}→${balCur}.`,
          fxRate: Number(rate.rawRate), fxSource: rate.rateSource, fxPair: `${cost.currency}/${balCur}`,
        }
      }
    }
    if (fundingCoverage.ratio != null && fundingCoverage.ratio < 1) {
      reviewItems.push({
        item: `Closing balance covers only ${(fundingCoverage.ratio * 100).toFixed(0)}% of the estimated trip cost.`,
        evidence: `bank_analysis.closingBalance vs ${(tripCost as { tier: string }).tier}`,
      })
    }
  }

  if (latest?.salaryCreditsDetected === false) {
    reviewItems.push({ item: 'No recurring salary credits were detected in the latest statement.', evidence: `bank_analysis.salaryCreditsDetected (${latest.source})` })
  }
  if (latest && latest.suspiciousCount > 0) {
    reviewItems.push({ item: `${latest.suspiciousCount} transaction${latest.suspiciousCount === 1 ? '' : 's'} flagged for review in the latest statement analysis.`, evidence: 'bank_analysis.suspiciousTransactions' })
  }
  if (latest && latest.largeWithdrawalCount > 0) {
    reviewItems.push({ item: `${latest.largeWithdrawalCount} large unexplained withdrawal${latest.largeWithdrawalCount === 1 ? '' : 's'} noted.`, evidence: 'bank_analysis.largeUnexplainedWithdrawals' })
  }

  return {
    version: FINANCIAL_DNA_VERSION,
    computedAt: new Date().toISOString(),
    snapshotsUsed: input.snapshots.length,
    declaredMonthlyIncome: declared,
    observedMonthlyIncome: observed,
    incomeConsistency,
    closingBalance: closing, lowestBalance: lowest, averageBalance: average,
    balanceTrend, tripCost, fundingCoverage, reviewItems,
  }
}

// ── Data loading ─────────────────────────────────────────────────────────────

/** Best-effort read of stored analyses across all three historical stores.
 *  application_id in bank_statement_analyses may be a VisaApplication id OR
 *  a PortalApplication id (verified against production writers). */
export async function loadFinancialInputs(userId: string) {
  const visaApps = await prisma.visaApplication.findMany({
    where: { userId, isDraft: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, destinationIso2: true, monthlyIncome: true, email: true, status: true },
  })
  const portalApps = await prisma.portalApplication.findMany({
    where: { userId }, select: { id: true, amount: true, currency: true },
  }).catch(() => [] as Array<{ id: string; amount: number | null; currency: string }>)

  const ids = [...visaApps.map(a => a.id), ...portalApps.map(a => a.id)]
  const snapshots: FinancialSnapshot[] = []

  if (ids.length > 0) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('bank_statement_analyses')
        .select('application_id, analysis_result, analysis')
        .in('application_id', ids)
      for (const row of data ?? []) {
        const s = normalizeSnapshot(row.analysis_result, row.application_id, 'analysis_result')
          ?? normalizeSnapshot(row.analysis, row.application_id, 'analysis')
        if (s) snapshots.push(s)
      }
    } catch { /* table absent or unreadable — DNA degrades honestly */ }
    try {
      const { data } = await getSupabaseAdmin()
        .from('visa_applications')
        .select('id, bank_statement_analysis')
        .in('id', visaApps.map(a => a.id))
      for (const row of data ?? []) {
        if (snapshots.some(s => s.applicationId === row.id)) continue
        const s = normalizeSnapshot(row.bank_statement_analysis, row.id, 'visa_applications')
        if (s) snapshots.push(s)
      }
    } catch { /* legacy store absent */ }
  }

  // Trip cost precedence: accepted quote → itinerary → portal amount → destination benchmark.
  const latestApp = visaApps[0] ?? null
  let tripCost: { amount: number; currency: string; tier: string; sourceId?: string } | null = null
  const email = latestApp?.email ?? null
  if (email) {
    const quote = await prisma.quote.findFirst({
      where: { clientEmail: email, status: { in: ['accepted', 'converted'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, totalMinor: true, currency: true },
    }).catch(() => null)
    if (quote && quote.totalMinor != null) {
      tripCost = { amount: Number(quote.totalMinor) / 100, currency: quote.currency, tier: 'quote.totalMinor (accepted quote)', sourceId: quote.id }
    }
  }
  if (!tripCost) {
    const itin = await prisma.itinerary.findFirst({
      where: { userId, totalPrice: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, totalPrice: true, currency: true },
    }).catch(() => null)
    if (itin?.totalPrice) tripCost = { amount: itin.totalPrice, currency: itin.currency, tier: 'itinerary.totalPrice', sourceId: itin.id }
  }
  if (!tripCost) {
    const pa = portalApps.find(p => p.amount != null && p.amount > 0)
    if (pa) tripCost = { amount: pa.amount as number, currency: pa.currency, tier: 'portal_application.amount', sourceId: pa.id }
  }
  if (!tripCost && latestApp) {
    const destKey = ({ gb: 'uk', us: 'usa', ca: 'canada', ae: 'uae', au: 'australia' } as Record<string, string>)[latestApp.destinationIso2.toLowerCase()]
      ?? latestApp.destinationIso2.toLowerCase()
    const emb = EMBASSY_DB[destKey] ?? EMBASSY_DB.schengen
    if (emb?.tripCost) tripCost = { amount: emb.tripCost, currency: emb.currency, tier: `destination benchmark (EMBASSY_DB.${destKey})` }
  }

  return {
    visaApps,
    declaredIncomeRaw: latestApp?.monthlyIncome ?? null,
    snapshots,
    tripCost,
    successCount: visaApps.filter(a => a.status === 'approved').length,
    latestApplicationId: latestApp?.id ?? null,
  }
}
