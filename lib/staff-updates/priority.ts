/**
 * Staff Updates — which priorities require formal acknowledgement.
 *
 * Per spec: HIGH and URGENT ("Critical" — see PRIORITY_LABEL in
 * lib/email-announcement-notification.ts, where URGENT displays as
 * "Critical") both require staff acknowledgement and both feed the Super
 * Admin "Acknowledged X/Y outstanding" report. NORMAL priority is
 * read-tracked only — it is never something staff are required to
 * formally acknowledge.
 *
 * This is the SINGLE source of truth for that gate. The announcement
 * detail page (whether the acknowledge button / outstanding-report panel
 * render at all) and both ack API routes (server-side enforcement that
 * "acknowledge" and the report are only meaningful for HIGH/URGENT) import
 * this rather than each hardcoding their own priority list — exactly the
 * kind of duplication this feature's own audit already flagged once for
 * audience eligibility.
 */
import type { AnnouncementPriority } from '@/lib/email-announcement-notification'

export function requiresAcknowledgement(priority: AnnouncementPriority | string): boolean {
  return priority === 'HIGH' || priority === 'URGENT'
}
