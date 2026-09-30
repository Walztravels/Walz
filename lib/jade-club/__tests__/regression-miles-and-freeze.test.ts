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

  it('terms/entitlement CREATION with source PURCHASE goes through the shared createMembershipTermsCore only, never re-implemented elsewhere (structural remediation)', () => {
    const activationSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'purchase-activation.ts'), 'utf8')
    expect(activationSrc).toMatch(/createMembershipTermsCore\(/)
    expect(activationSrc).toMatch(/source: 'PURCHASE'/)
    // purchase-activation.ts never re-implements terms/snapshot/slot
    // CREATION itself — that logic lives ONLY in the shared core inside
    // entitlements.ts. (It DOES intentionally reuse the membership lock
    // statement/query shape as a read-only pre-check for the
    // winner-determined-before-mutation fix — see that fix's own header
    // comment — but never duplicates the actual row-creation logic.)
    expect(activationSrc).not.toMatch(/jadeClubMembershipBenefitSnapshot\.create/)
    expect(activationSrc).not.toMatch(/jadeClubEntitlementSlot\.create/)

    // The shared core's own lock/guard behavior is unchanged.
    const entitlementsSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'entitlements.ts'), 'utf8')
    expect(entitlementsSrc).toMatch(/SELECT id FROM jade_club_memberships WHERE id = \$\{params\.membershipId\} FOR UPDATE/)
    // Correction 3: the collision case is a RETURNED result, not a thrown
    // exception, at the shared-core level.
    expect(entitlementsSrc).toMatch(/ok: false, reason: 'UNEXPIRED_TERMS_EXISTS'/)
  })

  it('applyPurchaseTierBump is called ONLY after the winner-determination pre-check, never speculatively before it (narrow fix)', () => {
    const activationSrc = fs.readFileSync(path.join(JADE_CLUB_DIR, 'purchase-activation.ts'), 'utf8')
    const bumpIndex = activationSrc.indexOf('await applyPurchaseTierBump(tx')
    const preCheckIndex = activationSrc.indexOf('conflictingUnexpiredTerms')
    expect(bumpIndex).toBeGreaterThan(-1)
    expect(preCheckIndex).toBeGreaterThan(-1)
    expect(bumpIndex).toBeGreaterThan(preCheckIndex)
    expect(activationSrc).toMatch(/WINNER — confirmed\. Only NOW does canonical membership state change/)
  })

  it('applyPurchaseTierBump has exactly ONE call site anywhere in the codebase outside its own tests — inside attemptActivation, after the collision branch', () => {
    // Full call-site inventory, per the narrow-fix mandate: search every
    // .ts/.tsx file in the repo (excluding node_modules and this
    // function's own test files) for a call to applyPurchaseTierBump.
    const repoRoot = path.join(JADE_CLUB_DIR, '..', '..')
    const callSites: string[] = []
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(full); continue }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue
        if (entry.name.includes('.test.')) continue // test files call it directly to exercise it — not a production call site
        const content = fs.readFileSync(full, 'utf8')
        if (/applyPurchaseTierBump\(/.test(content) && !full.endsWith(path.join('lib', 'jade-club', 'membership.ts'))) {
          callSites.push(full)
        }
      }
    }
    walk(repoRoot)
    expect(callSites).toEqual([path.join(JADE_CLUB_DIR, 'purchase-activation.ts')])
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
