/**
 * Staff Updates — shared audience resolution.
 *
 * Prior to this file, the exact same isEligible() switch was duplicated
 * byte-for-byte in two places — app/api/admin/announcements/[id]/route.ts
 * (the Publish Now action) and app/api/cron/jade-daily-brief/route.ts (the
 * Daily Brief's own announcement-notification pass) — the classic
 * "two copies that will eventually drift" risk this feature's own mandate
 * ("do not create duplicate systems") is meant to prevent. Both call sites
 * now import from here instead.
 *
 * Recipients are ALWAYS resolved server-side from the authoritative Staff
 * table — never from anything the browser submits — and always scoped to
 * isActive staff only.
 */

import prisma from '@/lib/db'

export interface AnnouncementAudienceFields {
  audience:         string
  audienceRoles:    string[]
  audienceStaffIds: string[]
}

export interface EligibilityStaff {
  id:         string
  role:       string
  department: string
}

/** Pure predicate — safe to unit test without touching Prisma. */
export function isAnnouncementEligible(
  staff: EligibilityStaff,
  ann: AnnouncementAudienceFields,
): boolean {
  switch (ann.audience) {
    case 'EVERYONE':           return true
    case 'SALES':              return staff.department === 'sales'
    case 'VISA_TEAM':          return staff.department === 'visa'
    case 'TRAVEL_CONSULTANTS': return ['flights', 'tours', 'hotels'].includes(staff.department)
    case 'FINANCE':            return staff.department === 'accounts'
    case 'ADMIN_TEAM':         return ['super_admin', 'admin'].includes(staff.role)
    case 'MANAGEMENT':         return ['super_admin', 'manager', 'general_manager'].includes(staff.role)
    case 'SPECIFIC_ROLE':      return ann.audienceRoles.includes(staff.role)
    case 'SPECIFIC_STAFF':     return ann.audienceStaffIds.includes(staff.id)
    default:                   return true
  }
}

export interface AnnouncementRecipient {
  id:         string
  name:       string
  email:      string
  role:       string
  department: string
}

/**
 * Resolves the exact set of active staff targeted by an announcement's
 * audience, straight from the Staff table. This is the ONLY place recipient
 * lists are built for Staff Updates — the publish route, the notify
 * orchestrator, and the super-admin acknowledgement report all call this
 * same function, so "who was targeted" can never silently diverge between
 * where a notification was sent and where an acknowledgement report is
 * computed against.
 */
export async function resolveAnnouncementRecipients(
  ann: AnnouncementAudienceFields,
): Promise<AnnouncementRecipient[]> {
  const activeStaff = await prisma.staff.findMany({
    where:  { isActive: true },
    select: { id: true, name: true, email: true, role: true, department: true },
  })
  return activeStaff
    .filter(s => isAnnouncementEligible(s, ann))
    .map(s => ({ id: s.id, name: s.name, email: s.email, role: s.role, department: s.department }))
}
