/**
 * Jade Travel Club Release 2B — REAL-Postgres concurrency proof for two
 * simultaneous webhook deliveries / two activation workers racing the
 * SAME JadeClubPurchase row.
 *
 * Follows the same technique as the reference implementation
 * (lib/jade-club/__tests__/postgres-concurrency.test.ts in the
 * jade-2a-gate-a worktree, and its CI workflow
 * .github/workflows/jade-postgres-concurrency-gate.yml — not copied, the
 * TECHNIQUE is reproduced here): a real `postgres:16` container with
 * `log_statement=all`, genuinely concurrent activation attempts against the
 * SAME row, and Postgres's own server log read back as evidence that the
 * row lock actually serialized the two attempts (rather than trusting only
 * the application-level assertion).
 *
 * CONCURRENCY MECHANISM: this test does NOT mock '@/lib/db' — it points
 * the REAL Prisma singleton at the dockerized Postgres instance (by
 * setting DATABASE_URL/DIRECT_URL before that module is first required)
 * and calls the REAL, unmocked attemptActivation() twice via Promise.all.
 * Prisma's connection pool hands the two concurrent calls two separate
 * physical connections, so Postgres itself — not the Node event loop —
 * is what has to arbitrate the race via activateMembershipTerms's
 * `SELECT ... FOR UPDATE` row lock. This is a more faithful proof of the
 * SAME hazard two independent server processes would hit than spawning
 * subprocesses would be, without needing extra tooling (ts-node path-alias
 * resolution for '@/...' imports is not configured in this repo outside
 * Jest/Next's own bundler, so a subprocess-based approach would need a new
 * devDependency this worktree should not introduce).
 *
 * This test is SKIPPED, never failed, when Docker is unavailable — exactly
 * the case in the sandbox this was implemented in (no `docker` binary).
 * A human/CI runner with Docker available should run this directly:
 *   npx jest lib/jade-club/__tests__/purchase-postgres-concurrency.test.ts
 */

import { execSync, spawnSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const HAS_DOCKER = dockerAvailable()
const d = HAS_DOCKER ? describe : describe.skip

if (!HAS_DOCKER) {
  // eslint-disable-next-line no-console
  console.warn(
    '[purchase-postgres-concurrency.test.ts] SKIPPED — Docker is not available in this environment. ' +
    'This test requires Docker to spin up a real postgres:16 instance. Run it in an environment with ' +
    'Docker (e.g. CI, or a local machine) to get real concurrency evidence before independent review signs off.',
  )
}

d('Jade Club 2B — real-Postgres concurrent activation race', () => {
  jest.setTimeout(120_000)
  jest.resetModules() // ensure lib/db's singleton has not been constructed yet with a stale DATABASE_URL

  const CONTAINER_NAME = `jade-2b-pg-concurrency-${Date.now()}`
  const PG_PORT = 55654
  const DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`
  let logDir: string
  let attemptActivation: (purchaseId: string) => Promise<{ outcome: string }>
  let realPrisma: { $disconnect: () => Promise<void> }

  beforeAll(async () => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-2b-pg-'))

    spawnSync('docker', [
      'run', '-d', '--name', CONTAINER_NAME,
      '-e', 'POSTGRES_PASSWORD=postgres',
      '-p', `${PG_PORT}:5432`,
      'postgres:16',
      '-c', 'log_statement=all',
    ], { stdio: 'inherit' })

    let ready = false
    for (let i = 0; i < 30; i++) {
      const check = spawnSync('docker', ['exec', CONTAINER_NAME, 'pg_isready', '-U', 'postgres'])
      if (check.status === 0) { ready = true; break }
      spawnSync('sleep', ['1'])
    }
    if (!ready) throw new Error('Postgres container did not become ready in time')

    const migrations = ['jade_travel_club_v1.sql', 'jade_travel_club_commercial_v2a.sql', 'jade_travel_club_purchase_v2b.sql']
    for (const file of migrations) {
      const sqlPath = path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', file)
      spawnSync('docker', ['cp', sqlPath, `${CONTAINER_NAME}:/tmp/${file}`])
      const res = spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-f', `/tmp/${file}`], { encoding: 'utf8' })
      if (res.status !== 0) throw new Error(`Migration ${file} failed:\n${res.stdout}\n${res.stderr}`)
    }

    const fixtureSql = `
      INSERT INTO "User" (id, email, name, "createdAt", "updatedAt")
      VALUES ('user_concurrency_1', 'concurrency@example.com', 'Concurrency Test', now(), now());
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_concurrency_1', 'user_concurrency_1', 'JW-999999', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_commercial_policies (id, tier, market, currency, annual_price_minor, duration_months, service_fee_discount_percent, effective_from, version, status, created_by, created_at, updated_at)
      VALUES ('policy_concurrency_1', 'CLUB', 'NG', 'NGN', 8500000, 12, 10, now(), 1, 'ACTIVE', 'test-admin', now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_concurrency_1', 'user_concurrency_1', 'membership_concurrency_1', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_concurrency_1', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());
    `
    const fixturePath = path.join(logDir, 'fixture.sql')
    fs.writeFileSync(fixturePath, fixtureSql)
    spawnSync('docker', ['cp', fixturePath, `${CONTAINER_NAME}:/tmp/fixture.sql`])
    const fixtureRes = spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-f', '/tmp/fixture.sql'], { encoding: 'utf8' })
    if (fixtureRes.status !== 0) throw new Error(`Fixture load failed:\n${fixtureRes.stdout}\n${fixtureRes.stderr}`)

    // Point the REAL Prisma singleton at the dockerized instance BEFORE
    // requiring anything that transitively imports it — this is a plain
    // Node `require`, deliberately not a static ES `import`, so it runs
    // after the env vars above are set rather than being hoisted ahead of
    // them.
    process.env.DATABASE_URL = DB_URL
    process.env.DIRECT_URL = DB_URL
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const activationModule = require('../purchase-activation')
    attemptActivation = activationModule.attemptActivation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    realPrisma = require('@/lib/db').default
  })

  afterAll(async () => {
    await realPrisma?.$disconnect().catch(() => {})
    spawnSync('docker', ['rm', '-f', CONTAINER_NAME])
    try { fs.rmSync(logDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  })

  it('exactly one of two concurrent attemptActivation() calls for the SAME purchase activates it; the row lock inside activateMembershipTerms serializes them', async () => {
    const [r1, r2] = await Promise.all([
      attemptActivation('purchase_concurrency_1'),
      attemptActivation('purchase_concurrency_1'),
    ])

    const outcomes = [r1.outcome, r2.outcome].sort()
    expect(outcomes).toEqual(['ACTIVATED', 'ALREADY_ACTIVATED'])

    const countRes = spawnSync('docker', [
      'exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-t', '-c',
      `SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_concurrency_1'`,
    ], { encoding: 'utf8' })
    expect(countRes.stdout.trim()).toBe('1') // never double-activated

    // Evidence from Postgres's OWN server log (log_statement=all) — the
    // FOR UPDATE lock statement from activateMembershipTerms actually ran.
    const logs = spawnSync('docker', ['logs', CONTAINER_NAME], { encoding: 'utf8' })
    expect(logs.stdout + logs.stderr).toMatch(/SELECT id FROM jade_club_memberships WHERE id = .* FOR UPDATE/i)
  })
})
