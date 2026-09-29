/**
 * @jest-environment node
 *
 * My Walz Phase 1 — Walz Miles wallet (read-only).
 *
 * Rules under test:
 *  1. Category mapping only maps to REAL WalzMilesTransaction.type values —
 *     never invents a category for an unknown type.
 *  2. A client with no WalzRewardsMembership row gets a correct "0 Walz
 *     Miles" zero-state, WITHOUT the read path creating a membership row.
 *  3. The wallet reader never writes to the ledger (no .create/.update calls
 *     on walzRewardsMembership or walzMilesTransaction).
 *  4. The wallet page requires an authenticated session (ownership) and
 *     never accepts a client-supplied userId.
 *  5. No stated currency/monetary conversion value anywhere in the wallet
 *     page or the Home dashboard, near Miles.
 *  6. No redemption action/button/POST anywhere in the wallet page.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

// ── DB mock ──────────────────────────────────────────────────────────────────
const mockDb = {
  walzRewardsMembership: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))

/* eslint-disable @typescript-eslint/no-var-requires */
const { getMilesWalletData, categorizeMilesTransactionType } = require('@/lib/portal/miles-data')

beforeEach(() => jest.clearAllMocks())

// ═════════════════════════════════════════════════════════════════════════════
describe('categorizeMilesTransactionType — maps only real schema type values', () => {
  it('maps the real earned type to Booking Earn', () => {
    expect(categorizeMilesTransactionType('earned')).toBe('Booking Earn')
  })
  it('maps bonus/adjustment/reversal/expiry to their labels', () => {
    expect(categorizeMilesTransactionType('bonus')).toBe('Bonus')
    expect(categorizeMilesTransactionType('adjustment')).toBe('Adjustment')
    expect(categorizeMilesTransactionType('reversal')).toBe('Reversal')
    expect(categorizeMilesTransactionType('expiry')).toBe('Expiry')
  })
  it('falls back to Other for an unrecognised type rather than inventing a label', () => {
    expect(categorizeMilesTransactionType('some_future_type')).toBe('Other')
  })
})

describe('getMilesWalletData — zero-state for a client who has never earned Miles', () => {
  it('returns enrolled:false, 0 balance, empty activity — and does NOT create a membership row', async () => {
    mockDb.walzRewardsMembership.findUnique.mockResolvedValue(null)

    const wallet = await getMilesWalletData('user_no_miles')

    expect(wallet.enrolled).toBe(false)
    expect(wallet.milesBalance).toBe(0)
    expect(wallet.lifetimeMiles).toBe(0)
    expect(wallet.activity).toEqual([])
    expect(mockDb.walzRewardsMembership.create).not.toHaveBeenCalled()
    expect(mockDb.walzRewardsMembership.upsert).not.toHaveBeenCalled()
    expect(mockDb.walzRewardsMembership.update).not.toHaveBeenCalled()
  })
})

describe('getMilesWalletData — authoritative balance for an enrolled client', () => {
  it('returns the real balance/lifetime/tier and maps ledger rows to categories, never mutating anything', async () => {
    mockDb.walzRewardsMembership.findUnique.mockResolvedValue({
      milesBalance: 1250,
      lifetimeMiles: 4300,
      tier: 'silver',
      joinedAt: new Date('2026-01-01'),
      transactions: [
        { type: 'earned', description: 'Booking confirmed', miles: 250, createdAt: new Date('2026-02-01') },
        { type: 'bonus', description: null, miles: 100, createdAt: new Date('2026-01-15') },
      ],
    })

    const wallet = await getMilesWalletData('user_with_miles')

    expect(wallet.enrolled).toBe(true)
    expect(wallet.milesBalance).toBe(1250)
    expect(wallet.lifetimeMiles).toBe(4300)
    expect(wallet.tier).toBe('silver')
    expect(wallet.activity).toHaveLength(2)
    expect(wallet.activity[0].category).toBe('Booking Earn')
    expect(wallet.activity[1].category).toBe('Bonus')
    expect(wallet.activity[1].description).toBe('Bonus') // falls back to category label when no description
    expect(mockDb.walzRewardsMembership.create).not.toHaveBeenCalled()
    expect(mockDb.walzRewardsMembership.update).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('app/dashboard/miles/page.tsx — source-level guarantees', () => {
  const src = readSource('app/dashboard/miles/page.tsx')

  it('requires an authenticated session and redirects otherwise (ownership)', () => {
    expect(src).toContain('getServerSession(authOptions)')
    expect(src).toContain("redirect('/login?callbackUrl=/dashboard/miles')")
  })

  it('reads Miles for session.user.id only — never a client-supplied id', () => {
    expect(src).toContain('getMilesWalletData(session.user.id)')
    expect(src).not.toMatch(/searchParams\.\w*(userId|user_id)/i)
  })

  it('never states a Miles-to-currency conversion value', () => {
    // e.g. "100 miles = £1" style copy is permanently forbidden near Miles.
    expect(src).not.toMatch(/\d+\s*(walz\s*)?miles?\s*=\s*[£$€]/i)
    expect(src).not.toMatch(/[£$€]\s*\d+.*miles?/i)
  })

  it('has no redemption action of any kind', () => {
    expect(src).not.toMatch(/redeem/i)
    expect(src).not.toContain('/api/flights/loyalty')
    expect(src).toContain('Redemption benefits are coming soon')
  })

  it('never exposes an internal transaction id in the rendered activity list', () => {
    // React keys use array index, not a DB id, and the DTO from miles-data.ts
    // deliberately omits `id` — see lib/portal/miles-data.ts.
    expect(src).toMatch(/wallet\.activity\.map\(\(row, i\)/)
  })
})

describe('lib/portal/miles-data.ts — read-only ledger access', () => {
  const src = readSource('lib/portal/miles-data.ts')

  it('never writes to WalzRewardsMembership or WalzMilesTransaction', () => {
    expect(src).not.toMatch(/walzRewardsMembership\.(create|update|upsert|delete)/)
    expect(src).not.toMatch(/walzMilesTransaction\.(create|update|upsert|delete)/)
  })

  it('does not return raw internal DB ids in the activity DTO', () => {
    expect(src).not.toMatch(/id:\s*t\.id/)
  })

  it('does not fabricate pending/expiring figures the schema cannot support', () => {
    expect(src).not.toMatch(/pending:\s*\d/)
    expect(src).not.toMatch(/expiring:\s*\d/)
  })
})
