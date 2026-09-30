/**
 * Walz Business (Release 2.1) — static validation of
 * prisma/migrations/walz_business_r2_1.sql: zero silent reclassification,
 * zero row mutation beyond the two explicitly-documented backfill
 * statements, additive-only, idempotent, RLS convention matched.
 */
import fs from 'fs'
import path from 'path'

const SQL_PATH = path.join(__dirname, '..', 'prisma', 'migrations', 'walz_business_r2_1.sql')
const sql = fs.readFileSync(SQL_PATH, 'utf8')
// Comment-stripped view for structural checks, so prose mentioning SQL
// keywords (e.g. explaining why something was NOT built) never gets
// mistaken for actual executable SQL.
const sqlNoComments = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')

describe('walz_business_r2_1.sql — structural safety', () => {
  it('is wrapped in a single BEGIN/COMMIT transaction', () => {
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
  })

  it('contains no DROP TABLE / DROP COLUMN outside the documented ROLLBACK comment block', () => {
    const rollbackStart = sql.indexOf('-- ROLLBACK')
    const rollbackEnd = sql.indexOf('-- ====', rollbackStart + 1)
    const body = sql.slice(0, rollbackStart) + sql.slice(rollbackEnd)
    expect(body).not.toMatch(/DROP TABLE/i)
    expect(body).not.toMatch(/DROP COLUMN/i)
  })

  it('every ALTER TABLE ... ADD COLUMN uses IF NOT EXISTS (idempotent)', () => {
    const addColumnLines = sqlNoComments.match(/ADD COLUMN[^;]*/gi) ?? []
    expect(addColumnLines.length).toBeGreaterThan(0)
    for (const line of addColumnLines) {
      expect(line).toMatch(/IF NOT EXISTS/i)
    }
  })

  it('every CREATE TABLE uses IF NOT EXISTS (idempotent)', () => {
    const createTableLines = sqlNoComments.match(/CREATE TABLE[^\n(]*/gi) ?? []
    expect(createTableLines.length).toBeGreaterThan(0)
    for (const line of createTableLines) {
      expect(line).toMatch(/IF NOT EXISTS/i)
    }
  })

  it('contains EXACTLY TWO backfill UPDATE statements, each explicitly commented and each touching exactly one table', () => {
    const updates = sql.match(/^UPDATE\s+\w+/gim) ?? []
    expect(updates.length).toBe(2)
    expect(sql).toMatch(/UPDATE organizations SET organization_type = 'CORPORATE'/)
    expect(sql).toMatch(/UPDATE business_travellers SET traveller_kind = 'EMPLOYEE'/)
    expect(sql).toMatch(/EXPLICIT BACKFILL/i)
  })

  it('the organization_type backfill explicitly authorizes and documents the acceptance-test organization classification', () => {
    expect(sql).toMatch(/Walz Business Acceptance Test/)
    expect(sql).toMatch(/explicit authorization/i)
  })

  it('every new table enables RLS with a service_role-only ALL policy (matching R1/R2 convention)', () => {
    const newTables = ['organization_invitations', 'organization_brand_settings', 'travel_request_service_attestations']
    for (const table of newTables) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated`))
      expect(sql).toMatch(new RegExp(`CREATE POLICY "service_role_${table}" ON ${table}`))
    }
  })

  it('organization_invitations stores only token_hash, never a raw token column', () => {
    const tableBlock = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS organization_invitations'), sql.indexOf('CREATE TABLE IF NOT EXISTS organization_brand_settings'))
    expect(tableBlock).toMatch(/token_hash\s+text\s+NOT NULL/)
    expect(tableBlock).not.toMatch(/\btoken\s+text/) // no separate raw-token column
  })

  it('organization_invitations has a partial unique index limiting one un-consumed invitation per (org, email)', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitations_active_per_org_email/)
    expect(sql).toMatch(/WHERE consumed_at IS NULL/)
  })

  it('CHECK constraints are added idempotently via DO $$ ... pg_constraint guard blocks', () => {
    const checkBlocks = sql.match(/DO \$\$ BEGIN[\s\S]*?END \$\$;/g) ?? []
    expect(checkBlocks.length).toBeGreaterThan(0)
    for (const block of checkBlocks) {
      if (/ADD CONSTRAINT/.test(block)) {
        expect(block).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname/)
      }
    }
  })

  it('the organization_type CHECK constraint matches lib/business/organization-type.ts\'s exact allow-list', () => {
    expect(sql).toMatch(/CHECK \(organization_type IN \('CORPORATE', 'TRAVEL_AGENCY', 'REFERRAL_PARTNER'\)\)/)
  })

  it('the traveller_kind CHECK constraint matches lib/business/traveller-kind.ts\'s exact allow-list', () => {
    expect(sql).toMatch(/CHECK \(traveller_kind IN \('EMPLOYEE', 'CLIENT'\)\)/)
  })

  it('the scanStatus CHECK constraint matches the schema comment\'s exact allow-list', () => {
    expect(sql).toMatch(/CHECK \("scanStatus" IN \('PENDING_SCAN', 'SCAN_UNAVAILABLE', 'CLEAN', 'QUARANTINED'\)\)/)
  })

  it('never creates a B2BVisaApplication or PortalDocument-style table (explicit scope guard)', () => {
    expect(sql).not.toMatch(/B2BVisaApplication/i)
    expect(sql).not.toMatch(/PortalDocument/i)
  })

  it('introduces no commission/payout/clawback/eligibility COLUMNS anywhere (comments explaining the deliberate exclusion are fine; actual schema is not)', () => {
    expect(sqlNoComments).not.toMatch(/commission|payout|clawback|eligibility_window/i)
  })

  it('has a VALIDATION section asserting zero unintended backfill on the three brand-new tables', () => {
    expect(sql).toMatch(/invitation_row_count/)
    expect(sql).toMatch(/brand_settings_row_count/)
    expect(sql).toMatch(/attestation_row_count/)
  })
})
