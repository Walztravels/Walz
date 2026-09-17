import prisma from '@/lib/db'
import { getVisaCaseContext } from '@/lib/intelligence/visa-case-context'
import { getCaseEvidence } from '@/lib/intelligence/evidence'

/**
 * Case dossier (INT-2/INT-3) — a MINIMAL structured digest of a case for
 * review intelligence. Payload minimization: counts, statuses and short
 * labels only — never raw documents, full statements, or passport
 * numbers. This is what the Officer Simulation prompt receives and what
 * the Readiness engine scores from.
 */

export interface CaseDossier {
  applicationId: string
  destination: string
  visaType: string
  applicant: {
    hasName: boolean
    nationality: string | null
    employmentStatus: string | null
    employerNamed: boolean
    incomeDeclared: boolean
  }
  travel: {
    datesDeclared: boolean
    tripDays: number | null
    purpose: string | null
    accommodationNamed: boolean
  }
  evidence: {
    documentTypes: string[]          // distinct doc types with extracted evidence
    valueCount: number
  }
  documentChecks: Array<{ documentType: string; verdict: string; reviewState: string | null }>
  crossCheck: null | {
    formType: string
    runAt: string
    counts: { fieldsChecked: number; matches: number; partialMatches: number; conflicts: number; missing: number; unverified: number }
    conflictFields: Array<{ field: string; explanation: string }>
    missingFields: string[]
  }
  financialDna: null | {
    computedAt: string
    fundingCoverageRatio: number | null
    incomeConsistencyNote: string
    reviewItems: string[]
  }
}

export async function buildCaseDossier(applicationId: string): Promise<CaseDossier | null> {
  const ctx = await getVisaCaseContext(applicationId)
  if (!ctx) return null

  const evidence = await getCaseEvidence(applicationId)
  const evidenceTypes = [...new Set(evidence.map(e => e.documentType).filter((t): t is string => Boolean(t)))]

  let crossCheck: CaseDossier['crossCheck'] = null
  try {
    const run = await prisma.formCrossCheck.findFirst({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      include: { findings: { where: { status: { in: ['CONFLICT', 'MISSING'] } }, take: 20 } },
    })
    if (run) {
      crossCheck = {
        formType: run.formType,
        runAt: run.createdAt.toISOString(),
        counts: {
          fieldsChecked: run.fieldsChecked, matches: run.matches,
          partialMatches: run.partialMatches, conflicts: run.conflicts,
          missing: run.missing, unverified: run.unverified,
        },
        conflictFields: run.findings.filter(f => f.status === 'CONFLICT')
          .map(f => ({ field: f.field, explanation: f.explanation ?? '' })),
        missingFields: run.findings.filter(f => f.status === 'MISSING').map(f => f.field),
      }
    }
  } catch { /* pre-migration */ }

  let financialDna: CaseDossier['financialDna'] = null
  try {
    const app = await prisma.visaApplication.findUnique({ where: { id: applicationId }, select: { userId: true } })
    if (app?.userId) {
      const row = await prisma.clientFinancialDNA.findUnique({ where: { userId: app.userId } })
      const dna = row?.scoreHistory as Record<string, unknown> | null
      if (dna && typeof dna === 'object' && dna.version) {
        const coverage = dna.fundingCoverage as { ratio: number | null } | undefined
        const income   = dna.incomeConsistency as { note: string } | undefined
        const items    = Array.isArray(dna.reviewItems) ? dna.reviewItems as Array<{ item: string }> : []
        financialDna = {
          computedAt: String(dna.computedAt ?? row?.updatedAt?.toISOString() ?? ''),
          fundingCoverageRatio: coverage?.ratio ?? null,
          incomeConsistencyNote: income?.note ?? '',
          reviewItems: items.map(i => i.item).slice(0, 10),
        }
      }
    }
  } catch { /* dna absent */ }

  const tripDays = ctx.travel.arrivalDate && ctx.travel.returnDate
    ? Math.round((ctx.travel.returnDate.getTime() - ctx.travel.arrivalDate.getTime()) / 86_400_000)
    : null

  const checks = ctx.documentChecks.slice(0, 15).map(c => {
    let reviewState: string | null = null
    // reviewState lives inside the evidence JSON on newer rows.
    return { documentType: c.documentType, verdict: c.verdict, reviewState }
  })

  return {
    applicationId,
    destination: ctx.application.destinationIso2,
    visaType: ctx.application.visaType,
    applicant: {
      hasName: Boolean(ctx.applicant.fullName),
      nationality: ctx.applicant.nationality,
      employmentStatus: ctx.employment.employmentStatus,
      employerNamed: Boolean(ctx.employment.employerName),
      incomeDeclared: Boolean(ctx.financialDeclarations.monthlyIncome),
    },
    travel: {
      datesDeclared: Boolean(ctx.travel.arrivalDate && ctx.travel.returnDate),
      tripDays,
      purpose: ctx.travel.purposeOfVisit,
      accommodationNamed: Boolean(ctx.accommodation.accommodationName),
    },
    evidence: { documentTypes: evidenceTypes, valueCount: evidence.length },
    documentChecks: checks,
    crossCheck,
    financialDna,
  }
}
