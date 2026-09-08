/**
 * Walz Recruitment Hub — retention & compliance (Release 10).
 *
 * Retention is REPORT-first: nothing is ever deleted automatically. Staff
 * see which closed applications have passed the retention window and
 * erase candidates one at a time, each erasure an explicit, audited,
 * management-role human action. Erasure scrubs personal data but keeps
 * anonymous aggregate records (references, stages, dates) so historical
 * analytics stay truthful.
 */

import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { AdminSession } from '@/lib/admin-auth'
import { recruitmentAudit } from '@/lib/recruitment/core'
import { RECRUITMENT_BUCKET } from '@/lib/recruitment/applications'

/** Months closed applications are kept before appearing in the retention report. */
export const DEFAULT_RETENTION_MONTHS = 24

export function retentionMonths(): number {
  const env = Number(process.env.RECRUITMENT_RETENTION_MONTHS)
  return Number.isInteger(env) && env >= 1 && env <= 120 ? env : DEFAULT_RETENTION_MONTHS
}

export function retentionCutoff(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() - retentionMonths())
  return d
}

/**
 * Candidates whose every application is closed (rejected/withdrawn/hired-no —
 * hired stays), older than the retention window, and who are not in the
 * talent pool. Report only — deletion never happens here.
 */
export async function retentionReport(now: Date = new Date()) {
  const cutoff = retentionCutoff(now)
  const candidates = await prisma.candidate.findMany({
    where: {
      email: { not: { startsWith: 'anonymized-' } },
      applications: {
        every:  { status: { in: ['rejected', 'withdrawn'] }, updatedAt: { lt: cutoff } },
        some:   {},                       // at least one application (not a bare record)
      },
    },
    select: {
      id: true, email: true, firstName: true, lastName: true, createdAt: true,
      applications: { select: { reference: true, status: true, updatedAt: true, consentPrivacyVersion: true } },
    },
    take: 200,
  })
  // The talent pool overrides retention (the candidate agreed to be kept).
  const pooled = new Set(
    (await prisma.talentPoolEntry.findMany({ select: { candidateId: true } }))
      .map((e: { candidateId: string }) => e.candidateId),
  )
  return {
    retentionMonths: retentionMonths(),
    cutoff,
    candidates: candidates.filter((c: { id: string }) => !pooled.has(c.id)),
  }
}

/**
 * Erases one candidate's personal data — explicit human action, audited.
 * Scrubs identity fields, deletes stored documents (files + rows), notes,
 * free-text answers, AI artifacts and response notes; keeps anonymous
 * application skeletons (reference, stage history, dates) for statistics.
 */
export async function anonymizeCandidate(
  session: Pick<AdminSession, 'id' | 'email' | 'name'>,
  candidateId: string,
): Promise<{ ok: true; erasedDocuments: number } | { ok: false; error: string; status: number }> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true, email: true,
      documents:    { select: { id: true, storagePath: true } },
      applications: { select: { id: true } },
    },
  })
  if (!candidate) return { ok: false, error: 'Candidate not found', status: 404 }
  if (candidate.email.startsWith('anonymized-')) {
    return { ok: false, error: 'Candidate is already anonymized', status: 409 }
  }
  const pooled = await prisma.talentPoolEntry.findUnique({
    where: { candidateId }, select: { id: true },
  })
  if (pooled) {
    return { ok: false, error: 'Candidate is in the talent pool — remove them from it first', status: 409 }
  }

  // 1. Delete stored files (best-effort per file; rows go regardless).
  let erasedDocuments = 0
  const supabase = getSupabaseAdmin()
  for (const doc of candidate.documents) {
    try {
      await supabase.storage.from(RECRUITMENT_BUCKET).remove([doc.storagePath])
      erasedDocuments++
    } catch (err) {
      console.error('[compliance] storage delete failed for', doc.id, err instanceof Error ? err.message : err)
    }
  }

  const applicationIds = candidate.applications.map((a: { id: string }) => a.id)

  // 2. Scrub the database atomically.
  await prisma.$transaction([
    prisma.candidateDocument.deleteMany({ where: { candidateId } }),
    prisma.candidateNote.deleteMany({ where: { candidateId } }),
    ...(applicationIds.length > 0
      ? [
          prisma.applicationAnswer.deleteMany({ where: { applicationId: { in: applicationIds } } }),
          prisma.aiScreeningResult.deleteMany({ where: { applicationId: { in: applicationIds } } }),
          prisma.aiInterview.deleteMany({ where: { applicationId: { in: applicationIds } } }),
          prisma.jobOffer.updateMany({
            where: { applicationId: { in: applicationIds } },
            data:  { candidateNote: null, terms: null, compensationNotes: null },
          }),
          prisma.jobApplication.updateMany({
            where: { id: { in: applicationIds } },
            data: {
              coverLetter: null, accommodation: null, howHeard: null, referral: null,
              workAuthorization: null, statusTokenHash: null, statusTokenExpiresAt: null,
            },
          }),
        ]
      : []),
    prisma.candidate.update({
      where: { id: candidateId },
      data: {
        email:        `anonymized-${candidateId}@removed.invalid`,
        firstName:    'Removed',
        lastName:     'Candidate',
        phone:        null,
        country:      null,
        city:         null,
        linkedinUrl:  null,
        portfolioUrl: null,
        tags:         [],
      },
    }),
  ])

  await recruitmentAudit(session, 'Candidate Anonymized',
    `candidate ${candidateId}: PII scrubbed, ${candidate.documents.length} document(s) removed, ${applicationIds.length} application(s) reduced to anonymous records`)
  return { ok: true, erasedDocuments }
}
