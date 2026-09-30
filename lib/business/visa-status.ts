// lib/business/visa-status.ts — Walz Business (Release 2.1 remediation)
//
// A genuinely SEPARATE, narrower business-friendly status projection for
// Corporate/Agency users who need to track case progress WITHOUT seeing
// passport/document-sensitive metadata. Built as its OWN thing per the
// remediation brief, rather than by widening the sensitive
// .../visa-documents metadata route (which was reverted to its original,
// capability-gated boundary — see that route's header).
//
// The underlying raw VisaApplication.status vocabulary is the SAME one
// already exposed to the public, unauthenticated tracker page
// (app/track/[reference]/page.tsx) and the customer's own /my-account page
// — it is not new sensitive surface, just re-bucketed into a small,
// coarse, business-friendly set of labels for an operational dashboard.
//
// NEVER included anywhere downstream of this module: passportNumber,
// passportExpiryDate, document filenames/types, signed URLs, storage
// paths/ids, internal staff notes, or embassy/internal processing detail.
// This module only ever receives a bare status string and a document
// COUNT — never document rows.

export type BusinessFriendlyVisaStatus =
  | 'NOT_STARTED'
  | 'ACTION_NEEDED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'

const NOT_STARTED_STATES = ['draft']
const ACTION_NEEDED_STATES = ['documents_pending', 'pending_payment']
const SUBMITTED_STATES = ['submitted_to_embassy', 'submitted', 'decision_pending', 'pending_approval']
const IN_PROGRESS_STATES = ['under_review', 'processing', 'pending_review', 'ready_to_submit', 'revision_draft', 'pending', 'change_pending', 'received']
const APPROVED_STATES = ['approved', 'completed', 'complete']
const REJECTED_STATES = ['refused', 'rejected', 'declined']

/**
 * Maps the raw VisaApplication.status string to one of six coarse,
 * business-friendly buckets. Fails safe: an unrecognized raw status (a
 * future addition to the visa domain's own vocabulary) falls back to
 * IN_PROGRESS rather than silently defaulting to something more final
 * (APPROVED/REJECTED), so a business user is never told a case is decided
 * when it isn't.
 */
export function toBusinessFriendlyStatus(rawStatus: string | null | undefined): BusinessFriendlyVisaStatus {
  const s = (rawStatus ?? '').trim().toLowerCase()
  if (APPROVED_STATES.includes(s)) return 'APPROVED'
  if (REJECTED_STATES.includes(s)) return 'REJECTED'
  if (ACTION_NEEDED_STATES.includes(s)) return 'ACTION_NEEDED'
  if (SUBMITTED_STATES.includes(s)) return 'SUBMITTED'
  if (IN_PROGRESS_STATES.includes(s)) return 'IN_PROGRESS'
  if (NOT_STARTED_STATES.includes(s)) return 'NOT_STARTED'
  return 'IN_PROGRESS'
}

/**
 * A coarse "does someone need to do something" signal for a dashboard —
 * never a substitute for actually opening the case. Deliberately
 * conservative: ACTION_NEEDED always flags true; an IN_PROGRESS case with
 * zero documents received also flags true (nothing has been supplied yet).
 */
export function computeActionNeeded(businessStatus: BusinessFriendlyVisaStatus, documentsReceivedCount: number): boolean {
  if (businessStatus === 'ACTION_NEEDED') return true
  if (businessStatus === 'IN_PROGRESS' && documentsReceivedCount === 0) return true
  return false
}
