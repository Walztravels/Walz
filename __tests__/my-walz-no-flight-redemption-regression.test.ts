/**
 * @jest-environment node
 *
 * My Walz Phase 1 — regression guard: no flight Miles-redemption path was
 * reintroduced anywhere by this mission (settled rule: Walz Miles cannot be
 * redeemed against flights/airfare/airline charges — commit 58b228af froze
 * this in production and must not be reversed, weakened, or worked around).
 *
 * This is a SOURCE-LEVEL scan, deliberately broad, over every file this
 * mission touched plus the frozen path itself.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8')

const MY_WALZ_PHASE1_FILES = [
  'app/dashboard/page.tsx',
  'app/dashboard/miles/page.tsx',
  'app/dashboard/trips/page.tsx',
  'app/dashboard/jade/page.tsx',
  'app/dashboard/jade/_components/PortalJadeChat.tsx',
  'lib/portal/miles-data.ts',
  'lib/portal/portal-jade-context.ts',
  'components/portal/PortalSidebar.tsx',
]

describe('The flight-fare Miles redemption freeze (commit 58b228af) is intact', () => {
  const src = readSource('lib/payments/authority.ts')

  it('the flight payment-intent discount is still unconditionally zero', () => {
    expect(src).toContain('const discount = 0')
  })

  it('never re-reads walzRewards/milesBalance to compute a flight discount', () => {
    expect(src).not.toContain('walzRewards')
    expect(src).not.toContain('.milesBalance')
    expect(src).not.toContain('Math.min(requested, maxDiscount)')
  })
})

describe('app/(public)/flights/review/page.tsx — redeem picker stays removed', () => {
  const src = readSource('app/(public)/flights/review/page.tsx')

  it('does not reintroduce the MILES_OPTIONS redeem picker or its handler', () => {
    expect(src).not.toContain('MILES_OPTIONS = [')
    expect(src).not.toContain('handleMilesRedeem')
    expect(src).not.toContain('setMilesRedeemed')
  })

  it('shows only the neutral "coming soon" copy, with no stated conversion value', () => {
    expect(src).toContain('Redemption benefits are coming soon')
    expect(src).not.toMatch(/100 miles = £1/i)
  })
})

describe('app/api/flights/loyalty/route.ts — dead redeem/earn stub removed', () => {
  const src = readSource('app/api/flights/loyalty/route.ts')

  it('no longer has a POST handler with a redeem or earn action', () => {
    expect(src).not.toMatch(/action\s*===\s*['"]redeem['"]/)
    expect(src).not.toMatch(/action\s*===\s*['"]earn['"]/)
    expect(src).not.toMatch(/export async function POST/)
  })

  it('no longer states a miles-to-currency conversion anywhere in the file', () => {
    expect(src).not.toMatch(/milesRequired\s*\/\s*100/)
  })

  it('GET (balance display) is untouched and still present', () => {
    expect(src).toContain('export async function GET()')
  })
})

describe('Every My Walz Phase 1 file: no redemption UI, no redeem API calls, no stated conversion rate', () => {
  for (const rel of MY_WALZ_PHASE1_FILES) {
    it(`${rel} has no redemption affordance`, () => {
      const src = readSource(rel)
      expect(src).not.toMatch(/redeem/i)
      expect(src).not.toContain('/api/flights/loyalty')
      // No "N miles = <currency symbol>N" or "<currency symbol>N ... miles" copy anywhere.
      expect(src).not.toMatch(/\d+\s*(walz\s*)?miles?\s*=\s*[£$€]/i)
      expect(src).not.toMatch(/[£$€]\s*\d+[^\n]{0,20}miles?/i)
    })
  }
})

describe('WalzMilesTransaction unique idempotency constraint is unchanged', () => {
  it('bookingId+type remains unique in the schema (prevents duplicate EARN rows)', () => {
    const schema = readSource('prisma/schema.prisma')
    expect(schema).toContain('@@unique([bookingId, type])')
  })

  it('the admin EARN path still writes the ledger row before incrementing balance', () => {
    const src = readSource('app/api/admin/bookings/[id]/route.ts')
    const createIdx = src.indexOf('walzMilesTransaction.create')
    const incrementIdx = src.indexOf('milesBalance: { increment: earnedMiles }')
    expect(createIdx).toBeGreaterThan(-1)
    expect(incrementIdx).toBeGreaterThan(createIdx)
  })
})
