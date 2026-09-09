/**
 * Walz central NGN FX engine — regression suite.
 *
 * Unit-tests lib/fx with mocked providers and database, plus source
 * invariants on the integration points (payment routes, admin RBAC, Jade,
 * client secrecy). Covers the 35-point checklist from the FX engine spec.
 */
import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Database mock ────────────────────────────────────────────────────────────
const mockDb = {
  fxSettings:  { findUnique: jest.fn(), upsert: jest.fn() },
  fxQuoteLock: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  activityLog: { create: jest.fn() },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: mockDb, prisma: mockDb }))

/* eslint-disable @typescript-eslint/no-var-requires */
const { createNgnQuote, loadFxLock } = require('@/lib/fx/quote')
const { getNgnRate }                 = require('@/lib/fx/policy')
const { invalidateFxSettingsCache }  = require('@/lib/fx/settings')
const { clearRateCache, rateCacheKey, getCachedRate, setCachedRate } = require('@/lib/fx/cache')
const { getMonierateNgnRate }        = require('@/lib/fx/providers/monierate')

// ── Fetch mock helpers ───────────────────────────────────────────────────────
type FetchHandler = (url: string) => { ok: boolean; status?: number; json?: unknown } | 'throw'
let fetchHandler: FetchHandler = () => ({ ok: false, status: 500 })
const fetchCalls: string[] = []

beforeAll(() => {
  global.fetch = jest.fn(async (url: unknown) => {
    const u = String(url)
    fetchCalls.push(u)
    const res = fetchHandler(u)
    if (res === 'throw') throw Object.assign(new Error('timeout'), { name: 'AbortError' })
    return {
      ok:     res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json:   async () => res.json ?? {},
    }
  }) as unknown as typeof fetch
})

function monierateOk(rate: number, opts: { timestamp?: number } = {}) {
  return {
    ok: true,
    json: {
      status: 'success',
      data:   { timestamp: opts.timestamp ?? Date.now(), base: 'USD', market: 'parallel', rates: rate },
    },
  }
}
function standardOk(rates: Record<string, number>) {
  return { ok: true, json: { rates } }
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fx-settings',
    rateMode: 'AUTO_MONIERATE',
    manualRates: {},
    adjustmentUsd: new Prisma.Decimal('5.00'),
    cacheMinutes: 10,
    lockMinutes: 15,
    isEnabled: true,
    updatedBy: null,
    updatedAt: new Date(),
    createdAt: new Date(),
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
  mockDb.fxQuoteLock.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'lock_1', ...data }))
})

// ═════════════════════════════════════════════════════════════════════════════
describe('NGN routing policy', () => {
  it('1. USD→NGN uses the Monierate parallel market', async () => {
    fetchHandler = url => url.includes('monierate') ? monierateOk(1397) : standardOk({})
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('MONIERATE_PARALLEL')
    expect(rate.rawRate.toString()).toBe('1397')
    expect(fetchCalls.some(u => u.includes('market=parallel'))).toBe(true)
  })

  it('2. GBP→NGN uses Monierate (direct parallel pair)', async () => {
    fetchHandler = url => url.includes('base=GBP') ? monierateOk(1800) : monierateOk(1397)
    const rate = await getNgnRate('GBP')
    expect(rate.rateSource).toBe('MONIERATE_PARALLEL')
    expect(rate.rawRate.toString()).toBe('1800')
  })

  it('3. CAD→NGN uses Monierate, bridging deterministically via USD when the direct pair is missing', async () => {
    fetchHandler = url => {
      if (url.includes('base=CAD') && url.includes('monierate')) return { ok: false, status: 404 }
      if (url.includes('base=USD') && url.includes('monierate')) return monierateOk(1400)
      if (url.includes('exchangerate-api') && url.includes('CAD')) return standardOk({ USD: 0.73 })
      return { ok: false, status: 500 }
    }
    const rate = await getNgnRate('CAD')
    expect(rate.rateSource).toBe('MONIERATE_PARALLEL')
    expect(rate.provider).toBe('monierate+usd-bridge')
    // 1400 × 0.73 = 1022 NGN per CAD
    expect(rate.rawRate.toNumber()).toBeCloseTo(1022, 6)
  })

  it('4. Monierate failure falls back to the Walz manual rate', async () => {
    mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow({ manualRates: { USD: '1500' } }))
    fetchHandler = () => ({ ok: false, status: 500 })
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
    expect(rate.rawRate.toString()).toBe('1500')
  })

  it('5. MANUAL mode uses the manual rate immediately and never calls Monierate', async () => {
    mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow({ rateMode: 'MANUAL', manualRates: { USD: '1450' } }))
    fetchHandler = () => { throw new Error('should not be called') }
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
    expect(fetchCalls.length).toBe(0)
  })

  it('6. A stale Monierate rate (old provider timestamp) falls back to manual', async () => {
    mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow({ manualRates: { USD: '1500' } }))
    const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000
    fetchHandler = url => url.includes('monierate') ? monierateOk(1397, { timestamp: eightHoursAgo }) : standardOk({})
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
  })

  it('7. A missing Monierate API key does not crash — manual fallback engages', async () => {
    delete process.env.MONIERATE_API_KEY
    mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow({ manualRates: { USD: '1500' } }))
    fetchHandler = () => ({ ok: false, status: 401 })
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
  })

  it('8. No manual rate + Monierate down fails CLOSED for NGN only (NGN_RATE_UNAVAILABLE)', async () => {
    fetchHandler = () => ({ ok: false, status: 500 })
    await expect(getNgnRate('USD')).rejects.toMatchObject({ code: 'NGN_RATE_UNAVAILABLE' })
    // Never silently downgraded to an official/standard rate:
    const policySrc = read('lib/fx/policy.ts')
    expect(policySrc).not.toMatch(/getStandardRate\([^)]*['"]NGN['"]/)
  })

  it('33. Provider timeout is handled — falls back instead of throwing', async () => {
    mockDb.fxSettings.findUnique.mockResolvedValue(settingsRow({ manualRates: { USD: '1480' } }))
    fetchHandler = () => 'throw'
    const rate = await getNgnRate('USD')
    expect(rate.rateSource).toBe('WALZ_MANUAL')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('USD $5 adjustment', () => {
  it('12. Spec example exact: (2300 + 5) × 1397 = 3,220,085 NGN', async () => {
    fetchHandler = url => url.includes('monierate') ? monierateOk(1397) : standardOk({})
    const q = await createNgnQuote({ baseCurrency: 'USD', baseAmount: 2300, context: 'DISPLAY_ESTIMATE' })
    expect(q.adjustmentUsd.toString()).toBe('5')
    expect(q.adjustedBaseAmount.toNumber()).toBe(2305)
    expect(q.convertedAmount.toNumber()).toBe(3220085)
    // The raw rate stays the REAL rate — never inflated to hide the adjustment
    expect(q.rawRate.toString()).toBe('1397')
    expect(q.effectiveRate.toNumber()).toBeGreaterThan(1397)
  })

  it('10/11. Adjustment applied ONCE per conversion total — a 5-item cart converts its sum with a single $5', async () => {
    fetchHandler = url => url.includes('monierate') ? monierateOk(1400) : standardOk({})
    const items = [1000, 300, 100, 50, 50] // summed by the caller — the engine sees one total
    const total = items.reduce((a, b) => a + b, 0)
    const q = await createNgnQuote({ baseCurrency: 'USD', baseAmount: total, context: 'DISPLAY_ESTIMATE' })
    expect(q.adjustedBaseAmount.toNumber()).toBe(total + 5)      // +5 once, not +25
    expect(q.convertedAmount.toNumber()).toBe((total + 5) * 1400)
  })

  it('13. GBP adjustment is the USD $5 converted via the standard service, not hardcoded', async () => {
    fetchHandler = url => {
      if (url.includes('monierate')) return monierateOk(1800)
      if (url.includes('exchangerate-api') && url.includes('/USD')) return standardOk({ GBP: 0.78 })
      return { ok: false, status: 500 }
    }
    const q = await createNgnQuote({ baseCurrency: 'GBP', baseAmount: 1000, context: 'DISPLAY_ESTIMATE' })
    expect(q.adjustmentUsd.toString()).toBe('5')
    expect(q.adjustmentInBaseCurrency.toNumber()).toBeCloseTo(3.9, 4)   // 5 × 0.78
    expect(q.convertedAmount.toNumber()).toBeCloseTo((1000 + 3.9) * 1800, 2)
  })

  it('14. CAD adjustment converted correctly (5 USD × USD→CAD)', async () => {
    fetchHandler = url => {
      if (url.includes('monierate') && url.includes('base=CAD')) return monierateOk(1022)
      if (url.includes('exchangerate-api') && url.includes('/USD')) return standardOk({ CAD: 1.37 })
      return { ok: false, status: 500 }
    }
    const q = await createNgnQuote({ baseCurrency: 'CAD', baseAmount: 500, context: 'DISPLAY_ESTIMATE' })
    expect(q.adjustmentInBaseCurrency.toNumber()).toBeCloseTo(6.85, 4)
  })

  it('15. Money math is Decimal — no floating-point drift', async () => {
    fetchHandler = url => url.includes('monierate') ? monierateOk(1397.33) : standardOk({})
    const q = await createNgnQuote({ baseCurrency: 'USD', baseAmount: 0.1, context: 'DISPLAY_ESTIMATE' })
    // (0.1 + 5) × 1397.33 = 7126.383 → 7126.38 at 2dp; float math would wobble
    expect(q.convertedAmount.toString()).toBe('7126.38')
    const srcs = ['lib/fx/quote.ts', 'lib/fx/policy.ts', 'lib/fx/providers/monierate.ts']
    for (const s of srcs) expect(read(s)).toContain('Prisma.Decimal')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('rate locks', () => {
  it('16/21. QUOTE/CHECKOUT contexts persist a lock snapshot; DISPLAY_ESTIMATE does not', async () => {
    fetchHandler = url => url.includes('monierate') ? monierateOk(1400) : standardOk({})
    const est = await createNgnQuote({ baseCurrency: 'USD', baseAmount: 100, context: 'DISPLAY_ESTIMATE' })
    expect(est.lockId).toBeUndefined()
    expect(mockDb.fxQuoteLock.create).not.toHaveBeenCalled()

    const chk = await createNgnQuote({ baseCurrency: 'USD', baseAmount: 100, context: 'CHECKOUT', reference: 'test-ref' })
    expect(chk.lockId).toBe('lock_1')
    const data = mockDb.fxQuoteLock.create.mock.calls[0][0].data
    expect(data.rawRate.toString()).toBe('1400')
    expect(data.rateSource).toBe('MONIERATE_PARALLEL')
    expect(data.adjustmentUsd.toString()).toBe('5')
    expect(data.convertedAmount.toNumber()).toBe(105 * 1400)
    expect(data.expiresAt).toBeInstanceOf(Date)
    // 15-minute default lock
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000)
  })

  it('17. An expired lock is flagged so checkout revalidates instead of silently charging', async () => {
    mockDb.fxQuoteLock.findUnique.mockResolvedValue({
      id: 'lock_old', context: 'CHECKOUT', baseCurrency: 'GBP', quoteCurrency: 'NGN',
      baseAmount: new Prisma.Decimal(100), rawRate: new Prisma.Decimal(1800),
      effectiveRate: new Prisma.Decimal(1870), rateSource: 'MONIERATE_PARALLEL', provider: 'monierate',
      adjustmentUsd: new Prisma.Decimal(5), adjustmentInBaseCurrency: new Prisma.Decimal(3.9),
      adjustedBaseAmount: new Prisma.Decimal(103.9), convertedAmount: new Prisma.Decimal(187020),
      rateTimestamp: null, reference: null, usedAt: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000), expiresAt: new Date(Date.now() - 45 * 60 * 1000),
    })
    const lock = await loadFxLock('lock_old')
    expect(lock?.expired).toBe(true)
  })

  it('18/19/22. Checkout server ignores browser amount + FX fields when a lock is supplied', () => {
    const src = read('app/api/payments/paystack/initialize/route.ts')
    expect(src).toContain('loadFxLock')
    expect(src).toContain('amount       = lock.convertedAmount.toNumber()')
    expect(src).toContain('fxRate       = lock.rawRate.toNumber()')
    expect(src).toContain('FX_QUOTE_EXPIRED')  // expired → 409, never silent re-price
    expect(src).toContain("fxSource     = `walz-fx:${lock.rateSource}`")
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('cache', () => {
  it('31. Rates are cached — a second call within TTL makes no provider request', async () => {
    fetchHandler = url => url.includes('monierate') ? monierateOk(1400) : standardOk({})
    await getMonierateNgnRate('USD', 10 * 60 * 1000)
    const callsAfterFirst = fetchCalls.length
    await getMonierateNgnRate('USD', 10 * 60 * 1000)
    expect(fetchCalls.length).toBe(callsAfterFirst)
  })

  it('32. Cache is isolated by currency pair and rate type', () => {
    expect(rateCacheKey('USD', 'NGN', 'monierate_parallel')).not.toBe(rateCacheKey('GBP', 'NGN', 'monierate_parallel'))
    expect(rateCacheKey('USD', 'NGN', 'monierate_parallel')).not.toBe(rateCacheKey('USD', 'NGN', 'standard'))
    const rate = {
      baseCurrency: 'USD', quoteCurrency: 'NGN', rawRate: new Prisma.Decimal(1400),
      rateSource: 'MONIERATE_PARALLEL' as const, fetchedAt: new Date(),
    }
    setCachedRate(rate, 'monierate_parallel', 60_000)
    expect(getCachedRate('USD', 'NGN', 'monierate_parallel')).not.toBeNull()
    expect(getCachedRate('GBP', 'NGN', 'monierate_parallel')).toBeNull()
    expect(getCachedRate('USD', 'NGN', 'standard')).toBeNull()
  })

  it('failed responses are never cached as rates', async () => {
    fetchHandler = () => ({ ok: false, status: 500 })
    await getMonierateNgnRate('USD', 10 * 60 * 1000)
    expect(getCachedRate('USD', 'NGN', 'monierate_parallel')).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('integration invariants (source)', () => {
  it('9. Non-NGN conversion keeps the existing provider and logic', () => {
    // Display FX pipeline untouched
    expect(read('app/api/currency/route.ts')).toContain('exchangerate-api.com')
    // Legacy flight FX path intact for flag-off behavior
    const legacy = read('lib/payments/fx.ts')
    expect(legacy).toContain("source:      'flutterwave'")
    // fx-quote route only reroutes NGN behind the flag
    const route = read('app/api/flights/fx-quote/route.ts')
    expect(route).toContain("to === 'NGN' && isNgnFxEngineEnabled()")
    expect(route).toContain('getFxQuote(from, to, amount)')
  })

  it('20. Jade consumes the central engine and never invents a rate', () => {
    const tools = read('lib/jade/tools.ts')
    expect(tools).toContain('get_walz_ngn_rate')
    expect(tools).toContain('createNgnQuote')
    expect(tools).toContain('Do NOT estimate, recall or calculate any exchange rate')
    // Existing hard FX boundary untouched
    expect(read('lib/jade/search-tools.ts')).toContain('FX_CONVERSION_ALLOWED')
  })

  it('23. Paystack NGN amounts stay in major units into the route, kobo at the provider call', () => {
    const src = read('app/api/payments/paystack/initialize/route.ts')
    // Canonical helper — never a bare *100 for the provider call
    expect(src).toContain('paystackMajorToMinor(Number(amount), currency)')
    // The lock supplies MAJOR units (convertedAmount), same as the legacy amount field
    expect(src).toContain('lock.convertedAmount.toNumber()')
  })

  it('24. Flutterwave flight payments are provider-verified and reconciled at booking', () => {
    const book = read('app/api/flights/book/route.ts')
    expect(book).toContain('fxLockId')
    expect(book).toContain('markFxLockUsed')
    expect(book).toContain('reconcileFlutterwavePayment')
    expect(book).toContain('PAYMENT_RECONCILIATION_REQUIRED')
  })

  it('25/26/27. FX adjustment is separate from markup/service charges/supplier pricing', () => {
    for (const f of ['lib/fx/quote.ts', 'lib/fx/policy.ts', 'lib/fx/settings.ts', 'lib/fx/index.ts']) {
      const src = read(f)
      expect(src).not.toContain('esim-pricing')
      expect(src).not.toContain('payment-fees')
      expect(src).not.toMatch(/from ['"]@\/lib\/pricing/)
      expect(src).not.toMatch(/from ['"]@\/lib\/concierge/)
    }
    // Markup modules untouched by this feature keep their own logic files
    expect(read('lib/esim-pricing.ts')).not.toContain('lib/fx')
  })

  it('28. FX settings endpoint requires super_admin for read and write', () => {
    const src = read('app/api/admin/settings/fx/route.ts')
    expect(src).toContain("session.staffRole !== 'super_admin'")
    expect(src).toContain('status: 403')
    expect(src).toContain('requireSuperAdmin()')
    // Both handlers gated
    expect(src.split('requireSuperAdmin()').length).toBeGreaterThanOrEqual(3)
  })

  it('29. Manual-rate changes write an ActivityLog audit with before/after', () => {
    const src = read('app/api/admin/settings/fx/route.ts')
    expect(src).toContain('activityLog.create')
    expect(src).toContain('before:')
    expect(src).toContain('after:')
    expect(src).toContain("action:     'FX: settings updated'")
  })

  it('30. Monierate credentials never reach the client', () => {
    // No NEXT_PUBLIC_ Monierate vars anywhere in app/lib/components
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(p)
      }
    }
    for (const d of ['app', 'components', 'lib']) walk(path.join(process.cwd(), d))
    const offenders = files.filter(f => fs.readFileSync(f, 'utf8').includes('NEXT_PUBLIC_MONIERATE'))
    expect(offenders).toEqual([])
    // The provider module reads the key server-side only
    const provider = read('lib/fx/providers/monierate.ts')
    expect(provider).toContain('process.env.MONIERATE_API_KEY')
    expect(provider).not.toContain("'use client'")
    // Admin API returns configuration presence, never the key
    expect(read('app/api/admin/settings/fx/route.ts')).not.toMatch(/MONIERATE_API_KEY\s*[,}]/)
  })

  it('34. Customers see the safe NGN-unavailable message, never provider detail', () => {
    const route = read('app/api/flights/fx-quote/route.ts')
    expect(route).toContain('NGN_RATE_UNAVAILABLE')
    expect(read('lib/fx/types.ts')).toContain('NGN pricing is temporarily unavailable. Please try again shortly.')
  })

  it('35 (flag). Engine is off by default — flag must be exactly "true"', () => {
    const idx = read('lib/fx/index.ts')
    expect(idx).toContain("process.env.WALZ_NGN_FX_ENGINE_ENABLED === 'true'")
    delete process.env.WALZ_NGN_FX_ENGINE_ENABLED
    /* eslint-disable-next-line @typescript-eslint/no-var-requires */
    const { isNgnFxEngineEnabled } = require('@/lib/fx/index')
    expect(isNgnFxEngineEnabled()).toBe(false)
  })

  it('fake-rate pattern is banned: no arbitrary margin is added to the NGN rate', () => {
    for (const f of ['lib/fx/quote.ts', 'lib/fx/policy.ts', 'lib/fx/providers/monierate.ts']) {
      const src = read(f)
      expect(src).not.toMatch(/rawRate\.(mul|add)\([^)]*(MARGIN|margin)/)
      expect(src).not.toContain('FX_MARGIN')
    }
  })

  it('migration SQL is additive and idempotent', () => {
    const sql = read('prisma/migrations/fx_engine.sql')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS fx_settings')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS fx_quote_locks')
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING')
    expect(sql).not.toMatch(/DROP\s|ALTER TABLE (?!.*ADD)/i)
  })
})
