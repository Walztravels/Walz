// lib/jade/sales-qualification.ts
// Release 7.1 — Deterministic sales qualification helpers.
//
// SECURITY invariants:
//   - Pure functions only — no DB calls, no LLM calls
//   - Server-side only (never import from browser code)
//   - Qualification criteria are DETERMINISTIC: no model can supply or override them
//   - destination/startDate/adults must come from the Lead DB record, not from LLM input

import type { AutomationClass } from '@/lib/automation/eligibility'

export interface SalesQualificationInput {
  destination: string | null | undefined
  startDate:   string | Date | null | undefined
  adults:      number
}

/**
 * Returns true when all three qualifying fields are present:
 *   - destination is a non-empty string
 *   - startDate is non-empty (string) or a valid Date
 *   - adults >= 1
 *
 * These values MUST come from the Lead/Trip DB record — never from LLM model input.
 */
export function hasQualifiedSalesIntent(input: SalesQualificationInput): boolean {
  const { destination, startDate, adults } = input

  if (!destination || typeof destination !== 'string' || destination.trim() === '') {
    return false
  }

  if (startDate === null || startDate === undefined || startDate === '') {
    return false
  }
  if (typeof startDate === 'string' && startDate.trim() === '') {
    return false
  }

  if (typeof adults !== 'number' || adults < 1) {
    return false
  }

  return true
}

/**
 * Returns a human-readable label for an AutomationClass value — used for logging only.
 * Never use this label to make eligibility decisions.
 */
export function deriveAutomationClassLabel(cls: AutomationClass): string {
  switch (cls) {
    case 'AUTO_ALLOWED':            return 'Auto-allowed'
    case 'STAFF_APPROVAL_REQUIRED': return 'Staff approval required'
    case 'MANUAL_ONLY':             return 'Manual only'
    case 'BLOCKED':                 return 'Blocked'
    default:                        return `Unknown(${cls})`
  }
}
