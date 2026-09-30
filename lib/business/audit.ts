// lib/business/audit.ts — Walz Business (Release 1): sole writer to
// business_audit_log.
//
// Mirrors the engineering discipline of lib/automation/audit.ts
// (AutomationAuditLog): ONE function writes this table, and every mutation
// route in this domain (org create, member invite, traveller create,
// request create, approval decision) must call it.
//
// FAIL-SOFT CONTRACT: by the time this is called, the underlying business
// mutation has already committed. An audit-write failure must never surface
// as a failure of that mutation to the caller — it is logged to console and
// swallowed, exactly like recordAutomationDecision()'s error handling.

import prisma from '@/lib/db'
import type { Prisma } from '@prisma/client'

export interface BusinessAuditInput {
  organizationId?: string | null
  actorUserId?: string | null   // customer-portal actor (User.id)
  actorStaffId?: string | null  // staff/admin actor (Staff.id or email)
  action: string                // e.g. 'organization.create', 'member.invite'
  entityType: string            // e.g. 'Organization', 'OrganizationMembership'
  entityId?: string | null
  before?: unknown
  after?: unknown
}

export async function recordBusinessAudit(input: BusinessAuditInput): Promise<{ id: string } | null> {
  try {
    const row = await prisma.businessAuditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.actorUserId ?? null,
        actorStaffId: input.actorStaffId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        before: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
      },
    })
    return { id: row.id }
  } catch (err) {
    console.error('[BusinessAudit] Failed to write audit row:', (err as Error).message)
    return null
  }
}
