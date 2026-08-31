/**
 * Release 7.2 — WhatsApp guard fix, recovery eligibility gate, portal notification channel
 *
 * Tests cover:
 * 1. WhatsApp send is gated by RECOVERY_WHATSAPP_ENABLED (source check)
 * 2. waSent tracks actual WA send, not merely phone presence
 * 3. Portal notification uses dedupeKey with contactCount to prevent duplicates
 * 4. portalTitle / portalBody contain no price claims or availability promises
 * 5. RECOVERY_PORTAL_ENABLED=false disables portal channel (source check)
 * 6. message.ts still contains atomic TOCTOU gate from R7.0 (regression)
 * 7. canAutomateRecovery is importable from lib/jade/recovery-automation
 * 8. portalBody returns non-empty strings for all known recovery types
 * 9. portalTitle uses destination for ABANDONED_CART and INCOMPLETE_TRIP
 * 10. bail-out uses waSent, not contact.phone presence
 */

import fs from 'fs'
import path from 'path'

// ─── File paths ───────────────────────────────────────────────────────────────

const MESSAGE_TS  = path.resolve(__dirname, '../lib/recovery/message.ts')
const RECOVERY_TS = path.resolve(__dirname, '../lib/jade/recovery-automation.ts')

const messageSrc  = fs.readFileSync(MESSAGE_TS, 'utf8')
const recoverySrc = fs.readFileSync(RECOVERY_TS, 'utf8')

// ─── Import portal helpers ────────────────────────────────────────────────────

import { portalTitle, portalBody } from '@/lib/recovery/message'

// ─── 1. WhatsApp send gated by RECOVERY_WHATSAPP_ENABLED ─────────────────────

describe('WhatsApp guard', () => {
  test('WhatsApp block requires RECOVERY_WHATSAPP_ENABLED === true', () => {
    // The send block must be guarded by both phone AND the env flag
    expect(messageSrc).toMatch(
      /if\s*\(\s*contact\.phone\s*&&\s*process\.env\.RECOVERY_WHATSAPP_ENABLED\s*===\s*'true'\s*\)/
    )
  })

  test('bare "if (contact.phone)" without env guard is NOT present as the send gate', () => {
    // Old pattern: `if (contact.phone) {` immediately followed by sendRecoveryWhatsApp
    // After fix that pattern must not exist — the send must have the env check too.
    const bareGate = /if\s*\(\s*contact\.phone\s*\)\s*\{[\s\S]{0,40}sendRecoveryWhatsApp/
    expect(bareGate.test(messageSrc)).toBe(false)
  })
})

// ─── 2. waSent tracks actual send ─────────────────────────────────────────────

describe('waSent tracking', () => {
  test('waSent boolean is declared before the WhatsApp block', () => {
    expect(messageSrc).toMatch(/let\s+waSent\s*=\s*false/)
  })

  test('waSent is set to true inside the guarded WhatsApp block', () => {
    expect(messageSrc).toMatch(/waSent\s*=\s*true/)
  })
})

// ─── 3. bail-out uses waSent not contact.phone ────────────────────────────────

describe('bail-out guard', () => {
  test('bail-out uses waSent, not contact.phone', () => {
    expect(messageSrc).toMatch(/if\s*\(\s*!emailSent\s*&&\s*!waSent\s*\)\s*return/)
  })

  test('old bail-out "!emailSent && !contact.phone" is not present', () => {
    expect(messageSrc).not.toMatch(/!emailSent\s*&&\s*!contact\.phone/)
  })
})

// ─── 4. Portal notification dedupeKey includes contactCount ──────────────────

describe('portal notification dedupeKey', () => {
  test('dedupeKey embeds opp.contactCount to prevent duplicate notifications', () => {
    expect(messageSrc).toMatch(/`recovery_portal_\$\{opp\.id\}_\$\{opp\.contactCount\}`/)
  })
})

// ─── 5. RECOVERY_PORTAL_ENABLED gate ─────────────────────────────────────────

describe('RECOVERY_PORTAL_ENABLED gate', () => {
  test('portal block is gated by RECOVERY_PORTAL_ENABLED === true', () => {
    expect(messageSrc).toMatch(
      /process\.env\.RECOVERY_PORTAL_ENABLED\s*===\s*'true'/
    )
  })
})

// ─── 6. Atomic TOCTOU gate regression (R7.0) ─────────────────────────────────

describe('atomic TOCTOU gate (R7.0 regression)', () => {
  test('updateMany with contactCount < cap still present', () => {
    expect(messageSrc).toMatch(/updateMany/)
    expect(messageSrc).toMatch(/contactCount.*lt.*MAX_AUTO_CONTACTS|lt.*MAX_AUTO_CONTACTS.*contactCount/)
  })

  test('concurrent-run guard checks claimed.count === 0', () => {
    expect(messageSrc).toMatch(/claimed\.count\s*===\s*0/)
  })
})

// ─── 7. canAutomateRecovery importable ───────────────────────────────────────

describe('canAutomateRecovery export', () => {
  test('canAutomateRecovery is exported from recovery-automation.ts', () => {
    expect(recoverySrc).toMatch(/export\s+async\s+function\s+canAutomateRecovery/)
  })

  test('canAutomateRecovery checks JADE_AUTOMATED_FOLLOWUP_ENABLED flag', () => {
    expect(recoverySrc).toMatch(/JADE_AUTOMATED_FOLLOWUP_ENABLED/)
  })
})

// ─── 8 & 9. portalTitle / portalBody content rules ───────────────────────────

describe('portalTitle', () => {
  const PRICE_PATTERN = /\b(\d[\d,]*(\.\d+)?\s*(USD|GBP|EUR|NGN|£|\$|€)|(USD|GBP|EUR|NGN|£|\$|€)\s*\d)/i
  const AVAIL_PATTERN = /available.*seat|seats.*available|limited.*offer|book.*now.*save|fare.*guaranteed/i

  const types = ['ABANDONED_CART', 'UNPAID_PROPOSAL', 'FAILED_PAYMENT', 'INCOMPLETE_TRIP', 'UNKNOWN']

  for (const type of types) {
    test(`portalTitle('${type}') returns a non-empty string`, () => {
      const title = portalTitle(type, 'Lagos')
      expect(typeof title).toBe('string')
      expect(title.length).toBeGreaterThan(0)
    })

    test(`portalTitle('${type}') contains no price claim`, () => {
      const title = portalTitle(type, 'Lagos')
      expect(PRICE_PATTERN.test(title)).toBe(false)
    })

    test(`portalTitle('${type}') contains no availability promise`, () => {
      const title = portalTitle(type, 'Lagos')
      expect(AVAIL_PATTERN.test(title)).toBe(false)
    })
  }

  test('ABANDONED_CART title includes destination when provided', () => {
    expect(portalTitle('ABANDONED_CART', 'Maldives')).toContain('Maldives')
  })

  test('ABANDONED_CART title uses "trip" fallback when no destination', () => {
    expect(portalTitle('ABANDONED_CART', '')).toContain('trip')
  })

  test('INCOMPLETE_TRIP title includes destination when provided', () => {
    expect(portalTitle('INCOMPLETE_TRIP', 'Paris')).toContain('Paris')
  })
})

describe('portalBody', () => {
  const PRICE_PATTERN = /\b(\d[\d,]*(\.\d+)?\s*(USD|GBP|EUR|NGN|£|\$|€)|(USD|GBP|EUR|NGN|£|\$|€)\s*\d)/i
  const STALE_PATTERN = /still.*same.*price|fare.*still|price.*locked|availability.*held/i

  const types = ['ABANDONED_CART', 'UNPAID_PROPOSAL', 'FAILED_PAYMENT', 'INCOMPLETE_TRIP', 'UNKNOWN']

  for (const type of types) {
    test(`portalBody('${type}') returns a non-empty string`, () => {
      const body = portalBody(type)
      expect(typeof body).toBe('string')
      expect(body.length).toBeGreaterThan(0)
    })

    test(`portalBody('${type}') contains no price claim`, () => {
      expect(PRICE_PATTERN.test(portalBody(type))).toBe(false)
    })

    test(`portalBody('${type}') contains no stale-price/held-inventory claim`, () => {
      expect(STALE_PATTERN.test(portalBody(type))).toBe(false)
    })
  }
})

// ─── 10. source: portal block guarded by opp.userId ──────────────────────────

describe('portal userId guard', () => {
  test('portal notification block is gated by opp.userId', () => {
    expect(messageSrc).toMatch(/opp\.userId\s*&&\s*process\.env\.RECOVERY_PORTAL_ENABLED/)
  })
})
