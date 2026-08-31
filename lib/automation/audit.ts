// lib/automation/audit.ts — Autopilot Blocker Fix: AutomationAuditLog write path
//
// recordAutomationDecision() — sole writer to AutomationAuditLog.
// checkAndAudit()            — eligibility + audit as an atomic pair.
//
// FAIL-CLOSED CONTRACT:
//   If the audit write fails AND the decision is AUTO_ALLOWED,
//   the returned auditId will be null. Callers MUST NOT execute autonomous
//   actions when auditId is null. Informational paths (BLOCKED, MANUAL_ONLY)
//   may still return but callers must not execute.
//
// PII RULES (never store in this table):
//   passport numbers, payment credentials, supplier payload, rateKey,
//   margins, commission, or any other customer's personal data.

import prisma from '@/lib/db'
import { checkAutomationEligibility } from './eligibility'
import type { EligibilityResult, EligibilityRequest } from './eligibility'

export interface AuditContext {
  entityType?:    string
  entityId?:      string
  tripId?:        string
  leadId?:        string
  opportunityId?: string
  correlationId?: string   // idempotency / tracing key for the triggering job
  actor?:         string   // 'system' | 'cron' | staffId
}

// ─── Write one audit row ──────────────────────────────────────────────────────
// Returns the created row id, or null if the write failed.

export async function recordAutomationDecision(
  result: EligibilityResult,
  ctx: AuditContext,
): Promise<{ id: string } | null> {
  try {
    const row = await prisma.automationAuditLog.create({
      data: {
        action:            String(result.auditMetadata.action ?? 'unknown'),
        automationClass:   result.automationClass,
        entityType:        ctx.entityType      ?? null,
        entityId:          ctx.entityId        ?? null,
        tripId:            ctx.tripId          ?? null,
        leadId:            ctx.leadId          ?? null,
        opportunityId:     ctx.opportunityId   ?? null,
        staffId:           null,   // system-initiated; never set for autonomous runs
        blockers:          result.blockers  as object,
        reasons:           result.reasons   as object,
        warnings:          result.warnings  as object,
        auditMetadata:     {
          ...result.auditMetadata,
          correlationId: ctx.correlationId ?? null,
          actor:         ctx.actor         ?? 'system',
        } as object,
        approved:          null,
        approvalRequestId: null,
      },
    })
    return { id: row.id }
  } catch (err) {
    console.error('[AutomationAudit] Failed to write audit row:', (err as Error).message)
    return null
  }
}

// ─── Eligibility + audit as one operation ────────────────────────────────────
// Use this at every automation entry point instead of calling
// checkAutomationEligibility() alone.
//
// FAIL-CLOSED REQUIREMENT:
//   When automationClass === 'AUTO_ALLOWED' and auditId === null,
//   the caller MUST NOT execute the autonomous action.

export async function checkAndAudit(
  req: EligibilityRequest,
  ctx: AuditContext,
): Promise<{ result: EligibilityResult; auditId: string | null }> {
  const result  = checkAutomationEligibility(req)
  const written = await recordAutomationDecision(result, ctx)
  return { result, auditId: written?.id ?? null }
}
