/**
 * Walz Team Hub V1 — ActivityLog helper. Reuses the existing generic
 * ActivityLog table (never a new Team-Hub-specific audit table). Metadata
 * only, per the standing rule: never log message bodies, call audio, or
 * AI chain-of-thought — `detail` carries a short, human-readable summary,
 * never raw content.
 */
import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { currentStaffId } from './authz'

export async function logTeamActivity(
  session: AdminSession,
  action: string,
  entityId: string,
  detail?: string,
  entityType: string = 'team_conversation',
) {
  try {
    await prisma.activityLog.create({
      data: {
        staffId: currentStaffId(session), staffName: session.name, staffRole: session.role,
        action, module: 'team_hub', entityType, entityId, detail,
      },
    })
  } catch (e) {
    console.warn('[team/activity] activity log write failed:', e)
  }
}
