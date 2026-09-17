import prisma from '@/lib/db'
import { buildCaseDossier, type CaseDossier } from '@/lib/intelligence/case-dossier'

/**
 * Application Readiness (INT-3) — an explainable, DETERMINISTIC internal
 * indicator of how complete and consistent an application's evidence is.
 *
 * It is NOT an approval probability and is never presented as one.
 *
 * Documented formula (per dimension, 0–100):
 *   start at 100
 *   − 25 per CONFLICT finding in the dimension's categories
 *   − 10 per PARTIAL_MATCH or UNVERIFIED finding
 *   −  8 per MISSING finding
 *   completeness dimension instead scores presence of expected evidence
 *   (each expected document type contributes an equal share)
 * A dimension with no underlying data is INSUFFICIENT_DATA and is
 * EXCLUDED from the overall figure (never silently scored 50).
 * Overall = unweighted mean of dimensions that have data.
 */

export const READINESS_VERSION = 'int3.1'

export type DimensionStatus = 'STRONG' | 'ADEQUATE' | 'ATTENTION' | 'INSUFFICIENT_DATA'

export interface ReadinessDimension {
  key: string
  label: string
  score: number | null            // null = insufficient data
  status: DimensionStatus
  evidence: string[]              // where the assessment came from
  issues: string[]                // what is dragging it down
}

export interface ReadinessResult {
  version: string
  computedAt: string
  applicationId: string
  overall: number | null
  dimensionsScored: number
  dimensions: ReadinessDimension[]
  note: string
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const statusOf = (score: number | null): DimensionStatus =>
  score == null ? 'INSUFFICIENT_DATA' : score >= 85 ? 'STRONG' : score >= 60 ? 'ADEQUATE' : 'ATTENTION'

/** Which cross-check categories feed which dimension. */
const DIMENSION_CATEGORIES: Record<string, string[]> = {
  identityConsistency:   ['identity', 'passport'],
  travelConsistency:     ['travel', 'accommodation'],
  employmentEvidence:    ['employment'],
  financialConsistency:  ['financial'],
}

/** Expected evidence for a standard visitor-type case. */
const EXPECTED_DOC_TYPES = ['passport', 'bank_statement', 'employment_letter']

export function computeReadinessFromDossier(dossier: CaseDossier): ReadinessResult {
  const dims: ReadinessDimension[] = []
  const cc = dossier.crossCheck

  const findingsFor = (categories: string[]) => {
    if (!cc) return null
    // Reconstruct per-category counts from the conflict/missing detail we
    // have plus the aggregate counts (conflicts listed individually).
    const conflicts = cc.conflictFields.filter(f => categories.some(c => f.field.startsWith(categoryPrefix(c))))
    const missing   = cc.missingFields.filter(f => categories.some(c => f.startsWith(categoryPrefix(c))))
    return { conflicts, missing }
  }
  function categoryPrefix(category: string): string {
    return { identity: 'identity.', passport: 'passport.', employment: 'employment.',
             financial: 'financial.', travel: 'travel.', accommodation: 'accommodation.' }[category] ?? `${category}.`
  }

  for (const [key, categories] of Object.entries(DIMENSION_CATEGORIES)) {
    const label = {
      identityConsistency:  'Identity consistency',
      travelConsistency:    'Travel consistency',
      employmentEvidence:   'Employment evidence',
      financialConsistency: 'Financial consistency',
    }[key] as string
    const f = findingsFor(categories)
    if (!f || !cc || cc.counts.fieldsChecked === 0) {
      dims.push({ key, label, score: null, status: 'INSUFFICIENT_DATA',
        evidence: [], issues: ['No cross-check has been run for this case yet.'] })
      continue
    }
    let score = 100 - 25 * f.conflicts.length - 8 * f.missing.length
    const issues = [
      ...f.conflicts.map(c => `Conflict: ${c.field} — ${c.explanation}`),
      ...f.missing.map(m => `Missing evidence: ${m}`),
    ]
    dims.push({
      key, label, score: clamp(score), status: statusOf(clamp(score)),
      evidence: [`FormCrossCheck ${cc.formType} (${cc.runAt.slice(0, 10)})`],
      issues,
    })
  }

  // Document completeness — presence of expected evidence sources.
  {
    const present = EXPECTED_DOC_TYPES.filter(t =>
      dossier.evidence.documentTypes.includes(t) || dossier.documentChecks.some(c => c.documentType === t))
    const score = clamp((present.length / EXPECTED_DOC_TYPES.length) * 100)
    const missing = EXPECTED_DOC_TYPES.filter(t => !present.includes(t))
    dims.push({
      key: 'documentCompleteness', label: 'Document completeness',
      score, status: statusOf(score),
      evidence: present.length ? [`Evidence present for: ${present.join(', ')}`] : [],
      issues: missing.map(m => `No ${m.replace(/_/g, ' ')} has been analyzed for this case.`),
    })
  }

  // Financial DNA dimension — coverage + review items when computed.
  {
    const dna = dossier.financialDna
    if (!dna) {
      dims.push({ key: 'financialFunding', label: 'Financial funding', score: null,
        status: 'INSUFFICIENT_DATA', evidence: [], issues: ['Financial DNA has not been computed for this client.'] })
    } else {
      let score = 100
      const issues: string[] = []
      if (dna.fundingCoverageRatio == null) { score -= 20; issues.push('Funding coverage could not be computed.') }
      else if (dna.fundingCoverageRatio < 1) { score -= 40; issues.push(`Funding coverage is ${dna.fundingCoverageRatio}× — below the estimated trip cost.`) }
      else if (dna.fundingCoverageRatio < 1.5) { score -= 15; issues.push(`Funding coverage is ${dna.fundingCoverageRatio}× — limited headroom.`) }
      score -= 10 * dna.reviewItems.length
      issues.push(...dna.reviewItems)
      dims.push({
        key: 'financialFunding', label: 'Financial funding',
        score: clamp(score), status: statusOf(clamp(score)),
        evidence: [`ClientFinancialDNA (${dna.computedAt.slice(0, 10)})`],
        issues,
      })
    }
  }

  const scored = dims.filter(d => d.score != null)
  const overall = scored.length
    ? clamp(scored.reduce((s, d) => s + (d.score as number), 0) / scored.length)
    : null

  return {
    version: READINESS_VERSION,
    computedAt: new Date().toISOString(),
    applicationId: dossier.applicationId,
    overall,
    dimensionsScored: scored.length,
    dimensions: dims,
    note: 'Internal application-readiness indicator computed deterministically from case evidence. It is not a visa-approval probability.',
  }
}

/** Compute readiness for a user's most recent real application. */
export async function computeReadinessForUser(userId: string): Promise<
  | { ok: true; readiness: ReadinessResult; applicationId: string }
  | { ok: false; error: string }
> {
  const app = await prisma.visaApplication.findFirst({
    where: { userId, isDraft: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!app) return { ok: false, error: 'This client has no submitted visa applications yet.' }
  const dossier = await buildCaseDossier(app.id)
  if (!dossier) return { ok: false, error: 'The application could not be loaded.' }
  return { ok: true, readiness: computeReadinessFromDossier(dossier), applicationId: app.id }
}
