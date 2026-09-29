/**
 * prisma/migrations/jade_travel_club_v1.sql — seed data vs. CHECK constraint
 * consistency.
 *
 * FOUND IN PRODUCTION MIGRATION ATTEMPT: the file's seed INSERT wrote
 * activation_method = 'NONE' for 4 of the 7 benefit rows, but the CHECK
 * constraint's allowed list omitted 'NONE' (it only listed
 * EXTERNAL_LINK/CODE/API/MANUAL) — a mismatch against
 * lib/jade-club/types.ts's JADE_BENEFIT_ACTIVATION_METHODS, which does
 * include 'NONE'. This was invisible to every check this repo normally runs
 * (tsc, jest against a mocked Prisma client, `prisma generate`, `next
 * build`) because none of them execute this raw SQL against a real Postgres
 * engine — it only surfaced when the migration owner actually ran it in
 * Supabase, where the whole transaction aborted (BEGIN...COMMIT with no
 * savepoint around the failing bare INSERT) and nothing was persisted.
 *
 * This test statically re-derives the CHECK constraint's allowed value list
 * from the live SQL text and asserts every activation_method literal in the
 * seed INSERT is a member of it — so a future edit to either the seed data
 * or the constraint that reintroduces this class of mismatch fails CI
 * without needing a live database.
 */
import fs from 'fs'
import path from 'path'

const SQL_PATH = path.resolve(__dirname, '../jade_travel_club_v1.sql')
const sql = fs.readFileSync(SQL_PATH, 'utf-8')

describe('jade_travel_club_v1.sql — seed data satisfies its own CHECK constraints', () => {
  it('every activation_method value in the seed INSERT is allowed by chk_jade_club_benefits_activation_method', () => {
    const constraintMatch = sql.match(
      /chk_jade_club_benefits_activation_method\s+CHECK \(activation_method IS NULL OR activation_method IN \(([^)]+)\)\)/,
    )
    expect(constraintMatch).not.toBeNull()
    const allowed = constraintMatch![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''))
    expect(allowed.length).toBeGreaterThan(0)

    // The seed INSERT's last two columns are always `activation_method,
    // sort_order` and sort_order is always a bare integer immediately
    // before the row's closing paren — so `, <TOKEN>, <int>)` unambiguously
    // captures the activation_method value for every row without a full
    // SQL/CSV parse (none of the row's string literals contain parentheses).
    const insertBlock = sql.match(/INSERT INTO jade_club_benefits[\s\S]*?ON CONFLICT/)
    expect(insertBlock).not.toBeNull()
    const rowMatches = [...insertBlock![0].matchAll(/,\s*('[A-Z_]+'|NULL)\s*,\s*\d+\)/g)]
    expect(rowMatches.length).toBe(7) // one per seeded benefit row

    for (const m of rowMatches) {
      const raw = m[1]
      if (raw === 'NULL') continue // NULL is always explicitly allowed
      const value = raw.replace(/^'|'$/g, '')
      expect(allowed).toContain(value)
    }
  })

  it('the CHECK constraint allowed list matches lib/jade-club/types.ts JADE_BENEFIT_ACTIVATION_METHODS (minus the always-allowed NULL)', () => {
    const constraintMatch = sql.match(
      /chk_jade_club_benefits_activation_method\s+CHECK \(activation_method IS NULL OR activation_method IN \(([^)]+)\)\)/,
    )
    const allowed = constraintMatch![1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).sort()

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JADE_BENEFIT_ACTIVATION_METHODS } = require('../../../lib/jade-club/types')
    const tsValues = [...JADE_BENEFIT_ACTIVATION_METHODS].sort()

    expect(allowed).toEqual(tsValues)
  })
})
