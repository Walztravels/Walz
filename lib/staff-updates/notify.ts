/**
 * Staff Updates — publish→notify orchestrator.
 *
 * This is the ONE place "publish this announcement" fans out into an
 * in-app notification + a transactional email per targeted staff member.
 * Both the Publish Now route (app/api/admin/announcements/[id]/route.ts)
 * and the Jade Daily Brief cron (app/api/cron/jade-daily-brief/route.ts)
 * call this instead of hand-rolling their own loop — previously each had
 * its own byte-for-byte-identical copy of the eligibility switch and the
 * notification-creation block, which is exactly the duplicated-system
 * risk this feature's mandate says to avoid.
 *
 * Idempotency / safe retry:
 *  - In-app notification: createStaffNotification()'s own sourceId dedup
 *    (sourceId = announcementId, one per staffId) — unchanged mechanism.
 *  - Email: AnnouncementEmailDelivery has a UNIQUE(announcementId, staffId)
 *    constraint. A row already in QUEUED/SENT is never re-sent; only a
 *    previous FAILED row (or no row) triggers a send attempt. This means
 *    calling notifyAnnouncementPublished() twice for the same announcement
 *    — e.g. a retried PATCH request — never double-emails anyone.
 *
 * A failure anywhere in this pipeline (recipient resolution, a single
 * email send, the ActivityLog write) is caught and logged; it must never
 * throw back into the caller and fail the publish itself. The caller
 * (the Publish Now route) already committed the announcement's PUBLISHED
 * status before calling this — notification delivery is best-effort
 * on top of that, not a precondition of it.
 */

import prisma from '@/lib/db'
import { resolveAnnouncementRecipients, type AnnouncementAudienceFields } from '@/lib/staff-updates/audience'
import { createStaffNotification } from '@/lib/notifications/staff'
import { sendAnnouncementEmail, type AnnouncementPriority } from '@/lib/email-announcement-notification'

export interface AnnouncementForNotify extends AnnouncementAudienceFields {
  id:             string
  title:          string
  summary:        string
  category:       string
  priority:       AnnouncementPriority
  effectiveDate:  Date | null
}

export interface NotifyAnnouncementResult {
  recipients:     number
  notified:       number
  emailsQueued:   number
  emailsSent:     number
  emailsFailed:   number
  emailsSkipped:  number // already SENT/QUEUED from a prior run — not re-sent
}

/**
 * Fans a just-published announcement out to every eligible active staff
 * member: one in-app StaffNotification + one AnnouncementEmailDelivery
 * row (and best-effort send) each. Safe to call more than once for the
 * same announcementId.
 */
export async function notifyAnnouncementPublished(
  ann: AnnouncementForNotify,
  // staffId is a real FK into Staff (nullable column, but a non-null value
  // MUST reference an existing row or the ActivityLog insert below fails
  // its foreign-key constraint) — pass null for system/cron-triggered runs
  // rather than a synthetic id like "system:jade-daily-brief".
  actor: { staffId: string | null; staffName: string; staffRole: string },
): Promise<NotifyAnnouncementResult> {
  const result: NotifyAnnouncementResult = {
    recipients: 0, notified: 0,
    emailsQueued: 0, emailsSent: 0, emailsFailed: 0, emailsSkipped: 0,
  }

  let recipients: Awaited<ReturnType<typeof resolveAnnouncementRecipients>> = []
  try {
    recipients = await resolveAnnouncementRecipients(ann)
  } catch (err) {
    console.warn(`[staff-updates/notify] recipient resolution failed announcementId=${ann.id}:`, (err as Error).message)
    return result
  }
  result.recipients = recipients.length

  for (const staff of recipients) {
    // In-app notification — createStaffNotification's own sourceId dedup
    // means a re-run of this loop is a no-op here (returns the existing id).
    try {
      const notificationId = await createStaffNotification({
        staffId:    staff.id,
        category:   'SYSTEM',
        title:      ann.title,
        body:       ann.summary,
        important:  ann.priority === 'URGENT',
        sourceId:   ann.id,
        sourceType: 'announcement',
      })
      if (notificationId) result.notified++
    } catch (err) {
      console.warn(`[staff-updates/notify] in-app notification failed staffId=${staff.id} announcementId=${ann.id}:`, (err as Error).message)
    }

    // Email — resolved server-side from Staff.email, never from the browser.
    try {
      const existingDelivery = await prisma.announcementEmailDelivery.findUnique({
        where: { announcementId_staffId: { announcementId: ann.id, staffId: staff.id } },
      })
      if (existingDelivery && existingDelivery.status !== 'FAILED') {
        result.emailsSkipped++
        continue
      }

      const delivery = existingDelivery
        ? await prisma.announcementEmailDelivery.update({
            where: { id: existingDelivery.id },
            data:  { status: 'QUEUED', failureReason: null },
          })
        : await prisma.announcementEmailDelivery.create({
            data: {
              announcementId: ann.id,
              staffId:        staff.id,
              email:          staff.email,
              status:         'QUEUED',
            },
          })
      result.emailsQueued++

      const sendResult = await sendAnnouncementEmail({
        announcementId: ann.id,
        title:          ann.title,
        summary:        ann.summary,
        category:       ann.category,
        priority:       ann.priority,
        effectiveDate:  ann.effectiveDate,
        staffName:      staff.name,
        staffId:        staff.id,
        staffEmail:     staff.email,
      })

      if (sendResult.ok) {
        await prisma.announcementEmailDelivery.update({
          where: { id: delivery.id },
          data:  { status: 'SENT', sentAt: new Date(), providerMessageId: sendResult.providerMessageId ?? null },
        })
        result.emailsSent++
      } else {
        await prisma.announcementEmailDelivery.update({
          where: { id: delivery.id },
          data:  { status: 'FAILED', failureReason: sendResult.error ?? 'unknown_error' },
        })
        result.emailsFailed++
      }
    } catch (err) {
      console.warn(`[staff-updates/notify] email delivery bookkeeping failed staffId=${staff.id} announcementId=${ann.id}:`, (err as Error).message)
      result.emailsFailed++
    }
  }

  try {
    await prisma.activityLog.create({
      data: {
        staffId:    actor.staffId,
        staffName:  actor.staffName,
        staffRole:  actor.staffRole,
        action:     'announcement.published.notified',
        module:     'staff',
        entityId:   ann.id,
        entityType: 'StaffAnnouncement',
        detail:     `Notified ${result.notified}/${result.recipients} staff; emailed ${result.emailsSent} sent, ${result.emailsFailed} failed, ${result.emailsSkipped} already delivered`,
      },
    })
  } catch (err) {
    console.warn(`[staff-updates/notify] ActivityLog write failed announcementId=${ann.id}:`, (err as Error).message)
  }

  return result
}
