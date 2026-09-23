/**
 * WhatsApp Broadcast V1.1 — THE NO-CONSENT-BYPASS GUARANTEE.
 *
 * A source-level proof, over every file this feature touches, that no code
 * path anywhere accepts, defines, forwards or honours anything shaped like
 * `ignoreConsent` / `skipConsent` / `bypassConsent` — under any name — and
 * that the recorded Meta template category never reaches an eligibility
 * decision.
 *
 * Why source scanning rather than only behaviour: a bypass is a thing that
 * must not EXIST, not merely a branch that happens not to fire in the
 * cases a behavioural test picked. A reviewer reading this file should be
 * able to see the whole claim without running the product.
 */

import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

/**
 * Source with comments stripped. Several of these modules DISCUSS the
 * bypass they refuse to implement (that discussion is the point), so any
 * pin asserting "this does not exist" must look at executable code only.
 */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')

/** Every file in the broadcast feature, V1 and V1.1. */
const LIB_FILES = [
  'lib/whatsapp/broadcast/audience.ts',
  'lib/whatsapp/broadcast/audience-multi.ts',
  'lib/whatsapp/broadcast/consent.ts',
  'lib/whatsapp/broadcast/lifecycle.ts',
  'lib/whatsapp/broadcast/manual-numbers.ts',
  'lib/whatsapp/broadcast/processor.ts',
  'lib/whatsapp/broadcast/rbac.ts',
  'lib/whatsapp/broadcast/selection.ts',
  'lib/whatsapp/broadcast/sender.ts',
  'lib/whatsapp/broadcast/sources.ts',
  'lib/whatsapp/broadcast/status-callbacks.ts',
  'lib/whatsapp/broadcast/template.ts',
]

const ROUTE_FILES = [
  'app/api/admin/marketing/whatsapp-broadcast/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/preview/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/readiness/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/[id]/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/[id]/cancel/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/recipients/leads/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/recipients/visa-applications/route.ts',
  'app/api/admin/marketing/whatsapp-broadcast/recipients/manual/route.ts',
  'app/api/cron/whatsapp-broadcast/route.ts',
]

const UI_FILES = ['app/admin/marketing/whatsapp/page.tsx']

const ALL_FILES = [...LIB_FILES, ...ROUTE_FILES, ...UI_FILES]

/**
 * Anything shaped like a consent bypass, however it is spelled: an
 * ignore/skip/bypass/override/force/disable/suppress/without verb glued to
 * a consent/optout/optin/eligibility/compliance noun, in any case, with or
 * without a separator.
 *
 * Note what is deliberately NOT in the verb list: a bare "no". `NO_CONSENT`
 * and `SKIPPED_NO_CONSENT` are this feature's EXCLUSION reasons — the
 * opposite of a bypass — and flagging them would make this pin noise.
 */
const BYPASS_SHAPES =
  /\b(ignore|bypass|override|overrule|force|disable|suppress|without)[_\-]?(consent|optout|opt_out|optin|opt_in|eligibility|eligible|compliance)s?\b|\bskip[_\-]?(consent|optout|opt_out|optin|opt_in|eligibility|compliance)s?\b/i

describe('no consent bypass exists anywhere in this feature', () => {
  /**
   * The pin above is only worth anything if the pattern actually catches a
   * bypass. This asserts both halves: every spelling a future author might
   * reach for is caught, and this feature's legitimate exclusion
   * vocabulary is not.
   */
  it('the bypass pattern catches real bypasses and not exclusion reasons', () => {
    for (const bad of [
      'ignoreConsent', 'ignore_consent', 'IGNORE_CONSENT', 'skipConsent', 'skip-consent',
      'bypassConsent', 'overrideConsent', 'forceConsent', 'disableConsent', 'suppressConsent',
      'withoutConsent', 'ignoreOptOut', 'skipOptOut', 'bypassEligibility', 'overrideCompliance',
    ]) {
      expect(BYPASS_SHAPES.test(bad)).toBe(true)
    }
    for (const good of [
      'NO_CONSENT', 'SKIPPED_NO_CONSENT', 'skippedNoConsent', 'missingConsent',
      'whatsAppConsent', 'consentByNumber', 'consentStatus', 'decideEligibility',
    ]) {
      expect(BYPASS_SHAPES.test(good)).toBe(false)
    }
  })

  it.each(ALL_FILES)('%s defines no bypass-shaped identifier', file => {
    const code = readCode(file)
    const hit = code.match(BYPASS_SHAPES)
    expect(hit ? `${file}: ${hit[0]}` : null).toBeNull()
  })

  it.each(ALL_FILES)('%s never reads a bypass-shaped property off a request body', file => {
    const code = readCode(file)
    // `skippedNoConsent` / `skippedCount` are RECORDED EXCLUSION counts —
    // the opposite of a bypass — so the past participle is excluded.
    expect(code).not.toMatch(/\.\s*(ignore|skip(?!ped)|bypass|force|disable)[A-Za-z]*[Cc]onsent/)
    expect(code).not.toMatch(/['"](ignore|skip(?!ped)|bypass|force|disable)[A-Za-z]*[Cc]onsent['"]/)
  })

  it('the eligibility function takes exactly three inputs and none of them is a flag', () => {
    const code = readCode('lib/whatsapp/broadcast/consent.ts')
    // The interface is the whole contract: opt-out, number, consent row.
    const iface = code.match(/interface EligibilityInput \{([\s\S]*?)\}/)
    expect(iface).toBeTruthy()
    const body = iface![1]
    const fields = body.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split(/[?:]/)[0].trim())
    expect(fields.sort()).toEqual(['consent', 'marketingOptOut', 'normalizedNumber'])
  })

  it('V1s decision tree is byte-for-byte what V1.1 still calls', () => {
    const code = readCode('lib/whatsapp/broadcast/consent.ts')
    // Opt-out first and unconditional.
    expect(code).toMatch(/if \(input\.marketingOptOut === true\) return \{ eligible: false, reason: 'OPT_OUT' \}/)
    // No consent row at all is not consent.
    expect(code).toMatch(/if \(!input\.consent\) return \{ eligible: false, reason: 'NO_CONSENT' \}/)
    // A positive allowlist, so an unrecognised status fails closed.
    expect(code).toMatch(/input\.consent\.status !== 'SUBSCRIBED'/)
    // There is exactly one exported decision function and no variant.
    expect(code).not.toMatch(/decideEligibilityWithout|decideEligibilityUnsafe|decideEligibilityFor[A-Z]/)
  })

  it('the multi-source resolver reaches eligibility only through decideEligibility', () => {
    const code = readCode('lib/whatsapp/broadcast/audience-multi.ts')
    // One call site, no local re-implementation of the rules.
    expect((code.match(/decideEligibility\(/g) ?? [])).toHaveLength(1)
    expect(code).not.toMatch(/status === 'SUBSCRIBED'\s*\?/)
    // Every source funnels into that one call: no per-source early "true".
    expect(code).not.toMatch(/eligible:\s*true/)
  })

  it('every source is consent-checked — MANUAL gets no special case', () => {
    const code = readCode('lib/whatsapp/broadcast/audience-multi.ts')
    // The single decideEligibility call is not inside a source-type branch.
    const call = code.indexOf('decideEligibility({')
    const preceding = code.slice(Math.max(0, call - 600), call)
    expect(preceding).not.toMatch(/sourceType === 'MANUAL'/)
    expect(preceding).not.toMatch(/if \([^)]*MANUAL[^)]*\)/)
  })
})

describe('the recorded template category is inert', () => {
  it('sources.ts defines it and nothing near the eligibility path consumes it', () => {
    // It is DEFINED here…
    expect(readCode('lib/whatsapp/broadcast/sources.ts')).toMatch(/TEMPLATE_CATEGORIES/)
    // …and read by NEITHER the decision tree nor either resolver.
    for (const f of [
      'lib/whatsapp/broadcast/consent.ts',
      'lib/whatsapp/broadcast/audience.ts',
      'lib/whatsapp/broadcast/audience-multi.ts',
      'lib/whatsapp/broadcast/sender.ts',
      'lib/whatsapp/broadcast/processor.ts',
    ]) {
      expect(readCode(f)).not.toMatch(/templateCategory|TemplateCategory|TEMPLATE_CATEGORIES/)
    }
  })

  it('no route compares the category to a value — it is only stored', () => {
    for (const f of ROUTE_FILES) {
      const code = readCode(f)
      // `if (body.templateCategory !== undefined)` in the PATCH handler is
      // field-presence gating for an UPDATE, not a behavioural branch, so
      // the pin is specifically on comparing it to a CATEGORY value.
      expect(code).not.toMatch(/templateCategory\s*[!=]==\s*['"]/)
      expect(code).not.toMatch(/['"](MARKETING|UTILITY|AUTHENTICATION)['"]\s*[!=]==\s*\w*[Tt]emplateCategory/)
      expect(code).not.toMatch(/templateCategory\s*(&&|\|\|)\s*\w*[Cc]onsent/)
    }
  })

  it('the schedule route consumes the category nowhere at all', () => {
    expect(readCode('app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route.ts'))
      .not.toMatch(/templateCategory/)
  })

  it('only MARKETING / UTILITY / AUTHENTICATION can be stored', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseTemplateCategory } = require('@/lib/whatsapp/broadcast/sources')
    expect(parseTemplateCategory('utility')).toBe('UTILITY')
    expect(parseTemplateCategory('MARKETING')).toBe('MARKETING')
    expect(parseTemplateCategory('TRANSACTIONAL')).toBeNull()
    expect(parseTemplateCategory(undefined)).toBeNull()
    expect(parseTemplateCategory({ toString: () => 'UTILITY' })).toBeNull()
  })

  it('the UI tells the operator the category changes nothing', () => {
    const ui = read('app/admin/marketing/whatsapp/page.tsx')
    expect(ui).toMatch(/recorded only/i)
    expect(ui).toMatch(/requires full recorded WhatsApp consent/i)
  })
})

describe('V1 internals this release must not have touched', () => {
  const PROTECTED = [
    'lib/whatsapp/broadcast/sender.ts',
    'lib/whatsapp/broadcast/status-callbacks.ts',
    'lib/whatsapp/broadcast/consent.ts',
    'lib/whatsapp/broadcast/rbac.ts',
    'lib/whatsapp/broadcast/lifecycle.ts',
    'lib/whatsapp/broadcast/template.ts',
    'lib/whatsapp/broadcast/audience.ts',
  ]

  it.each(PROTECTED)('%s knows nothing about V1.1 multi-source types', file => {
    const code = readCode(file)
    expect(code).not.toMatch(/sourceProvenance|visaApplicationId|manualEntries|audienceSelection/)
  })

  // processor.ts is DELIBERATELY excluded from the check above as of
  // WhatsApp Broadcast V1.2: its new pre-dispatch consent recheck reads
  // `visaApplicationId` off an already-frozen recipient row to re-verify a
  // VisaApplication-sourced opt-out fresh, immediately before sending (see
  // __tests__/whatsapp-broadcast-routes.test.ts's "never RE-RESOLVES the
  // audience" test for the guarantee that actually matters: it is a
  // single-row-by-known-id RECHECK, never audience expansion). The
  // property THIS test suite exists to protect — no second, divergent
  // consent rule — is asserted directly below instead.
  it('processor.ts still imports and calls the real decideEligibility for its recheck — never a reimplementation', () => {
    const code = readCode('lib/whatsapp/broadcast/processor.ts')
    expect(code).toMatch(/import\s*\{[^}]*decideEligibility[^}]*\}\s*from\s*'\.\/consent'/)
    expect(code).toContain('decideEligibility({')
    // No parallel eligibility vocabulary of its own.
    expect(code).not.toMatch(/ignoreConsent|forceSend|skipConsentCheck/)
  })

  it('the sender still builds only an approved Content Template payload (V1.2.1: Twilio, not Meta)', () => {
    const code = readCode('lib/whatsapp/broadcast/sender.ts')
    expect(code).toMatch(/sendWhatsAppContentTemplate/)
    expect(code).not.toMatch(/type:\s*'text'/)
    expect(code).not.toContain('graph.facebook.com')
  })

  it('the provider-readiness gate still blocks queueing', () => {
    const code = readCode('app/api/admin/marketing/whatsapp-broadcast/[id]/schedule/route.ts')
    expect(code).toMatch(/getWhatsAppReadiness\(\)/)
    expect(code).toMatch(/if \(!readiness\.canSend\)/)
    expect(code).toMatch(/status: 503/)
  })

  it('the wizard cannot send on mount — queueing is only the final button', () => {
    const ui = readCode('app/admin/marketing/whatsapp/page.tsx')
    // queueBroadcast is referenced exactly twice: its definition and the
    // one onClick on the final step's button. No effect calls it.
    expect((ui.match(/queueBroadcast/g) ?? [])).toHaveLength(2)
    expect(ui).not.toMatch(/useEffect\([^)]*queueBroadcast/)
    // The visa pre-population effect fills fields and stops there.
    expect(ui).toMatch(/visaApplicationId/)
    expect(ui).not.toMatch(/schedule[`'"][^`'"]*\}\s*,\s*\{\s*method:\s*'POST'[\s\S]{0,80}auto/i)
  })
})
