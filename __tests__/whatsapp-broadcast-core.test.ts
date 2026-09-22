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
  buildTemplatePayload,
  MAX_TEMPLATE_PARAMS,
} from '@/lib/whatsapp/broadcast/template'
import {
  canTransitionBroadcast, canScheduleBroadcast, canCancelBroadcast, terminalBroadcastStatus,
  canTransitionRecipient, isForwardProgress, BROADCAST_STATUSES, RECIPIENT_STATUSES,
} from '@/lib/whatsapp/broadcast/lifecycle'
import { matchesCountry, parseTargetFilter, maskNumber } from '@/lib/whatsapp/broadcast/audience'
import { classifyMetaError } from '@/lib/whatsapp/broadcast/sender'

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
  const ok = { name: 'summer_visa_offer', language: 'en_US', params: [] }

  it('accepts a well-formed definition', () => {
    const r = validateTemplateDefinition(ok)
    expect(r.ok).toBe(true)
    expect(r.definition).toEqual({ name: 'summer_visa_offer', language: 'en_US', params: [] })
  })

  it('a MISSING template name is rejected', () => {
    const r = validateTemplateDefinition({ language: 'en', params: [] })
    expect(r.ok).toBe(false)
    expect(r.definition).toBeNull()
    expect(r.errors.join(' ')).toMatch(/Template name is required/)
  })

  it('a MALFORMED template name is rejected', () => {
    expect(validateTemplateDefinition({ ...ok, name: 'Summer Visa Offer' }).ok).toBe(false)
    expect(validateTemplateDefinition({ ...ok, name: 'summer-visa' }).ok).toBe(false)
  })

  it('a malformed language is rejected', () => {
    expect(validateTemplateDefinition({ ...ok, language: 'english' }).ok).toBe(false)
    expect(validateTemplateDefinition({ ...ok, language: '' }).ok).toBe(false)
  })

  it('malformed parameters are rejected, and every problem is reported at once', () => {
    const r = validateTemplateDefinition({
      name: 'BAD NAME', language: 'english',
      params: [{ type: 'static', value: '' }, { type: 'lead_field', field: 'salary' }, 'nope'],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(4)
  })

  it('rejects characters Meta rejects inside a parameter', () => {
    expect(validateTemplateDefinition({ ...ok, params: [{ type: 'static', value: 'line\nbreak' }] }).ok).toBe(false)
    expect(validateTemplateDefinition({ ...ok, params: [{ type: 'static', value: 'four    spaces' }] }).ok).toBe(false)
  })

  it('rejects more parameters than Meta allows', () => {
    const many = Array.from({ length: MAX_TEMPLATE_PARAMS + 1 }, () => ({ type: 'static', value: 'x' }))
    expect(validateTemplateDefinition({ ...ok, params: many }).ok).toBe(false)
  })

  it('resolves lead fields, applies fallbacks, and reports unresolvable positions', () => {
    const params = [
      { type: 'lead_field' as const, field: 'name' as const, fallback: 'there' },
      { type: 'static' as const, value: 'July' },
      { type: 'lead_field' as const, field: 'destination' as const },
    ]
    expect(resolveTemplateParams(params, { name: 'Ada', destination: 'London' }))
      .toEqual({ values: ['Ada', 'July', 'London'], missing: [] })
    // Missing name falls back; missing destination has no fallback → reported.
    expect(resolveTemplateParams(params, { name: '  ', destination: null }))
      .toEqual({ values: ['there', 'July', ''], missing: [3] })
  })
})

describe('the no-free-text-fallback guarantee', () => {
  it('buildTemplatePayload always emits type:"template" with the Meta shape', () => {
    const payload = buildTemplatePayload({
      to: '2348012345678', templateName: 'summer_visa_offer', templateLanguage: 'en_US',
      paramValues: ['Ada', 'July'],
    })
    expect(payload).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '2348012345678',
      type: 'template',
      template: {
        name: 'summer_visa_offer',
        language: { code: 'en_US' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }, { type: 'text', text: 'July' }] }],
      },
    })
  })

  it('a parameterless template omits components but stays a template', () => {
    const payload = buildTemplatePayload({ to: '1', templateName: 't', templateLanguage: 'en', paramValues: [] })
    expect(payload.type).toBe('template')
    expect(payload.template.components).toBeUndefined()
  })

  it('NO broadcast module can emit a free-form MESSAGE payload', () => {
    // A message-level free-text send is `messaging_product` + `type:'text'`
    // + `text: { body }`. (`{ type: 'text', text }` inside a template's
    // body components is a template PARAMETER and is required.)
    for (const f of [
      'lib/whatsapp/broadcast/template.ts',
      'lib/whatsapp/broadcast/sender.ts',
      'lib/whatsapp/broadcast/processor.ts',
      'lib/whatsapp/broadcast/audience.ts',
    ]) {
      const s = read(f)
      expect(s).not.toMatch(/text:\s*\{\s*body/)
      expect(s).not.toMatch(/type:\s*['"]text['"]\s*,\s*\n\s*text:/)
    }
    // And the one payload builder hard-codes the literal.
    expect(read('lib/whatsapp/broadcast/template.ts')).toContain("type: 'template',")
  })

  it('the sender has exactly one payload builder and it is the template one', () => {
    const s = read('lib/whatsapp/broadcast/sender.ts')
    expect(s).toContain('buildTemplatePayload')
    expect(s).not.toContain('text: { body')
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

// ── Meta error classification ───────────────────────────────────────────

describe('Meta API failure classification', () => {
  it('treats rate limits and 5xx as TRANSIENT (retryable)', () => {
    expect(classifyMetaError({ httpStatus: 429, code: 130429, message: 'rate limit' }).kind).toBe('TRANSIENT')
    expect(classifyMetaError({ httpStatus: 500, code: null, message: 'boom' }).kind).toBe('TRANSIENT')
    expect(classifyMetaError({ httpStatus: 503, code: 1, message: 'unknown' }).kind).toBe('TRANSIENT')
    expect(classifyMetaError({ httpStatus: 400, code: 80007, message: 'throttled' }).kind).toBe('TRANSIENT')
  })

  it('treats template and recipient errors as PERMANENT (never retried)', () => {
    expect(classifyMetaError({ httpStatus: 400, code: 132001, message: 'template not found' }).kind).toBe('PERMANENT')
    expect(classifyMetaError({ httpStatus: 400, code: 132000, message: 'param mismatch' }).kind).toBe('PERMANENT')
    expect(classifyMetaError({ httpStatus: 400, code: 132015, message: 'paused' }).kind).toBe('PERMANENT')
    expect(classifyMetaError({ httpStatus: 400, code: 131026, message: 'undeliverable' }).kind).toBe('PERMANENT')
    expect(classifyMetaError({ httpStatus: 401, code: 190, message: 'token expired' }).kind).toBe('PERMANENT')
    expect(classifyMetaError({ httpStatus: 403, code: 10, message: 'permission' }).kind).toBe('PERMANENT')
  })

  it('an unknown 4xx code biases to TRANSIENT, bounded by the attempt cap', () => {
    expect(classifyMetaError({ httpStatus: 400, code: 999999, message: 'who knows' }).kind).toBe('TRANSIENT')
  })

  it('never echoes more than 300 characters of Meta’s message', () => {
    const long = 'x'.repeat(5000)
    expect(classifyMetaError({ httpStatus: 400, code: 1, message: long }).reason.length).toBe(300)
  })
})
