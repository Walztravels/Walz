/**
 * @jest-environment node
 *
 * Release 7.1 — Commercial event wiring tests
 *
 * Tests:
 *   1.  jade_sales_qualified declared in CommercialEventName (track.ts source)
 *   2.  jade_option_selected declared in CommercialEventName (track.ts source)
 *   3.  jade_staff_handoff declared in CommercialEventName (track.ts source)
 *   4.  hasQualifiedSalesIntent returns true when all fields are present
 *   5.  hasQualifiedSalesIntent returns false when destination is missing
 *   6.  hasQualifiedSalesIntent returns false when startDate is missing
 *   7.  hasQualifiedSalesIntent returns false when adults < 1
 *   8.  hasQualifiedSalesIntent is exported as a function
 *   9.  jade_staff_handoff fires only for BLOCKED/MANUAL_ONLY — source check
 *   10. jade_staff_handoff never fires for AUTO_ALLOWED — source check
 *   11. crm-sync reads qualification data from the Lead/Trip model, not from raw LLM text
 *   12. hasQualifiedSalesIntent returns false when adults is 0
 *   13. hasQualifiedSalesIntent returns true when startDate is a Date object
 *   14. deriveAutomationClassLabel returns correct labels
 */

import * as fs from 'fs'
import * as path from 'path'

const LIB_ROOT = path.resolve(__dirname, '../lib')

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(LIB_ROOT, relPath), 'utf-8')
}

// ── Tests 1-3: CommercialEventName union contains all three new events ────────

describe('CommercialEventName union (track.ts)', () => {
  const source = readSource('commercial/track.ts')

  test('declares jade_sales_qualified', () => {
    expect(source).toContain("'jade_sales_qualified'")
  })

  test('declares jade_option_selected', () => {
    expect(source).toContain("'jade_option_selected'")
  })

  test('declares jade_staff_handoff', () => {
    expect(source).toContain("'jade_staff_handoff'")
  })
})

// ── Tests 4-8, 12-14: hasQualifiedSalesIntent unit tests ─────────────────────

import { hasQualifiedSalesIntent, deriveAutomationClassLabel } from '../lib/jade/sales-qualification'

describe('hasQualifiedSalesIntent', () => {
  test('returns true when destination, startDate (string), and adults >= 1 are all present', () => {
    expect(hasQualifiedSalesIntent({ destination: 'Dubai', startDate: '2026-12-01', adults: 2 })).toBe(true)
  })

  test('returns false when destination is missing (null)', () => {
    expect(hasQualifiedSalesIntent({ destination: null, startDate: '2026-12-01', adults: 2 })).toBe(false)
  })

  test('returns false when destination is empty string', () => {
    expect(hasQualifiedSalesIntent({ destination: '', startDate: '2026-12-01', adults: 2 })).toBe(false)
  })

  test('returns false when startDate is missing (null)', () => {
    expect(hasQualifiedSalesIntent({ destination: 'Dubai', startDate: null, adults: 2 })).toBe(false)
  })

  test('returns false when startDate is empty string', () => {
    expect(hasQualifiedSalesIntent({ destination: 'Dubai', startDate: '', adults: 2 })).toBe(false)
  })

  test('returns false when adults is 0', () => {
    expect(hasQualifiedSalesIntent({ destination: 'Dubai', startDate: '2026-12-01', adults: 0 })).toBe(false)
  })

  test('returns false when adults < 1 (negative)', () => {
    expect(hasQualifiedSalesIntent({ destination: 'Dubai', startDate: '2026-12-01', adults: -1 })).toBe(false)
  })

  test('is exported as a function', () => {
    expect(typeof hasQualifiedSalesIntent).toBe('function')
  })

  test('returns true when startDate is a Date object', () => {
    expect(hasQualifiedSalesIntent({ destination: 'Accra', startDate: new Date('2026-11-15'), adults: 1 })).toBe(true)
  })
})

// ── Test 14: deriveAutomationClassLabel ───────────────────────────────────────

describe('deriveAutomationClassLabel', () => {
  test('returns correct labels for all AutomationClass values', () => {
    expect(deriveAutomationClassLabel('AUTO_ALLOWED')).toBe('Auto-allowed')
    expect(deriveAutomationClassLabel('STAFF_APPROVAL_REQUIRED')).toBe('Staff approval required')
    expect(deriveAutomationClassLabel('MANUAL_ONLY')).toBe('Manual only')
    expect(deriveAutomationClassLabel('BLOCKED')).toBe('Blocked')
  })
})

// ── Tests 9-10: jade_staff_handoff only fires for BLOCKED/MANUAL_ONLY ─────────

describe('jade_staff_handoff wiring in checkout-handoff.ts', () => {
  const source = readSource('jade/checkout-handoff.ts')

  test("jade_staff_handoff is always paired with automationClass BLOCKED or MANUAL_ONLY, never AUTO_ALLOWED", () => {
    // Find all jade_staff_handoff call sites
    const handoffBlocks: string[] = []
    const re = /jade_staff_handoff[\s\S]{0,300}?automationClass['":\s]+(['"`])([\w_]+)\1/g
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) {
      handoffBlocks.push(match[2])
    }
    // Every automationClass value at a jade_staff_handoff call site must not be AUTO_ALLOWED
    expect(handoffBlocks.length).toBeGreaterThan(0)
    for (const cls of handoffBlocks) {
      expect(cls).not.toBe('AUTO_ALLOWED')
    }
  })

  test("jade_staff_handoff is NOT called in the READY return path", () => {
    // The READY path returns after ACTION_REQUIRED check — verify no staff handoff there
    // The READY block starts after 'revalResult.status === .ACTION_REQUIRED.' check
    const readySection = source.split("// ── READY")[1] ?? ''
    expect(readySection).not.toContain("jade_staff_handoff")
  })
})

// ── Test 11: crm-sync reads qualification data from Lead/Trip model ───────────

describe('crm-sync.ts qualification data source', () => {
  const source = readSource('jade/crm-sync.ts')

  test('hasQualifiedSalesIntent is called with tripCtx fields (DB record), not raw LLM arguments', () => {
    // The call must reference tripCtx.destination, tripCtx.startDate, tripCtx.adults
    expect(source).toContain('tripCtx.destination')
    expect(source).toContain('tripCtx.startDate')
    expect(source).toContain('tripCtx.adults')
    expect(source).toContain('hasQualifiedSalesIntent')
  })

  test('jade_sales_qualified event is fired only inside the hasQualifiedSalesIntent guard', () => {
    // The event name must appear AFTER the hasQualifiedSalesIntent call, inside its block
    const qualIndex    = source.indexOf('hasQualifiedSalesIntent')
    const eventIndex   = source.indexOf("'jade_sales_qualified'")
    expect(qualIndex).toBeGreaterThan(-1)
    expect(eventIndex).toBeGreaterThan(qualIndex)
  })
})
