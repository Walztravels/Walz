/**
 * Jade Travel Club Release 2B — REAL-Postgres concurrency proof for the
 * ATOMIC purchase-activation redesign.
 *
 * REAL POSTGRES CONCURRENCY — NOT VERIFIED IN THIS SESSION (see the
 * mode-detection block below for exactly what was checked). The test
 * below is complete, real code, ready to run; it is gated to
 * `describe.skip` ONLY so `npx jest` doesn't hard-fail in an environment
 * that structurally cannot reach a Postgres instance.
 *
 * ── HARNESS HARDENING (this revision) ───────────────────────────────────
 * Three issues were found by independent review of the PRIOR version of
 * this file and are fixed here:
 *
 * 1. FRESH-DB BOOTSTRAP VALIDITY. The Jade migrations reference "User"(id)
 *    via FK, but nothing created that table first, and none of the psql
 *    invocations used `-v ON_ERROR_STOP=1` — meaning a failed migration
 *    statement (e.g. "relation User does not exist") could be silently
 *    swallowed by `psql -f`'s default per-statement-continue behavior,
 *    with the harness reporting false success. Fixed by (a) creating a
 *    genuinely minimal, exact-shape prerequisite schema for the columns
 *    the Jade migrations/fixtures actually reference (see "PREREQUISITE
 *    SCHEMA STRATEGY" below for why this was chosen over running the full
 *    260-model `prisma db push`), and (b) `-v ON_ERROR_STOP=1` on every
 *    single psql invocation in this file, so any migration/fixture error
 *    now fails test setup loudly instead of continuing silently.
 *
 * 2. GENUINE CONCURRENCY, NOT SEQUENTIAL AWAITS WRAPPED IN Promise.all.
 *    Every scenario below that claims to be a race now uses
 *    `raceWithLockContentionProof()`, which (a) installs a temporary,
 *    test-only Postgres trigger that adds a deliberate `pg_sleep()` to
 *    UPDATE statements on the contended table — widening the row-lock
 *    hold window so the SECOND worker's own lock-acquisition attempt has
 *    time to genuinely queue behind it — and (b) runs a concurrent
 *    background poller against `pg_stat_activity` that captures whether,// and at what elapsed offset, a backend was actually observed
 *    `wait_event_type = 'Lock'` against that table. A scenario is only
 *    reported as having proven contention if the poller actually observed
 *    a lock wait — this is verified, not assumed. See "SCENARIO
 *    INVENTORY" below for the honest classification of every scenario in
 *    this file (several are NOT concurrency tests at all, and are labeled
 *    accordingly).
 *
 * 3. REDUCED HARD DOCKER DEPENDENCE. This file now supports two run
 *    modes: (a) the existing Docker-managed local Postgres (unchanged,
 *    still the default whenever Docker is available and no external URL
 *    is supplied), and (b) an externally-supplied, isolated Postgres via
 *    `JADE_TEST_DATABASE_URL` + an explicit `JADE_ALLOW_REAL_POSTGRES_TESTS=1`
 *    opt-in — see "EXTERNAL MODE SAFETY" below for the non-negotiable
 *    guards. External mode requires a local `psql` binary (this sandbox
 *    has neither Docker nor a local `psql`, so external mode is
 *    implemented and documented but genuinely unexercised here).
 *
 * ── PREREQUISITE SCHEMA STRATEGY ─────────────────────────────────────────
 * This repo has NO formal `prisma migrate` history — "User"/"Staff" were
 * never created via a hand-written SQL migration file this harness could
 * "apply in dependency order"; they predate this repo's hand-written-SQL
 * convention entirely. The two real alternatives were:
 *   (a) `prisma db push` against the REAL `prisma/schema.prisma` — would
 *       give perfect fidelity for every table, but pushes ALL ~260 models
 *       in this production schema to a throwaway container. Rejected as
 *       IMPRACTICAL specifically because this sandbox has no reachable
 *       Postgres to validate that operation against — a partial failure
 *       deep in 260 models (a missing extension, an ordering issue, an
 *       enum type this Postgres image lacks) would be silent and
 *       undebuggable blind, which is the exact class of risk this
 *       hardening pass exists to eliminate.
 *   (b) A minimal, test-only prerequisite schema containing ONLY the
 *       columns the Jade migrations' FKs and this file's own fixtures
 *       actually reference, with every included column's name/type/
 *       nullability/default copied EXACTLY from the real
 *       `prisma/schema.prisma` models (User, Staff, StaffNotification,
 *       ActivityLog) — never invented. Chosen. The one deliberate,
 *       documented simplification: `StaffNotification.category` is a
 *       native Postgres enum in the real schema; here it's a plain `text`
 *       column (a stricter type would reject nothing this file's own
 *       inserts don't already satisfy, and creating/registering an enum
 *       type adds complexity with no behavioral benefit for what these
 *       tests actually assert).
 *
 * CORRECTION (post-first-real-external-run): the first genuine run against
 * a real Neon Postgres test database reached and executed the scenarios,
 * but hit a real Prisma P2021 — `ActivityLog` did not exist, because it
 * was missing from the prerequisite bootstrap above. This is a harness gap,
 * NOT a Jade business-logic finding — the scenario results from that run
 * are invalid evidence and must be disregarded. `ActivityLog` (and the
 * `anon`/`authenticated`/`service_role` Postgres roles the Jade migrations'
 * RLS policies reference, also missing until this correction) have been
 * added below. See the "FULL PREREQUISITE-DEPENDENCY AUDIT" comment further
 * down for the complete trace of every non-Jade model reachable by the 12
 * scenarios in this file.
 *
 * ── EXTERNAL MODE SAFETY (non-negotiable) ────────────────────────────────
 * - The connection string is read ONLY from `JADE_TEST_DATABASE_URL` —
 *   this file never reads or falls back to `DATABASE_URL`.
 * - `JADE_ALLOW_REAL_POSTGRES_TESTS=1` must also be set, or setup throws
 *   before anything destructive runs.
 * - A safety banner printing the parsed host + database name is printed
 *   BEFORE any destructive statement.
 * - The database/host name must contain "test" (case-insensitive) and
 *   must NOT look like a production name ("prod"/"production") — setup
 *   throws otherwise. There is no way to reach this file's destructive
 *   DDL/DML against an untagged or ordinary connection string.
 *
 * ── SCENARIO INVENTORY (honest classification — see each `it()` too) ────
 *   1  TRUE CONCURRENT RACE     — two workers, same purchase
 *   2  TRUE CONCURRENT RACE     — two distinct same-tier purchases, same membership
 *   3  TRUE CONCURRENT RACE     — webhook vs reconciliation, same purchase
 *   4  TRUE CONCURRENT RACE     — refund vs activation, same purchase
 *   5  TRUE CONCURRENT RACE     — activation vs refund, same purchase (reverse ordering pressure)
 *   6  ROLLBACK TEST            — forced DB-level failure during issuance (single-threaded, no race)
 *   7  TRUE CONCURRENT RACE     — cross-tier CLUB vs CLUB_PLUS, CLUB pressured to win
 *   8  TRUE CONCURRENT RACE     — cross-tier CLUB vs CLUB_PLUS, CLUB_PLUS pressured to win
 *   9  FK-INTEGRITY TEST        — single DELETE, no concurrency involved
 *   10 ROLLBACK TEST            — forced invariant failure (single-threaded, no race)
 *   11 SEQUENTIAL STATE-TRANSITION TEST — POLICY_NO_LONGER_ACTIVE, real DB, no concurrency
 *   12 SEQUENTIAL STATE-TRANSITION TEST — purchaseIdHint crash-recovery self-heal, real DB, no concurrency
 * Scenarios 1-5, 7, 8 use `raceWithLockContentionProof()` and report
 * actual timing/contention evidence. Scenarios 6, 9, 10, 11, 12 were never
 * mislabeled as races in the prior version and remain single-threaded —
 * they are listed here for completeness of the honest inventory, not
 * because their classification changed.
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

function localPsqlAvailable(): boolean {
  try {
    execSync('psql --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const EXTERNAL_TEST_DB_URL = process.env.JADE_TEST_DATABASE_URL
const ALLOW_REAL_POSTGRES = process.env.JADE_ALLOW_REAL_POSTGRES_TESTS === '1'
const HAS_DOCKER = dockerAvailable()

type Mode = 'docker' | 'external' | 'none'
const MODE: Mode = EXTERNAL_TEST_DB_URL ? 'external' : HAS_DOCKER ? 'docker' : 'none'

const d = MODE !== 'none' ? describe : describe.skip

if (MODE === 'none') {
  // eslint-disable-next-line no-console
  console.warn(
    'REAL POSTGRES CONCURRENCY — NOT VERIFIED. Neither Docker nor an external test database is reachable in ' +
    'this environment: `docker`, `podman`, `colima`, `limactl`, `finch` are all absent from PATH, `docker info` ' +
    'fails, there is no /Applications/Docker.app, no local `postgres`/`pg_ctl`/`psql` binary, and no ' +
    'JADE_TEST_DATABASE_URL was supplied. This test has NOT produced real concurrency evidence in this session. ' +
    'Run it directly in an environment with Docker OR with JADE_TEST_DATABASE_URL + JADE_ALLOW_REAL_POSTGRES_TESTS=1 ' +
    'set before independent sign-off:\n' +
    '  npx jest lib/jade-club/__tests__/purchase-postgres-concurrency.test.ts',
  )
}

d('Jade Club 2B — real-Postgres atomic activation concurrency proof', () => {
  jest.setTimeout(300_000)
  jest.resetModules()

  const CONTAINER_NAME = `jade-2b-pg-concurrency-${Date.now()}`
  const PG_PORT = 55655
  const DOCKER_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`
  const DB_URL = MODE === 'external' ? (EXTERNAL_TEST_DB_URL as string) : DOCKER_DB_URL

  let logDir: string
  let attemptActivation: (purchaseId: string) => Promise<{ outcome: string; error?: string }>
  let recordRefund: (providerReference: string) => Promise<void>
  let recordCheckoutSessionPaid: (params: { providerReference: string; amountTotalMinor: number; currency: string; purchaseIdHint?: string | null }) => Promise<{ outcome: string; purchaseId?: string }>
  let reconcilePendingActivations: () => Promise<{ activated: number; requiresReconciliation: number }>
  let realPrisma: { $disconnect: () => Promise<void> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entitlementsModule: any

  // ── Mode-aware psql helpers — EVERY invocation uses -v ON_ERROR_STOP=1 ──
  function psql(sql: string) {
    if (MODE === 'docker') {
      return spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-c', sql], { encoding: 'utf8' })
    }
    return spawnSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-c', sql], { encoding: 'utf8' })
  }

  /** Same as psql() but THROWS on any non-zero exit — for setup/fixture statements where a silent failure must never be possible. */
  function psqlOrThrow(sql: string, label: string) {
    const res = psql(sql)
    if (res.status !== 0) {
      throw new Error(`[${label}] psql statement failed (ON_ERROR_STOP=1 caught it):\n${sql}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`)
    }
    return res
  }

  function runSqlFile(localPath: string, label = path.basename(localPath)) {
    if (MODE === 'docker') {
      spawnSync('docker', ['cp', localPath, `${CONTAINER_NAME}:/tmp/${label}`])
      const res = spawnSync('docker', ['exec', CONTAINER_NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', `/tmp/${label}`], { encoding: 'utf8' })
      if (res.status !== 0) throw new Error(`SQL file ${label} failed (docker mode, ON_ERROR_STOP=1 caught it):\n${res.stdout}\n${res.stderr}`)
      return res
    }
    const res = spawnSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', localPath], { encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`SQL file ${label} failed (external mode, ON_ERROR_STOP=1 caught it):\n${res.stdout}\n${res.stderr}`)
    return res
  }

  function assertExternalModeSafetyOrThrow(url: string) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('JADE_TEST_DATABASE_URL is not a valid connection URL.')
    }
    const dbName = parsed.pathname.replace(/^\//, '')
    const host = parsed.hostname
    // eslint-disable-next-line no-console
    console.warn(`\n[jade-postgres-tests] ⚠️  EXTERNAL POSTGRES MODE — about to run DESTRUCTIVE test setup against:\n    host:     ${host}\n    database: ${dbName}\n`)

    if (!ALLOW_REAL_POSTGRES) {
      throw new Error('JADE_TEST_DATABASE_URL is set but JADE_ALLOW_REAL_POSTGRES_TESTS=1 was not provided — refusing to run destructive setup without this explicit opt-in.')
    }
    const looksLikeProd = /prod(uction)?/i.test(dbName) || /prod(uction)?/i.test(host)
    if (looksLikeProd) {
      throw new Error(`Refusing to run — database/host name looks like a PRODUCTION name (host=${host}, database=${dbName}). Never run destructive Jade Club Postgres tests against anything resembling production.`)
    }
    const looksLikeTest = /test/i.test(dbName) || /test/i.test(host)
    if (!looksLikeTest) {
      throw new Error(`Refusing to run — the connection string's host or database name must clearly contain "test" (host=${host}, database=${dbName}). Refusing destructive setup against an unconfirmed database.`)
    }
    if (!localPsqlAvailable()) {
      throw new Error('JADE_TEST_DATABASE_URL is set but no local `psql` binary is available on PATH — external mode requires a local psql client for schema bootstrap and verification.')
    }
  }

  beforeAll(async () => {
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jade-2b-pg-'))

    if (MODE === 'external') {
      assertExternalModeSafetyOrThrow(DB_URL)
      let ready = false
      for (let i = 0; i < 30; i++) {
        const check = psql('SELECT 1')
        if (check.status === 0) { ready = true; break }
        spawnSync('sleep', ['1'])
      }
      if (!ready) throw new Error('External Postgres did not respond to a readiness check in time.')
    } else {
      // Docker mode — unchanged container lifecycle, still fully working.
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
    }

    // ── Idempotent Postgres role bootstrap ──────────────────────────────
    // The Jade migrations' RLS policies target `service_role` (e.g.
    // `CREATE POLICY "service_role_jade_club_..." ON ... TO service_role`)
    // — a role Supabase provisions automatically but vanilla Postgres
    // (this Docker image, or a fresh Neon/Railway database) does not.
    // Without it, those CREATE POLICY statements themselves fail with
    // "role service_role does not exist", which — now that ON_ERROR_STOP=1
    // is enforced — would abort migration setup outright. Created here,
    // idempotently, in the disposable test bootstrap only — NEVER in any
    // production migration file. `anon`/`authenticated` are included for
    // the same reason, in case a future Jade migration's RLS policies ever
    // reference them (none currently do, but Supabase always provisions
    // all three together, so bootstrapping only `service_role` would be a
    // partial, fragile fix). This test always connects as the `postgres`
    // superuser, which bypasses RLS regardless — these roles only need to
    // EXIST for the CREATE POLICY statements to succeed; their actual
    // privilege grants are irrelevant to what this test file exercises.
    const rolesSql = `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        END IF;
      END $$;
    `
    const rolesPath = path.join(logDir, 'roles.sql')
    fs.writeFileSync(rolesPath, rolesSql)
    runSqlFile(rolesPath, 'roles.sql')

    // ── Minimal, exact-shape prerequisite schema (see file header for why) ──
    //
    // FULL PREREQUISITE-DEPENDENCY AUDIT (traced across every production
    // code path the 12 scenarios in this file actually exercise —
    // attemptActivation, applyPurchaseTierBump, createMembershipTermsCore,
    // issueSlotsForSnapshot, recordRefund, recordCheckoutSessionPaid,
    // recordCheckoutSessionFailed, reconcilePendingActivations, and the
    // alert-raising functions; adminResetForRetry is NOT reachable by any
    // of the 12 scenarios and was excluded from this audit for that
    // reason): every non-Jade Prisma model touched is `User` (FK target
    // only), `Staff` (read by the alert functions), `StaffNotification`
    // (written by the alert functions), and `ActivityLog` (written by
    // lib/jade-club/purchase-activation.ts's writeAuditLog and
    // lib/jade-club/membership.ts's applyPurchaseTierBump — this was the
    // ONE table missing from the harness before this correction, causing
    // a real Prisma P2021 "table does not exist" inside the activation
    // transaction on a genuine external Postgres run). No other non-Jade
    // model is reachable by these 12 scenarios — entitlements.ts's OWN
    // ActivityLog write lives inside activateMembershipTerms (the 2A admin
    // wrapper), which none of these scenarios call; only its sibling
    // createMembershipTermsCore is exercised here, and that function never
    // touches ActivityLog itself.
    const prerequisiteSql = `
      CREATE TABLE IF NOT EXISTS "User" (
        id text PRIMARY KEY,
        name text,
        email text UNIQUE,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "Staff" (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL UNIQUE,
        "passwordHash" text NOT NULL,
        role text NOT NULL DEFAULT 'sales_rep',
        permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS "StaffNotification" (
        id text PRIMARY KEY,
        "staffId" text NOT NULL REFERENCES "Staff"(id),
        category text NOT NULL DEFAULT 'SYSTEM', -- native enum in the real schema; text here, see file header
        title text NOT NULL,
        body text NOT NULL,
        important boolean NOT NULL DEFAULT false,
        "sourceId" text,
        "sourceType" text,
        read boolean NOT NULL DEFAULT false,
        archived boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      -- Exact shape copied from prisma/schema.prisma's ActivityLog model —
      -- no @@map, so the real table name is the bare model name
      -- "ActivityLog"; no @map on any field, so every column name matches
      -- the Prisma field name exactly (camelCase, quoted). staffBranch/
      -- ipAddress/userAgent exist on the real model but are never written
      -- by any code path these 12 scenarios exercise — included anyway
      -- (nullable, matching the real model) for full schema fidelity
      -- rather than an invented stripped-down shape.
      CREATE TABLE IF NOT EXISTS "ActivityLog" (
        id text PRIMARY KEY,
        "staffId" text REFERENCES "Staff"(id) ON DELETE SET NULL,
        "staffName" text,
        "staffRole" text,
        "staffBranch" text,
        action text NOT NULL,
        module text,
        "entityId" text,
        "entityType" text,
        detail text,
        "ipAddress" text,
        "userAgent" text,
        before jsonb,
        after jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `
    const prerequisitePath = path.join(logDir, 'prerequisite.sql')
    fs.writeFileSync(prerequisitePath, prerequisiteSql)
    runSqlFile(prerequisitePath, 'prerequisite.sql')

    // The four Jade migrations, in order. ON_ERROR_STOP=1 (enforced inside
    // runSqlFile above) means any statement failure here throws loudly —
    // this is the direct fix for Issue 1's "may silently look like
    // success" finding.
    const migrations = [
      'jade_travel_club_v1.sql',
      'jade_travel_club_commercial_v2a.sql',
      'jade_travel_club_purchase_v2b.sql',
      'jade_travel_club_purchase_v2b_terms_link.sql',
    ]
    for (const file of migrations) {
      runSqlFile(path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', file), file)
    }

    psqlOrThrow(
      `INSERT INTO "Staff" (id, name, email, "passwordHash", role, permissions) ` +
      `VALUES ('staff_concurrency_1', 'Concurrency Reviewer', 'reviewer@example.com', 'x', 'super_admin', '{"jade_club.manage": true}'::jsonb) ` +
      `ON CONFLICT (id) DO NOTHING`,
      'staff fixture',
    )

    // Fixture sets — one per scenario, so no scenario's writes interfere.
    const fixtureSql = `
      INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES
        ('user_s1', 's1@example.com', 'Scenario 1', now(), now()),
        ('user_s2', 's2@example.com', 'Scenario 2', now(), now()),
        ('user_s3', 's3@example.com', 'Scenario 3', now(), now()),
        ('user_s4', 's4@example.com', 'Scenario 4', now(), now()),
        ('user_s5', 's5@example.com', 'Scenario 5', now(), now()),
        ('user_s6', 's6@example.com', 'Scenario 6', now(), now()),
        ('user_s7', 's7@example.com', 'Scenario 7', now(), now()),
        ('user_s8', 's8@example.com', 'Scenario 8', now(), now()),
        ('user_s9', 's9@example.com', 'Scenario 9', now(), now()),
        ('user_s10', 's10@example.com', 'Scenario 10', now(), now()),
        ('user_s11', 's11@example.com', 'Scenario 11', now(), now()),
        ('user_s12', 's12@example.com', 'Scenario 12', now(), now());

      INSERT INTO jade_club_commercial_policies (id, tier, market, currency, annual_price_minor, duration_months, service_fee_discount_percent, effective_from, version, status, created_by, created_at, updated_at)
      VALUES
        ('policy_concurrency_1', 'CLUB', 'NG', 'NGN', 8500000, 12, 10, now(), 1, 'ACTIVE', 'test-admin', now(), now()),
        ('policy_concurrency_plus', 'CLUB_PLUS', 'NG', 'NGN', 15000000, 12, 15, now(), 1, 'ACTIVE', 'test-admin', now(), now());
      INSERT INTO jade_club_benefits (id, key, name, category, status, active, created_at, updated_at)
      VALUES
        ('benefit_concurrency_1', 'jade-connect-concurrency', 'Jade Connect (test)', 'WALZ', 'ACTIVE', true, now(), now()),
        ('benefit_concurrency_plus', 'jade-connect-concurrency-plus', 'Jade Connect Plus (test)', 'WALZ', 'ACTIVE', true, now(), now());
      INSERT INTO jade_club_policy_benefits (id, policy_id, benefit_key, entitlement_type, count_per_period, created_at)
      VALUES
        ('pb_concurrency_1', 'policy_concurrency_1', 'jade-connect-concurrency', 'COUNT_PER_PERIOD', 3, now()),
        ('pb_concurrency_plus', 'policy_concurrency_plus', 'jade-connect-concurrency-plus', 'COUNT_PER_PERIOD', 6, now());

      INSERT INTO jade_club_memberships (id, user_id, member_code, tier, status, source, started_at, qr_token_version, created_at, updated_at) VALUES
        ('membership_s1', 'user_s1', 'JW-900001', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s2', 'user_s2', 'JW-900002', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s3', 'user_s3', 'JW-900003', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s4', 'user_s4', 'JW-900004', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s5', 'user_s5', 'JW-900005', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s6', 'user_s6', 'JW-900006', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s7', 'user_s7', 'JW-900007', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s8', 'user_s8', 'JW-900008', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s9', 'user_s9', 'JW-900009', 'CLUB', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s10', 'user_s10', 'JW-900010', 'FREE', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s11', 'user_s11', 'JW-900011', 'FREE', 'FREE', 'DEFAULT', now(), 1, now(), now()),
        ('membership_s12', 'user_s12', 'JW-900012', 'FREE', 'FREE', 'DEFAULT', now(), 1, now(), now());

      INSERT INTO jade_club_purchases (id, user_id, membership_id, policy_id, policy_version, tier, market, currency, amount_minor, provider, provider_reference, payment_status, activation_status, created_at, updated_at, paid_at) VALUES
        ('purchase_s1', 'user_s1', 'membership_s1', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s1', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s2a', 'user_s2', 'membership_s2', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s2a', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s2b', 'user_s2', 'membership_s2', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s2b', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s3', 'user_s3', 'membership_s3', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s3', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s4', 'user_s4', 'membership_s4', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s4', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s5', 'user_s5', 'membership_s5', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s5', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s6', 'user_s6', 'membership_s6', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s6', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s7_club', 'user_s7', 'membership_s7', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s7_club', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s7_plus', 'user_s7', 'membership_s7', 'policy_concurrency_plus', 1, 'CLUB_PLUS', 'NG', 'NGN', 15000000, 'STRIPE', 'cs_s7_plus', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s8_plus', 'user_s8', 'membership_s8', 'policy_concurrency_plus', 1, 'CLUB_PLUS', 'NG', 'NGN', 15000000, 'STRIPE', 'cs_s8_plus', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s8_club', 'user_s8', 'membership_s8', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s8_club', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s9', 'user_s9', 'membership_s9', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s9', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s10', 'user_s10', 'membership_s10', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s10', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s11', 'user_s11', 'membership_s11', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'cs_s11', 'SUCCEEDED', 'PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING', now(), now(), now()),
        ('purchase_s12', 'user_s12', 'membership_s12', 'policy_concurrency_1', 1, 'CLUB', 'NG', 'NGN', 8500000, 'STRIPE', 'pending:crashwindow_s12', 'PENDING', 'NOT_STARTED', now(), now(), NULL);
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
    recordCheckoutSessionPaid = activationModule.recordCheckoutSessionPaid
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    entitlementsModule = require('../entitlements')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    reconcilePendingActivations = require('../purchase-reconciliation').reconcilePendingActivations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    realPrisma = require('@/lib/db').default
  })

  afterAll(async () => {
    await realPrisma?.$disconnect().catch(() => {})
    if (MODE === 'docker') spawnSync('docker', ['rm', '-f', CONTAINER_NAME])
    try { fs.rmSync(logDir, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  })

  // ─── Genuine-concurrency proof infrastructure ─────────────────────────
  //
  // installSlowUpdateTrigger widens the real row-lock hold window on the
  // contended table by adding a temporary, test-only BEFORE UPDATE trigger
  // that calls pg_sleep() — this is test infrastructure only (added and
  // torn down per scenario), never a change to application code. It does
  // not manufacture the lock contention itself (Postgres's own row lock is
  // real and would exist without it); it only makes an already-real,
  // otherwise sub-millisecond contention window reliably observable by a
  // polling loop running from a separate process.
  function installSlowUpdateTrigger(table: string, delaySeconds: number, label: string) {
    const fnName = `test_slow_update_${label}_fn`
    const triggerName = `test_slow_update_${label}_trigger`
    psqlOrThrow(
      `CREATE OR REPLACE FUNCTION ${fnName}() RETURNS trigger AS $$ BEGIN PERFORM pg_sleep(${delaySeconds}); RETURN NEW; END; $$ LANGUAGE plpgsql;`,
      `install slow-update trigger fn (${label})`,
    )
    psqlOrThrow(
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${table}; CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fnName}();`,
      `install slow-update trigger (${label})`,
    )
    return () => {
      psql(`DROP TRIGGER IF EXISTS ${triggerName} ON ${table};`)
      psql(`DROP FUNCTION IF EXISTS ${fnName}();`)
    }
  }

  /**
   * Polls pg_stat_activity for a backend genuinely BLOCKED
   * (wait_event_type = 'Lock') with a query referencing `tableHint`.
   * Returns as soon as it observes one, with the elapsed offset from
   * `startedAt` — or after `timeoutMs` with `observed: false`. This is the
   * actual proof mechanism: a scenario only gets to claim "genuine
   * contention" if this function returns `observed: true`.
   */
  async function pollForLockContention(tableHint: string, startedAt: number, timeoutMs: number): Promise<{ observed: boolean; elapsedMs: number | null; sample?: string }> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const res = psql(
        `SELECT pid, wait_event_type, wait_event, query FROM pg_stat_activity ` +
        `WHERE wait_event_type = 'Lock' AND query ILIKE '%${tableHint}%' AND state = 'active'`,
      )
      if (res.stdout && res.stdout.trim().length > 0) {
        return { observed: true, elapsedMs: Date.now() - startedAt, sample: res.stdout.trim() }
      }
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
    return { observed: false, elapsedMs: null }
  }

  /**
   * Runs two workers genuinely concurrently, with a background poller
   * proving actual lock contention on `tableHint`, and reports full
   * timing/order evidence. THIS is what makes a scenario a "TRUE
   * CONCURRENT RACE" rather than two sequential awaits wrapped in
   * Promise.all — the poller result is asserted on, not just logged.
   */
  async function raceWithLockContentionProof<A, B>(params: {
    tableHint: string
    workerA: { label: string; run: () => Promise<A> }
    workerB: { label: string; run: () => Promise<B> }
    pollTimeoutMs?: number
  }): Promise<{ resultA: A; resultB: B; firstDone: string; contention: { observed: boolean; elapsedMs: number | null } }> {
    const startedAt = Date.now()
    const order: string[] = []

    const runA = params.workerA.run().then((r) => { order.push(params.workerA.label); return r })
    const runB = params.workerB.run().then((r) => { order.push(params.workerB.label); return r })
    const pollPromise = pollForLockContention(params.tableHint, startedAt, params.pollTimeoutMs ?? 2500)

    const [resultA, resultB, contention] = await Promise.all([runA, runB, pollPromise])

    // eslint-disable-next-line no-console
    console.log(`[race proof] ${params.workerA.label} vs ${params.workerB.label} on ${params.tableHint}:`, {
      startedAt, firstDone: order[0], secondDone: order[1],
      contentionObserved: contention.observed, contentionElapsedMs: contention.elapsedMs,
    })

    return { resultA, resultB, firstDone: order[0], contention }
  }

  it('SCENARIO 1 [TRUE CONCURRENT RACE] — two workers race the SAME purchase: exactly one terms period, exactly one 3-slot benefit-issuance set, ACTIVATED with membershipTermsId populated, NO FAILED_PERMANENTLY anywhere, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_purchases', 1, 's1')
    try {
      const { resultA, resultB, contention } = await raceWithLockContentionProof({
        tableHint: 'jade_club_purchases',
        workerA: { label: 'worker-A', run: () => attemptActivation('purchase_s1') },
        workerB: { label: 'worker-B', run: () => attemptActivation('purchase_s1') },
      })
      const outcomes = [resultA.outcome, resultB.outcome].sort()
      expect(outcomes).toEqual(['ACTIVATED', 'ALREADY_ACTIVATED'])
      expect(outcomes).not.toContain('FAILED_PERMANENTLY')
      expect(contention.observed).toBe(true) // PROOF, not assumption

      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s1'`)
      expect(termsCount.stdout.trim()).toBe('1')
      const slotsCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s1')`)
      expect(slotsCount.stdout.trim()).toBe('3')

      if (MODE === 'docker') {
        const logs = spawnSync('docker', ['logs', CONTAINER_NAME], { encoding: 'utf8' })
        expect(logs.stdout + logs.stderr).toMatch(/SELECT id FROM jade_club_purchases WHERE id = .* FOR UPDATE/i)
        expect(logs.stdout + logs.stderr).toMatch(/SELECT id FROM jade_club_memberships WHERE id = .* FOR UPDATE/i)
      }
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 2 [TRUE CONCURRENT RACE] — two DIFFERENT, distinct, same-tier SUCCEEDED purchases race for the SAME membership: exactly one ACTIVATED, exactly one terms period, the loser lands in PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_memberships', 1, 's2')
    try {
      const { resultA, resultB, contention } = await raceWithLockContentionProof({
        tableHint: 'jade_club_memberships',
        workerA: { label: 'purchase_s2a', run: () => attemptActivation('purchase_s2a') },
        workerB: { label: 'purchase_s2b', run: () => attemptActivation('purchase_s2b') },
      })
      const outcomes = [resultA.outcome, resultB.outcome].sort()
      expect(outcomes).toEqual(['ACTIVATED', 'REQUIRES_RECONCILIATION'])
      expect(outcomes).not.toContain('FAILED_PERMANENTLY')
      expect(contention.observed).toBe(true)

      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s2'`)
      expect(termsCount.stdout.trim()).toBe('1')

      const loserRow = psql(`SELECT activation_status, failure_reason FROM jade_club_purchases WHERE id IN ('purchase_s2a', 'purchase_s2b') AND activation_status = 'PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION'`)
      expect(loserRow.stdout).toContain('DUPLICATE_PAID_MEMBERSHIP_PURCHASE')

      const alertCount = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceType" = 'jade_club_reconciliation'`)
      expect(Number(alertCount.stdout.trim())).toBeGreaterThan(0)

      const reconScan = await reconcilePendingActivations()
      expect(reconScan.activated).toBe(0)
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 3 [TRUE CONCURRENT RACE] — a webhook-triggered attemptActivation() races a reconciliation-job pass over the SAME purchase: idempotent successful result, never double-activated, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_purchases', 1, 's3')
    try {
      const { resultA, contention } = await raceWithLockContentionProof({
        tableHint: 'jade_club_purchases',
        workerA: { label: 'webhook', run: () => attemptActivation('purchase_s3') },
        workerB: { label: 'reconciliation', run: () => reconcilePendingActivations() },
      })
      expect(['ACTIVATED', 'ALREADY_ACTIVATED']).toContain(resultA.outcome)
      expect(resultA.outcome).not.toBe('FAILED_PERMANENTLY')
      expect(contention.observed).toBe(true)

      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s3'`)
      expect(termsCount.stdout.trim()).toBe('1')
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 4 [TRUE CONCURRENT RACE] — refund vs activation racing the SAME purchase row lock: the purchase never ends ACTIVATED with a REFUNDED payment silently ignored, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_purchases', 1, 's4')
    try {
      const { resultA, contention } = await raceWithLockContentionProof({
        tableHint: 'jade_club_purchases',
        workerA: { label: 'activation', run: () => attemptActivation('purchase_s4') },
        workerB: { label: 'refund', run: () => recordRefund('cs_s4') },
      })
      expect(contention.observed).toBe(true)

      const finalRow = psql(`SELECT payment_status, activation_status FROM jade_club_purchases WHERE id = 'purchase_s4'`)
      expect(finalRow.stdout).toContain('REFUNDED')
      if (finalRow.stdout.includes('ACTIVATED') && !finalRow.stdout.includes('FAILED_PERMANENTLY')) {
        const alert = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceId" = 'jade-club-refund-after-activation:purchase_s4'`)
        expect(Number(alert.stdout.trim())).toBeGreaterThan(0)
      }
      expect(resultA).toBeTruthy()
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 5 [TRUE CONCURRENT RACE] — activation vs refund with the opposite start ordering pressure (activation fires first): the purchase ends REFUNDED, at most one terms row, alert raised if activation completed first, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_purchases', 1, 's5')
    try {
      const startedAt = Date.now()
      const order: string[] = []
      const activationPromise = attemptActivation('purchase_s5').then((r) => { order.push('activation'); return r })
      const refundPromise = new Promise<void>((resolve) => setTimeout(resolve, 10))
        .then(() => recordRefund('cs_s5'))
        .then((r) => { order.push('refund'); return r })
      const pollPromise = pollForLockContention('jade_club_purchases', startedAt, 2500)

      const [, , contention] = await Promise.all([activationPromise, refundPromise, pollPromise])
      // eslint-disable-next-line no-console
      console.log('[race proof] activation vs refund (staggered start) on jade_club_purchases:', { startedAt, order, contention })
      expect(contention.observed).toBe(true)

      const finalRow = psql(`SELECT payment_status, activation_status FROM jade_club_purchases WHERE id = 'purchase_s5'`)
      expect(finalRow.stdout).toContain('REFUNDED')

      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s5'`)
      expect(['0', '1']).toContain(termsCount.stdout.trim())

      if (finalRow.stdout.includes('ACTIVATED')) {
        const alert = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceId" = 'jade-club-refund-after-activation:purchase_s5'`)
        expect(Number(alert.stdout.trim())).toBeGreaterThan(0)
      }
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 6 [ROLLBACK TEST — single-threaded, no race] — a genuine technical failure during entitlement-slot issuance rolls back the ENTIRE real-Postgres transaction: no terms, no snapshots, no slots, no ACTIVATED purchase, membership tier bump also undone', async () => {
    psqlOrThrow(`ALTER TABLE jade_club_entitlement_slots ADD CONSTRAINT test_force_issuance_failure CHECK (false) NOT VALID`, 'scenario 6 setup')

    try {
      const outcome = await attemptActivation('purchase_s6')
      expect(outcome.outcome).toBe('FAILED_RETRYABLE')

      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s6'`)
      expect(termsCount.stdout.trim()).toBe('0')

      const slotsCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id IN (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s6')`)
      expect(slotsCount.stdout.trim()).toBe('0')

      const purchaseRow = psql(`SELECT activation_status FROM jade_club_purchases WHERE id = 'purchase_s6'`)
      expect(purchaseRow.stdout).toContain('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
      expect(purchaseRow.stdout).not.toContain('ACTIVATED')

      const membershipRow = psql(`SELECT status FROM jade_club_memberships WHERE id = 'membership_s6'`)
      expect(membershipRow.stdout).not.toContain('ACTIVE')

      if (MODE === 'docker') {
        const logs = spawnSync('docker', ['logs', CONTAINER_NAME], { encoding: 'utf8' })
        expect(logs.stdout + logs.stderr).toMatch(/test_force_issuance_failure/i)
      }
    } finally {
      psql(`ALTER TABLE jade_club_entitlement_slots DROP CONSTRAINT test_force_issuance_failure`)
    }
  })

  it('SCENARIO 7 [TRUE CONCURRENT RACE] — CROSS-TIER: CLUB vs CLUB_PLUS genuinely racing, CLUB pressured to win by a head start — membership.tier ends CLUB, never mutated by the CLUB_PLUS loser, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_memberships', 1, 's7')
    try {
      const startedAt = Date.now()
      const order: string[] = []
      // A small, explicit head start for CLUB (rather than a bare
      // Promise.all with identical start times) — this is what makes the
      // OUTCOME deterministic (CLUB pressured to win) while the actual
      // CONTENTION is still genuine: CLUB_PLUS's own attempt fires while
      // CLUB's transaction is still inside its slowed membership UPDATE,
      // holding the row lock — proven by the poller below, not assumed.
      const clubPromise = attemptActivation('purchase_s7_club').then((r) => { order.push('club'); return r })
      const plusPromise = new Promise<void>((resolve) => setTimeout(resolve, 15))
        .then(() => attemptActivation('purchase_s7_plus'))
        .then((r) => { order.push('club_plus'); return r })
      const pollPromise = pollForLockContention('jade_club_memberships', startedAt, 2500)

      const [clubOutcome, plusOutcome, contention] = await Promise.all([clubPromise, plusPromise, pollPromise])
      // eslint-disable-next-line no-console
      console.log('[race proof] SCENARIO 7 CLUB vs CLUB_PLUS on jade_club_memberships:', { startedAt, order, contention })

      expect(clubOutcome.outcome).toBe('ACTIVATED')
      expect(plusOutcome).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })
      expect(contention.observed).toBe(true)

      const membershipTier = psql(`SELECT tier, status FROM jade_club_memberships WHERE id = 'membership_s7'`)
      const activeTerms = psql(`SELECT id, tier, purchase_id FROM jade_club_membership_terms WHERE membership_id = 'membership_s7'`)
      const winningPurchase = psql(`SELECT activation_status, tier, membership_terms_id FROM jade_club_purchases WHERE id = 'purchase_s7_club'`)
      const losingPurchase = psql(`SELECT activation_status, failure_reason, tier, membership_terms_id FROM jade_club_purchases WHERE id = 'purchase_s7_plus'`)
      const snapshotCount = psql(`SELECT count(*) FROM jade_club_membership_benefit_snapshots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s7')`)
      const slotCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s7')`)
      const eventCount = psql(`SELECT count(*) FROM jade_club_entitlement_events WHERE slot_id IN (SELECT id FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s7'))`)

      // eslint-disable-next-line no-console
      console.log('[SCENARIO 7 final DB state]', {
        membershipTier: membershipTier.stdout.trim(), activeTerms: activeTerms.stdout.trim(),
        winningPurchase: winningPurchase.stdout.trim(), losingPurchase: losingPurchase.stdout.trim(),
        snapshotCount: snapshotCount.stdout.trim(), slotCount: slotCount.stdout.trim(), eventCount: eventCount.stdout.trim(),
      })

      expect(membershipTier.stdout).toContain('CLUB')
      expect(membershipTier.stdout).not.toContain('CLUB_PLUS')
      expect(activeTerms.stdout).toContain('purchase_s7_club')
      expect(winningPurchase.stdout).toContain('ACTIVATED')
      expect(losingPurchase.stdout).toContain('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
      expect(losingPurchase.stdout).toContain('CLUB_PLUS') // retained on ITS OWN record only
      expect(snapshotCount.stdout.trim()).toBe('1')
      expect(slotCount.stdout.trim()).toBe('3')
      expect(Number(eventCount.stdout.trim())).toBeGreaterThan(0)
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 8 [TRUE CONCURRENT RACE] — CROSS-TIER reverse: CLUB vs CLUB_PLUS genuinely racing, CLUB_PLUS pressured to win by a head start — membership.tier ends CLUB_PLUS, never downgraded by the CLUB loser, genuine lock contention proven', async () => {
    const removeTrigger = installSlowUpdateTrigger('jade_club_memberships', 1, 's8')
    try {
      const startedAt = Date.now()
      const order: string[] = []
      const plusPromise = attemptActivation('purchase_s8_plus').then((r) => { order.push('club_plus'); return r })
      const clubPromise = new Promise<void>((resolve) => setTimeout(resolve, 15))
        .then(() => attemptActivation('purchase_s8_club'))
        .then((r) => { order.push('club'); return r })
      const pollPromise = pollForLockContention('jade_club_memberships', startedAt, 2500)

      const [plusOutcome, clubOutcome, contention] = await Promise.all([plusPromise, clubPromise, pollPromise])
      // eslint-disable-next-line no-console
      console.log('[race proof] SCENARIO 8 CLUB_PLUS vs CLUB on jade_club_memberships:', { startedAt, order, contention })

      expect(plusOutcome.outcome).toBe('ACTIVATED')
      expect(clubOutcome).toEqual({ outcome: 'REQUIRES_RECONCILIATION', reason: 'DUPLICATE_PAID_MEMBERSHIP_PURCHASE' })
      expect(contention.observed).toBe(true)

      const membershipTier = psql(`SELECT tier, status FROM jade_club_memberships WHERE id = 'membership_s8'`)
      const activeTerms = psql(`SELECT id, tier, purchase_id FROM jade_club_membership_terms WHERE membership_id = 'membership_s8'`)
      const winningPurchase = psql(`SELECT activation_status, tier, membership_terms_id FROM jade_club_purchases WHERE id = 'purchase_s8_plus'`)
      const losingPurchase = psql(`SELECT activation_status, failure_reason, tier, membership_terms_id FROM jade_club_purchases WHERE id = 'purchase_s8_club'`)
      const snapshotCount = psql(`SELECT count(*) FROM jade_club_membership_benefit_snapshots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s8')`)
      const slotCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s8')`)
      const eventCount = psql(`SELECT count(*) FROM jade_club_entitlement_events WHERE slot_id IN (SELECT id FROM jade_club_entitlement_slots WHERE membership_terms_id = (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s8'))`)

      // eslint-disable-next-line no-console
      console.log('[SCENARIO 8 final DB state]', {
        membershipTier: membershipTier.stdout.trim(), activeTerms: activeTerms.stdout.trim(),
        winningPurchase: winningPurchase.stdout.trim(), losingPurchase: losingPurchase.stdout.trim(),
        snapshotCount: snapshotCount.stdout.trim(), slotCount: slotCount.stdout.trim(), eventCount: eventCount.stdout.trim(),
      })

      expect(membershipTier.stdout).toContain('CLUB_PLUS')
      expect(activeTerms.stdout).toContain('purchase_s8_plus')
      expect(winningPurchase.stdout).toContain('ACTIVATED')
      expect(losingPurchase.stdout).toContain('PAYMENT_CONFIRMED_REQUIRES_RECONCILIATION')
      expect(snapshotCount.stdout.trim()).toBe('1')
      expect(slotCount.stdout.trim()).toBe('6')

      const membershipTierOnly = psql(`SELECT tier FROM jade_club_memberships WHERE id = 'membership_s8'`)
      expect(membershipTierOnly.stdout.trim()).toBe('CLUB_PLUS')
    } finally {
      removeTrigger()
    }
  })

  it('SCENARIO 9 [FK-INTEGRITY TEST — no concurrency] — a real DELETE against a purchase backing an active terms row is rejected by Postgres (ON DELETE RESTRICT), never silently nulling the provenance', async () => {
    const activated = await attemptActivation('purchase_s9')
    expect(activated.outcome).toBe('ACTIVATED')

    const beforeDelete = psql(`SELECT id, purchase_id FROM jade_club_membership_terms WHERE membership_id = 'membership_s9'`)
    expect(beforeDelete.stdout).toContain('purchase_s9')

    const deleteAttempt = psql(`DELETE FROM jade_club_purchases WHERE id = 'purchase_s9'`)
    expect(deleteAttempt.status).not.toBe(0)
    expect((deleteAttempt.stderr || '') + (deleteAttempt.stdout || '')).toMatch(/foreign key constraint/i)

    const purchaseStillExists = psql(`SELECT count(*) FROM jade_club_purchases WHERE id = 'purchase_s9'`)
    expect(purchaseStillExists.stdout.trim()).toBe('1')
    const afterDelete = psql(`SELECT purchase_id FROM jade_club_membership_terms WHERE membership_id = 'membership_s9'`)
    expect(afterDelete.stdout).toContain('purchase_s9')
  })

  it('SCENARIO 10 [ROLLBACK TEST — single-threaded, no race] — a forced post-tier-bump invariant failure rolls back the ENTIRE real-Postgres transaction — tier mutation undone, purchase not ACTIVATED, no terms/snapshots/slots/events, verified via actual persisted state', async () => {
    const spy = jest.spyOn(entitlementsModule, 'createMembershipTermsCore').mockImplementationOnce(async () => ({
      ok: false, reason: 'UNEXPIRED_TERMS_EXISTS', existingTerms: { id: 'phantom_terms_for_scenario_10', purchaseId: null },
    }))

    try {
      const outcome = await attemptActivation('purchase_s10')
      expect(outcome.outcome).toBe('FAILED_RETRYABLE')
      expect(outcome.error).toContain('Collision detected after membership tier mutation under purchase/member locks')

      const membershipRow = psql(`SELECT tier, status FROM jade_club_memberships WHERE id = 'membership_s10'`)
      const purchaseRow = psql(`SELECT activation_status, membership_terms_id FROM jade_club_purchases WHERE id = 'purchase_s10'`)
      const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s10'`)
      const slotCount = psql(`SELECT count(*) FROM jade_club_entitlement_slots WHERE membership_terms_id IN (SELECT id FROM jade_club_membership_terms WHERE membership_id = 'membership_s10')`)

      // eslint-disable-next-line no-console
      console.log('[SCENARIO 10 final DB state — after rollback]', {
        membershipRow: membershipRow.stdout.trim(), purchaseRow: purchaseRow.stdout.trim(),
        termsCount: termsCount.stdout.trim(), slotCount: slotCount.stdout.trim(),
      })

      expect(membershipRow.stdout).toContain('FREE')
      expect(membershipRow.stdout).not.toContain('ACTIVE')
      expect(purchaseRow.stdout).toContain('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
      expect(termsCount.stdout.trim()).toBe('0')
      expect(slotCount.stdout.trim()).toBe('0')

      const alert = psql(`SELECT count(*) FROM "StaffNotification" WHERE "sourceId" = 'jade-club-activation-invariant-violation:purchase_s10'`)
      expect(Number(alert.stdout.trim())).toBeGreaterThan(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('SCENARIO 11 [SEQUENTIAL STATE-TRANSITION TEST — no concurrency needed] — POLICY_NO_LONGER_ACTIVE through the REAL attemptActivation orchestration against real Postgres: no tier mutation, no terms/snapshots/entitlements', async () => {
    // Uses a DEDICATED cloned policy row (never the shared
    // policy_concurrency_1 every other scenario also activates against),
    // so superseding it here can never affect any other scenario's
    // fixtures regardless of Jest's execution order.
    psqlOrThrow(
      `INSERT INTO jade_club_commercial_policies (id, tier, market, currency, annual_price_minor, duration_months, service_fee_discount_percent, effective_from, version, status, created_by, created_at, updated_at) ` +
      `VALUES ('policy_s11_superseded', 'CLUB', 'NG', 'NGN', 8500000, 12, 10, now(), 2, 'ACTIVE', 'test-admin', now(), now())`,
      'scenario 11 dedicated policy',
    )
    psqlOrThrow(`UPDATE jade_club_purchases SET policy_id = 'policy_s11_superseded' WHERE id = 'purchase_s11'`, 'scenario 11 repoint purchase')
    psqlOrThrow(`UPDATE jade_club_commercial_policies SET status = 'SUPERSEDED' WHERE id = 'policy_s11_superseded'`, 'scenario 11 supersede')

    const outcome = await attemptActivation('purchase_s11')
    expect(outcome).toEqual({ outcome: 'FAILED_PERMANENTLY', reason: 'POLICY_NO_LONGER_ACTIVE' })

    const membershipRow = psql(`SELECT tier, status FROM jade_club_memberships WHERE id = 'membership_s11'`)
    expect(membershipRow.stdout).toContain('FREE')
    const termsCount = psql(`SELECT count(*) FROM jade_club_membership_terms WHERE membership_id = 'membership_s11'`)
    expect(termsCount.stdout.trim()).toBe('0')
    const purchaseRow = psql(`SELECT activation_status, failure_reason FROM jade_club_purchases WHERE id = 'purchase_s11'`)
    expect(purchaseRow.stdout).toContain('POLICY_NO_LONGER_ACTIVE')
  })

  it('SCENARIO 12 [SEQUENTIAL STATE-TRANSITION TEST — no concurrency needed] — purchaseIdHint crash-recovery self-heal via the REAL recordCheckoutSessionPaid against real Postgres: correct purchase recovered, no duplicate created', async () => {
    const before = psql(`SELECT count(*) FROM jade_club_purchases`)
    const countBefore = Number(before.stdout.trim())

    const result = await recordCheckoutSessionPaid({
      providerReference: 'cs_s12_real_session',
      amountTotalMinor: 8_500_000,
      currency: 'NGN',
      purchaseIdHint: 'purchase_s12', // still carrying 'pending:crashwindow_s12' at this point — see fixture
    })
    expect(result).toEqual({ outcome: 'CONFIRMED_PENDING_ACTIVATION', purchaseId: 'purchase_s12' })

    const after = psql(`SELECT count(*) FROM jade_club_purchases`)
    expect(after.stdout.trim()).toBe(String(countBefore)) // no duplicate created

    const healed = psql(`SELECT provider_reference, payment_status, activation_status FROM jade_club_purchases WHERE id = 'purchase_s12'`)
    expect(healed.stdout).toContain('cs_s12_real_session')
    expect(healed.stdout).toContain('SUCCEEDED')
    expect(healed.stdout).toContain('PAYMENT_CONFIRMED_BUT_ACTIVATION_PENDING')
  })
})
