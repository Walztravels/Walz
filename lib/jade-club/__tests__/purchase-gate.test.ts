/**
 * Jade Travel Club Phase 1 — purchase kill switch
 * (lib/jade-club/purchase.ts::createJadeClubCheckout, JADE_CLUB_PURCHASES_ENABLED).
 *
 * Phase 1 must not activate paid purchases. This file proves the gate is:
 *   - fail-closed when the env var is unset or any non-"true" value
 *   - checked BEFORE the commercial-policy lookup and BEFORE any Stripe call
 *   - not influenced by any ACTIVE policy existing
 *   - not bypassable by client-supplied fields on the request
 *   - the single gate for the one real caller (createJadeClubCheckout itself,
 *     so there is no second "direct invocation" path that skips it)
 *   - functionally transparent once explicitly enabled (test-only — this
 *     suite never enables it against a real Stripe account; mockStripeSessionCreate
 *     stands in for Stripe entirely)
 */

function makeFakeDb() {
  const policies = new Map<string, any>()
  const memberships = new Map<string, any>()
  const terms = new Map<string, any>()
  const purchases = new Map<string, any>()
  let seq = 0

  return {
    db: {
      jadeClubCommercialPolicy: {
        findFirst: async ({ where }: any) => {
          for (const p of policies.values()) {
            if (p.tier === where.tier && p.market === where.market && p.currency === where.currency && p.status === where.status) return { ...p }
          }
          return null
        },
      },
      jadeClubMembership: {
        findUnique: async ({ where }: any) => memberships.get(where.userId) ?? null,
      },
      jadeClubMembershipTerms: {
        findFirst: async ({ where }: any) => {
          for (const t of terms.values()) {
            if (t.membershipId === where.membershipId && t.expiresAt.getTime() > where.expiresAt.gt.getTime()) return { ...t }
          }
          return null
        },
      },
      jadeClubPurchase: {
        create: async ({ data }: any) => {
          const id = `purchase_${++seq}`
          const row = { id, ...data }
          purchases.set(id, row)
          return { ...row }
        },
        update: async ({ where, data }: any) => {
          Object.assign(purchases.get(where.id), data)
          return { ...purchases.get(where.id) }
        },
      },
    },
    policies, memberships, terms, purchases,
  }
}

const { db: fakeDb, policies, memberships, terms, purchases } = makeFakeDb()
jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

const mockStripeSessionCreate = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: mockStripeSessionCreate } } }),
}))

import { createJadeClubCheckout } from '../purchase'

const ORIGINAL_ENV = process.env.JADE_CLUB_PURCHASES_ENABLED
const VALID_PARAMS = { userId: 'u1', customerEmail: 'a@b.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://x.com' }

function activateAPolicy() {
  policies.set('p1', { id: 'p1', tier: 'CLUB', market: 'NG', currency: 'NGN', status: 'ACTIVE', annualPriceMinor: 100, version: 1, durationMonths: 12 })
}

beforeEach(() => {
  policies.clear(); memberships.clear(); terms.clear(); purchases.clear()
  mockStripeSessionCreate.mockReset()
  mockStripeSessionCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' })
})

afterAll(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.JADE_CLUB_PURCHASES_ENABLED
  else process.env.JADE_CLUB_PURCHASES_ENABLED = ORIGINAL_ENV
})

describe('createJadeClubCheckout — Phase 1 purchase kill switch', () => {
  it('blocks when JADE_CLUB_PURCHASES_ENABLED is unset — fail closed by default', async () => {
    delete process.env.JADE_CLUB_PURCHASES_ENABLED
    activateAPolicy()

    const result = await createJadeClubCheckout(VALID_PARAMS)

    expect(result).toEqual({ ok: false, code: 'PURCHASES_DISABLED', message: expect.any(String) })
    expect(mockStripeSessionCreate).not.toHaveBeenCalled()
  })

  it('blocks when JADE_CLUB_PURCHASES_ENABLED="false"', async () => {
    process.env.JADE_CLUB_PURCHASES_ENABLED = 'false'
    activateAPolicy()

    const result = await createJadeClubCheckout(VALID_PARAMS)

    expect(result).toEqual({ ok: false, code: 'PURCHASES_DISABLED', message: expect.any(String) })
    expect(mockStripeSessionCreate).not.toHaveBeenCalled()
  })

  it('blocks for any non-exact-"true" value, including truthy-looking strings ("1", "yes", "TRUE")', async () => {
    activateAPolicy()
    for (const value of ['1', 'yes', 'TRUE', 'True', 'enabled', ' true', 'true ']) {
      process.env.JADE_CLUB_PURCHASES_ENABLED = value
      const result = await createJadeClubCheckout(VALID_PARAMS)
      expect(result).toEqual({ ok: false, code: 'PURCHASES_DISABLED', message: expect.any(String) })
    }
    expect(mockStripeSessionCreate).not.toHaveBeenCalled()
  })

  it('an ACTIVE commercial policy existing is NOT sufficient on its own to enable purchases', async () => {
    delete process.env.JADE_CLUB_PURCHASES_ENABLED
    activateAPolicy() // a real, otherwise-purchasable ACTIVE policy exists

    const result = await createJadeClubCheckout(VALID_PARAMS)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.code).toBe('PURCHASES_DISABLED')
    // Proves the gate runs BEFORE anything else: no purchase row was ever
    // created, even though a real, otherwise-matching ACTIVE policy exists.
    expect(purchases.size).toBe(0)
  })

  it('is checked before the commercial-policy lookup — the gate fires even for an invalid tier/scope that would otherwise fail differently', async () => {
    delete process.env.JADE_CLUB_PURCHASES_ENABLED
    // Deliberately an otherwise-invalid tier — if the gate ran AFTER tier
    // validation, this would return INVALID_TIER instead.
    const result = await createJadeClubCheckout({ ...VALID_PARAMS, tier: 'NOT_A_REAL_TIER' })
    expect(result).toEqual({ ok: false, code: 'PURCHASES_DISABLED', message: expect.any(String) })
  })

  it('direct invocation of createJadeClubCheckout is blocked — the gate lives inside the function itself, not only at the HTTP route layer', async () => {
    delete process.env.JADE_CLUB_PURCHASES_ENABLED
    activateAPolicy()
    // No HTTP layer involved at all here — this calls the lib function
    // exactly as any other current or future caller would.
    const result = await createJadeClubCheckout(VALID_PARAMS)
    expect(result).toEqual({ ok: false, code: 'PURCHASES_DISABLED', message: expect.any(String) })
  })

  it('client-supplied fields cannot bypass the gate — extra/forged properties on the request are ignored', async () => {
    delete process.env.JADE_CLUB_PURCHASES_ENABLED
    activateAPolicy()
    // Simulates a malicious/malformed client payload smuggling extra fields
    // that don't exist on CreateCheckoutParams — the gate reads only the
    // server-side env var, never anything from params.
    const maliciousParams = {
      ...VALID_PARAMS,
      purchasesEnabled: true,
      JADE_CLUB_PURCHASES_ENABLED: 'true',
      bypassGate: true,
      __proto__: { purchasesEnabled: true },
    } as any

    const result = await createJadeClubCheckout(maliciousParams)

    expect(result).toEqual({ ok: false, code: 'PURCHASES_DISABLED', message: expect.any(String) })
    expect(mockStripeSessionCreate).not.toHaveBeenCalled()
  })

  it('TEST ONLY — explicitly enabled + an otherwise-valid ACTIVE policy: existing checkout mechanics remain functional', async () => {
    // This test exercises the mocked Stripe client only — see the top-level
    // jest.mock('@/lib/stripe', ...) above. No real Stripe account/network
    // call is ever reachable from this test file.
    process.env.JADE_CLUB_PURCHASES_ENABLED = 'true'
    activateAPolicy()

    const result = await createJadeClubCheckout(VALID_PARAMS)

    expect(result.ok).toBe(true)
    expect(mockStripeSessionCreate).toHaveBeenCalledTimes(1)
  })
})
