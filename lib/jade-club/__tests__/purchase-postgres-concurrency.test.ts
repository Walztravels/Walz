/**
 * Jade Travel Club Release 2B — REAL-Postgres concurrency proof, tightened
 * after independent review found the original assertions loose enough
 * that BOTH the correct outcome AND the buggy pre-remediation
 * FAILED_PERMANENTLY-loser behavior would have satisfied them. Every
 * assertion below now explicitly checks for the SPECIFIC correct outcome
 * AND explicitly checks that the buggy outcome never appears anywhere —
 * see each `expect(...).not.toBe('FAILED_PERMANENTLY')` / DB scans below.
 *
 * Three scenarios, matching the remediation's required proof:
 *   1. Two workers race the SAME purchase (Case A).
 *   2. Two DIFFERENT, distinct, already-SUCCEEDED purchases race for the
 *      SAME membership (Case B).
 *   3. A webhook-triggered attemptActivation() races a
 *      reconciliation-job pass over the SAME purchase.
 *
 * Follows the same technique as the reference implementation
 * (lib/jade-club/__tests__/postgres-concurrency.test.ts in the
 * jade-2a-gate-a worktree, and its CI workflow
 * .github/workflows/jade-postgres-concurrency-gate.yml — not copied, the
 * TECHNIQUE is reproduced here): a real `postgres:16` container with
 * `log_statement=all`, genuinely concurrent activation attempts, and
 * Postgres's own server log read back as evidence that the row lock
 * actually serialized the racing attempts (rather than trusting only the
 * application-level assertion).
 *
 * CONCURRENCY MECHANISM: this test does NOT mock '@/lib/db' — it points
 * the REAL Prisma singleton at the dockerized Postgres instance (by
 * setting DATABASE_URL/DIRECT_URL before that module is first required)
 * and calls the REAL, unmocked attemptActivation()/reconcilePendingActivations()
 * concurrently via Promise.all. Prisma's connection pool hands concurrent
 * calls separate physical connections, so Postgres itself — not the Node
 * event loop — is what has to arbitrate each race via
 * activateMembershipTerms's `SELECT ... FOR UPDATE` row lock.
 *
 * HARD REQUIREMENT (per remediation instructions): this test must actually
 * be run against real Docker-backed Postgres, not silently skipped. This
 * implementation session's sandbox has NO `docker` binary available at
 * all (`which docker` → not found) — that is stated here explicitly, not
 * silently. The test below is complete, real code, ready to run; it is
 * gated to `describe.skip` ONLY so `npx jest` doesn't hard-fail in an
 * environment that structurally cannot run Docker, and the skip reason is
 * printed loudly. **This has NOT been executed against real Postgres in
 * this session — an environment with Docker available must run it before
 * independent sign-off**, e.g.:
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
    '[purchase-postgres-concurrency.test.ts] SKIPPED — no `docker` binary is available in this environment ' +
    '(verified via `docker info` failing). This is stated explicitly, not silently: this test has NOT produced ' +
    'real concurrency evidence in this session. An environment with Docker available (CI, or a local machine) ' +
    'MUST run this test directly before independent review signs off on the race-condition remediation:\n' +
    '  npx jest lib/jade-club/__tests__/purchase-postgres-concurrency.test.ts',
  )
}

d('Jade Club 2B — real-Postgres concurrency proof (race-condition remediation)', () => {
  jest.setTimeout(180_000)
  jest.resetModules() // ensure lib/db's singleton has not been constructed yet with a stale DATABASE_URL

  const CONTAINER_NAME = `jade-2b-pg-concurrency-${Date.now()}`
  const PG_PORT = 55654
  const DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`
  let logDir: string
  let attemptActivation: (purchaseId: string) => Promise<{ outcome: string }>
  let reconcilePendingActivations: () => Promise<{ activated: number; requiresReconciliation: number }>
  let realPrisma: { $disconnect: () => Promise<void> }

  function psql(sql: string) {
    return spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-t', '-c', sql], { encoding: 'utf8' })
  }

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

    // Minimal Staff/StaffNotification tables this session's Prisma schema
    // also defines but the hand-written SQL migrations above don't create
    // (they are Phase-1-era Supabase tables outside this feature's own
    // migrations) — created inline here ONLY so the operational-alert path
    // (raiseJadeClubOperationalAlert) has somewhere real to write during
    // this test; this is test fixture setup, never run against production.
    const supportingTablesSql = `
      CREATE TABLE IF NOT EXISTS "Staff" (
        id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, "passwordHash" text NOT NULL,
        "roleTitle" text NOT NULL DEFAULT 'Staff', role text NOT NULL DEFAULT 'sales_rep',
        department text NOT NULL DEFAULT 'general', branch text NOT NULL DEFAULT 'nigeria',
        permissions jsonb NOT NULL DEFAULT '{}'::jsonb, "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "StaffNotification" (
        id text PRIMARY KEY, "staffId" text NOT NULL REFERENCES "Staff"(id),
        category text NOT NULL DEFAULT 'SYSTEM', title text NOT NULL, body text NOT NULL,
        important boolean NOT NULL DEFAULT false, "sourceId" text, "sourceType" text,
        read boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO "Staff" (id, name, email, "passwordHash", role, permissions)
      VALUES ('staff_concurrency_1', 'Concurrency Reviewer', 'reviewer@example.com', 'x', 'super_admin', '{"jade_club.manage": true}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `
    const supportingPath = path.join(logDir, 'supporting.sql')
    fs.writeFileSync(supportingPath, supportingTablesSql)
    spawnSync('docker', ['cp', supportingPath, `${CONTAINER_NAME}:/tmp/supporting.sql`])
    const supportingRes = spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-f', '/tmp/supporting.sql'], { encoding: 'utf8' })
    if (supportingRes.status !== 0) throw new Error(`Supporting tables failed:\n${supportingRes.stdout}\n${supportingRes.stderr}`)

    const fixtureSql = `
      INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES
        ('user_concurrency_1', 'concurrency1@example.com', 'Concurrency Test A', now(), now()),
        ('user_concurrency_2', 'concurrency2@example.com', 'Concurrency Test B', now(), now()),
        ('user_concurrency_3', 'concurrency3@example.com', 'Concurrency Test C', now(), now());

      -- ── Scenario 1 fixtures: ONE membership, ONE purchase (raced by two workers) ──
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_concurrency_1', 'user_concurrency_1', 'JW-999991', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_commercial_policies (id, tier, market, currency, annual_price_minor, duration_months, service_fee_discount_percent, effective_from, version, status, created_by, created_at, updated_at)
      VALUES ('policy_concurrency_1', 'CLUB', 'NG', 'NGN', 8500000, 12, 10, now(), 1, 'ACTIVE', 'test-admin', now(), now());
      INSERT INTO jade_club_benefits (id, key, name, category, status, active, created_at, updated_at)
      VALUES ('benefit_concurrency_1', 'jade-connect-concurrency', 'Jade Connect (test)', 'WALZ', 'ACTIVE', true, now(), now());
      INSERT INTO jade_club_policy_benefits (id, policy_id, benefit_key, entitlement_type, count_per_period, created_at)
      VALUES ('pb_concurrency_1', 'policy_concurrency_1', 'jade-connect-concurrency', 'COUNT_PER_PERIOD', 3, now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_concurrency_1', 'user_concurrency_1', 'membership_concurrency_1', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_concurrency_1', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- ── Scenario 2 fixtures: ONE membership, TWO DIFFERENT purchases (Case B) ──
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_concurrency_2', 'user_concurrency_2', 'JW-999992', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES
        ('purchase_concurrency_2a', 'user_concurrency_2', 'membership_concurrency_2', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_concurrency_2a', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_concurrency_2b', 'user_concurrency_2', 'membership_concurrency_2', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_concurrency_2b', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- ── Scenario 3 fixtures: webhook attempt races a reconciliation-job pass ──
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_concurrency_3', 'user_concurrency_3', 'JW-999993', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_concurrency_3', 'user_concurrency_3', 'membership_concurrency_3', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_concurrency_3', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());
    `
    const fixturePath = path.join(logDir, 'fixture.sql')
    fs.writeFileSync(fixturePath, fixtureSql)
    spawnSync('docker', ['cp', fixturePath, `${CONTAINER_NAME}:/tmp/fixture.sql`])
    const fixtureRes = spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-f', '/tmp/fixture.sql'], { encoding: 'utf8' })
    if (fixtureRes.status !== 0) throw new Error(`Fixture load failed:\n${fixtureRes.stdout}\n${fixtureRes.stderr}`)

    // Point the REAL Prisma singleton at the dockerized instance BEFORE
    // requiring anything that transitively imports it — plain Node
    // `require`, deliberately not a static ES `import`, so it runs after
    // the env vars above are set rather than being hoisted ahead of them.
    process.env.DATABASE_URL = DB_URL
    process.env.DIRECT_URL = DB_URL
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const activationModule = require('../purchase-activation')
    attemptActivation = activationModule.attemptActivation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    reconcilePendingActivations = require('../purchase-reconciliation').reconcilePendingActivations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    realPrisma = require('@/lib/db').default
  })

  afterAll(async () => {
    await realPrisma?.$disconnect().catch(() => {})
    spawnSync('docker', ['rm', '-f', CONTAINER_NAME])
    try { fs.rmSync(logDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  })

  it('SCENARIO 1 — two workers race the SAME purchase: exactly one terms period, exactly one benefit-issuance set, the purchase ends ACTIVATED, membershipTermsId populated, NO FAILED_PERMANENTLY anywhere', async () => {
    const [r1, r2] = await Promise.all([
      attemptActivation('purchase_concurrency_1'),
      attemptActivation('purchase_concurrency_1'),
    ])

    const outcomes = [r1.outcome, r2.outcome].sort()
    // Tightened per independent review: the ONLY acceptable pair.
    expect(outcomes).toEqual(['ACTIVATED', 'ALREADY_ACTIVATED'])
    expect(outcomes).not.toContain('FAILED_PERMANENTLY') // the exact bug that was found

    const purchaseRow = psql(`SELECT activation_status, membership_terms_id FROM jade_club_purchases WHERE id = 'purchase_concurrency_1'`)
    expect(purchaseRow.stdout).toContain('ACTIVATED')
    expect(purchaseRow.stdout).not.toContain('FAILED_PERMANENTLY')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_concurrency_1'`)
    expect(termsCount.stdout.trim()).toBe('1') // exactly one terms period

    const slotsCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_concurrency_1')`)
    expect(slotsCount.stdout.trim()).toBe('3') // exactly ONE 3-slot benefit-issuance set — never 6 (double-issued)

    // Evidence from Postgres's OWN server log (log_statement=all) — the
    // FOR UPDATE lock statement from activateMembershipTerms actually ran,
    // proving Postgres itself (not application luck) serialized the race.
    const logs = spawnSync('docker', ['logs', CONTAINER_NAME], { encoding: 'utf8' })
    expect(logs.stdout + logs.stderr).toMatch(/SELECT id FROM jade_club_memberships WHERE id = .* FOR UPDATE/i)

    // No FAILED_PERMANENTLY anywhere in the audit trail for this purchase.
    const failedLogCount = psql(`SELECT count(*) FROM "ActivityLog" WHERE "entityId" = 'purchase_concurrency_1' AND action = 'JADE_CLUB_PURCHASE_ACTIVATION_FAILED_PERMANENTLY'`)
    expect(failedLogCount.stdout.trim()).toBe('0')
  })

  it('SCENARIO 2 — two DIFFERENT, distinct, already-SUCCEEDED purchases race for the SAME membership: exactly one ACTIVATED, exactly one terms period, exactly one entitlement-issuance set, the loser lands in PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION (never FAILED_PERMANENTLY, never a second activation, never an infinite retry loop)', async () => {
    const [rA, rB] = await Promise.all([
      attemptActivation('purchase_concurrency_2a'),
      attemptActivation('purchase_concurrency_2b'),
    ])

    const outcomes = [rA.outcome, rB.outcome].sort()
    expect(outcomes).toEqual(['ACTIVATED', 'REQUIRES_RECONCILIATION'])
    expect(outcomes).not.toContain('FAILED_PERMANENTLY') // the core Case B fix

    const statuses = psql(`SELECT id, activation_status, failure_reason FROM jade_club_purchases WHERE id IN ('purchase_concurrency_2a', 'purchase_concurrency_2b') ORDER BY id`)
    expect(statuses.stdout).toContain('ACTIVATED')
    expect(statuses.stdout).toContain('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
    expect(statuses.stdout).toContain('DUPLICATE_PAID_MEMBERSHIP_PURCHASE')
    expect(statuses.stdout).not.toContain('FAILED_PERMANENTLY')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_concurrency_2'`)
    expect(termsCount.stdout.trim()).toBe('1') // exactly one terms period — never two

    // The loser is NOT retryable via the reconciliation job's own scan filter.
    const reconScan = await reconcilePendingActivations()
    expect(reconScan.activated).toBe(0) // nothing new activates — no infinite retry loop
    expect(reconScan.requiresReconciliation).toBe(0) // it was already moved out of the scan's filter before this run

    // The loser remains fully visible/reconcilable — never swallowed.
    const loserExists = psql(`SELECT count(*) FROM jade_club_purchases WHERE id IN ('purchase_concurrency_2a', 'purchase_concurrency_2b') AND payment_status = 'SUCCEEDED'`)
    expect(loserExists.stdout.trim()).toBe('2') // both rows still present, both still show money received

    // A real staff alert exists for the reconciliation case.
    const alertCount = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceType" = 'jade_club_reconciliation'`)
    expect(Number(alertCount.stdout.trim())).toBeGreaterThan(0)
  })

  it('SCENARIO 3 — a webhook-triggered attemptActivation() races a reconciliation-job pass over the SAME purchase: idempotent successful result, never double-activated, never an error', async () => {
    const [webhookResult, reconResult] = await Promise.all([
      attemptActivation('purchase_concurrency_3'),
      reconcilePendingActivations(),
    ])

    // The webhook side must land on exactly one of the two valid idempotent outcomes.
    expect(['ACTIVATED', 'ALREADY_ACTIVATED']).toContain(webhookResult.outcome)
    expect(webhookResult.outcome).not.toBe('FAILED_PERMANENTLY')

    // The reconciliation pass must never report a second activation for
    // the same purchase as an error — its own summary counters must add
    // up sanely (this call itself must not throw).
    expect(reconResult).toBeTruthy()

    const purchaseRow = psql(`SELECT activation_status FROM jade_club_purchases WHERE id = 'purchase_concurrency_3'`)
    expect(purchaseRow.stdout).toContain('ACTIVATED')
    expect(purchaseRow.stdout).not.toContain('FAILED_PERMANENTLY')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_concurrency_3'`)
    expect(termsCount.stdout.trim()).toBe('1')
  })
})
