/**
 * Walz Consent Foundation V1 — A2P 10DLC CUSTOMER_CARE.
 *
 * Twilio rejected the CUSTOMER_CARE campaign with error 30896 (inadequate
 * SMS consent language on the public opt-in page). These tests defend the
 * fix AND the two guarantees the fix must not break:
 *
 *   1. An unchecked box creates NO consent record of any status.
 *   2. NOTHING in this feature converts an existing phone number — on a
 *      Lead, VisaApplication, Client or historical booking — into a
 *      consent record. There is no backfill, and there is no code path
 *      that could become one.
 *
 * Prisma is mocked so the route's own decision logic is what is under
 * test; the write decision itself is a pure function and is exercised
 * exhaustively on its own.
 */

const mockPrisma = {
  consentRecord: { upsert: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockPrisma }))

import fs from 'fs'
import path from 'path'

import { POST as consentPost } from '@/app/api/consent/sms-customer-care/route'
import {
  CONSENT_PURPOSES,
  CONSENT_STATUSES,
  SMS_CUSTOMER_CARE_DISCLOSURE,
  SMS_CUSTOMER_CARE_DISCLOSURE_BODY,
  SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
  REQUIRED_DISCLOSURE_ELEMENTS,
  CONSENT_SOURCE_BOOKING_CHECKOUT,
  PRIVACY_POLICY_PATH,
  TERMS_PATH,
  decideConsentWrite,
  isConsentPurpose,
  isConsentStatus,
  isGranted,
} from '@/lib/consent/purposes'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/lib/content/legal-content'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

/**
 * Source with comments removed. Several assertions below are about what the
 * CODE does, and these files document at length why they do it — so the
 * prose legitimately names the very things the code must not contain
 * ("no `defaultChecked`", "never a native enum", "`selectAll` prop"). These
 * checks run against the stripped source so the documentation cannot
 * either mask a real violation or manufacture a false one.
 */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')    // block comments, JSX comments included
    .replace(/^\s*\/\/.*$/gm, ' ')        // whole-line // comments
    .replace(/^\s*--.*$/gm, ' ')          // whole-line SQL comments
}

const ROUTE_SRC = 'app/api/consent/sms-customer-care/route.ts'
// The capture logic (rate limit, normalization, strict === true, upsert) now
// lives in ONE shared helper used by both consent routes; the route files
// are thin wrappers that each pass a single literal purpose.
const CAPTURE_SRC = 'lib/consent/capture.ts'
const PURPOSES_SRC = 'lib/consent/purposes.ts'
const COMPONENT_SRC = 'components/consent/SmsCustomerCareConsent.tsx'
const MIGRATION_SRC = 'prisma/migrations/consent_foundation_v1.sql'
const LEGAL_SQL_SRC = 'scripts/consent_legal_content_v1.sql'

/** A minimal NextRequest stand-in: the route only uses headers + json(). */
function req(body: unknown, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'jest', ...headers }))
  return {
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    json: async () => body,
  } as unknown as Parameters<typeof consentPost>[0]
}

/**
 * The in-memory rate limiter is shared across the module, so each test
 * gets its own IP to avoid one test's traffic throttling the next.
 */
let ipCounter = 0
function freshIp() {
  ipCounter += 1
  return `198.51.100.${ipCounter % 250}`
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPrisma.consentRecord.upsert.mockResolvedValue({ id: 'c1' })
})

// ── 1. The unchecked box writes NOTHING ─────────────────────────────────

describe('an unchecked consent box creates NO ConsentRecord of any status', () => {
  it('decideConsentWrite refuses every non-true value', () => {
    const notConsent: unknown[] = [
      false, undefined, null, 0, 1, '', 'false', 'true', 'on', 'off', [], {}, NaN,
    ]
    for (const checked of notConsent) {
      expect(decideConsentWrite({ checked, normalizedNumber: '+2348012345678' }))
        .toEqual({ write: false, reason: 'NOT_CHECKED' })
    }
  })

  it('the route returns 200 but writes nothing when consent is false', async () => {
    const res = await consentPost(
      req({ phone: '+2348012345678', consent: false }, { 'x-forwarded-for': freshIp() }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'NOT_CHECKED' })
    expect(mockPrisma.consentRecord.upsert).not.toHaveBeenCalled()
  })

  it('the route writes nothing when the consent field is absent entirely', async () => {
    const res = await consentPost(req({ phone: '+2348012345678' }, { 'x-forwarded-for': freshIp() }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'NOT_CHECKED' })
    expect(mockPrisma.consentRecord.upsert).not.toHaveBeenCalled()
  })

  it('a truthy-but-not-true value (the classic coercion bug) writes nothing', async () => {
    for (const consent of ['true', 1, 'on', {}]) {
      mockPrisma.consentRecord.upsert.mockClear()
      const res = await consentPost(
        req({ phone: '+2348012345678', consent }, { 'x-forwarded-for': freshIp() }),
      )
      await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'NOT_CHECKED' })
      expect(mockPrisma.consentRecord.upsert).not.toHaveBeenCalled()
    }
  })

  it('NOT_GRANTED is never written by the capture path — absence is the negative state', async () => {
    await consentPost(req({ phone: '+2348012345678', consent: false }, { 'x-forwarded-for': freshIp() }))
    expect(mockPrisma.consentRecord.upsert).not.toHaveBeenCalled()
    // And the route source contains no NOT_GRANTED write at all.
    expect(read(ROUTE_SRC)).not.toMatch(/status:\s*['"]NOT_GRANTED['"]/)
    expect(read(CAPTURE_SRC)).not.toMatch(/status:\s*['"]NOT_GRANTED['"]/)
  })

  it('the source uses a strict identity check, not a truthy test', () => {
    expect(read(PURPOSES_SRC)).toContain('if (input.checked !== true) return { write: false, reason: \'NOT_CHECKED\' }')
    // No `if (checked)` / `!!checked` / Boolean(checked) shortcut anywhere.
    expect(read(PURPOSES_SRC)).not.toMatch(/Boolean\(\s*input\.checked\s*\)/)
    expect(read(ROUTE_SRC)).not.toMatch(/consent\s*\?\s*true/)
    expect(read(CAPTURE_SRC)).not.toMatch(/consent\s*\?\s*true/)
  })

  it('the checkbox state is never defaulted to true at any call site', () => {
    for (const src of [
      'app/(public)/flights/traveller/page.tsx',
      'components/booking/PassengerForm.tsx',
      'app/hotels/book/page.tsx',
    ]) {
      // The hook (components/consent/useSmsConsent.tsx) owns the unticked
      // default; the call site must use it and never seed state true.
      expect(read(src)).toContain('useSmsConsent()')
      expect(read(src)).not.toMatch(/useState\(\s*true\s*\)[^\n]*[Cc]onsent/)
    }
  })
})

// ── 2. Consent is NEVER inferred from a phone number existing ───────────

describe('consent is never inferred from the presence of a phone number', () => {
  const featureFiles = [
    PURPOSES_SRC,
    ROUTE_SRC,
    CAPTURE_SRC,
    'lib/consent/client.ts',
    COMPONENT_SRC,
    'components/consent/SmsMarketingConsent.tsx',
    'components/consent/useSmsConsent.tsx',
    MIGRATION_SRC,
  ]

  it('no feature file reads Lead, VisaApplication or any Client store', () => {
    for (const f of featureFiles) {
      const src = read(f)
      // No Prisma model access that could enumerate existing numbers.
      expect(src).not.toMatch(/prisma\.lead\b/i)
      expect(src).not.toMatch(/prisma\.visaApplication\b/i)
      expect(src).not.toMatch(/prisma\.client\b/i)
      expect(src).not.toMatch(/prisma\.clientAccount\b/i)
      expect(src).not.toMatch(/prisma\.booking\b/i)
      expect(src).not.toMatch(/prisma\.user\b/i)
    }
  })

  it('no feature file performs a bulk read that could feed a backfill', () => {
    for (const f of featureFiles) {
      const src = read(f)
      expect(src).not.toMatch(/findMany/)
      expect(src).not.toMatch(/createMany/)
      expect(src).not.toMatch(/updateMany/)
      expect(src).not.toMatch(/\$queryRaw/)
      expect(src).not.toMatch(/\$executeRaw/)
    }
  })

  it('the only Prisma write in the whole feature is a single-row consentRecord upsert', () => {
    const src = read(CAPTURE_SRC)
    const writes = src.match(/prisma\.\w+\.(create|upsert|update|delete|createMany|updateMany|deleteMany)/g) ?? []
    expect(writes).toEqual(['prisma.consentRecord.upsert'])
  })

  it('no backfill/migration script for consent exists anywhere in the repo', () => {
    const suspects = ['scripts', 'prisma/migrations']
      .flatMap((dir) => fs.readdirSync(path.join(process.cwd(), dir)).map((f) => path.join(dir, f)))
      .filter((f) => /\.(ts|js|mjs|sql)$/.test(f))

    for (const f of suspects) {
      const src = read(f)
      if (!/consent_records|consentRecord/i.test(src)) continue
      // Any file that mentions the new table must not populate it from
      // an existing store.
      expect(src).not.toMatch(/INSERT\s+INTO\s+consent_records\s+SELECT/i)
      expect(src).not.toMatch(/INSERT\s+INTO\s+consent_records[\s\S]{0,400}FROM\s+"?(Lead|VisaApplication|Client)"?/i)
      expect(src).not.toMatch(/consentRecord\.createMany/)
    }
  })

  it('the migration creates the table EMPTY — no seeded or backfilled rows', () => {
    const sql = read(MIGRATION_SRC)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+consent_records/i)
    // And it says so, with a validation query asserting zero rows.
    expect(sql).toContain('consent_rows_expect_0')
    expect(sql).toContain('There is NO backfill in this file')
  })

  it('isGranted cannot be satisfied by anything but a real GRANTED row for that purpose', () => {
    expect(isGranted(null, 'SMS_CUSTOMER_CARE')).toBe(false)
    expect(isGranted(undefined, 'SMS_CUSTOMER_CARE')).toBe(false)
    expect(isGranted({ status: 'NOT_GRANTED', purpose: 'SMS_CUSTOMER_CARE' }, 'SMS_CUSTOMER_CARE')).toBe(false)
    expect(isGranted({ status: 'REVOKED', purpose: 'SMS_CUSTOMER_CARE' }, 'SMS_CUSTOMER_CARE')).toBe(false)
    // A GRANTED row for a DIFFERENT purpose does not satisfy this one.
    expect(isGranted({ status: 'GRANTED', purpose: 'SMS_MARKETING' }, 'SMS_CUSTOMER_CARE')).toBe(false)
    expect(isGranted({ status: 'GRANTED', purpose: 'SMS_CUSTOMER_CARE' }, 'SMS_CUSTOMER_CARE')).toBe(true)
  })
})

// ── 3. A genuine tick creates exactly one correct record ────────────────

describe('a genuinely checked submission creates exactly one GRANTED record', () => {
  it('writes one SMS_CUSTOMER_CARE / GRANTED row with a real timestamp', async () => {
    const before = Date.now()
    const res = await consentPost(
      req(
        { phone: '+234 801 234 5678', consent: true, capturePage: '/flights/traveller' },
        { 'x-forwarded-for': freshIp(), 'user-agent': 'Mozilla/5.0 (test)' },
      ),
    )
    const after = Date.now()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED',
    })

    expect(mockPrisma.consentRecord.upsert).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.consentRecord.upsert.mock.calls[0][0]

    // Keyed on the (number, purpose) pair, with the number NORMALIZED.
    expect(arg.where).toEqual({
      normalizedNumber_purpose: {
        normalizedNumber: '+2348012345678',
        purpose: 'SMS_CUSTOMER_CARE',
      },
    })

    expect(arg.create.purpose).toBe('SMS_CUSTOMER_CARE')
    expect(arg.create.status).toBe('GRANTED')
    expect(arg.create.normalizedNumber).toBe('+2348012345678')
    expect(arg.create.source).toBe(CONSENT_SOURCE_BOOKING_CHECKOUT)
    expect(arg.create.capturePage).toBe('/flights/traveller')
    expect(arg.create.disclosureVersion).toBe(SMS_CUSTOMER_CARE_DISCLOSURE_VERSION)

    // A REAL timestamp, not a placeholder.
    expect(arg.create.consentedAt).toBeInstanceOf(Date)
    const t = (arg.create.consentedAt as Date).getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })

  it('captures auditable context (ip + user agent), matching the repo pattern', async () => {
    await consentPost(
      req({ phone: '+2348012345678', consent: true }, { 'x-forwarded-for': '203.0.113.99', 'user-agent': 'UA/1' }),
    )
    const arg = mockPrisma.consentRecord.upsert.mock.calls[0][0]
    expect(arg.create.ipAddress).toBe('203.0.113.99')
    expect(arg.create.userAgent).toBe('UA/1')
  })

  it('an unusable number is refused rather than stored un-normalized', async () => {
    // A national-format Nigerian number cannot be converted to E.164
    // without country context — normalizePhoneE164 returns null.
    const res = await consentPost(req({ phone: '08012345678', consent: true }, { 'x-forwarded-for': freshIp() }))
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'INVALID_NUMBER' })
    expect(mockPrisma.consentRecord.upsert).not.toHaveBeenCalled()
  })

  it('a repeat tick upserts the same row rather than duplicating consent', async () => {
    await consentPost(req({ phone: '+2348012345678', consent: true }, { 'x-forwarded-for': freshIp() }))
    const arg = mockPrisma.consentRecord.upsert.mock.calls[0][0]
    expect(arg.update.status).toBe('GRANTED')
    expect(arg.update.consentedAt).toBeInstanceOf(Date)
    // A fresh affirmative tick clears a prior revocation.
    expect(arg.update.revokedAt).toBeNull()
  })
})

// ── 4. Phone normalization reuses the EXISTING utility ──────────────────

describe('phone normalization reuses lib/identity/normalize.ts — no second normalizer', () => {
  it('the shared capture helper imports the shared normalizer by name', () => {
    expect(read(CAPTURE_SRC)).toContain("import { normalizePhoneE164 } from '@/lib/identity/normalize'")
  })

  it('no file in this feature defines its own phone normalization', () => {
    for (const f of [ROUTE_SRC, CAPTURE_SRC, PURPOSES_SRC, COMPONENT_SRC]) {
      const src = read(f)
      expect(src).not.toMatch(/function\s+normalize\w*Phone/i)
      expect(src).not.toMatch(/replace\(\s*\/\\D\/g/)
      expect(src).not.toMatch(/const\s+\w*[Ee]164\s*=\s*\(/)
    }
  })

  it('it is the SAME function the WhatsApp Broadcast audience resolver uses', () => {
    // Both import the same module path — one idea of who a number is.
    expect(read('lib/whatsapp/broadcast/audience.ts')).toContain("from '@/lib/identity/normalize'")
    expect(read(CAPTURE_SRC)).toContain("from '@/lib/identity/normalize'")
  })

  it('the route stores exactly what the shared normalizer produces', async () => {
    const raw = '+44 (0) 7911 123456'.replace('(0) ', '')   // '+44 7911 123456'
    const expected = normalizePhoneE164(raw)
    expect(expected).toBe('+447911123456')

    await consentPost(req({ phone: raw, consent: true }, { 'x-forwarded-for': freshIp() }))
    const arg = mockPrisma.consentRecord.upsert.mock.calls[0][0]
    expect(arg.create.normalizedNumber).toBe(expected)
  })

  it('normalizer behaviour is unchanged (regression guard on the shared utility)', () => {
    expect(normalizePhoneE164('+2348012345678')).toBe('+2348012345678')
    expect(normalizePhoneE164('00234 801 234 5678')).toBe('+2348012345678')
    expect(normalizePhoneE164('0803 123 4567')).toBeNull()      // national — not convertible
    expect(normalizePhoneE164('123')).toBeNull()                 // too short
    expect(normalizePhoneE164('')).toBeNull()
    expect(normalizePhoneE164(null)).toBeNull()
  })
})

// ── 5. The three purposes are genuinely independent ─────────────────────

describe('the three consent purposes are independent', () => {
  it('the taxonomy is exactly the three agreed values', () => {
    expect(CONSENT_PURPOSES).toEqual(['SMS_CUSTOMER_CARE', 'SMS_MARKETING', 'WHATSAPP_MARKETING'])
    expect(CONSENT_STATUSES).toEqual(['GRANTED', 'NOT_GRANTED', 'REVOKED'])
    expect(isConsentPurpose('SMS_CUSTOMER_CARE')).toBe(true)
    expect(isConsentPurpose('EMAIL_MARKETING')).toBe(false)
    expect(isConsentStatus('GRANTED')).toBe(true)
    expect(isConsentStatus('SUBSCRIBED')).toBe(false)   // that vocabulary belongs to WhatsAppConsent
  })

  it('granting SMS_CUSTOMER_CARE touches no other purpose for the same number', async () => {
    await consentPost(req({ phone: '+2348012345678', consent: true }, { 'x-forwarded-for': freshIp() }))

    expect(mockPrisma.consentRecord.upsert).toHaveBeenCalledTimes(1)
    const calls = mockPrisma.consentRecord.upsert.mock.calls
    const purposesWritten = calls.map((c: [{ create: { purpose: string } }]) => c[0].create.purpose)
    expect(purposesWritten).toEqual(['SMS_CUSTOMER_CARE'])
    expect(purposesWritten).not.toContain('SMS_MARKETING')
    expect(purposesWritten).not.toContain('WHATSAPP_MARKETING')
  })

  it('the route can only ever address the SMS_CUSTOMER_CARE slot', () => {
    const src = code(ROUTE_SRC)
    expect(src).not.toContain('SMS_MARKETING')
    expect(src).not.toContain('WHATSAPP_MARKETING')
    // The one purpose it does name, it names as a literal on both branches.
    expect(src).toMatch(/purpose:\s*'SMS_CUSTOMER_CARE'/)
  })

  it('the database key is (number, purpose), which is what makes them independent', () => {
    const schema = read('prisma/schema.prisma')
    expect(schema).toContain('@@unique([normalizedNumber, purpose])')

    const sql = read(MIGRATION_SRC)
    expect(sql).toContain('uq_consent_records_number_purpose')
    expect(sql).toContain('ON consent_records (normalized_number, purpose)')
    // NOT unique on the number alone — that would collapse the purposes.
    expect(sql).not.toMatch(/UNIQUE\s+INDEX[^\n]*\(\s*normalized_number\s*\)/i)
  })
})

// ── 6. The WhatsApp Broadcast consent path is untouched ─────────────────

describe('WhatsAppConsent and lib/whatsapp/broadcast/consent.ts are untouched', () => {
  it('the broadcast eligibility module never mentions the new model', () => {
    const src = read('lib/whatsapp/broadcast/consent.ts')
    expect(src).not.toMatch(/consentRecord/i)
    expect(src).not.toMatch(/ConsentRecord/)
    expect(src).not.toMatch(/consent_records/)
    expect(src).not.toMatch(/SMS_CUSTOMER_CARE/)
    // It still decides on WhatsAppConsent's own vocabulary, unchanged.
    expect(src).toContain("export type ConsentStatus = 'SUBSCRIBED' | 'UNKNOWN' | 'OPTED_OUT'")
  })

  it('no broadcast module reads consent_records', () => {
    const dir = path.join(process.cwd(), 'lib/whatsapp/broadcast')
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(src).not.toMatch(/consentRecord/i)
      expect(src).not.toMatch(/consent_records/)
    }
  })

  it('this feature never reads or writes the whatsapp_consents store', () => {
    for (const f of [ROUTE_SRC, CAPTURE_SRC, PURPOSES_SRC, COMPONENT_SRC]) {
      const src = read(f)
      expect(src).not.toMatch(/prisma\.whatsAppConsent/i)
    }
    // The migration does not alter it either.
    const sql = read(MIGRATION_SRC)
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+whatsapp_consents/i)
    expect(sql).not.toMatch(/UPDATE\s+whatsapp_consents/i)
    expect(sql).not.toMatch(/DROP\s+TABLE\s+whatsapp_consents/i)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+whatsapp_consents/i)
  })

  it('the WhatsAppConsent Prisma model is byte-for-byte as it was', () => {
    const schema = read('prisma/schema.prisma')
    const model = schema.slice(
      schema.indexOf('model WhatsAppConsent {'),
      schema.indexOf('@@map("whatsapp_consents")') + '@@map("whatsapp_consents")\n}'.length,
    )
    // Every field, in its original form.
    for (const line of [
      'normalizedNumber String    @unique @map("normalized_number")',
      'status           String    @default("UNKNOWN") @map("status")',
      'source           String?   @map("source")',
      'evidence         String?   @map("evidence")',
      'consentedAt      DateTime? @map("consented_at")',
      'optedOutAt       DateTime? @map("opted_out_at")',
      'lead             Lead?     @relation(fields: [leadId], references: [id], onDelete: SetNull)',
    ]) {
      expect(model).toContain(line)
    }
    // And the new model did not smuggle itself in as a relation on it.
    expect(model).not.toMatch(/ConsentRecord/)
  })

  it('the new migration leaves the broadcast tables alone', () => {
    const sql = read(MIGRATION_SRC)
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"?WhatsAppBroadcast"?/i)
    expect(sql).not.toMatch(/whatsapp_broadcast_recipients[^\n]*(ALTER|DROP|INSERT|UPDATE)/i)
  })
})

// ── 7. Migration structure: RLS, CHECKs, additive-only ──────────────────

describe('the migration carries this repo’s RLS and CHECK posture', () => {
  const sql = read(MIGRATION_SRC)

  it('constrains purpose and status with TEXT + CHECK, never a native enum', () => {
    for (const p of CONSENT_PURPOSES) expect(sql).toContain(`'${p}'`)
    for (const s of CONSENT_STATUSES) expect(sql).toContain(`'${s}'`)
    expect(sql).toContain('chk_consent_records_purpose')
    expect(sql).toContain('chk_consent_records_status')
    expect(code(MIGRATION_SRC)).not.toMatch(/CREATE\s+TYPE/i)
  })

  it('refuses an undated GRANTED or REVOKED row at the database level', () => {
    expect(sql).toContain("CHECK (status <> 'GRANTED' OR consented_at IS NOT NULL)")
    expect(sql).toContain("CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL)")
  })

  it('only ever stores an E.164 number', () => {
    expect(sql).toContain('chk_consent_records_e164')
    expect(sql).toMatch(/normalized_number\s*~\s*'\^\\\+\[1-9\]/)
  })

  it('enables RLS with a service-role-only policy and revokes anon/authenticated', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE %I FROM anon, authenticated')
    expect(sql).toContain('FOR ALL TO service_role')
    expect(sql).toContain("'consent_records'")
    expect(sql).toContain('service_all_')
  })

  it('is additive only — nothing is dropped, truncated or re-cased', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i)
    expect(sql).not.toMatch(/DROP\s+COLUMN/i)
    expect(sql).not.toMatch(/DROP\s+INDEX/i)
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT/i)
    expect(sql).not.toMatch(/TRUNCATE/i)
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
  })

  it('is idempotent — every create is guarded', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS consent_records')
    const unguardedIdx = sql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/g)
    expect(unguardedIdx).toBeNull()
    // Constraints are added inside existence checks.
    for (const c of [
      'chk_consent_records_purpose', 'chk_consent_records_status',
      'chk_consent_records_granted_dated', 'chk_consent_records_revoked_dated',
      'chk_consent_records_e164',
    ]) {
      expect(sql).toContain(`WHERE conname = '${c}'`)
    }
  })

  it('ends with a validation SELECT and says it has not been run', () => {
    expect(sql).toContain('DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT')
    expect(sql).toContain('It has NOT been executed by the implementing agent')
    expect(sql).toContain('-- Expect:')
    expect(sql.lastIndexOf('SELECT')).toBeGreaterThan(sql.indexOf('COMMIT;'))
  })

  it('the Prisma model and the SQL agree on every column', () => {
    const schema = read('prisma/schema.prisma')
    const model = schema.slice(schema.indexOf('model ConsentRecord {'))
    for (const [prismaMap, sqlCol] of [
      ['normalized_number', 'normalized_number'],
      ['purpose', 'purpose'],
      ['status', 'status'],
      ['source', 'source'],
      ['capture_page', 'capture_page'],
      ['disclosure_version', 'disclosure_version'],
      ['ip_address', 'ip_address'],
      ['user_agent', 'user_agent'],
      ['evidence', 'evidence'],
      ['consented_at', 'consented_at'],
      ['revoked_at', 'revoked_at'],
    ]) {
      expect(model).toContain(`@map("${prismaMap}")`)
      expect(sql).toContain(sqlCol)
    }
    expect(model).toContain('@@map("consent_records")')
  })
})

// ── 8. The disclosure itself satisfies Twilio's A2P 10DLC review ────────

describe('the SMS consent disclosure carries every carrier-required element', () => {
  it.each(Object.entries(REQUIRED_DISCLOSURE_ELEMENTS))(
    'includes the %s',
    (_element, phrase) => {
      expect(SMS_CUSTOMER_CARE_DISCLOSURE).toContain(phrase)
    },
  )

  it('identifies the brand and describes SERVICE messages, not marketing', () => {
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toContain(
      'SMS messages from The Walz Travels Inc., operating as Walz Travels,',
    )
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toContain('bookings')
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toContain('customer support')
    // A CUSTOMER_CARE campaign must not promise promotional content.
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).not.toMatch(/promotion|marketing|offers|deals/i)
  })

  it('carries a STOP/HELP pair, as Twilio requires', () => {
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toMatch(/Reply STOP to opt out or HELP for help/)
  })

  it('the rendered component is driven by the audited constant and links both policies', () => {
    const jsx = read(COMPONENT_SRC)
    // The sentence is rendered FROM the constant — it cannot drift.
    expect(jsx).toContain('{SMS_CUSTOMER_CARE_DISCLOSURE_BODY}')
    expect(jsx).toContain('Terms &amp; Conditions')
    expect(jsx).toContain('Privacy Policy')
  })

  it('the disclosure is EXACTLY the owner-approved wording, at version sms-customer-care-v2', () => {
    expect(SMS_CUSTOMER_CARE_DISCLOSURE_BODY).toBe(
      'I agree to receive SMS messages from The Walz Travels Inc., operating as Walz Travels, regarding my travel enquiries, bookings, payments, itinerary updates, visa-service updates and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.',
    )
    expect(SMS_CUSTOMER_CARE_DISCLOSURE).toBe(
      SMS_CUSTOMER_CARE_DISCLOSURE_BODY + ' See our Terms & Conditions and Privacy Policy.',
    )
    expect(SMS_CUSTOMER_CARE_DISCLOSURE_VERSION).toBe('sms-customer-care-v2')
  })
})

// ── 9. The component's structural compliance rules ──────────────────────

describe('the consent checkbox is structurally compliant', () => {
  const jsx = read(COMPONENT_SRC)
  const jsxCode = code(COMPONENT_SRC)

  it('is a controlled checkbox with no defaultChecked anywhere', () => {
    expect(jsxCode).toContain('type="checkbox"')
    expect(jsxCode).toContain('checked={checked}')
    expect(jsxCode).not.toContain('defaultChecked')
    // No prop that would let a caller start it ticked.
    expect(jsxCode).not.toMatch(/initialChecked|startChecked|defaultValue\s*=\s*\{?\s*true/)
  })

  it('is never a required field — consent is not a condition of purchase', () => {
    expect(jsxCode).not.toMatch(/\brequired\b/)
    expect(jsxCode).not.toMatch(/aria-required/)
  })

  it('exposes no "select all" / bundling hook', () => {
    expect(jsxCode).not.toMatch(/selectAll|checkAll|groupOnChange|acceptAll/i)
  })

  it('links to the real Privacy and Terms pages, never a placeholder href', () => {
    expect(PRIVACY_POLICY_PATH).toBe('/privacy')
    expect(TERMS_PATH).toBe('/terms')
    expect(jsx).toContain('href={TERMS_PATH}')
    expect(jsx).toContain('href={PRIVACY_POLICY_PATH}')
    expect(jsx).not.toMatch(/href="#"/)
    // And those pages genuinely exist.
    expect(fs.existsSync(path.join(process.cwd(), 'app/privacy/page.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'app/terms/page.tsx'))).toBe(true)
  })

  it('is not nested inside, or driven by, a Terms acceptance checkbox', () => {
    for (const src of [
      'app/(public)/flights/traveller/page.tsx',
      'components/booking/PassengerForm.tsx',
      'app/hotels/book/page.tsx',
    ]) {
      const page = read(src)
      // The call site never sets consent state itself: the hook's boxes
      // are rendered via `sms.fields` and are the only thing that toggles it.
      expect(page).not.toMatch(/setSmsConsent\(/)
      expect(page).not.toMatch(/sms\.setCustomerCare\(/)
      expect(page).toContain('{sms.fields}')
    }
  })

  it('is wired into all three booking checkouts and posts to the consent route', () => {
    // Wiring now goes through useSmsConsent (which renders the customer-care
    // box and posts via lib/consent/client).
    expect(read('lib/consent/client.ts')).toContain('/api/consent/sms-customer-care')
    for (const src of [
      'app/(public)/flights/traveller/page.tsx',
      'components/booking/PassengerForm.tsx',
      'app/hotels/book/page.tsx',
    ]) {
      expect(read(src)).toContain('useSmsConsent()')
      expect(read(src)).toContain('sms.record(')
      expect(read(src)).toContain('{sms.fields}')
    }
    expect(read('app/book/page.tsx')).toContain('PassengerForm')
  })
})

// ── 11. /hotels/book — the third call site (Twilio 30896's actual page) ─

describe('the /hotels/book checkout is a third, additive call site', () => {
  const HOTELS_BOOK_SRC = 'app/hotels/book/page.tsx'
  const jsx = read(HOTELS_BOOK_SRC)
  const jsxCode = code(HOTELS_BOOK_SRC)

  it('collects a phone number and reuses the SAME reusable component, unmodified', () => {
    expect(jsx).toContain("import { useSmsConsent } from '@/components/consent/useSmsConsent'")
    expect(jsx).toContain('const sms = useSmsConsent()')
    expect(jsx).toContain('{sms.fields}')
  })

  it('initialises the checkbox state to false, exactly like the other two call sites', () => {
    // (the unticked default now lives in the shared hook)
    expect(jsxCode).toContain('const sms = useSmsConsent()')
    expect(jsxCode).not.toMatch(/useState\(\s*true\s*\)[^\n]*[Cc]onsent/)
  })

  it('fires the SAME fire-and-forget POST to the existing consent route, with the correct capture page', () => {
    // Recorded through the hook (fire-and-forget: `void`, never awaited;
    // the hook posts only ticked boxes via lib/consent/client, which
    // swallows failures and never throws).
    expect(jsxCode).toMatch(/void sms\.record\(\{[^}]*capturePage: '\/hotels\/book'/)
    expect(jsxCode).not.toMatch(/await sms\.record/)
  })

  it('introduces no second consent-capture code path — no direct Prisma access, no second route, no second normalizer', () => {
    expect(jsx).not.toMatch(/prisma\./i)
    expect(jsx).not.toMatch(/consentRecord/i)
    expect(jsx).not.toMatch(/\/api\/consent\/(?!sms-customer-care)/)
    expect(jsx).not.toMatch(/function\s+normalize\w*Phone/i)
  })

  it('the only Prisma write in the whole feature is still the single-row consentRecord upsert, with the third call site added', () => {
    const src = read(CAPTURE_SRC)
    const writes = src.match(/prisma\.\w+\.(create|upsert|update|delete|createMany|updateMany|deleteMany)/g) ?? []
    expect(writes).toEqual(['prisma.consentRecord.upsert'])
  })

  it('implies no SMS_MARKETING or WhatsApp marketing consent', () => {
    expect(jsx).not.toContain('SMS_MARKETING')
    expect(jsx).not.toContain('WHATSAPP_MARKETING')
    expect(jsx).not.toMatch(/prisma\.whatsAppConsent/i)
  })

  it('the checkbox is optional — Continue to Payment does not require it to be checked', () => {
    // validate() (the gate before payment) never inspects smsConsent.
    const validateFn = jsxCode.slice(jsxCode.indexOf('function validate('), jsxCode.indexOf('function handleContinueToPayment('))
    expect(validateFn).not.toMatch(/smsConsent/)
  })

  it('a genuinely checked submission from /hotels/book records exactly one GRANTED row, same as the other call sites', async () => {
    const res = await consentPost(
      req(
        { phone: '+2348012345678', consent: true, capturePage: '/hotels/book' },
        { 'x-forwarded-for': freshIp() },
      ),
    )
    await expect(res.json()).resolves.toEqual({
      recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED',
    })
    expect(mockPrisma.consentRecord.upsert).toHaveBeenCalledTimes(1)
    const arg = mockPrisma.consentRecord.upsert.mock.calls[0][0]
    expect(arg.create.purpose).toBe('SMS_CUSTOMER_CARE')
    expect(arg.create.capturePage).toBe('/hotels/book')
  })

  it('an unticked submission from /hotels/book writes nothing — same guarantee as the other call sites', async () => {
    const res = await consentPost(
      req({ phone: '+2348012345678', consent: false, capturePage: '/hotels/book' }, { 'x-forwarded-for': freshIp() }),
    )
    await expect(res.json()).resolves.toEqual({ recorded: false, reason: 'NOT_CHECKED' })
    expect(mockPrisma.consentRecord.upsert).not.toHaveBeenCalled()
  })
})

// ── 10. Privacy / Terms now satisfy the A2P disclosure requirements ─────

describe('the legal content closes the Twilio gaps', () => {
  const privacyS5 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s5')!
  const termsS13  = TERMS_SECTIONS.find((s) => s.key === 'terms_s13')!

  it('Privacy §5 names MOBILE INFORMATION and AFFILIATES, as Twilio requires', () => {
    expect(privacyS5.body).toContain('Mobile information')
    expect(privacyS5.body).toContain('mobile phone number')
    expect(privacyS5.body).toContain('third parties or affiliates')
    expect(privacyS5.body).toMatch(/marketing or promotional purposes/)
  })

  it('Terms §13 covers frequency, rates, STOP, HELP and not-a-condition-of-purchase', () => {
    expect(termsS13.title).toBe('13. SMS Messaging')
    expect(termsS13.body).toContain('Message frequency varies. Message and data rates may apply.')
    expect(termsS13.body).toContain('Reply STOP to opt out. Reply HELP for help.')
    expect(termsS13.body).toContain('Consent is not a condition of purchase.')
  })

  it('Terms §13 names the sender entity and describes customer-care messages only', () => {
    expect(termsS13.body).toContain('Sender:\nThe Walz Travels Inc., operating as Walz Travels.')
    expect(termsS13.body).not.toMatch(/promotional (messages|SMS)|separate opt-ins|occasional promotional offers/)
  })

  it('the earlier v1 SQL script still carries the Privacy §5 text (unchanged); Terms §13 is superseded by a2p v2', () => {
    const sql = read(LEGAL_SQL_SRC)
    expect(sql).toContain(privacyS5.body)
    // consent_legal_content_v1.sql carries the OLD terms_s13 body on purpose
    // (history); a2p_entity_legal_content_v1.sql supersedes it and is
    // verified against the current TS source in a2p-entity-consent.test.ts.
    expect(sql).not.toContain(termsS13.body)
  })

  it('the SQL update script is idempotent, scoped to two rows, and unexecuted', () => {
    const sql = read(LEGAL_SQL_SRC)
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE')
    expect(sql).toContain('DO NOT RUN THIS UNTIL YOU HAVE REVIEWED IT')
    expect(sql).toContain('It has NOT been executed by the implementing agent')
    const keys = sql.match(/'(privacy|terms)_s\d+_body'/g) ?? []
    expect(new Set(keys)).toEqual(new Set(["'privacy_s5_body'", "'terms_s13_body'"]))
    expect(sql).not.toMatch(/DELETE\s+FROM/i)
    expect(sql).not.toMatch(/DROP\s+/i)
  })

  it('no other privacy/terms section was disturbed', () => {
    expect(PRIVACY_SECTIONS).toHaveLength(13)   // s13 (SMS and Mobile Messaging) appended
    expect(TERMS_SECTIONS).toHaveLength(14)
    expect(PRIVACY_SECTIONS.map((s) => s.key)).toContain('privacy_s7')
    expect(PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s7')!.anchorId).toBe('data-deletion')
  })
})
