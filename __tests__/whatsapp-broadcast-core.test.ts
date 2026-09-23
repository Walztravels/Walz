/**
 * WhatsApp Broadcast V1 — pure logic.
 *
 * Consent eligibility, number normalization, template validation/payload
 * shape, and both state machines. No Prisma, no fetch, no env — every
 * assertion here is about a deterministic function.
 */

import fs from 'fs'
import path from 'path'

import { decideEligibility, isHardExcluded, SKIP_REASON_TO_STATUS } from '@/lib/whatsapp/broadcast/consent'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import {
  validateTemplateDefinition,
  resolveTemplateParams,
  MAX_TEMPLATE_PARAMS,
} from '@/lib/whatsapp/broadcast/template'
import {
  canTransitionBroadcast, canScheduleBroadcast, canCancelBroadcast, terminalBroadcastStatus,
  canTransitionRecipient, isForwardProgress, BROADCAST_STATUSES, RECIPIENT_STATUSES,
} from '@/lib/whatsapp/broadcast/lifecycle'
import { matchesCountry, parseTargetFilter, maskNumber } from '@/lib/whatsapp/broadcast/audience'
import { classifyTwilioError } from '@/lib/whatsapp/broadcast/sender'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Consent ─────────────────────────────────────────────────────────────

describe('affirmative-consent enforcement', () => {
  const number = '+2348012345678'

  it('a lead with NO consent record is EXCLUDED (absence of opt-out is not consent)', () => {
    expect(decideEligibility({ marketingOptOut: false, normalizedNumber: number, consent: null }))
      .toEqual({ eligible: false, reason: 'NO_CONSENT' })
  })

  it('a lead with a real SUBSCRIBED consent record is INCLUDED', () => {
    expect(decideEligibility({ marketingOptOut: false, normalizedNumber: number, consent: { status: 'SUBSCRIBED' } }))
      .toEqual({ eligible: true })
  })

  it('an UNKNOWN consent row is still not consent', () => {
    expect(decideEligibility({ marketingOptOut: false, normalizedNumber: number, consent: { status: 'UNKNOWN' } }))
      .toEqual({ eligible: false, reason: 'NO_CONSENT' })
  })

  it('an explicit Lead.marketingOptOut ALWAYS excludes, whatever the consent row says', () => {
    // The hard override: every other signal is maximally favourable here.
    expect(decideEligibility({ marketingOptOut: true, normalizedNumber: number, consent: { status: 'SUBSCRIBED' } }))
      .toEqual({ eligible: false, reason: 'OPT_OUT' })
    expect(decideEligibility({ marketingOptOut: true, normalizedNumber: number, consent: null }))
      .toEqual({ eligible: false, reason: 'OPT_OUT' })
    expect(decideEligibility({ marketingOptOut: true, normalizedNumber: null, consent: { status: 'SUBSCRIBED' } }))
      .toEqual({ eligible: false, reason: 'OPT_OUT' })
    expect(isHardExcluded(true)).toBe(true)
  })

  it('the opt-out check runs FIRST — it can never be reached-around', () => {
    // Proven structurally as well as behaviourally: the marketingOptOut
    // branch precedes every other branch in the source.
    const s = read('lib/whatsapp/broadcast/consent.ts')
    const optOutIdx = s.indexOf('if (input.marketingOptOut === true)')
    expect(optOutIdx).toBeGreaterThan(-1)
    expect(optOutIdx).toBeLessThan(s.indexOf('if (!input.normalizedNumber)'))
    expect(optOutIdx).toBeLessThan(s.indexOf('if (!input.consent)'))
  })

  it('a consent-side OPTED_OUT excludes', () => {
    expect(decideEligibility({ marketingOptOut: false, normalizedNumber: number, consent: { status: 'OPTED_OUT' } }))
      .toEqual({ eligible: false, reason: 'OPT_OUT' })
  })

  it('an unrecognised future consent status FAILS CLOSED', () => {
    expect(decideEligibility({
      marketingOptOut: false, normalizedNumber: number,
      consent: { status: 'PENDING_DOUBLE_OPT_IN' as never },
    })).toEqual({ eligible: false, reason: 'NO_CONSENT' })
  })

  it('no usable number is INVALID_NUMBER, not silent inclusion', () => {
    expect(decideEligibility({ marketingOptOut: false, normalizedNumber: null, consent: { status: 'SUBSCRIBED' } }))
      .toEqual({ eligible: false, reason: 'INVALID_NUMBER' })
  })

  it('every skip reason maps to a distinct constrained recipient status', () => {
    expect(SKIP_REASON_TO_STATUS).toEqual({
      OPT_OUT: 'SKIPPED_OPT_OUT',
      NO_CONSENT: 'SKIPPED_NO_CONSENT',
      INVALID_NUMBER: 'SKIPPED_INVALID_NUMBER',
    })
    for (const s of Object.values(SKIP_REASON_TO_STATUS)) {
      expect(RECIPIENT_STATUSES as readonly string[]).toContain(s)
    }
  })

  it('there is no helper that reads marketingOptOut===false as consent', () => {
    // Comment lines are stripped: the module DISCUSSES this anti-pattern
    // at length; what matters is that no executable line implements it.
    const code = read('lib/whatsapp/broadcast/consent.ts')
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toMatch(/marketingOptOut\s*===\s*false/)
    expect(code).not.toMatch(/!\s*input\.marketingOptOut/)
  })
})

// ── Number normalization ────────────────────────────────────────────────

describe('WhatsApp number normalization', () => {
  it('normalizes international forms to E.164', () => {
    expect(normalizePhoneE164('+234 801 234 5678')).toBe('+2348012345678')
    expect(normalizePhoneE164('00234-801-234-5678')).toBe('+2348012345678')
    expect(normalizePhoneE164('(234) 801 234 5678')).toBe('+2348012345678')
  })

  it('refuses national format rather than minting an unmatched number', () => {
    expect(normalizePhoneE164('08012345678')).toBeNull()
  })

  it('refuses junk, empties and PSIDs', () => {
    expect(normalizePhoneE164(null)).toBeNull()
    expect(normalizePhoneE164('')).toBeNull()
    expect(normalizePhoneE164('1234')).toBeNull()
    // 17-digit Meta PSID stored in a phone column — never a phone number.
    expect(normalizePhoneE164('+12345678901234567')).toBeNull()
  })

  it('two spellings of one number normalize identically — the basis of dedup', () => {
    expect(normalizePhoneE164('+2348012345678')).toBe(normalizePhoneE164('00234 801 234 5678'))
  })

  it('masking never reveals the full number', () => {
    expect(maskNumber('+2348012345678')).toBe('+234••••78')
    expect(maskNumber(null)).toBe('(no number)')
  })
})

// ── Country derivation ──────────────────────────────────────────────────

describe('derived country filter', () => {
  it('matches on dialling prefix', () => {
    expect(matchesCountry('+2348012345678', 'NG')).toBe(true)
    expect(matchesCountry('+233554324622', 'NG')).toBe(false)
    expect(matchesCountry('+233554324622', 'GH')).toBe(true)
  })

  it('no country filter matches everything', () => {
    expect(matchesCountry('+2348012345678', undefined)).toBe(true)
    expect(matchesCountry(null, undefined)).toBe(true)
  })

  it('an unknown country code matches NOBODY (fails closed)', () => {
    expect(matchesCountry('+2348012345678', 'XX')).toBe(false)
  })

  it('a null number cannot satisfy a country filter', () => {
    expect(matchesCountry(null, 'NG')).toBe(false)
  })

  it('parseTargetFilter drops unknown dimensions', () => {
    expect(parseTargetFilter({ country: 'ng', service: 'Visa Processing', rogue: 'x', status: 'New' }))
      .toEqual({ country: 'NG', service: 'Visa Processing' })
    expect(parseTargetFilter(null)).toEqual({})
    expect(parseTargetFilter('nope')).toEqual({})
  })
})

// ── Template validation ─────────────────────────────────────────────────

describe('template validation blocks scheduling', () => {
  const CONTENT_SID = 'HX98c6c9a03dc7155b1b743e09de56b9b2'
  const ok = { contentSid: CONTENT_SID, variables: {} }

  it('accepts a well-formed definition', () => {
    const r = validateTemplateDefinition(ok)
    expect(r.ok).toBe(true)
    expect(r.definition).toEqual({ contentSid: CONTENT_SID, variables: {} })
  })

  it('a MISSING content SID is rejected', () => {
    const r = validateTemplateDefinition({ variables: {} })
    expect(r.ok).toBe(false)
    expect(r.definition).toBeNull()
    expect(r.errors.join(' ')).toMatch(/WhatsApp template is required/)
  })

  it('a MALFORMED content SID is rejected', () => {
    expect(validateTemplateDefinition({ ...ok, contentSid: 'not-a-sid' }).ok).toBe(false)
    expect(validateTemplateDefinition({ ...ok, contentSid: 'HXshort' }).ok).toBe(false)
    expect(validateTemplateDefinition({ ...ok, contentSid: 'summer_visa_offer' }).ok).toBe(false)
  })

  it('malformed variables are rejected, and every problem is reported at once', () => {
    const r = validateTemplateDefinition({
      contentSid: 'BAD SID',
      variables: { '1': { type: 'static', value: '' }, '2': { type: 'lead_field', field: 'salary' }, '3': 'nope' },
    })
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(4)
  })

  it('rejects characters WhatsApp rejects inside a variable', () => {
    expect(validateTemplateDefinition({ ...ok, variables: { '1': { type: 'static', value: 'line\nbreak' } } }).ok).toBe(false)
    expect(validateTemplateDefinition({ ...ok, variables: { '1': { type: 'static', value: 'four    spaces' } } }).ok).toBe(false)
  })

  it('rejects more variables than the practical cap allows', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_TEMPLATE_PARAMS + 1 }, (_, i) => [String(i + 1), { type: 'static', value: 'x' }]))
    expect(validateTemplateDefinition({ ...ok, variables: many }).ok).toBe(false)
  })

  it('resolves lead fields, applies fallbacks, and reports unresolvable keys', () => {
    const variables = {
      '1': { type: 'lead_field' as const, field: 'name' as const, fallback: 'there' },
      '2': { type: 'static' as const, value: 'July' },
      '3': { type: 'lead_field' as const, field: 'destination' as const },
    }
    expect(resolveTemplateParams(variables, { name: 'Ada', destination: 'London' }))
      .toEqual({ values: { '1': 'Ada', '2': 'July', '3': 'London' }, missing: [] })
    // Missing name falls back; missing destination has no fallback → reported.
    expect(resolveTemplateParams(variables, { name: '  ', destination: null }))
      .toEqual({ values: { '1': 'there', '2': 'July', '3': '' }, missing: ['3'] })
  })
})

describe('the no-free-text-fallback guarantee', () => {
  it('NO broadcast module can emit a free-form Twilio Body send', () => {
    // A free-text Twilio send sets `Body` with no `ContentSid`. Every
    // broadcast module must only ever build a ContentSid + ContentVariables
    // request.
    for (const f of [
      'lib/whatsapp/broadcast/template.ts',
      'lib/whatsapp/broadcast/sender.ts',
      'lib/whatsapp/broadcast/processor.ts',
      'lib/whatsapp/broadcast/audience.ts',
    ]) {
      const s = read(f)
      expect(s).not.toMatch(/params\.set\(['"]Body['"]/)
    }
  })

  it('the sender calls the Content Template sender, never the free-form one', () => {
    const s = read('lib/whatsapp/broadcast/sender.ts')
    expect(s).toContain('sendWhatsAppContentTemplate')
    expect(s).not.toContain('sendWhatsAppBody')
  })
})

// ── Lifecycle ───────────────────────────────────────────────────────────

describe('broadcast state machine', () => {
  it('follows DRAFT → READY → SCHEDULED|QUEUED → SENDING → terminal', () => {
    expect(canTransitionBroadcast('DRAFT', 'READY')).toBe(true)
    expect(canTransitionBroadcast('READY', 'SCHEDULED')).toBe(true)
    expect(canTransitionBroadcast('READY', 'QUEUED')).toBe(true)
    expect(canTransitionBroadcast('SCHEDULED', 'QUEUED')).toBe(true)
    expect(canTransitionBroadcast('QUEUED', 'SENDING')).toBe(true)
    expect(canTransitionBroadcast('SENDING', 'COMPLETED')).toBe(true)
    expect(canTransitionBroadcast('SENDING', 'PARTIAL_FAILURE')).toBe(true)
    expect(canTransitionBroadcast('SENDING', 'FAILED')).toBe(true)
  })

  it('refuses illegal jumps and revivals', () => {
    expect(canTransitionBroadcast('DRAFT', 'SENDING')).toBe(false)
    expect(canTransitionBroadcast('COMPLETED', 'QUEUED')).toBe(false)
    expect(canTransitionBroadcast('CANCELLED', 'QUEUED')).toBe(false)
    expect(canTransitionBroadcast('FAILED', 'SENDING')).toBe(false)
    expect(canTransitionBroadcast('nonsense', 'QUEUED')).toBe(false)
    // QUEUED → PARTIAL_FAILURE is NOT legitimate: that outcome requires at
    // least one dispatched recipient, which requires having passed through
    // SENDING first (see the QUEUED → FAILED note just below).
    expect(canTransitionBroadcast('QUEUED', 'PARTIAL_FAILURE')).toBe(false)
  })

  it('QUEUED → FAILED is a legitimate direct transition (skipping SENDING)', () => {
    // The processor's closeout can fire from QUEUED, never having claimed
    // a single recipient into SENDING, when every recipient row was
    // already terminal (SKIPPED_*, or FAILED from an unresolvable
    // template parameter) at snapshot time. See processor.test.ts's
    // "closes a broadcast straight from QUEUED to FAILED" case, which
    // exercises this end to end.
    expect(canTransitionBroadcast('QUEUED', 'FAILED')).toBe(true)
    expect(canTransitionBroadcast('QUEUED', 'COMPLETED')).toBe(true)
  })

  it('CANCELLED is reachable only from SCHEDULED and QUEUED', () => {
    expect(canCancelBroadcast('SCHEDULED')).toBe(true)
    expect(canCancelBroadcast('QUEUED')).toBe(true)
    expect(canCancelBroadcast('SENDING')).toBe(false)
    expect(canCancelBroadcast('DRAFT')).toBe(false)
    expect(canCancelBroadcast('COMPLETED')).toBe(false)
    for (const s of BROADCAST_STATUSES) {
      if (s !== 'SCHEDULED' && s !== 'QUEUED') expect(canCancelBroadcast(s)).toBe(false)
    }
  })

  it('scheduling is only legal from DRAFT/READY — the double-submit guard', () => {
    expect(canScheduleBroadcast('DRAFT')).toBe(true)
    expect(canScheduleBroadcast('READY')).toBe(true)
    for (const s of ['SCHEDULED', 'QUEUED', 'SENDING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED', 'CANCELLED']) {
      expect(canScheduleBroadcast(s)).toBe(false)
    }
  })

  it('derives the right terminal status from the tallies', () => {
    expect(terminalBroadcastStatus({ dispatched: 10, failed: 0 })).toBe('COMPLETED')
    expect(terminalBroadcastStatus({ dispatched: 8, failed: 2 })).toBe('PARTIAL_FAILURE')
    expect(terminalBroadcastStatus({ dispatched: 0, failed: 5 })).toBe('FAILED')
    // Nothing eligible: nothing failed either.
    expect(terminalBroadcastStatus({ dispatched: 0, failed: 0 })).toBe('COMPLETED')
  })
})

describe('recipient state machine', () => {
  it('follows QUEUED → SENT → DELIVERED → READ', () => {
    expect(canTransitionRecipient('QUEUED', 'SENDING')).toBe(true)
    expect(canTransitionRecipient('SENDING', 'SENT')).toBe(true)
    expect(canTransitionRecipient('SENT', 'DELIVERED')).toBe(true)
    expect(canTransitionRecipient('DELIVERED', 'READ')).toBe(true)
  })

  it('allows the transient-retry return to QUEUED', () => {
    expect(canTransitionRecipient('SENDING', 'QUEUED')).toBe(true)
  })

  it('skip states and READ are terminal', () => {
    for (const s of ['READ', 'SKIPPED_OPT_OUT', 'SKIPPED_NO_CONSENT', 'SKIPPED_INVALID_NUMBER']) {
      expect(canTransitionRecipient(s, 'SENT')).toBe(false)
      expect(canTransitionRecipient(s, 'QUEUED')).toBe(false)
    }
  })

  it('out-of-order Meta callbacks never walk a recipient backwards', () => {
    expect(isForwardProgress('SENT', 'DELIVERED')).toBe(true)
    expect(isForwardProgress('SENT', 'READ')).toBe(true)
    // The common real case: `delivered` arriving after `read`.
    expect(isForwardProgress('READ', 'DELIVERED')).toBe(false)
    expect(isForwardProgress('DELIVERED', 'SENT')).toBe(false)
    expect(isForwardProgress('SENT', 'SENT')).toBe(false)
  })
})

// ── Schema / migration agreement ────────────────────────────────────────

describe('the Prisma schema and the hand-run migration agree', () => {
  const sql = read('prisma/migrations/whatsapp_broadcast_v1.sql')
  const schema = read('prisma/schema.prisma')

  it('the CHECK constraints carry exactly the TypeScript vocabularies', () => {
    for (const s of BROADCAST_STATUSES) {
      expect(sql).toContain(`'${s}'`)
    }
    for (const s of RECIPIENT_STATUSES) {
      expect(sql).toContain(`'${s}'`)
    }
    expect(sql).toContain('chk_wa_broadcast_status')
    expect(sql).toContain('chk_wa_broadcast_recipients_status')
    expect(sql).toContain('chk_whatsapp_consents_status')
    // TEXT + CHECK, never a native Postgres enum (repo convention).
    expect(sql).not.toMatch(/CREATE\s+TYPE/i)
  })

  it('the dispatch-identity key is on the NUMBER, in both schema and SQL', () => {
    expect(schema).toContain('@@unique([broadcastId, normalizedNumber])')
    expect(sql).toContain('uq_wa_broadcast_recipients_broadcast_number')
    expect(sql).toContain('ON whatsapp_broadcast_recipients (broadcast_id, normalized_number)')
  })

  it('the migration is additive — no DROP of a table, column or index', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i)
    expect(sql).not.toMatch(/DROP\s+COLUMN/i)
    expect(sql).not.toMatch(/DROP\s+INDEX/i)
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT/i)
    expect(sql).not.toMatch(/TRUNCATE/i)
    // Every new column is guarded.
    const addCols = sql.match(/ADD COLUMN(?! IF NOT EXISTS)/g)
    expect(addCols).toBeNull()
  })

  it('carries this repo’s RLS posture on the new tables', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE %I FROM anon, authenticated')
    expect(sql).toContain('FOR ALL TO service_role')
    expect(sql).toContain("'whatsapp_broadcast_recipients'")
    expect(sql).toContain("'whatsapp_consents'")
  })

  it('ends with a validation SELECT and says it has not been run', () => {
    expect(sql).toContain('DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT')
    expect(sql).toContain('It has NOT been executed by the implementing agent')
    expect(sql).toContain('-- Expect:')
    expect(sql.lastIndexOf('SELECT')).toBeGreaterThan(sql.indexOf('COMMIT;'))
  })

  it('migrates every legacy lowercase status value', () => {
    for (const legacy of ['draft', 'scheduled', 'sending', 'sent', 'failed']) {
      expect(sql).toContain(`WHEN '${legacy}'`)
    }
    expect(sql).toContain("ELSE 'DRAFT'")   // unknown legacy values fail safe
  })
})

// ── Twilio error classification ─────────────────────────────────────────

describe('Twilio API failure classification', () => {
  it('treats rate limits and 5xx as TRANSIENT (retryable)', () => {
    expect(classifyTwilioError({ httpStatus: 429, code: 20429, message: 'rate limit' }).kind).toBe('TRANSIENT')
    expect(classifyTwilioError({ httpStatus: 500, code: null, message: 'boom' }).kind).toBe('TRANSIENT')
    expect(classifyTwilioError({ httpStatus: 503, code: 1, message: 'unknown' }).kind).toBe('TRANSIENT')
    expect(classifyTwilioError({ httpStatus: 400, code: 21611, message: 'throttled' }).kind).toBe('TRANSIENT')
  })

  it('treats template and recipient errors as PERMANENT (never retried)', () => {
    expect(classifyTwilioError({ httpStatus: 400, code: 63032, message: 'template not found' }).kind).toBe('PERMANENT')
    expect(classifyTwilioError({ httpStatus: 400, code: 63015, message: 'template mismatch' }).kind).toBe('PERMANENT')
    expect(classifyTwilioError({ httpStatus: 400, code: 21610, message: 'opted out' }).kind).toBe('PERMANENT')
    expect(classifyTwilioError({ httpStatus: 400, code: 21211, message: 'invalid to' }).kind).toBe('PERMANENT')
    expect(classifyTwilioError({ httpStatus: 401, code: 20003, message: 'auth failed' }).kind).toBe('PERMANENT')
    expect(classifyTwilioError({ httpStatus: 403, code: 20003, message: 'permission' }).kind).toBe('PERMANENT')
  })

  it('an unknown 4xx code biases to TRANSIENT, bounded by the attempt cap', () => {
    expect(classifyTwilioError({ httpStatus: 400, code: 999999, message: 'who knows' }).kind).toBe('TRANSIENT')
  })

  it('never echoes more than 300 characters of Twilio’s message', () => {
    const long = 'x'.repeat(5000)
    expect(classifyTwilioError({ httpStatus: 400, code: 1, message: long }).reason.length).toBe(300)
  })
})
