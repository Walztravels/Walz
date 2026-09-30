/**
 * Jade Travel Club — regression guardrails.
 * Covers section 16/17/24/25: Walz Miles stays a separate, read-only ledger
 * from this feature's point of view, and the flight Miles redemption freeze
 * is untouched by this feature's source tree.
 */

import fs from 'fs'
import path from 'path'

const JADE_CLUB_DIR = path.join(__dirname, '..')

function readAllJadeClubSource(): string {
  const files = fs.readdirSync(JADE_CLUB_DIR).filter(f => f.endsWith('.ts') && !f.includes('__tests__'))
  return files.map(f => fs.readFileSync(path.join(JADE_CLUB_DIR, f), 'utf8')).join('\n')
}

describe('Walz Miles separation', () => {
  const src = readAllJadeClubSource()

  it('never writes to WalzRewardsMembership or WalzMilesTransaction', () => {
    expect(src).not.toMatch(/prisma\.walzRewardsMembership\.(create|update|updateMany|delete|upsert)/)
    expect(src).not.toMatch(/prisma\.walzMilesTransaction\.(create|update|updateMany|delete|upsert)/)
  })

  it('never reads WalzRewardsMembership directly — Miles display goes through the existing lib/portal/miles-data.ts reader instead', () => {
    // Documentation comments may reference the model name for context; the
    // guardrail is that no Jade Club file ever calls prisma against it.
    expect(src).not.toMatch(/prisma\.walzRewardsMembership/i)
  })

  it('the JadeClubMembership model has no Miles balance / monetary field', () => {
    const schema = fs.readFileSync(path.join(JADE_CLUB_DIR, '..', '..', 'prisma', 'schema.prisma'), 'utf8')
    const modelMatch = schema.match(/model JadeClubMembership \{[\s\S]*?\n\}/)
    expect(modelMatch).not.toBeNull()
    const modelBody = modelMatch![0]
    expect(modelBody.toLowerCase()).not.toMatch(/miles|balance|price|amount|currency/)
  })
})

describe('Flight Miles redemption freeze stays intact', () => {
  it('lib/payments/authority.ts still unconditionally clamps the flight Miles discount to 0', () => {
    const authoritySrc = fs.readFileSync(
      path.join(JADE_CLUB_DIR, '..', 'payments', 'authority.ts'), 'utf8',
    )
    expect(authoritySrc).toMatch(/const discount = 0/)
  })

  it('no Jade Club source file references lib/payments/authority.ts at all', () => {
    const src = readAllJadeClubSource()
    expect(src).not.toMatch(/payments\/authority/)
  })
})

describe('Release 2B — purchase engine stays inside the same boundaries', () => {
  const src = readAllJadeClubSource()

  it('never writes to WalzRewardsMembership or WalzMilesTransaction from the purchase engine either', () => {
    // readAllJadeClubSource() scans the whole lib/jade-club directory, so
    // this already covers purchase.ts / purchase-activation.ts /
    // purchase-reconciliation.ts / purchase-types.ts without any new
    // file-listing logic.
    expect(src).not.toMatch(/prisma\.walzRewardsMembership\.(create|update|updateMany|delete|upsert)/)
    expect(src).not.toMatch(/prisma\.walzMilesTransaction\.(create|update|updateMany|delete|upsert)/)
  })

  it('the checkout route never trusts a client-supplied price — amountMinor is only ever read from the resolved policy', () => {
    const purchaseSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'purchase.ts'), 'utf8')
    expect(purchaseSrc).not.toMatch(/req\.body\.amountMinor/)
    expect(purchaseSrc).toMatch(/amountMinor: policy\.annualPriceMinor/)
  })

  it('terms/entitlement creation with source PURCHASE goes through the shared createMembershipTermsCore only, never re-implemented elsewhere (structural remediation)', () => {
    const activationSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'purchase-activation.ts'), 'utf8')
    expect(activationSrc).toMatch(/createMembershipTermsCore\(/)
    expect(activationSrc).toMatch(/source: 'PURCHASE'/)
    // purchase-activation.ts never re-implements the membership lock or the
    // terms/snapshot/slot creation itself — that logic lives ONLY in the
    // shared core inside entitlements.ts.
    expect(activationSrc).not.toMatch(/SELECT id FROM jade_club_memberships WHERE id/)
    expect(activationSrc).not.toMatch(/jadeClubMembershipBenefitSnapshot\.create/)

    // The shared core's own lock/guard behavior is unchanged.
    const entitlementsSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'entitlements.ts'), 'utf8')
    expect(entitlementsSrc).toMatch(/SELECT id FROM jade_club_memberships WHERE id = \$\{params\.membershipId\} FOR UPDATE/)
    // Correction 3: the collision case is a RETURNED result, not a thrown
    // exception, at the shared-core level.
    expect(entitlementsSrc).toMatch(/ok: false, reason: 'UNEXPIRED_TERMS_EXISTS'/)
  })

  it('activateMembershipTerms (2A admin wrapper) still throws the exact same collision error string — its external contract is unaffected by the shared-core refactor', () => {
    const entitlementsSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'entitlements.ts'), 'utf8')
    expect(entitlementsSrc).toMatch(/This membership already has an unexpired commercial terms period — renewal is not implemented in Release 2A/)
  })

  it('lock order invariant is documented at the one call site that takes both the purchase and membership locks', () => {
    const activationSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'purchase-activation.ts'), 'utf8')
    expect(activationSrc).toMatch(/LOCK ORDER INVARIANT/)
    expect(activationSrc).toMatch(/ALWAYS acquired FIRST, the membership lock SECOND/)
  })
})
