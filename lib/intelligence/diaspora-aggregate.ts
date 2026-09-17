import prisma from '@/lib/db'

/**
 * Diaspora Intelligence aggregation (INT-4) — AGGREGATE business
 * intelligence over Walz's own historical cases. Never profiles an
 * individual: nationality-level rows are written only when a group
 * reaches the k-anonymity minimum, everything else rolls into the
 * destination-level 'ALL' row. Deterministic — no model calls.
 */

export const DIASPORA_MIN_GROUP_SIZE = 5
/** Sentinel used by the existing unique key ('' = not bank-segmented). */
export const BANK_SENTINEL = ''
/** Destination-level aggregate row (not tied to any nationality). */
export const ALL_PASSPORTS = 'ALL'

/** Normalize free-text nationality into a stable group label. */
export function normalizeNationality(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!s) return null
  const MAP: Record<string, string> = {
    nigerian: 'Nigeria', nigeria: 'Nigeria', 'nigerian citizen': 'Nigeria',
    ghanaian: 'Ghana', ghana: 'Ghana',
    kenyan: 'Kenya', kenya: 'Kenya',
    'south african': 'South Africa', 'south africa': 'South Africa',
    british: 'United Kingdom', 'united kingdom': 'United Kingdom', uk: 'United Kingdom',
    american: 'United States', usa: 'United States', 'united states': 'United States',
  }
  if (MAP[s]) return MAP[s]
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

interface Group {
  passportCountry: string
  destinationIso2: string
  total: number
  approvals: number
  refusals: number
  monthCounts: Map<string, number>
  recent90d: number
  prior90d: number
}

export interface DiasporaBackfillResult {
  rowsWritten: number
  destinationRows: number
  nationalityRows: number
  suppressedGroups: number    // below k — rolled into ALL, never written
  applicationsScanned: number
}

/** Rebuild aggregates from historical VisaApplication rows. */
export async function backfillDiasporaIntelligence(now = new Date()): Promise<DiasporaBackfillResult> {
  const apps = await prisma.visaApplication.findMany({
    where:  { isDraft: false },
    select: { nationality: true, destinationIso2: true, status: true, createdAt: true },
  })

  const d90  = new Date(now.getTime() - 90 * 86_400_000)
  const d180 = new Date(now.getTime() - 180 * 86_400_000)

  const groups = new Map<string, Group>()
  const bump = (passport: string, dest: string, app: { status: string; createdAt: Date }) => {
    const key = `${passport}|${dest}`
    let g = groups.get(key)
    if (!g) {
      g = { passportCountry: passport, destinationIso2: dest, total: 0, approvals: 0, refusals: 0, monthCounts: new Map(), recent90d: 0, prior90d: 0 }
      groups.set(key, g)
    }
    g.total++
    if (app.status === 'approved') g.approvals++
    if (app.status === 'refused')  g.refusals++
    const month = app.createdAt.toISOString().slice(5, 7)
    g.monthCounts.set(month, (g.monthCounts.get(month) ?? 0) + 1)
    if (app.createdAt >= d90) g.recent90d++
    else if (app.createdAt >= d180) g.prior90d++
  }

  for (const app of apps) {
    const dest = app.destinationIso2.toLowerCase()
    bump(ALL_PASSPORTS, dest, app)                     // destination rollup, always
    const nat = normalizeNationality(app.nationality)
    if (nat) bump(nat, dest, app)
  }

  let destinationRows = 0, nationalityRows = 0, suppressed = 0
  for (const g of groups.values()) {
    const isAll = g.passportCountry === ALL_PASSPORTS
    if (!isAll && g.total < DIASPORA_MIN_GROUP_SIZE) { suppressed++; continue }   // k-anonymity

    const decided = g.approvals + g.refusals
    const peakMonths = [...g.monthCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => m)
    const uniqueWhere = {
      passportCountry_destinationIso2_bankName: {
        passportCountry: g.passportCountry, destinationIso2: g.destinationIso2, bankName: BANK_SENTINEL,
      },
    }
    const values = {
      totalApplications: g.total,
      approvals: g.approvals,
      refusals:  g.refusals,
      approvalRate: decided > 0 ? g.approvals / decided : 0,   // DB stores a 0–1 fraction
      peakMonths: peakMonths as unknown as string[],
      demandSignal: g.recent90d,
      trending: g.recent90d > g.prior90d && g.recent90d >= 3,
    }
    await prisma.diasporaIntelligence.upsert({
      where: uniqueWhere,
      update: values,
      create: {
        passportCountry: g.passportCountry, destinationIso2: g.destinationIso2,
        bankName: BANK_SENTINEL, ...values,
      },
    })
    if (isAll) destinationRows++; else nationalityRows++
  }

  return {
    rowsWritten: destinationRows + nationalityRows,
    destinationRows, nationalityRows,
    suppressedGroups: suppressed,
    applicationsScanned: apps.length,
  }
}
