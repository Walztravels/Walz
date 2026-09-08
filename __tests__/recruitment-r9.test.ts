/**
 * Recruitment Hub — Release 9 (offers & talent pools).
 *
 * Covers: offer input validation, offer token security, the respond flow
 * (once only, sent-only, expiry, withdrawn), no-stage-writes invariant,
 * route security (management-only drafting/sending, single open offer,
 * post-commit candidate email), candidate page behavior, talent pool
 * add/remove semantics, and migration invariants.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const offers = new Map<string, Record<string, unknown>>()
let seq = 0

const db = {
  jobOffer: {
    findUnique: jest.fn(async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
      const rows = [...offers.values()]
      const row = where.tokenHash ? rows.find(r => r.tokenHash === where.tokenHash) : rows.find(r => r.id === where.id)
      return row ? { ...row } : null
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = offers.get(where.id)
      if (row) Object.assign(row, data)
      return row
    }),
  },
  jobApplication: { findUnique: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

import {
  validateOfferInput, newOfferToken, respondToOffer, offerExpired, OFFER_STATUSES,
} from '@/lib/recruitment/offers'
import { hashToken } from '@/lib/recruitment/applications'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

beforeEach(() => { offers.clear(); jest.clearAllMocks() })

// ── Offer validation & tokens ─────────────────────────────────────────────────

describe('validateOfferInput', () => {
  it('applies defaults and validates types, amounts, currencies, dates', () => {
    expect(validateOfferInput({})).toMatchObject({
      ok: true, value: { compensationType: 'salary', currency: 'NGN', compensationAmount: null },
    })
    expect(validateOfferInput({ compensationType: 'equity' })).toMatchObject({ ok: false })
    expect(validateOfferInput({ compensationAmount: -5 })).toMatchObject({ ok: false })
    expect(validateOfferInput({ startDate: 'not-a-date' })).toMatchObject({ ok: false })
    const ok = validateOfferInput({ compensationType: 'commission', compensationAmount: '150000', currency: 'usd' })
    expect(ok).toMatchObject({ ok: true, value: { compensationAmount: 150000, currency: 'NGN' } }) // bad currency → default
  })
  it('exposes the closed status vocabulary', () => {
    expect([...OFFER_STATUSES]).toEqual(['draft', 'sent', 'accepted', 'declined', 'withdrawn', 'expired'])
  })
})

describe('offer tokens', () => {
  it('are random, hashed and expire in 14 days', () => {
    const a = newOfferToken()
    expect(a.token.length).toBeGreaterThanOrEqual(32)
    expect(a.hash).toBe(hashToken(a.token))
    const days = (a.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThan(14.1)
    expect(offerExpired({ tokenExpiresAt: new Date(Date.now() - 1) })).toBe(true)
    expect(offerExpired({ tokenExpiresAt: null })).toBe(false)
  })
})

// ── Respond flow ──────────────────────────────────────────────────────────────

describe('respondToOffer', () => {
  function seed(over: Record<string, unknown> = {}) {
    const { token, hash, expiresAt } = newOfferToken()
    const row = { id: `of_${++seq}`, applicationId: 'app_1', status: 'sent', tokenHash: hash, tokenExpiresAt: expiresAt, ...over }
    offers.set(row.id as string, row)
    return { token, row }
  }

  it('records accept and decline exactly once, with an optional note', async () => {
    const { token, row } = seed()
    expect(await respondToOffer(token, 'accepted', '  Can I start on the 1st?  ')).toEqual({ ok: true, status: 'accepted' })
    const saved = offers.get(row.id as string)!
    expect(saved.status).toBe('accepted')
    expect(saved.candidateNote).toBe('Can I start on the 1st?')
    expect(saved.respondedAt).toBeInstanceOf(Date)
    // second answer refused
    expect(await respondToOffer(token, 'declined', null)).toMatchObject({ ok: false, status: 409 })
  })

  it('validates decisions and token states', async () => {
    const { token } = seed()
    expect(await respondToOffer(token, 'maybe', null)).toMatchObject({ ok: false, status: 400 })
    expect(await respondToOffer('bad-token-bad-token', 'accepted', null)).toMatchObject({ ok: false, status: 404 })
    const { token: t2 } = seed({ status: 'withdrawn' })
    expect(await respondToOffer(t2, 'accepted', null)).toMatchObject({ ok: false, status: 410 })
    const { token: t3 } = seed({ status: 'draft' })
    expect(await respondToOffer(t3, 'accepted', null)).toMatchObject({ ok: false, status: 409 })
    const { token: t4 } = seed({ tokenExpiresAt: new Date(Date.now() - 1000) })
    expect(await respondToOffer(t4, 'accepted', null)).toMatchObject({ ok: false, status: 410 })
  })

  it('never touches the pipeline stage', () => {
    const lib = read('lib/recruitment/offers.ts')
    expect(lib).not.toMatch(/stageKey\s*[:=]/)      // no stage writes (the doc comment may mention it)
    expect(lib).not.toMatch(/jobApplication\.update/)
    expect(lib).not.toMatch(/moveApplicationStage/)
  })
})

// ── Route invariants ──────────────────────────────────────────────────────────

describe('offer routes', () => {
  it('admin route: management-only, single open offer, post-commit email, no raw token in GET', () => {
    const src = read('app/api/admin/recruitment/applications/[id]/offers/route.ts')
    expect(src).toContain('getAdminSession')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.offers.manage')")
    expect(src).toContain('already open for this application')
    expect(src).toContain('{ status: 409 }')
    // send: DB update happens before the email
    expect(src.indexOf("status: 'sent', tokenHash")).toBeLessThan(src.indexOf('emails.send'))
    // GET select never exposes token material
    expect(src.slice(src.indexOf('findMany'), src.indexOf('// POST'))).not.toContain('tokenHash')
  })
  it('public route: rate-limited, minimal fields, team notified post-commit', () => {
    const src = read('app/api/careers/offer/[token]/route.ts')
    expect(src).toContain('rateLimit')
    expect(src).toContain('{ status: 429 }')
    // the candidate-facing GET exposes only firstName + reference + offer content
    const getHandler = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function POST'))
    expect(getHandler).not.toMatch(/lastName|email: true|phone/)
    expect(src.indexOf('respondToOffer')).toBeLessThan(src.indexOf('emails.send'))
    expect(src).toContain("to:      NOTIFY_TO")
  })
})

// ── Candidate offer page ──────────────────────────────────────────────────────

describe('offer page', () => {
  const src = read('app/careers/offer/[token]/page.tsx')
  it('confirms before responding and handles all terminal states', () => {
    expect(src).toContain('confirm(')
    for (const s of ['withdrawn', 'accepted', 'declined']) expect(src).toContain(s)
    expect(src).toContain('You can respond once')
  })
})

// ── Talent pool ───────────────────────────────────────────────────────────────

describe('talent pool', () => {
  const src = read('app/api/admin/recruitment/talent-pool/route.ts')
  it('is authenticated, management-gated for writes, idempotent per candidate, audited', () => {
    expect(src).toContain('getAdminSession')
    expect(src).toContain("hasRecruitmentPermission(session, 'recruitment.candidates.manage')")
    expect(src).toContain('already in the talent pool')
    expect(src).toContain("recruitmentAudit(session, 'Talent Pool Added'")
    expect(src).toContain("recruitmentAudit(session, 'Talent Pool Removed'")
  })
  it('the pool page removes on request and links candidate profiles', () => {
    const page = read('app/admin/recruitment/talent-pool/page.tsx')
    expect(page).toContain("method: 'DELETE'")
    expect(page).toContain('asks not to be contacted')
    expect(page).toContain('/admin/recruitment/candidates/')
    expect(read('lib/admin/permissions.ts')).toContain('/admin/recruitment/talent-pool')
  })
  it('candidates are added from their profile page', () => {
    expect(read('app/admin/recruitment/candidates/[id]/page.tsx')).toContain('Add to talent pool')
  })
})

// ── UI wiring & migration ─────────────────────────────────────────────────────

describe('offers UI and migration', () => {
  it('the offers section is embedded and never moves stages itself', () => {
    expect(read('app/admin/recruitment/applications/[id]/page.tsx')).toContain('OffersSection')
    const section = read('components/admin/recruitment/OffersSection.tsx')
    expect(section).toContain('move the pipeline stage above')
    expect(section).toContain('confirm(')
  })
  it('recruitment_r9 migration creates both tables idempotently', () => {
    const sql = read('prisma/migrations/recruitment_r9_offers_talent_pool.sql')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "JobOffer"')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "TalentPoolEntry"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "JobOffer_tokenHash_key"')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "TalentPoolEntry_candidateId_key"')
  })
})
