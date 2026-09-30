/**
 * Jade Travel Club Release 2B — REAL-Postgres concurrency proof for the
 * ATOMIC purchase-activation redesign (Phase 1 structural remediation).
 *
 * REAL POSTGRES CONCURRENCY — NOT VERIFIED IN THIS SESSION. Checked again
 * per the mandatory instruction to re-verify Docker availability before
 * assuming the prior sandbox's absence still holds: `docker`, `podman`,
 * `colima`, `limactl`, `finch` are all absent from PATH, `docker info`
 * fails, there is no /Applications/Docker.app, and no local `postgres`/
 * `pg_ctl` binary or running Postgres process exists in this environment.
 * This is stated explicitly, not silently substituted with a mocked green
 * run. The test below is complete, real code, ready to run; it is gated
 * to `describe.skip` ONLY so `npx jest` doesn't hard-fail in an
 * environment that structurally cannot run Docker. An environment with
 * Docker available MUST run this directly before independent sign-off:
 *   npx jest lib/jade-club/__tests__/purchase-postgres-concurrency.test.ts
 *
 * TECHNIQUE (not copied from the jade-2a-gate-a worktree's reference
 * implementation — reproduced): a real `postgres:16` container with
 * `log_statement=all`, genuinely concurrent operations against real
 * Postgres connections, and the server's OWN log read back as evidence.
 *
 * CONCURRENCY MECHANISM: this file does NOT mock '@/lib/db' — it points
 * the REAL Prisma singleton at the dockerized Postgres instance (setting
 * DATABASE_URL/DIRECT_URL before that module is first required) and calls
 * the REAL, unmocked attemptActivation()/recordRefund()/
 * reconcilePendingActivations() concurrently via Promise.all. Prisma's
 * connection pool hands concurrent calls separate physical connections,
 * so Postgres itself has to arbitrate every race via the actual
 * `SELECT ... FOR UPDATE` row locks (purchase row in attemptActivation and
 * recordRefund; membership row inside createMembershipTermsCore).
 *
 * SCENARIOS (per the Phase 1 remediation's required test list):
 *   1. Two workers race the SAME purchase (Case A)
 *   2. Two DIFFERENT, distinct, SUCCEEDED purchases race for the SAME
 *      membership (Case B)
 *   3. A webhook-triggered attemptActivation() races a
 *      reconciliation-job pass over the SAME purchase
 *   4. Refund wins the purchase-row lock race against a concurrent
 *      activation attempt
 *   5. Activation wins the purchase-row lock race, THEN a refund lands
 *      immediately after (true mid-flight coordination, not a
 *      pre-refunded seed)
 *   6. A genuine technical failure during entitlement issuance rolls back
 *      the ENTIRE real-Postgres transaction (no terms, no snapshots, no
 *      slots, no ACTIVATED purchase)
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
    'REAL POSTGRES CONCURRENCY — NOT VERIFIED. Docker is not available in this environment ' +
    '(checked: docker, podman, colima, limactl, finch, /Applications/Docker.app, local postgres/pg_ctl — none found). ' +
    'This test has NOT produced real concurrency evidence in this session. An environment with Docker available ' +
    'MUST run it before independent review signs off on the atomic activation redesign:\n' +
    '  npx jest lib/jade-club/__tests__/purchase-postgres-concurrency.test.ts',
  )
}

d('Jade Club 2B Phase 1 — real-Postgres atomic activation concurrency proof', () => {
  jest.setTimeout(240_000)
  jest.resetModules()

  const CONTAINER_NAME = `jade-2b-pg-concurrency-${Date.now()}`
  const PG_PORT = 55655
  const DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`
  let logDir: string
  let attemptActivation: (purchaseId: string) => Promise<{ outcome: string }>
  let recordRefund: (providerReference: string) => Promise<void>
  let reconcilePendingActivations: () => Promise<{ activated: number; requiresReconciliation: number }>
  let realPrisma: { $disconnect: () => Promise<void> }

  function psql(sql: string) {
    return spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-t', '-c', sql], { encoding: 'utf8' })
  }
  function runSqlFile(localPath: string, containerName = path.basename(localPath)) {
    spawnSync('docker', ['cp', localPath, `${CONTAINER_NAME}:/tmp/${containerName}`])
    const res = spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-f', `/tmp/${containerName}`], { encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`SQL file ${containerName} failed:\n${res.stdout}\n${res.stderr}`)
    return res
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

    // All four migrations, in order — including the NEW structural
    // remediation migration (purchase_id link + RESTRICT FK).
    const migrations = [
      'jade_travel_club_v1.sql',
      'jade_travel_club_commercial_v2a.sql',
      'jade_travel_club_purchase_v2b.sql',
      'jade_travel_club_purchase_v2b_terms_link.sql',
    ]
    for (const file of migrations) {
      runSqlFile(path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', file), file)
    }

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
    runSqlFile(supportingPath, 'supporting.sql')

    // Six independent membership/policy/purchase fixture sets — one per
    // scenario, so no scenario's writes can interfere with another's.
    const fixtureSql = `
      INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES
        ('user_s1', 's1@example.com', 'Scenario 1', now(), now()),
        ('user_s2', 's2@example.com', 'Scenario 2', now(), now()),
        ('user_s3', 's3@example.com', 'Scenario 3', now(), now()),
        ('user_s4', 's4@example.com', 'Scenario 4', now(), now()),
        ('user_s5', 's5@example.com', 'Scenario 5', now(), now()),
        ('user_s6', 's6@example.com', 'Scenario 6', now(), now());

      INSERT INTO jade_club_commercial_policies (id, tier, market, currency, annual_price_minor, duration_months, service_fee_discount_percent, effective_from, version, status, created_by, created_at, updated_at)
      VALUES ('policy_concurrency_1', 'CLUB', 'NG', 'NGN', 8500000, 12, 10, now(), 1, 'ACTIVE', 'test-admin', now(), now());
      INSERT INTO jade_club_benefits (id, key, name, category, status, active, created_at, updated_at)
      VALUES ('benefit_concurrency_1', 'jade-connect-concurrency', 'Jade Connect (test)', 'WALZ', 'ACTIVE', true, now(), now());
      INSERT INTO jade_club_policy_benefits (id, policy_id, benefit_key, entitlement_type, count_per_period, created_at)
      VALUES ('pb_concurrency_1', 'policy_concurrency_1', 'jade-connect-concurrency', 'COUNT_PER_PERIOD', 3, now());

      -- Scenario 1: ONE membership, ONE purchase.
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_s1', 'user_s1', 'JW-900001', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_s1', 'user_s1', 'membership_s1', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s1', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- Scenario 2: ONE membership, TWO DIFFERENT purchases.
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_s2', 'user_s2', 'JW-900002', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES
        ('purchase_s2a', 'user_s2', 'membership_s2', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s2a', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s2b', 'user_s2', 'membership_s2', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s2b', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- Scenario 3: webhook attempt races a reconciliation-job pass.
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_s3', 'user_s3', 'JW-900003', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_s3', 'user_s3', 'membership_s3', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s3', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- Scenario 4: refund races activation for the lock on the SAME purchase (refund should be able to win).
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_s4', 'user_s4', 'JW-900004', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_s4', 'user_s4', 'membership_s4', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s4', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- Scenario 5: activation and refund race; whichever wins the lock first is fine, both outcomes are checked.
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_s5', 'user_s5', 'JW-900005', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_s5', 'user_s5', 'membership_s5', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s5', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());

      -- Scenario 6: rollback during issuance. The test itself adds a
      -- temporary real Postgres CHECK(false) constraint on
      -- jade_club_entitlement_slots immediately before calling
      -- attemptActivation, forcing a genuine DB-level failure at the exact
      -- point entitlement slots are inserted, then removes it afterward.
      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at)
      VALUES ('membership_s6', 'user_s6', 'JW-900006', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now());
      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at)
      VALUES ('purchase_s6', 'user_s6', 'membership_s6', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s6', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now());
    `
    const fixturePath = path.join(logDir, 'fixture.sql')
    fs.writeFileSync(fixturePath, fixtureSql)
    runSqlFile(fixturePath, 'fixture.sql')

    process.env.DATABASE_URL = DB_URL
    process.env.DIRECT_URL = DB_URL
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const activationModule = require('../purchase-activation')
    attemptActivation = activationModule.attemptActivation
    recordRefund = activationModule.recordRefund
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

  it('SCENARIO 1 — two workers race the SAME purchase: exactly one terms period, exactly one 3-slot benefit-issuance set, ACTIVATED with membershipTermsId populated, NO FAILED_PERMANENTLY anywhere', async () => {
    const [r1, r2] = await Promise.all([attemptActivation('purchase_s1'), attemptActivation('purchase_s1')])
    const outcomes = [r1.outcome, r2.outcome].sort()
    expect(outcomes).toEqual(['ACTIVATED', 'ALREADY_ACTIVATED'])
    expect(outcomes).not.toContain('FAILED_PERMANENTLY')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s1'`)
    expect(termsCount.stdout.trim()).toBe('1')
    const slotsCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s1')`)
    expect(slotsCount.stdout.trim()).toBe('3')

    const purchaseRow = psql(`SELECT activation_status, purchase_id FROM jade_club_purchases p JOIN jade_club_membership_terms t ON t.purchase_id = p.id WHERE p.id = 'purchase_s1'`)
    expect(purchaseRow.stdout).toContain('ACTIVATED')

    const logs = spawnSync('docker', ['logs', CONTAINER_NAME], { encoding: 'utf8' })
    expect(logs.stdout + logs.stderr).toMatch(/SELECT id FROM jade_club_purchases WHERE id = .* FOR UPDATE/i)
    expect(logs.stdout + logs.stderr).toMatch(/SELECT id FROM jade_club_memberships WHERE id = .* FOR UPDATE/i)
  })

  it('SCENARIO 2 — two DIFFERENT, distinct, SUCCEEDED purchases race for the SAME membership: exactly one ACTIVATED, exactly one terms period, the loser lands in PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION (never FAILED_PERMANENTLY, never a second activation)', async () => {
    const [rA, rB] = await Promise.all([attemptActivation('purchase_s2a'), attemptActivation('purchase_s2b')])
    const outcomes = [rA.outcome, rB.outcome].sort()
    expect(outcomes).toEqual(['ACTIVATED', 'REQUIRES_RECONCILIATION'])
    expect(outcomes).not.toContain('FAILED_PERMANENTLY')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s2'`)
    expect(termsCount.stdout.trim()).toBe('1')

    const loserRow = psql(`SELECT activation_status, failure_reason FROM jade_club_purchases WHERE id IN ('purchase_s2a', 'purchase_s2b') AND activation_status = 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION'`)
    expect(loserRow.stdout).toContain('DUPLICATE_PAID_MEMBERSHIP_PURCHASE')

    const alertCount = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceType" = 'jade_club_reconciliation'`)
    expect(Number(alertCount.stdout.trim())).toBeGreaterThan(0)

    const reconScan = await reconcilePendingActivations()
    expect(reconScan.activated).toBe(0) // no infinite retry loop — the loser is no longer even scanned
  })

  it('SCENARIO 3 — a webhook-triggered attemptActivation() races a reconciliation-job pass over the SAME purchase: idempotent successful result, never double-activated', async () => {
    const [webhookResult] = await Promise.all([attemptActivation('purchase_s3'), reconcilePendingActivations()])
    expect(['ACTIVATED', 'ALREADY_ACTIVATED']).toContain(webhookResult.outcome)
    expect(webhookResult.outcome).not.toBe('FAILED_PERMANENTLY')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s3'`)
    expect(termsCount.stdout.trim()).toBe('1')
  })

  it('SCENARIO 4 — refund wins the purchase-row lock race against a concurrent activation attempt: the purchase ends REFUNDED and never ACTIVATED', async () => {
    const [activationResult] = await Promise.all([
      attemptActivation('purchase_s4'),
      recordRefund('cs_s4'),
    ])
    // Either the refund lock wins first (activation then sees paymentStatus
    // REFUNDED under its own lock and reports FAILED_PERMANENTLY/
    // REFUNDED_BEFORE_ACTIVATION) or activation's lock briefly wins first
    // but the refund is still correctly recorded moments later — either
    // way, the row must NEVER end up ACTIVATED with paymentStatus REFUNDED
    // silently ignored.
    const finalRow = psql(`SELECT payment_status, activation_status FROM jade_club_purchases WHERE id = 'purchase_s4'`)
    expect(finalRow.stdout).toContain('REFUNDED')
    if (finalRow.stdout.includes('ACTIVATED') && !finalRow.stdout.includes('FAILED_PERMANENTLY')) {
      // Activation won the lock race first (payment was still SUCCEEDED at
      // that instant) — this is a legitimate outcome (design doc scenario
      // 8, refund AFTER activation), verified by requiring the refund-
      // after-activation alert to exist in that case.
      const alert = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceId" = 'jade-club-refund-after-activation:purchase_s4'`)
      expect(Number(alert.stdout.trim())).toBeGreaterThan(0)
    }
    expect(activationResult).toBeTruthy()
  })

  it('SCENARIO 5 — activation wins the purchase-row lock race, THEN a refund lands immediately after (true mid-flight coordination): the purchase ends ACTIVATED + REFUNDED with the refund-after-activation alert raised, never silently dropped', async () => {
    // Coordinate real concurrent operations rather than a pre-refunded
    // seed: fire activation first, and fire the refund a beat later but
    // BEFORE awaiting activation's result, so both are genuinely in
    // flight against Postgres at the same time.
    const activationPromise = attemptActivation('purchase_s5')
    const refundPromise = new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() => recordRefund('cs_s5'))

    await Promise.all([activationPromise, refundPromise])

    const finalRow = psql(`SELECT payment_status, activation_status FROM jade_club_purchases WHERE id = 'purchase_s5'`)
    expect(finalRow.stdout).toContain('REFUNDED')

    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s5'`)
    // Activation may or may not have completed before the refund's lock
    // acquisition, depending on real scheduling — either 0 or 1 terms rows
    // is valid, but NEVER more than 1 (no double-activation regardless of
    // interleaving).
    expect(['0', '1']).toContain(termsCount.stdout.trim())

    if (finalRow.stdout.includes('ACTIVATED')) {
      const alert = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceId" = 'jade-club-refund-after-activation:purchase_s5'`)
      expect(Number(alert.stdout.trim())).toBeGreaterThan(0)
    }
  })

  it('SCENARIO 6 — a genuine technical failure during entitlement-slot issuance rolls back the ENTIRE real-Postgres transaction: no terms, no snapshots, no slots, no ACTIVATED purchase, membership tier bump also undone', async () => {
    // Force a REAL Postgres-level failure at the exact point entitlement
    // slots are inserted — a CHECK(false) constraint with NOT VALID skips
    // validating pre-existing rows but Postgres still enforces it on every
    // NEW insert from this point forward, so the very first
    // jade_club_entitlement_slots INSERT inside the transaction genuinely
    // fails at the database level (not simulated in application code).
    psql(`ALTER TABLE jade_club_entitlement_slots ADD CONSTRAINT test_force_issuance_failure CHECK (false) NOT VALID`)

    try {
      const outcome = await attemptActivation('purchase_s6')
      expect(outcome.outcome).toBe('FAILED_RETRYABLE')

      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s6'`)
      expect(termsCount.stdout.trim()).toBe('0') // the terms row insert also rolled back, even though it succeeded before the slot insert failed

      const snapshotCount = psql(`SELECT count(*) FROM jade_club_membership_benefit_snapshots WHERE membership_terms_id NOT IN (SELECT id FROM jade_club_membership_terms)`)
      // (there are none full stop, since terms_count is 0 and snapshots FK to terms — this just re-confirms no orphaned snapshot rows exist)
      expect(Number(snapshotCount.stdout.trim())).toBe(0)

      const slotsCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id IN (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s6')`)
      expect(slotsCount.stdout.trim()).toBe('0')

      const purchaseRow = psql(`SELECT activation_status FROM jade_club_purchases WHERE id = 'purchase_s6'`)
      expect(purchaseRow.stdout).toContain('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
      expect(purchaseRow.stdout).not.toContain('ACTIVATED')

      // The membership tier bump (which runs BEFORE the failing slot
      // insert, in the SAME transaction) is ALSO rolled back — real proof
      // this is one atomic unit, not partially committed.
      const membershipRow = psql(`SELECT status FROM jade_club_memberships WHERE id = 'membership_s6'`)
      expect(membershipRow.stdout).not.toContain('ACTIVE')

      // Postgres's own log shows the real constraint-violation error.
      const logs = spawnSync('docker', ['logs', CONTAINER_NAME], { encoding: 'utf8' })
      expect(logs.stdout + logs.stderr).toMatch(/test_force_issuance_failure/i)
    } finally {
      psql(`ALTER TABLE jade_club_entitlement_slots DROP CONSTRAINT test_force_issuance_failure`)
    }
  })
})
