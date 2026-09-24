/**
 * Privacy Policy / Terms of Service → SiteContent migration.
 *
 * Covers:
 *  - Verbatim fidelity of the migrated legal text vs. the previously
 *    hardcoded pages, plus the two new Twilio A2P 10DLC SMS compliance
 *    additions (exact wording).
 *  - Access control on /api/admin/content/site: privacy/terms groups are
 *    super_admin only (both GET visibility and POST — fail closed), while
 *    the existing about/homepage/general groups keep their prior,
 *    unrestricted-by-role behavior unchanged.
 */

import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/lib/content/legal-content'

// ── Mocks (route handlers under test) ──────────────────────────────────────

let session: { role: string } | null = { role: 'super_admin' }
jest.mock('@/lib/admin-auth', () => ({
  getAdminSession: jest.fn(async () => session),
}))

// A small stateful fake — not just a spy — so a POST write is actually
// visible to a subsequent findMany read, letting the "write-then-read"
// tests below exercise the real save → refetch path end to end.
type Row = { key: string; value: string; label: string; group: string }
const store = new Map<string, Row>()
const upsertCalls: Array<{ where: { key: string }; update: { value: string } }> = []
const db = {
  siteContent: {
    findMany: jest.fn(async (args?: { where?: { group?: string } }) => {
      const rows = [...store.values()]
      return args?.where?.group ? rows.filter((r) => r.group === args.where!.group) : rows
    }),
    upsert: jest.fn(async (args: { where: { key: string }; update: { value: string }; create: Row }) => {
      upsertCalls.push(args)
      const existing = store.get(args.where.key)
      const row: Row = existing ? { ...existing, value: args.update.value } : args.create
      store.set(args.where.key, row)
      return { id: 'sc_1', ...row }
    }),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

import { GET, POST } from '@/app/api/admin/content/site/route'

function jsonRequest(body: Record<string, string>) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  upsertCalls.length = 0
  store.clear()
  db.siteContent.findMany.mockClear()
  db.siteContent.upsert.mockClear()
})

/** Mirrors the merge in app/privacy|terms/page.tsx's getSections() exactly. */
function mergeWithDefaults(rows: Row[], defaults: { key: string; title: string; body: string }[]) {
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return defaults.map((s) => ({
    ...s,
    title: map[`${s.key}_title`] ?? s.title,
    body:  map[`${s.key}_body`]  ?? s.body,
  }))
}

// ── Verbatim content fidelity ───────────────────────────────────────────────

describe('legal content fidelity', () => {
  /**
   * UPDATED by Walz Consent Foundation V1 (A2P 10DLC).
   *
   * The sentence this test previously pinned —
   *   "We do not sell or share your SMS opt-in data or personal
   *    information with third parties for marketing purposes."
   * — did not satisfy Twilio's actual A2P 10DLC review requirement, which
   * asks for MOBILE INFORMATION (the phone number itself, not only "opt-in
   * data") and names AFFILIATES alongside third parties. Twilio rejected
   * the CUSTOMER_CARE campaign with error 30896. The replacement below is
   * pinned just as strictly; the original no-sale sentence is untouched.
   */
  it('privacy §5 (Data Sharing) keeps the original no-sale sentence and carries the A2P mobile-information sentence', () => {
    const s5 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s5')
    expect(s5).toBeDefined()
    expect(s5!.body).toContain('We do not sell your personal data to third parties for marketing purposes.')
    expect(s5!.body).toContain(
      'Mobile information — including your mobile phone number and your SMS opt-in consent — will not be shared with third parties or affiliates for marketing or promotional purposes.'
    )
    expect(s5!.body).toContain(
      'excluded from every category of data sharing described above'
    )
  })

  it('privacy §7 (Your Rights) keeps its data-deletion anchor id for the Meta callback URL', () => {
    const s7 = PRIVACY_SECTIONS.find((s) => s.key === 'privacy_s7')
    expect(s7?.anchorId).toBe('data-deletion')
    expect(s7?.title).toBe('7. Your Rights')
  })

  /**
   * UPDATED by Walz Consent Foundation V1 (A2P 10DLC).
   *
   * The previous single paragraph bundled "occasional promotional offers"
   * into the SAME opt-in as booking and support messages. That directly
   * contradicts a CUSTOMER_CARE campaign registration and contradicts the
   * new consent checkbox, which promises service messages only. The
   * section now separates the two programmes. Every element the old
   * assertion locked (frequency, rates, STOP, HELP, carrier non-liability)
   * is still pinned below, plus the not-a-condition-of-purchase statement.
   */
  it('terms "SMS Messaging" carries the SMS program sentence, sender, message types and every required element', () => {
    const smsSection = TERMS_SECTIONS.find((s) => s.title.includes('SMS Messaging'))
    expect(smsSection).toBeDefined()
    const body = smsSection!.body

    expect(body).toContain(
      'SMS communications under the Canadian messaging program are provided by The Walz Travels Inc., operating under the Walz Travels brand.'
    )
    expect(body).toContain('Sender:\nThe Walz Travels Inc., operating as Walz Travels.')
    for (const t of [
      'travel enquiries', 'booking confirmations', 'booking updates',
      'itinerary notifications', 'payment reminders', 'visa-service notifications',
      'appointment and consultation reminders', 'customer-support communications',
    ]) {
      expect(body).toContain(t)
    }
    expect(body).toContain('Message frequency varies. Message and data rates may apply.')
    expect(body).toContain('Reply STOP to opt out. Reply HELP for help.')
    expect(body).toContain('Consent is not a condition of purchase.')
    expect(body).toContain('with third parties or affiliates for their marketing or promotional purposes')
    expect(body).not.toContain('occasional promotional offers')
  })

  it('terms still ends with a Contact section after the SMS Messaging insertion', () => {
    const last = TERMS_SECTIONS[TERMS_SECTIONS.length - 1]
    expect(last.title).toBe('14. Contact')
    expect(last.body).toContain('Email: contact@walztravels.com')
  })

  it('all section keys are unique across both pages (no SiteContent key collisions)', () => {
    const keys = [...PRIVACY_SECTIONS, ...TERMS_SECTIONS].map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every original privacy section title is preserved verbatim (1 through 12, unrenumbered) and s13 is appended', () => {
    const titles = PRIVACY_SECTIONS.map((s) => s.title)
    expect(titles).toEqual([
      '1. Who We Are',
      '2. Information We Collect',
      '3. How We Use Your Information',
      '4. Legal Basis for Processing',
      '5. Data Sharing',
      '6. Data Retention',
      '7. Your Rights',
      '8. Cookies',
      '9. International Transfers',
      '10. Security',
      '11. Changes to This Policy',
      '12. Contact Us',
      '13. SMS and Mobile Messaging',
    ])
  })

  it('every original terms section title is preserved, renumbered only where the new section was inserted', () => {
    const titles = TERMS_SECTIONS.map((s) => s.title)
    expect(titles).toEqual([
      '1. About These Terms',
      '2. Our Services',
      '3. Bookings and Payments',
      '4. Cancellations and Refunds',
      '5. Visa Assistance',
      '6. Travel Documents',
      '7. Liability',
      '8. Gift Vouchers',
      '9. Intellectual Property',
      '10. Privacy',
      '11. Governing Law',
      '12. Changes to These Terms',
      '13. SMS Messaging',
      '14. Contact',
    ])
  })
})

// ── Access control ───────────────────────────────────────────────────────────

describe('GET /api/admin/content/site — role gating', () => {
  it('returns 401 with no session', async () => {
    session = null
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('super_admin sees privacy/terms keys alongside existing groups', async () => {
    session = { role: 'super_admin' }
    const res = await GET()
    const body = await res.json()
    expect(body.privacy_s5_body?.group).toBe('privacy')
    // The new s13 section flows through the admin DEFAULTS pipeline.
    expect(body.privacy_s13_title?.value).toBe('13. SMS and Mobile Messaging')
    expect(body.privacy_s13_body?.group).toBe('privacy')
    expect(body.terms_s13_body?.group).toBe('terms')
    expect(body.about_company_story?.group).toBe('about') // existing group unaffected
  })

  it('non-super_admin does not see any privacy/terms keys, but still sees existing groups', async () => {
    session = { role: 'general_manager' }
    const res = await GET()
    const body = await res.json()
    expect(Object.keys(body).some((k) => k.startsWith('privacy_'))).toBe(false)
    expect(Object.keys(body).some((k) => k.startsWith('terms_'))).toBe(false)
    expect(body.about_company_story?.group).toBe('about')
    expect(body.home_hero_eyebrow?.group).toBe('homepage')
  })
})

describe('POST /api/admin/content/site — role gating', () => {
  it('super_admin can save a privacy or terms field', async () => {
    session = { role: 'super_admin' }
    const res = await POST(jsonRequest({ privacy_s5_body: 'updated text' }))
    expect(res.status).toBe(200)
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0].where.key).toBe('privacy_s5_body')
  })

  it('non-super_admin is rejected (403) when the payload touches a privacy field, and nothing is written', async () => {
    session = { role: 'general_manager' }
    const res = await POST(jsonRequest({ privacy_s5_body: 'attempted edit' }))
    expect(res.status).toBe(403)
    expect(upsertCalls).toHaveLength(0)
  })

  it('non-super_admin is rejected (403) when the payload touches a terms field, and nothing is written', async () => {
    session = { role: 'sales_rep' }
    const res = await POST(jsonRequest({ terms_s13_body: 'attempted edit' }))
    expect(res.status).toBe(403)
    expect(upsertCalls).toHaveLength(0)
  })

  it('non-super_admin can still save existing non-legal groups (about/homepage/general) — unchanged prior behavior', async () => {
    session = { role: 'general_manager' }
    const res = await POST(jsonRequest({ home_hero_eyebrow: 'new eyebrow' }))
    expect(res.status).toBe(200)
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0].where.key).toBe('home_hero_eyebrow')
  })

  it('a mixed payload touching both a legal and a non-legal key is rejected wholesale (fail closed)', async () => {
    session = { role: 'general_manager' }
    const res = await POST(jsonRequest({ home_hero_eyebrow: 'new eyebrow', terms_s13_body: 'attempted edit' }))
    expect(res.status).toBe(403)
    expect(upsertCalls).toHaveLength(0)
  })
})

// ── Write-then-read: admin save → public page refetch ──────────────────────
// Exercises the actual path a super_admin edit takes to reach /privacy or
// /terms: POST /api/admin/content/site (real route handler, above) writes a
// SiteContent row; the public page's getSections() (mirrored here via
// mergeWithDefaults, matching app/privacy/page.tsx and app/terms/page.tsx
// line for line) re-reads that same row on its next request and overrides
// the verbatim default with it — everything else stays unchanged.

describe('privacy_s13 renders from the code fallback when the DB has no s13 rows yet', () => {
  it('a DB holding only the older 12 privacy sections still yields s13 via the code default', async () => {
    const rows = PRIVACY_SECTIONS.filter((s) => s.key !== 'privacy_s13').flatMap((s) => [
      { key: `${s.key}_title`, value: s.title, label: '', group: 'privacy' },
      { key: `${s.key}_body`, value: s.body, label: '', group: 'privacy' },
    ])
    const merged = mergeWithDefaults(rows, PRIVACY_SECTIONS)
    expect(merged).toHaveLength(13)
    const s13 = merged.find((s) => s.key === 'privacy_s13')!
    expect(s13.title).toBe('13. SMS and Mobile Messaging')
    expect(s13.body).toContain('The Walz Travels Inc., operating as Walz Travels')
  })
})

describe('super_admin edit is reflected on the public page on next read', () => {
  it('editing one privacy section body updates only that section on re-fetch', async () => {
    session = { role: 'super_admin' }
    const res = await POST(jsonRequest({ privacy_s5_body: 'UPDATED data-sharing text for a compliance correction' }))
    expect(res.status).toBe(200)

    const rows = await db.siteContent.findMany({ where: { group: 'privacy' } })
    const merged = mergeWithDefaults(rows, PRIVACY_SECTIONS)

    const s5 = merged.find((s) => s.key === 'privacy_s5')!
    expect(s5.body).toBe('UPDATED data-sharing text for a compliance correction')

    // Every other section is untouched — still the verbatim default.
    const others = merged.filter((s) => s.key !== 'privacy_s5')
    const defaultsForOthers = PRIVACY_SECTIONS.filter((s) => s.key !== 'privacy_s5')
    expect(others).toEqual(defaultsForOthers)
  })

  it('editing the new terms SMS Messaging section is reflected, and a denied edit never reaches the store', async () => {
    session = { role: 'super_admin' }
    await POST(jsonRequest({ terms_s13_title: '13. SMS Messaging (Updated)' }))

    session = { role: 'sales_rep' }
    const denied = await POST(jsonRequest({ terms_s13_body: 'a non-super_admin should never be able to write this' }))
    expect(denied.status).toBe(403)

    const rows = await db.siteContent.findMany({ where: { group: 'terms' } })
    const merged = mergeWithDefaults(rows, TERMS_SECTIONS)
    const s13 = merged.find((s) => s.key === 'terms_s13')!

    expect(s13.title).toBe('13. SMS Messaging (Updated)') // the allowed super_admin edit landed
    expect(s13.body).toBe(TERMS_SECTIONS.find((s) => s.key === 'terms_s13')!.body) // the denied edit never landed
  })
})
