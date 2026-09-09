/**
 * Monierate BUY-side patch — regression suite.
 *
 * Business rule under test: an NGN customer buying foreign-currency value
 * pays the Monierate parallel BUY price (NGN required to obtain 1 unit).
 * SELL is never selected; the composite (current/average) is never the
 * commercial rate; anomalous provider data → Walz manual fallback → fail
 * closed. The $5 adjustment stays separate from the rate.
 */
import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const mockDb = {
  fxSettings:  { findUnique: jest.fn(), upsert: jest.fn() },
  fxQuoteLock: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  activityLog: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))

/* eslint-disable @typescript-eslint/no-var-requires */
const { createNgnQuote }            = require('@/lib/fx/quote')
const { getNgnRate }                = require('@/lib/fx/policy')
const { invalidateFxSettingsCache } = require('@/lib/fx/settings')
const { clearRateCache }            = require('@/lib/fx/cache')
const { NgnRateUnavailableError }   = require('@/lib/fx/types')

type FetchHandler = (url: string) => { ok: boolean; status?: number; json?: unknown }
let fetchHandler: FetchHandler = () => ({ ok: false, status: 500 })
const fetchCalls: string[] = []

beforeAll(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    const u = String(url)
    fetchCalls.push(u)
    const res = fetchHandler(u)
    return { ok: res.ok, status: res.status ?? (res.ok ? 200 : 500), json: async () => res.json ?? {} }
  }) as unknown as typeof fetch
})

/** Full pair-endpoint response with distinct buy/sell/current values. */
function pairResponse(price: { buy?: unknown; sell?: number; current?: number; average?: number },
                      opts: { code?: string; updatedAt?: string } = {}) {
  return {
    ok: true,
    json: {
      status: 'success',
      data: {
        pair: {
          ...(opts.code ? { code: opts.code } : {}),
          price,
          updatedAt: opts.updatedAt ?? new Date().toISOString(),
        },
      },
    },
  }
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fx-settings', rateMode: 'AUTO_MONIERATE', manualRates: {},
    adjustmentUsd: new Prisma.Decimal('5.00'), cacheMinutes: 10, lockMinutes: 15,
    isEnabled: true, updatedBy: null, updatedAt: new Date(), createdAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  clearRateCache()
  invalidateFxSettingsCache()
  fetchCalls.length = 0
  process.env.MONIERATE_API_KEY = 'test-key'
  delete process.env.MONIERATE_API_URL
  mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow())
  mockDb.fxQuoteLock.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lock_buy', ...data }))
})

// ═════════════════════════════════════════════════════════════════════════════
describe('BUY selection (never SELL, never composite)', () => {
  // Distinct values per field so a wrong selection is unmistakable.
  const CASES: Array<[string, string, { buy: number; sell: number; current: number }]> = [
    ['USD', '/pairs/usdngn', { buy: 1375.13, sell: 1369.08, current: 1373.04 }],
    ['GBP', '/pairs/gbpngn', { buy: 1868.11, sell: 1808.17, current: 1838.14 }],
    ['EUR', '/pairs/eurngn', { buy: 1605.98, sell: 1551.03, current: 1578.50 }],
    ['AED', '/pairs/aedngn', { buy: 361.10,  sell: 360.96,  current: 361.03  }],
  ]

  it.each(CASES)('%s→NGN selects price.buy — not sell, not composite', async (cur, pairPath, price) => {
    fetchHandler = url => url.includes(pairPath) ? pairResponse({ ...price, average: price.current }) : { ok: false, status: 500 }
    const rate = await getNgnRate(cur)
    expect(rate.rateSource).toBe('MONIERATE_PARALLEL_BUY')
    expect(rate.rawRate.toNumber()).toBe(price.buy)
    expect(rate.rawRate.toNumber()).not.toBe(price.sell)
    expect(rate.rawRate.toNumber()).not.toBe(price.current)
  })

  it('the provider source selects price.buy and never reads sell or composite as the rate', () => {
    const src = read('lib/fx/providers/monierate.ts')
    expect(src).toContain('const buy = price?.buy')
    expect(src).toContain("rawRate:       new Prisma.Decimal(String(buy))")
    // sell and current appear ONLY in validation, never as the selected rate
    expect(src).not.toMatch(/rawRate:\s*new Prisma\.Decimal\(String\((sell|current)\)\)/)
    // never averaged
    expect(src).not.toMatch(/\(buy \+ sell\)|\(sell \+ buy\)/)
    // never max(buy, current) substitution
    expect(src).not.toMatch(/Math\.max\(\s*buy/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('anomalous / invalid provider data → manual fallback, never composite', () => {
  const withManual = (cur: string, rate: string) =>
    mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow({ manualRates: { [cur]: rate } }))

  it('CAD inverted book (buy < sell, as observed live) → manual fallback', async () => {
    withManual('CAD', '975')
    fetchHandler = url => url.includes('/pairs/cadngn')
      ? pairResponse({ buy: 959.88, sell: 965.08, current: 965.08 })
      : { ok: false, status: 500 }
    const rate = await getNgnRate('CAD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
    expect(rate.rawRate.toString()).toBe('975')
  })

  it('BUY deviating beyond the named sanity threshold vs composite → manual fallback', async () => {
    withManual('USD', '1500')
    // 20% above composite — bad data, not a market move the composite agrees with
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ buy: 1650, sell: 1360, current: 1375 })
      : { ok: false, status: 500 }
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
  })

  it('missing BUY → manual fallback (composite present but never substituted)', async () => {
    withManual('USD', '1500')
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ sell: 1369, current: 1373 })
      : { ok: false, status: 500 }
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
    expect(rate.rawRate.toString()).toBe('1500')
  })

  it('zero / non-numeric BUY → manual fallback', async () => {
    withManual('USD', '1500')
    for (const bad of [0, -1, NaN, 'x' as unknown]) {
      clearRateCache()
      fetchHandler = url => url.includes('/pairs/usdngn')
        ? pairResponse({ buy: bad, sell: 1369, current: 1373 })
        : { ok: false, status: 500 }
      const rate = await getNgnRate('USD')
      expect(rate.rateSource).toBe('WALZ_MANUAL')
    }
  })

  it('stale pair (updatedAt older than the existing staleness policy) → manual fallback', async () => {
    withManual('USD', '1500')
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ buy: 1375, sell: 1369, current: 1373 }, { updatedAt: eightHoursAgo })
      : { ok: false, status: 500 }
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
  })

  it('pair-code mismatch → rejected → manual fallback', async () => {
    withManual('USD', '1500')
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ buy: 1375, sell: 1369, current: 1373 }, { code: 'gbpngn' })
      : { ok: false, status: 500 }
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
  })

  it('invalid BUY + no manual rate → fails closed (NGN_RATE_UNAVAILABLE)', async () => {
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ buy: 0, sell: 1369, current: 1373 })
      : { ok: false, status: 500 }
    await expect(getNgnRate('USD')).rejects.toBeInstanceOf(NgnRateUnavailableError)
  })

  it('rejected data is never bridged around via USD', async () => {
    withManual('CAD', '975')
    fetchHandler = url => {
      if (url.includes('/pairs/cadngn')) return pairResponse({ buy: 959.88, sell: 965.08, current: 965.08 }) // inverted → rejected
      if (url.includes('/pairs/usdngn')) return pairResponse({ buy: 1375, sell: 1369, current: 1373 })
      return { ok: true, json: { rates: { USD: 0.73 } } }
    }
    const rate = await getNgnRate('CAD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')       // not monierate+usd-bridge
    // The USD pair was never even needed for a rejected direct answer
    expect(fetchCalls.filter(u => u.includes('/pairs/usdngn')).length).toBe(0)
  })

  it('the sanity threshold is a named, documented constant', () => {
    const src = read('lib/fx/providers/monierate.ts')
    expect(src).toContain('MONIERATE_BUY_SANITY_MAX_DEVIATION = 0.10')
    expect(src).toContain('BAD PROVIDER DATA')
    expect(src).not.toMatch(/deviation > 0\.\d/)   // no magic number at the use site
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('$5 adjustment stays separate from the BUY rate', () => {
  it('quote math: (base + $5) × BUY, adjustment reported separately, rate never inflated', async () => {
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ buy: 1400, sell: 1390, current: 1395 })
      : { ok: false, status: 500 }
    const q = await createNgnQuote({ baseCurrency: 'USD', baseAmount: 2300, context: 'DISPLAY_ESTIMATE' })
    expect(q.rawRate.toNumber()).toBe(1400)                      // the real BUY, untouched
    expect(q.adjustmentUsd.toString()).toBe('5')
    expect(q.adjustedBaseAmount.toNumber()).toBe(2305)           // applied ONCE
    expect(q.convertedAmount.toNumber()).toBe(2305 * 1400)
    expect(q.effectiveRate.toNumber()).toBeGreaterThan(1400)     // derived, not the raw rate
  })

  it('quote lock persists the BUY rawRate and MONIERATE_PARALLEL_BUY source', async () => {
    fetchHandler = url => url.includes('/pairs/usdngn')
      ? pairResponse({ buy: 1400, sell: 1390, current: 1395 })
      : { ok: false, status: 500 }
    const q = await createNgnQuote({ baseCurrency: 'USD', baseAmount: 100, context: 'CHECKOUT' })
    expect(q.lockId).toBe('lock_buy')
    const data = mockDb.fxQuoteLock.create.mock.calls[0][0].data
    expect(data.rawRate.toNumber()).toBe(1400)
    expect(data.rateSource).toBe('MONIERATE_PARALLEL_BUY')
    expect(data.adjustmentUsd.toString()).toBe('5')
    // 15-minute default lock preserved
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000)
  })

  it('admin manual-rate copy states buy-side semantics', () => {
    const page = read('app/admin/settings/currency/page.tsx')
    expect(page).toContain('Walz commercial buy-side rate — NGN required per 1 unit of foreign')
    expect(page).toContain('NGN required for Walz to recover $1')
  })
})
