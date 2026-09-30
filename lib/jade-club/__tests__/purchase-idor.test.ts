/**
 * Jade Travel Club Release 2B — IDOR test on the purchase-status read path.
 *
 * app/api/jade-club/purchase/status/route.ts is a thin wrapper around
 * getOwnPurchaseStatus(session.user.id, purchaseId) — this test proves the
 * actual security boundary (the `where` clause enforcing ownership) rather
 * than re-testing Next.js request/response plumbing.
 */

function makeFakeDb() {
  const purchases = new Map<string, any>()
  return {
    db: {
      jadeClubPurchase: {
        findFirst: async ({ where }: any) => {
          for (const p of purchases.values()) {
            if (where.id !== undefined && p.id !== where.id) continue
            if (where.userId !== undefined && p.userId !== where.userId) continue
            return { ...p }
          }
          return null
        },
      },
    },
    purchases,
  }
}

const { db: fakeDb, purchases } = makeFakeDb()
jest.mock('@/lib/db', () => ({ __esModule: true, default: fakeDb }))

import { getOwnPurchaseStatus } from '../purchase'

beforeEach(() => {
  purchases.clear()
  purchases.set('purchase_victim', {
    id: 'purchase_victim', userId: 'user_victim', tier: 'CLUB_PLUS',
    paymentStatus: 'SUCCEEDED', activationStatus: 'ACTIVATED', failureReason: null,
  })
})

describe('getOwnPurchaseStatus — IDOR boundary', () => {
  it('the owner can read their own purchase', async () => {
    const status = await getOwnPurchaseStatus('user_victim', 'purchase_victim')
    expect(status?.purchaseId).toBe('purchase_victim')
    expect(status?.tier).toBe('CLUB_PLUS')
  })

  it('a different authenticated user cannot read someone else\'s purchase by guessing/enumerating its id', async () => {
    const status = await getOwnPurchaseStatus('user_attacker', 'purchase_victim')
    expect(status).toBeNull()
  })

  it('returns null (not a distinguishable 403) for a non-existent purchase id — never leaks existence', async () => {
    const status = await getOwnPurchaseStatus('user_attacker', 'purchase_does_not_exist')
    expect(status).toBeNull()
  })
})
