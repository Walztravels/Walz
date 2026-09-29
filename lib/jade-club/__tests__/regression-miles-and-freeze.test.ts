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
