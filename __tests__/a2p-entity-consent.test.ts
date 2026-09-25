/**
 * A2P 10DLC error 30907 fix (CUSTOMER_CARE only) — entity naming, customer-care
 * consent, A2P registration copy, legal copy + SQL drift guard, footer, site-settings default.
 * (UI/hook behaviour is in a2p-sms-consent-ui.test.tsx, which needs jsdom.)
 */

const mockPrisma = {
  consentRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  consentEvent: { create: jest.fn() },
  $transaction: jest.fn(),
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import fs from 'fs'
import path from 'path'

import { POST as carePost } from '@/app/api/consent/sms-customer-care/route'
import {
  A2P_CAMPAIGN_DESCRIPTION,
  A2P_MESSAGE_FLOW,
  A2P_SAMPLE_MESSAGES,
} from '@/lib/config/a2p-campaign-copy'
import {
  LEGAL_ENTITIES,
  CORPORATE_DISCLOSURE,
  SMS_PROGRAM_DISCLOSURE,
  SMS_SENDER_PHRASE,
  UK_ENTITY_NAME,
  ENTITY_DISPLAY_LINES,
} from '@/lib/config/legal-entities'
import {
  SMS_CUSTOMER_CARE_DISCLOSURE,
  SMS_CUSTOMER_CARE_DISCLOSURE_BODY,
  SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
  REQUIRED_DISCLOSURE_ELEMENTS,
  CONSENT_SOURCE_BOOKING_CHECKOUT,
  CONSENT_SOURCE_TOUR_BOOKING,
  resolveConsentSource,
  decideConsentWrite,
} from '@/lib/consent/purposes'
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/lib/content/legal-content'
import { SETTING_DEFAULTS } from '@/lib/site-settings-defaults'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

function req(body: unknown, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'jest', ...headers }))
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Parameters<typeof carePost>[0]
}
let ipCounter = 100
const freshIp = () => `198.51.100.${(ipCounter += 1) % 250}`

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) => cb(mockPrisma))
  mockPrisma.consentRecord.findUnique.mockResolvedValue(null)
  mockPrisma.consentRecord.create.mockResolvedValue({ id: 'x' })
  mockPrisma.consentEvent.create.mockResolvedValue({ id: 'e1' })
})

describe('legal entities — single source with correct roles', () => {
  it('canada legalName is The Walz Travels Inc.; UK legalName preserved exactly; no UK displayName', () => {
    expect(LEGAL_ENTITIES.canada.legalName).toBe('The Walz Travels Inc.')
    expect(LEGAL_ENTITIES.uk.legalName).toBe('Walz Travels Ltd')
    expect(UK_ENTITY_NAME).toBe('Walz Travels Ltd')
    expect('displayName' in LEGAL_ENTITIES.uk).toBe(false)
    // Nothing is fabricated.
    expect(LEGAL_ENTITIES.canada.corporationNumber).toBe('')
    expect(LEGAL_ENTITIES.canada.registeredOffice).toBe('')
    expect(LEGAL_ENTITIES.uk.companyNumber).toBe('')
  })

  it('exact disclosure strings', () => {
    expect(CORPORATE_DISCLOSURE).toBe(
      'Walz Travels is an international travel services brand operated through locally registered entities in Canada and the United Kingdom.',
    )
    expect(SMS_PROGRAM_DISCLOSURE).toBe(
      'SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating under the Walz Travels brand.',
    )
    expect(SMS_SENDER_PHRASE).toBe('The Walz Travels Inc., operating as Walz Travels')
    expect(ENTITY_DISPLAY_LINES.canada).toBe('Canada: The Walz Travels Inc.')
    expect(ENTITY_DISPLAY_LINES.uk).toBe('United Kingdom: Walz Travels Ltd')
  })

  it("'The Walz Travels Ltd' appears nowhere in the config/content/footer/SQL sources", () => {
    const files = ['components/common/Footer.tsx', 'scripts/a2p_entity_legal_content_v1.sql']
    for (const dir of ['lib/config', 'lib/content']) {
      for (const f of fs.readdirSync(path.join(process.cwd(), dir))) files.push(`${dir}/${f}`)
    }
    for (const f of files) expect(read(f)).not.toContain('The Walz Travels Ltd')
  })

  it('Inc is the SMS sender and Canadian; Ltd is never the SMS operator; Inc is never UK', () => {
    const smsTexts = [
      SMS_CUSTOMER_CARE_DISCLOSURE,
      SMS_PROGRAM_DISCLOSURE,
      SMS_SENDER_PHRASE,
      TERMS_SECTIONS.find((s) => s.key === 'terms_s13')!.body,
      PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s13')!.body,
    ]
    for (const t of smsTexts) {
      expect(t).toContain('The Walz Travels Inc.')
      expect(t).not.toMatch(/Walz Travels Ltd/)
    }
    const all = [...PRIVACY_SECTIONS, ...TERMS_SECTIONS].map((s) => s.body).join('\n')
    expect(all).not.toMatch(/The Walz Travels Inc\.?\s*\(United Kingdom\)/)
    expect(all).not.toMatch(/The Walz Travels Inc\.?\s+in the United Kingdom/)
    expect(all).not.toMatch(/Walz Travels Ltd\.?\s*\(Canada\)/)
    expect(ENTITY_DISPLAY_LINES.canada).not.toContain('Ltd')
    expect(ENTITY_DISPLAY_LINES.uk).not.toContain('Inc')
  })
})

const PROMO = /promotion|promotional|marketing|offer|deal/i

describe('customer-care disclosure (owner wording, character for character)', () => {
  it('is exactly the owner wording at v2 and links Terms + Privacy', () => {
    expect(SMS_CUSTOMER_CARE_DISCLOSURE_BODY).toBe(
      'I agree to receive SMS messages from The Walz Travels Inc., operating as Walz Travels, regarding my travel enquiries, bookings, payments, itinerary updates, visa-service updates and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.',
    )
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toBe(SMS_CUSTOMER_CARE_DISCLOSURE_BODY + ' See our Terms & Conditions and Privacy Policy.')
    expect(SMS_CUSTOMER_CARE_DISCLOSURE_VERSION).toBe('sms-customer-care-v2')
  })

  it.each(Object.entries(REQUIRED_DISCLOSURE_ELEMENTS))('includes the %s', (_n, phrase) => {
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toContain(phrase)
  })

  it('carries the sender phrase and mentions no promotions/marketing/offers/deals', () => {
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toContain(SMS_SENDER_PHRASE)
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).not.toMatch(PROMO)
  })
})

describe('A2P registration copy (lib/config/a2p-campaign-copy.ts)', () => {
  it('campaign description is exact and has no promotional wording', () => {
    expect(A2P_CAMPAIGN_DESCRIPTION).toBe(
      'The Walz Travels Inc. is the Canadian legal entity operating under the customer-facing Walz Travels brand. This A2P 10DLC Customer Care campaign is operated by The Walz Travels Inc. and is used to communicate with customers who voluntarily opt in to SMS communications through walztravels.com.\n\nMessages include travel enquiry responses, booking confirmations and updates, payment reminders, itinerary notifications, visa-service status notifications, appointment or consultation reminders, and customer-support communications.\n\nWalz Travels operates internationally through locally registered entities in Canada and the United Kingdom. This A2P 10DLC campaign specifically relates to The Walz Travels Inc. in Canada.',
    )
    expect(A2P_CAMPAIGN_DESCRIPTION).not.toMatch(PROMO)
  })

  it('message flow is exact; its only promo mention is the owner non-enrolment sentence', () => {
    expect(A2P_MESSAGE_FLOW).toBe(
      'Customers opt in to receive customer-care SMS messages from The Walz Travels Inc., operating as Walz Travels, through the Walz Travels website at https://www.walztravels.com/.\n\nDuring an eligible travel enquiry, booking, visa-service request, consultation request or other customer-service interaction, the customer enters their mobile telephone number and is presented with a separate, unchecked SMS consent checkbox.\n\nThe customer must actively select the checkbox to consent to receiving SMS communications from Walz Travels.\n\nSMS consent is optional and is not required to make a purchase or use Walz Travels services.\n\nThe disclosure informs customers that message frequency varies, message and data rates may apply, and customers may reply STOP to opt out or HELP for assistance.\n\nLinks to the Walz Travels Privacy Policy and Terms & Conditions are displayed with the consent disclosure.\n\nThis opt-in is for customer-care/service communications and does not enroll the customer in promotional or marketing SMS messages.',
    )
    const rest = A2P_MESSAGE_FLOW.replace('and does not enroll the customer in promotional or marketing SMS messages', '')
    expect(rest).not.toMatch(PROMO)
  })

  it('has exactly the five owner sample messages, each with brand, STOP and HELP, none promotional', () => {
    expect(A2P_SAMPLE_MESSAGES).toEqual([
      'Walz Travels: Hi {{first_name}}, we received your travel enquiry. A member of our team will contact you shortly with the requested information. Reply STOP to opt out or HELP for help.',
      'Walz Travels: Hi {{first_name}}, your booking {{booking_reference}} has been confirmed. Please review your booking details in your Walz Travels account. Reply STOP to opt out or HELP for help.',
      'Walz Travels: Hi {{first_name}}, there is an update regarding your travel service request {{reference_number}}. Please sign in to your Walz Travels account or contact our support team for details. Reply STOP to opt out or HELP for help.',
      'Walz Travels: Reminder: your scheduled consultation is on {{date}} at {{time}}. Reply STOP to opt out or HELP for help.',
      'Walz Travels: Hi {{first_name}}, your requested travel quotation is ready for review. Please check your Walz Travels account for details. Reply STOP to opt out or HELP for help.',
    ])
    expect(A2P_SAMPLE_MESSAGES).toHaveLength(5)
    for (const m of A2P_SAMPLE_MESSAGES) {
      expect(m).toContain('Walz Travels')
      expect(m).toContain('STOP')
      expect(m).toContain('HELP')
      expect(m).not.toMatch(PROMO)
    }
  })
})

describe('consent source allowlist', () => {
  it('keeps the existing booking constant unchanged and resolves only allowlisted values', () => {
    expect(CONSENT_SOURCE_BOOKING_CHECKOUT).toBe('booking_checkout_sms_customer_care')
    expect(resolveConsentSource(CONSENT_SOURCE_TOUR_BOOKING, CONSENT_SOURCE_BOOKING_CHECKOUT)).toBe(CONSENT_SOURCE_TOUR_BOOKING)
    for (const bad of ['evil', '', 42, null, undefined, {}, '<script>']) {
      expect(resolveConsentSource(bad, CONSENT_SOURCE_BOOKING_CHECKOUT)).toBe(CONSENT_SOURCE_BOOKING_CHECKOUT)
    }
  })
})

describe('customer-care route — optional source + v2 stamp', () => {
  it('stamps v2 and the default source when none is sent', async () => {
    await carePost(req({ phone: '+2348012345678', consent: true }, { 'x-forwarded-for': freshIp() }))
    const arg = mockPrisma.consentRecord.create.mock.calls[0][0]
    expect(arg.data.disclosureVersion).toBe('sms-customer-care-v2')
    expect(arg.data.source).toBe(CONSENT_SOURCE_BOOKING_CHECKOUT)
  })

  it('accepts an allowlisted source and safely ignores an unknown one (no 400)', async () => {
    await carePost(req({ phone: '+2348012345678', consent: true, source: CONSENT_SOURCE_TOUR_BOOKING }, { 'x-forwarded-for': freshIp() }))
    expect(mockPrisma.consentRecord.create.mock.calls[0][0].data.source).toBe(CONSENT_SOURCE_TOUR_BOOKING)

    mockPrisma.consentRecord.create.mockClear()
    const res = await carePost(req({ phone: '+2348012345678', consent: true, source: 'made-up' }, { 'x-forwarded-for': freshIp() }))
    expect(res.status).toBe(200)
    expect(mockPrisma.consentRecord.create.mock.calls[0][0].data.source).toBe(CONSENT_SOURCE_BOOKING_CHECKOUT)
  })
})

describe('customer-care only release — no marketing route or UI', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`
      return e.isDirectory() ? walk(rel) : [rel]
    })

  it('app/api/consent/sms-marketing does not exist', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'app/api/consent/sms-marketing'))).toBe(false)
    expect(fs.readdirSync(path.join(process.cwd(), 'app/api/consent'))).toEqual(['sms-customer-care'])
  })

  it("nothing under app/ or components/ (except the reserved component) imports SmsMarketingConsent or mentions 'sms-marketing'", () => {
    const files = [...walk('app'), ...walk('components')].filter(
      (f) => /\.(ts|tsx|js|jsx)$/.test(f) && f !== 'components/consent/SmsMarketingConsent.tsx',
    )
    for (const f of files) {
      const src = read(f)
      expect(src).not.toContain('SmsMarketingConsent')
      expect(src).not.toContain('sms-marketing')
    }
  })

  it('the client posts only to the customer-care endpoint; no marketing endpoint exists', () => {
    const client = read('lib/consent/client.ts')
    expect(client).not.toMatch(/sms-marketing|SMS_MARKETING_ENDPOINT/)
    expect(read('components/consent/useSmsConsent.tsx')).not.toMatch(/[Mm]arketing/)
  })

  it('reserved marketing constants are clearly marked as reserved', () => {
    expect(read('lib/consent/purposes.ts')).toContain('RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release')
    expect(read('components/consent/SmsMarketingConsent.tsx')).toContain('RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release')
  })

  it('the customer-care route file names only its own purpose and touches no other store', () => {
    const care = code('app/api/consent/sms-customer-care/route.ts')
    expect(care).toMatch(/purpose:\s*'SMS_CUSTOMER_CARE'/)
    expect(care).not.toMatch(/[Mm]arketing|MARKETING/)
    for (const src of [care, code('lib/consent/capture.ts'), code('lib/consent/client.ts')]) {
      expect(src).not.toMatch(/prisma\.(lead|visaApplication|client|clientAccount|booking|user|whatsAppConsent)\b/i)
      expect(src).not.toMatch(/findMany|createMany|updateMany|\$queryRaw|\$executeRaw/)
    }
    expect(code('lib/consent/capture.ts')).toContain('normalizeSmsNumber')
    expect(code('lib/consent/capture.ts')).toContain('consentCaptureRateLimit')
  })

  it('no backfill path: no script/migration seeds consent rows from existing stores', () => {
    for (const dir of ['scripts', 'prisma/migrations']) {
      for (const f of fs.readdirSync(path.join(process.cwd(), dir))) {
        if (!/\.(ts|js|mjs|sql)$/.test(f)) continue
        const src = read(path.join(dir, f))
        expect(src).not.toMatch(/INSERT\s+INTO\s+consent_records[\s\S]{0,400}FROM\s+"?(Lead|VisaApplication|Client)"?/i)
      }
    }
    expect(decideConsentWrite({ checked: undefined, normalizedNumber: '+2348012345678' }).write).toBe(false)
  })
})

describe('repo-wide: no "Inc ... Registered in England"', () => {
  it('no source file under app/ lib/ components/ scripts/ supabase/ attaches England registration to Inc', () => {
    const walk = (dir: string): string[] => {
      if (!fs.existsSync(path.join(process.cwd(), dir))) return []
      return fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`
        return e.isDirectory() ? walk(rel) : [rel]
      })
    }
    const files = ['app', 'lib', 'components', 'scripts', 'supabase'].flatMap(walk).filter((f) => /\.(ts|tsx|js|jsx|sql|md|json)$/.test(f))
    expect(files.length).toBeGreaterThan(100)
    for (const f of files) {
      expect({ f, hit: /Inc[^\n]{0,80}Registered in England/i.test(read(f)) }).toEqual({ f, hit: false })
    }
  })
})

describe('legal copy', () => {
  const p1 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s1')!
  const p12 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s12')!
  const p13 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s13')!
  const t1 = TERMS_SECTIONS.find((s) => s.key === 'terms_s1')!
  const t11 = TERMS_SECTIONS.find((s) => s.key === 'terms_s11')!
  const t14 = TERMS_SECTIONS.find((s) => s.key === 'terms_s14')!

  it('privacy s1 states the corporate sentence, keeps website text and contact line, names Inc as SMS provider', () => {
    expect(p1.body).toContain(CORPORATE_DISCLOSURE)
    expect(p1.body).toContain('We operate the website walztravels.com')
    expect(p1.body).toContain('contact@walztravels.com')
    expect(p1.body).toContain('SMS communications are provided by The Walz Travels Inc.')
  })

  it('contact sections name both entities without inventing addresses', () => {
    for (const b of [p12.body, t14.body]) {
      expect(b).toContain('Canada: The Walz Travels Inc.')
      expect(b).toContain('United Kingdom: Walz Travels Ltd')
    }
    expect(p12.body).toContain('ico.org.uk')
    expect(t1.body).toContain('The Walz Travels Inc.')
    expect(t1.body).toContain('Walz Travels Ltd')
  })

  it('governing law is unchanged (England and Wales)', () => {
    expect(t11.body).toContain('These Terms are governed by the laws of England and Wales.')
  })

  const PRIVACY_S13 = `SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating as Walz Travels.

Mobile information we collect:
We may collect your mobile phone number and a record of your SMS consent, including the date and time of consent, the version of the consent wording presented to you, and the page or form through which consent was provided. We use this information to provide requested SMS communications, maintain consent records, process opt-outs and support compliance obligations.

If you opt in, SMS messages may include travel enquiry responses, booking confirmations and updates, payment reminders, itinerary updates, visa-service updates, appointment or consultation reminders and customer-support communications.

Message frequency varies. Message and data rates may apply. Consent is not a condition of purchase.

You may reply STOP to opt out or HELP for assistance. You may also contact contact@walztravels.com regarding your SMS preferences.

Mobile information, including your mobile phone number and SMS opt-in consent, will not be shared with third parties or affiliates for their marketing or promotional purposes.

See our Terms of Service for additional information about the SMS messaging programme.`

  const TERMS_S13 = `SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating under the Walz Travels brand.

Sender:
The Walz Travels Inc., operating as Walz Travels.

If you voluntarily opt in, you may receive SMS messages relating to travel enquiries, booking confirmations, booking updates, itinerary notifications, payment reminders, visa-service notifications, appointment and consultation reminders, and customer-support communications.

Message frequency varies. Message and data rates may apply.

Reply STOP to opt out. Reply HELP for help.

Consent is not a condition of purchase.

You may also contact contact@walztravels.com regarding your SMS preferences.

We do not sell or share mobile information, including mobile phone numbers and SMS consent information, with third parties or affiliates for their marketing or promotional purposes.

See our Privacy Policy for additional information.`

  it('privacy s13 and terms s13 are exactly the owner text', () => {
    expect(p13.title).toBe('13. SMS and Mobile Messaging')
    expect(p13.body).toBe(PRIVACY_S13)
    const t13 = TERMS_SECTIONS.find((s) => s.key === 'terms_s13')!
    expect(t13.title).toBe('13. SMS Messaging')
    expect(t13.body).toBe(TERMS_S13)
  })

  it('no SMS copy mentions promotions, except the required no-sharing sentence', () => {
    const NO_SHARE = /[^.\n]*for their marketing or promotional purposes\./g
    for (const body of [p13.body, TERMS_SECTIONS.find((s) => s.key === 'terms_s13')!.body]) {
      expect(body.match(NO_SHARE)).toHaveLength(1)
      expect(body.replace(NO_SHARE, '')).not.toMatch(PROMO)
    }
  })

  it('Last updated is September 2026 on both pages (and only that string changed)', () => {
    for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx']) {
      expect(read(f)).toContain("const lastUpdated = 'September 2026'")
      expect(read(f)).not.toContain('June 2025')
    }
  })
})

describe('a2p_entity_legal_content_v1.sql — drift guard, idempotence, scope', () => {
  const SQL = 'scripts/a2p_entity_legal_content_v1.sql'
  const sql = read(SQL)
  const byKey = (k: string) => [...PRIVACY_SECTIONS, ...TERMS_SECTIONS].find((s) => s.key === k)!

  it('carries the CURRENT body text of every changed row, verbatim', () => {
    for (const k of ['privacy_s1', 'privacy_s12', 'privacy_s13', 'terms_s1', 'terms_s13', 'terms_s14']) {
      expect(sql).toContain(`'${k}_body'`)
      expect(sql).toContain(`$legal$${byKey(k).body}$legal$`)
    }
    // s13 is new, so its heading is inserted too.
    expect(sql).toContain(`'privacy_s13_title'`)
    expect(sql).toContain(`'${byKey('privacy_s13').title}'`)
  })

  it('touches exactly the seven expected keys, idempotently, with no destructive statements', () => {
    const keys = new Set(sql.match(/^\s+'(?:privacy|terms)_s\d+_(?:title|body)',$/gm)?.map((l) => l.trim().replace(/[',]/g, '')))
    expect(keys).toEqual(new Set([
      'privacy_s1_body', 'privacy_s12_body', 'privacy_s13_title', 'privacy_s13_body',
      'terms_s1_body', 'terms_s13_body', 'terms_s14_body',
    ]))
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE')
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain('COMMIT;')
    expect(sql).toContain('DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT')
    expect(sql).toContain('It has NOT been executed by the implementing agent')
    expect(sql).toContain('0 schema changes')
    expect(sql).toContain('-- Expect:')
    expect(sql).not.toContain('The Walz Travels Ltd')
    expect(sql.lastIndexOf('SELECT')).toBeGreaterThan(sql.indexOf('COMMIT;'))
    const stripped = sql.replace(/^\s*--.*$/gm, '')
    expect(stripped).not.toMatch(/DELETE\s+FROM|DROP\s+|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE/i)
    expect(stripped).not.toMatch(/consent_records|whatsapp_consents/i)
  })

  it('uses the group/label conventions of the existing rows', () => {
    expect(sql).toContain(`'Privacy — 13. SMS and Mobile Messaging (Body)'`)
    expect(sql).toContain(`'Terms — 13. SMS Messaging (Body)'`)
    expect(sql).toMatch(/'privacy',\s+'general'/)
    expect(sql).toMatch(/'terms',\s+'general'/)
  })

  it('surgically fixes the live business_address setting and its validation', () => {
    expect(sql).toContain(`UPDATE "SiteSetting"`)
    expect(sql).toContain(`SET "value"     = 'The Walz Travels Inc. · Ontario, Canada'`)
    expect(sql).toContain(`WHERE "key" = 'business_address'`)
    expect(sql).toContain(`AND "value" ILIKE '%Registered in England%'`)
    expect(sql).toContain('address_england_expect_0')
    expect(sql).toContain('promo_sms_mentions_expect_0')
    expect(sql).toContain("LIKE '%Walz Travels Ltd%'")
  })
})

describe('footer + site settings', () => {
  it('footer renders both entities from the shared constants and keeps copyright + policy links', () => {
    const f = read('components/common/Footer.tsx')
    expect(f).toContain("from '@/lib/config/legal-entities'")
    expect(f).toContain('{CORPORATE_DISCLOSURE}')
    expect(f).toContain('{ENTITY_DISPLAY_LINES.canada}')
    expect(f).toContain('{ENTITY_DISPLAY_LINES.uk}')
    expect(f).toContain('All rights reserved.')
    expect(f).toContain("href: '/privacy'")
    expect(f).toContain("href: '/terms'")
  })

  it('business_address default no longer claims an Ontario Inc. is registered in England & Wales', () => {
    expect(SETTING_DEFAULTS.business_address).toBe('The Walz Travels Inc. · Ontario, Canada')
    expect(SETTING_DEFAULTS.business_address).not.toContain('Registered in England')
    expect(read('app/admin/settings/contact/page.tsx')).not.toContain('Registered in England')
  })
})
