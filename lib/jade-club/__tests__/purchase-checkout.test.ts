/**
 * Jade Travel Club Release 2B — checkout-creation edge cases
 * (lib/jade-club/purchase.ts::createJadeClubCheckout).
 * The full happy path is covered in purchase-integration.test.ts; this
 * file focuses on the reject-cleanly branches.
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

const { db: fakeDb, policies, memberships, terms } = makeFakeDb()
jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

const mockStripeSessionCreate = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: mockStripeSessionCreate } } }),
}))

import { createJadeClubCheckout } from '../purchase'

beforeEach(() => {
  policies.clear(); memberships.clear(); terms.clear()
  mockStripeSessionCreate.mockReset()
  mockStripeSessionCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' })
})

describe('createJadeClubCheckout — reject-cleanly branches', () => {
  it('rejects an invalid tier without touching the DB', async () => {
    const result = await createJadeClubCheckout({ userId: 'u1', customerEmail: 'a@b.com', tier: 'GOLD', market: 'NG', currency: 'NGN', origin: 'https://x.com' })
    expect(result).toEqual({ ok: false, code: 'INVALID_TIER', message: expect.any(String) })
  })

  it('rejects cleanly when no ACTIVE policy exists for the exact (tier, market, currency) scope — never fabricates a price', async () => {
    const result = await createJadeClubCheckout({ userId: 'u1', customerEmail: 'a@b.com', tier: 'CLUB_PLUS', market: 'NG', currency: 'NGN', origin: 'https://x.com' })
    expect(result).toEqual({ ok: false, code: 'POLICY_NOT_FOUND', message: expect.any(String) })
    expect(mockStripeSessionCreate).not.toHaveBeenCalled()
  })

  it('rejects before payment if the member already has an unexpired terms period', async () => {
    policies.set('p1', { id: 'p1', tier: 'CLUB', market: 'NG', currency: 'NGN', status: 'ACTIVE', annualPriceMinor: 100, version: 1, durationMonths: 12 })
    memberships.set('u1', { id: 'membership_1', userId: 'u1' })
    terms.set('t1', { id: 't1', membershipId: 'membership_1', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) })

    const result = await createJadeClubCheckout({ userId: 'u1', customerEmail: 'a@b.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://x.com' })
    expect(result).toEqual({ ok: false, code: 'ALREADY_ACTIVE', message: expect.any(String) })
    expect(mockStripeSessionCreate).not.toHaveBeenCalled()
  })

  it('allows checkout when the member has only an EXPIRED terms period', async () => {
    policies.set('p1', { id: 'p1', tier: 'CLUB', market: 'NG', currency: 'NGN', status: 'ACTIVE', annualPriceMinor: 100, version: 1, durationMonths: 12 })
    memberships.set('u1', { id: 'membership_1', userId: 'u1' })
    terms.set('t1', { id: 't1', membershipId: 'membership_1', expiresAt: new Date(Date.now() - 1000) }) // already expired

    const result = await createJadeClubCheckout({ userId: 'u1', customerEmail: 'a@b.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://x.com' })
    expect(result.ok).toBe(true)
  })

  it('surfaces a clean STRIPE_ERROR if session creation throws, without leaving the client guessing', async () => {
    policies.set('p1', { id: 'p1', tier: 'CLUB', market: 'NG', currency: 'NGN', status: 'ACTIVE', annualPriceMinor: 100, version: 1, durationMonths: 12 })
    mockStripeSessionCreate.mockRejectedValue(new Error('Stripe is down'))

    const result = await createJadeClubCheckout({ userId: 'u1', customerEmail: 'a@b.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://x.com' })
    expect(result).toEqual({ ok: false, code: 'STRIPE_ERROR', message: expect.any(String) })
  })

  it('never trusts a client-supplied price — the Stripe unit_amount comes from the resolved policy only', async () => {
    policies.set('p1', { id: 'p1', tier: 'CLUB', market: 'NG', currency: 'NGN', status: 'ACTIVE', annualPriceMinor: 999999, version: 3, durationMonths: 12 })

    await createJadeClubCheckout({ userId: 'u1', customerEmail: 'a@b.com', tier: 'CLUB', market: 'NG', currency: 'NGN', origin: 'https://x.com' })

    const args = mockStripeSessionCreate.mock.calls[0][0]
    expect(args.line_items[0].price_data.unit_amount).toBe(999999)
    expect(args.metadata.policyVersion).toBe('3')
  })
})
