/**
 * Release 7.6 — Autopilot Level system & approval bridge tests
 *
 * Guards against:
 *  - Missing level definitions
 *  - STAFF_APPROVAL_REQUIRED being accidentally mapped to AUTO_ALLOWED
 *  - AutomationAuditLog containing passport/supplier/margin fields (privacy)
 *  - Missing exports from key automation modules
 */

import { readFileSync } from 'fs'
import path from 'path'

// ─── Module imports ───────────────────────────────────────────────────────────

import {
  AutopilotLevel,
  toAutopilotLevel,
  bridgeToApprovalQueue,
} from '@/lib/automation/autopilot'

import {
  checkAutomationEligibility,
  worse,
  type AutomationClass,
} from '@/lib/automation/eligibility'

import {
  assignVariant,
  isInExperiment,
} from '@/lib/automation/experiment'

// ─── Test 1: AutopilotLevel.LEVEL_0 is AUTO_ALLOWED ──────────────────────────

test('AutopilotLevel.LEVEL_0 === AUTO_ALLOWED', () => {
  expect(AutopilotLevel.LEVEL_0).toBe('AUTO_ALLOWED')
})

// ─── Test 2-5: toAutopilotLevel maps all 4 AutomationClass values correctly ───

test('toAutopilotLevel maps AUTO_ALLOWED → LEVEL_0', () => {
  expect(toAutopilotLevel('AUTO_ALLOWED')).toBe('LEVEL_0')
})

test('toAutopilotLevel maps STAFF_APPROVAL_REQUIRED → LEVEL_1', () => {
  expect(toAutopilotLevel('STAFF_APPROVAL_REQUIRED')).toBe('LEVEL_1')
})

test('toAutopilotLevel maps MANUAL_ONLY → LEVEL_2', () => {
  expect(toAutopilotLevel('MANUAL_ONLY')).toBe('LEVEL_2')
})

test('toAutopilotLevel maps BLOCKED → LEVEL_3', () => {
  expect(toAutopilotLevel('BLOCKED')).toBe('LEVEL_3')
})

// ─── Test 6: AutopilotLevel values cover all AutomationClass values (no gaps) ─

test('AutopilotLevel values cover every AutomationClass with no gaps', () => {
  const allClasses: AutomationClass[] = [
    'AUTO_ALLOWED',
    'STAFF_APPROVAL_REQUIRED',
    'MANUAL_ONLY',
    'BLOCKED',
  ]
  const levelValues = Object.values(AutopilotLevel)
  allClasses.forEach((cls) => {
    expect(levelValues).toContain(cls)
  })
  // Also confirm the map is bijective: 4 levels, 4 classes
  expect(levelValues.length).toBe(allClasses.length)
})

// ─── Test 7: bridgeToApprovalQueue is exported as a function ─────────────────

test('bridgeToApprovalQueue is exported as a function from autopilot.ts', () => {
  expect(typeof bridgeToApprovalQueue).toBe('function')
})

// ─── Test 8: AutomationAuditLog present in schema.prisma ─────────────────────

test('AutomationAuditLog model is present in prisma/schema.prisma', () => {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
  const schema = readFileSync(schemaPath, 'utf-8')
  expect(schema).toContain('model AutomationAuditLog')
})

// ─── Test 9: AutomationAuditLog has no passport/supplier/margin fields ────────

test('AutomationAuditLog model contains no passport, supplier, or margin fields', () => {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')
  const schema = readFileSync(schemaPath, 'utf-8')

  // Extract only the AutomationAuditLog model block
  const modelMatch = schema.match(/model AutomationAuditLog \{[^}]+\}/)
  expect(modelMatch).not.toBeNull()
  const modelBlock = modelMatch![0]

  // Privacy-sensitive field names that must not appear in the audit log
  const forbidden = ['passport', 'supplier', 'margin', 'rateKey', 'offerId', 'supplierPayload']
  forbidden.forEach((field) => {
    expect(modelBlock.toLowerCase()).not.toContain(field.toLowerCase())
  })
})

// ─── Test 10: STAFF_APPROVAL_REQUIRED maps to LEVEL_1 (not AUTO_ALLOWED) ─────

test('STAFF_APPROVAL_REQUIRED is LEVEL_1 — guards against downgrade bug', () => {
  // The most critical safety invariant: approval-required actions must never
  // be silently promoted to auto-execution level.
  const level = toAutopilotLevel('STAFF_APPROVAL_REQUIRED')
  expect(level).toBe('LEVEL_1')
  expect(level).not.toBe('LEVEL_0')
  expect(AutopilotLevel[level]).toBe('STAFF_APPROVAL_REQUIRED')
  expect(AutopilotLevel[level]).not.toBe('AUTO_ALLOWED')
})

// ─── Test 11: experiment.ts exports assignVariant and isInExperiment ──────────

test('experiment.ts exports assignVariant and isInExperiment as functions', () => {
  expect(typeof assignVariant).toBe('function')
  expect(typeof isInExperiment).toBe('function')
})

// ─── Test 12: eligibility.ts exports checkAutomationEligibility and worse ─────

test('eligibility.ts exports checkAutomationEligibility and worse as functions', () => {
  expect(typeof checkAutomationEligibility).toBe('function')
  expect(typeof worse).toBe('function')
})
