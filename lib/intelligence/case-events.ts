import prisma from '@/lib/db'

/**
 * Case Intelligence History (DI-4) — the append-only per-case timeline.
 *
 * Every Document Intelligence action records an event; nothing is ever
 * updated or deleted. Recording is best-effort (tryDb): before the DI-4
 * migration runs, or if the write fails, the action itself still
 * succeeds — history must never break a workflow.
 *
 * Privacy: summaries and metadata carry references and counts, never
 * document text, passport numbers or financial values.
 */

export type CaseEventType =
  | 'document_uploaded'
  | 'document_analyzed'
  | 'evidence_extracted'
  | 'cross_check_run'
  | 'letter_generated'
  | 'ticket_generated'
  | 'document_sent'
  | 'financial_dna_run'
  | 'officer_sim_run'
  | 'readiness_run'

export const CASE_EVENT_LABELS: Record<CaseEventType, string> = {
  document_uploaded:  'Document uploaded',
  document_analyzed:  'Document analyzed',
  evidence_extracted: 'Evidence extracted',
  cross_check_run:    'Form cross-check run',
  letter_generated:   'Letter generated',
  ticket_generated:   'Dummy ticket generated',
  document_sent:      'Document sent to client',
  financial_dna_run:  'Financial analysis run',
  officer_sim_run:    'Officer simulation run',
  readiness_run:      'Readiness review run',
}

export async function recordCaseEvent(opts: {
  applicationId: string
  eventType:     CaseEventType
  actor:         string
  refType?:      string
  refId?:        string | null
  summary?:      string
  metadata?:     Record<string, unknown>
}): Promise<void> {
  if (!opts.applicationId) return
  try {
    await prisma.caseIntelligenceEvent.create({
      data: {
        applicationId: opts.applicationId,
        eventType:     opts.eventType,
        actor:         opts.actor,
        refType:       opts.refType ?? null,
        refId:         opts.refId ?? null,
        summary:       opts.summary?.slice(0, 500) ?? null,
        metadata:      (opts.metadata ?? {}) as never,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!/does not exist|relation|column/i.test(msg)) {
      console.error('[case-events] record failed:', msg.slice(0, 160))
    }
  }
}

/** Case timeline, newest first. Empty pre-migration. */
export async function getCaseTimeline(applicationId: string, take = 100) {
  try {
    return await prisma.caseIntelligenceEvent.findMany({
      where:   { applicationId },
      orderBy: { createdAt: 'desc' },
      take,
    })
  } catch { return [] }
}
