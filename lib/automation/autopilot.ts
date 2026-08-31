// lib/automation/autopilot.ts — Release 7.6: Autopilot Level mapping & approval bridge
//
// SQL to run in Supabase SQL editor (never prisma db push):
// See: lib/automation/MIGRATION_SQL.md
//
// HARD RULES:
//   - bridgeToApprovalQueue MUST NOT execute the automation — it only queues for review.
//   - AutopilotLevel is a mapping over the existing AutomationClass system.
//   - LEVEL_1 (STAFF_APPROVAL_REQUIRED) queues an ApprovalRequest and stops.

import type { AutomationClass, AutomationAction } from './eligibility'

// ─── Autopilot Level constant map ─────────────────────────────────────────────
// Maps user-facing level names to the existing AutomationClass values.
// This is a VIEW over AutomationClass — not a parallel system.

export const AutopilotLevel = {
  LEVEL_0: 'AUTO_ALLOWED',           // System executes eligible actions autonomously
  LEVEL_1: 'STAFF_APPROVAL_REQUIRED', // System prepares; staff approves execution
  LEVEL_2: 'MANUAL_ONLY',            // System flags; staff executes manually
  LEVEL_3: 'BLOCKED',                // Action is blocked; requires escalation
} as const

export type AutopilotLevelKey = keyof typeof AutopilotLevel

// ─── Level ↔ Class conversion ─────────────────────────────────────────────────

export function toAutopilotLevel(cls: AutomationClass): AutopilotLevelKey {
  const map: Record<AutomationClass, AutopilotLevelKey> = {
    AUTO_ALLOWED:             'LEVEL_0',
    STAFF_APPROVAL_REQUIRED:  'LEVEL_1',
    MANUAL_ONLY:              'LEVEL_2',
    BLOCKED:                  'LEVEL_3',
  }
  return map[cls]
}

// ─── STAFF_APPROVAL bridge ────────────────────────────────────────────────────
// Called when checkAutomationEligibility() returns STAFF_APPROVAL_REQUIRED.
// Creates an ApprovalRequest DB record and returns its id.
//
// CRITICAL: This function MUST NOT execute the automation.
// It queues the action for human review and returns immediately.

export async function bridgeToApprovalQueue(params: {
  action:                AutomationAction
  entityId:              string
  entityType:            string
  amount?:               number
  currency?:             string
  reason:                string
  requestedByStaffId?:   string
}): Promise<string> {
  const prisma = (await import('@/lib/db')).default

  const req = await prisma.approvalRequest.create({
    data: {
      type:        'automation_' + params.action.toLowerCase(),
      status:      'pending',
      requestedBy: params.requestedByStaffId ?? 'system',
      entityId:    params.entityId,
      entityType:  params.entityType,
      amount:      params.amount ?? null,
      currency:    params.currency ?? null,
      reason:      params.reason,
    },
  })

  return req.id
}
