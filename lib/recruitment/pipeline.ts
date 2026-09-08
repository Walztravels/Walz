/**
 * Walz Recruitment Hub — pipeline stage movement engine (Release 3).
 *
 * Every stage move is written to ApplicationStageHistory (the audit spine)
 * inside the same transaction as the application update. Moves into decision
 * stages (offer / hired / rejected) are hiring decisions: they can only be
 * made here, by an authenticated management-role human — never by AI and
 * never automatically.
 */

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { DEFAULT_PIPELINE_STAGES, hasRecruitmentPermission, recruitmentAudit } from '@/lib/recruitment/core'

/** Stages that represent a hiring decision — always a human, management-role action. */
export const DECISION_STAGES = ['offer', 'hired', 'rejected'] as const

/** Application.status derived from the stage the application sits in. */
export const STAGE_TO_STATUS: Record<string, string> = {
  hired:       'hired',
  rejected:    'rejected',
  talent_pool: 'pooled',
}

export function isDecisionStage(key: string): boolean {
  return (DECISION_STAGES as readonly string[]).includes(key)
}

export function statusForStage(stageKey: string): string {
  return STAGE_TO_STATUS[stageKey] ?? 'active'
}

export interface MoveInput {
  session: Pick<AdminSession, 'id' | 'email' | 'name' | 'role'>
  applicationId: string
  toKey: string
  note?: string | null
}

export type MoveResult =
  | { ok: true; fromKey: string; toKey: string; status: string }
  | { ok: false; error: string; code: 'forbidden' | 'not_found' | 'invalid_stage' | 'same_stage' | 'withdrawn' }

export async function moveApplicationStage(input: MoveInput): Promise<MoveResult> {
  const { session, applicationId, toKey, note } = input

  // All stage moves are candidate-management actions; decision stages doubly so.
  if (!hasRecruitmentPermission(session, 'recruitment.candidates.manage')) {
    return { ok: false, error: 'You are not authorized to move candidates between stages', code: 'forbidden' }
  }

  const application = await prisma.jobApplication.findUnique({
    where:  { id: applicationId },
    select: { id: true, reference: true, jobId: true, stageKey: true, status: true },
  })
  if (!application) return { ok: false, error: 'Application not found', code: 'not_found' }
  if (application.status === 'withdrawn') {
    return { ok: false, error: 'This application was withdrawn by the candidate and cannot be moved', code: 'withdrawn' }
  }

  // The target stage must exist in this job's pipeline (fallback: defaults).
  const jobStages = await prisma.jobPipelineStage.findMany({
    where:  { jobId: application.jobId },
    select: { key: true },
  })
  const validKeys = jobStages.length > 0
    ? jobStages.map((s: { key: string }) => s.key)
    : DEFAULT_PIPELINE_STAGES.map(s => s.key as string)
  if (!validKeys.includes(toKey)) {
    return { ok: false, error: `Unknown pipeline stage "${toKey}" for this job`, code: 'invalid_stage' }
  }
  if (toKey === application.stageKey) {
    return { ok: false, error: 'Application is already in this stage', code: 'same_stage' }
  }

  const status = statusForStage(toKey)
  await prisma.$transaction([
    prisma.jobApplication.update({
      where: { id: applicationId },
      data:  { stageKey: toKey, status },
    }),
    prisma.applicationStageHistory.create({
      data: {
        applicationId,
        fromKey: application.stageKey,
        toKey,
        movedBy: session.email,        // always the authenticated human — never 'system' or AI
        note:    note?.trim() ? note.trim().slice(0, 2000) : null,
      },
    }),
  ])

  await recruitmentAudit(
    session,
    isDecisionStage(toKey) ? 'Hiring Decision' : 'Stage Moved',
    `${application.reference}: ${application.stageKey} → ${toKey}${note?.trim() ? ` — ${note.trim().slice(0, 200)}` : ''}`,
  )

  return { ok: true, fromKey: application.stageKey, toKey, status }
}
