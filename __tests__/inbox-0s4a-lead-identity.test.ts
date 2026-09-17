/**
 * INBOX-0S.4A — Lead identity race (duplicate Lead rows from check-then-create).
 *
 * A production race created two Leads 256ms apart with the same
 * (source='whatsapp-jade', sourceId='jade-wa-+233554324622') because two
 * code paths did findFirst-then-create. The fix is a DB UNIQUE index on
 * ("source","sourceId") plus createLeadRaceSafe(): create first, and on
 * P2002 converge on the winner's row (created: false) so the loser applies
 * its update there instead of minting a second identity.
 *
 * Unit tests drive createLeadRaceSafe against stub Prisma clients that
 * mimic the unique index (this repo has no local DB — env is scrubbed);
 * source pins prove the two call sites and the schema are wired to it.
 */

import fs from 'fs'
import path from 'path'

import { createLeadRaceSafe } from '@/lib/leads/identity'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

// ── Stubs ────────────────────────────────────────────────────────────────────

type StoredRow = { id: string; source: string; sourceId: string }

/**
 * Stub Prisma client that behaves like the real UNIQUE ("source","sourceId")
 * index: the first create for an identity stores the row; any later create
 * for the same identity rejects with { code: 'P2002' }; findFirst returns
 * the stored row. `delayFirstCreate` parks the first create on the event
 * loop before its index check so the SECOND caller wins — proving arrival
 * order does not matter.
 */
function stubUniqueDb(opts: { delayFirstCreate?: boolean } = {}) {
  const rows: StoredRow[] = []
  let createCalls = 0
  let createSuccesses = 0
  let findFirstCalls = 0

  const db = {
    lead: {
      async create({ data }: { data: { source: string; sourceId: string } }) {
        createCalls += 1
        const mine = createCalls
        if (opts.delayFirstCreate && mine === 1) {
          await new Promise(resolve => setImmediate(resolve)) // let the rival reach the index first
        }
        if (rows.some(r => r.source === data.source && r.sourceId === data.sourceId)) {
          const err = new Error(
            'Unique constraint failed on the fields: (`source`,`sourceId`)',
          ) as Error & { code: string }
          err.code = 'P2002'
          throw err
        }
        const row: StoredRow = { id: `lead_${rows.length + 1}`, source: data.source, sourceId: data.sourceId }
        rows.push(row)
        createSuccesses += 1
        return { id: row.id }
      },
      async findFirst({ where }: { where: { source: string; sourceId: string } }) {
        findFirstCalls += 1
        const row = rows.find(r => r.source === where.source && r.sourceId === where.sourceId)
        return row ? { id: row.id } : null
      },
    },
    rows,
    stats: () => ({ createCalls, createSuccesses, findFirstCalls }),
  }
  return db
}

// The production identity that was duplicated.
const SOURCE = 'whatsapp-jade'
const SOURCE_ID = 'jade-wa-+233554324622'
const DATA = { name: 'WhatsApp Lead', status: 'New' }

// createLeadRaceSafe takes a PrismaClient; the stubs satisfy the shape it uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (stub: unknown) => stub as any

// ── Unit: createLeadRaceSafe ─────────────────────────────────────────────────

describe('createLeadRaceSafe — race-safe Lead creation by (source, sourceId)', () => {
  it('clean create returns created: true and stamps source/sourceId into the create data', async () => {
    let captured: Record<string, unknown> | null = null
    const db = asDb({
      lead: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          captured = data
          return { id: 'lead_new' }
        },
        findFirst: async () => { throw new Error('findFirst must not run on a clean create') },
      },
    })

    const res = await createLeadRaceSafe(db, SOURCE, SOURCE_ID, DATA)

    expect(res).toEqual({ id: 'lead_new', created: true })
    expect(captured).toMatchObject({ ...DATA, source: SOURCE, sourceId: SOURCE_ID })
  })

  it('P2002 (index conflict) falls back to findFirst on the SAME identity and returns the winner with created: false', async () => {
    let capturedWhere: Record<string, unknown> | null = null
    const db = asDb({
      lead: {
        create: async () => {
          const err = new Error('Unique constraint failed') as Error & { code: string }
          err.code = 'P2002'
          throw err
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          capturedWhere = where
          return { id: 'lead_winner' }
        },
      },
    })

    const res = await createLeadRaceSafe(db, SOURCE, SOURCE_ID, DATA)

    expect(res).toEqual({ id: 'lead_winner', created: false })
    expect(capturedWhere).toEqual({ source: SOURCE, sourceId: SOURCE_ID })
  })

  it('THE PRODUCTION RACE: two simultaneous saves for one identity converge on ONE row', async () => {
    const db = stubUniqueDb()

    const [a, b] = await Promise.all([
      createLeadRaceSafe(asDb(db), SOURCE, SOURCE_ID, DATA),
      createLeadRaceSafe(asDb(db), SOURCE, SOURCE_ID, DATA),
    ])

    // Both callers resolve to the same canonical Lead id.
    expect(a.id).toBe(b.id)
    // Exactly one create won; the other reports created: false so its caller
    // applies the update path to the winner's row.
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1)
    expect(db.stats().createSuccesses).toBe(1)
    // The 256ms-apart duplicate can no longer exist: one stored row.
    expect(db.rows).toHaveLength(1)
  })

  it('THE PRODUCTION RACE, interleaved: async ordering does not matter — the delayed first caller converges on the rival winner', async () => {
    const db = stubUniqueDb({ delayFirstCreate: true })

    const [first, second] = await Promise.all([
      createLeadRaceSafe(asDb(db), SOURCE, SOURCE_ID, DATA),
      createLeadRaceSafe(asDb(db), SOURCE, SOURCE_ID, DATA),
    ])

    // The first arrival stalled, so the SECOND caller won the index...
    expect(second.created).toBe(true)
    // ...and the first converged on it instead of duplicating.
    expect(first).toEqual({ id: second.id, created: false })
    expect(db.stats().createSuccesses).toBe(1)
    expect(db.rows).toHaveLength(1)
  })

  it('non-P2002 errors are rethrown, never swallowed into the findFirst fallback', async () => {
    let findFirstCalls = 0
    const dbError = new Error('connection reset') as Error & { code: string }
    dbError.code = 'P1001'
    const db = asDb({
      lead: {
        create: async () => { throw dbError },
        findFirst: async () => { findFirstCalls += 1; return { id: 'must_not_be_used' } },
      },
    })

    await expect(createLeadRaceSafe(db, SOURCE, SOURCE_ID, DATA)).rejects.toBe(dbError)
    expect(findFirstCalls).toBe(0)

    // A plain error with no Prisma code rethrows too.
    const bare = new Error('boom')
    const db2 = asDb({
      lead: {
        create: async () => { throw bare },
        findFirst: async () => ({ id: 'must_not_be_used' }),
      },
    })
    await expect(createLeadRaceSafe(db2, SOURCE, SOURCE_ID, DATA)).rejects.toBe(bare)
  })

  it('PATHOLOGICAL: P2002 but the winner row is gone → throws rather than silently continuing', async () => {
    const p2002 = new Error('Unique constraint failed') as Error & { code: string }
    p2002.code = 'P2002'
    const db = asDb({
      lead: {
        create: async () => { throw p2002 },
        findFirst: async () => null, // winner deleted between conflict and fetch
      },
    })

    await expect(createLeadRaceSafe(db, SOURCE, SOURCE_ID, DATA)).rejects.toBe(p2002)
  })
})

// ── Source pins: call sites use the race-safe path ───────────────────────────

describe('lib/jade/tools.ts save_lead is wired to the race-safe path', () => {
  const s = read('lib/jade/tools.ts')

  it('imports and calls createLeadRaceSafe with the jade-wa identity', () => {
    expect(s).toContain("import { createLeadRaceSafe } from '@/lib/leads/identity'")
    expect(s).toMatch(/createLeadRaceSafe\(db,\s*"whatsapp-jade",\s*`jade-wa-\$\{identifier\}`/)
  })

  it('contains NO bare db.lead.create anymore — check-then-create cannot come back', () => {
    expect(s).not.toContain('db.lead.create')
    // …and the meta webhook must never regain one either (review L5)
    const meta = fs.readFileSync(path.join(process.cwd(), 'app/api/webhooks/meta/route.ts'), 'utf8')
    expect(meta).not.toContain('prisma.lead.create')
  })

  it('the race LOSER applies its update to the winner\'s row', () => {
    expect(s).toContain('if (!res.created) await applyUpdate(res.id)')
    // and the fast path still updates an existing lead in place
    expect(s).toContain('await applyUpdate(existing.id)')
  })
})

describe('app/api/webhooks/meta/route.ts upsertLead is wired to the race-safe path', () => {
  const s = read('app/api/webhooks/meta/route.ts')
  // The create branch: from the race-safe create to the trailing notification.
  const branch = s.slice(s.indexOf('const res = await createLeadRaceSafe('), s.indexOf('Admin notification'))

  it('imports createLeadRaceSafe and branches on res.created', () => {
    expect(s).toContain("import { createLeadRaceSafe } from '@/lib/leads/identity'")
    expect(branch).toContain('createLeadRaceSafe(prisma, source, sourceId,')
    expect(branch).toContain('if (res.created)')
  })

  it('on losing the race it appends the message to the WINNER and refreshes lastMessage/lastMessageAt/isRead', () => {
    // Fetch the canonical winner row...
    expect(branch).toContain('prisma.lead.findUnique({ where: { id: res.id }, select: LEAD_SELECT })')
    // ...append the new conversation message to the winner's thread...
    expect(branch).toMatch(/winner\?\.conversation[\s\S]*?newMsg/)
    // ...and update the inbox fields on that same row.
    expect(branch).toMatch(/lastMessage:\s+message/)
    expect(branch).toMatch(/lastMessageAt:\s+new Date\(timestamp\)/)
    expect(branch).toMatch(/isRead:\s+false/)
  })

  it('sendJadeReply fires exactly ONCE in the create branch — winner or loser, one reply', () => {
    const calls = branch.match(/sendJadeReply\(/g) ?? []
    expect(calls).toHaveLength(1)
    // and it fires with the canonical lead, gated on having one
    expect(branch).toContain('if (lead) await sendJadeReply(lead as Lead, message, source, postContext)')
  })
})

// ── Source pins: schema + cleanup migration ──────────────────────────────────

describe('the database is the real guarantee', () => {
  it('prisma/schema.prisma Lead declares @@unique([source, sourceId])', () => {
    const s = read('prisma/schema.prisma')
    const lead = s.slice(s.indexOf('model Lead {'))
    const model = lead.slice(0, lead.indexOf('\nmodel '))
    expect(model).toContain('@@unique([source, sourceId])')
  })

  it('cleanup migration inbox_0s4a_lead_cleanup.sql merges duplicates safely before the index lands', () => {
    const p = path.join(process.cwd(), 'prisma/migrations/inbox_0s4a_lead_cleanup.sql')
    if (!fs.existsSync(p)) {
      throw new Error(
        'prisma/migrations/inbox_0s4a_lead_cleanup.sql does not exist yet — it is authored by ' +
        'a parallel agent. Integration order matters: land the cleanup migration, then re-run ' +
        'this suite. All other INBOX-0S.4A tests are independent of this file.',
      )
    }
    const s = fs.readFileSync(p, 'utf8')
    // Creates (or verifies) the Prisma-named unique index.
    expect(s).toContain('Lead_source_sourceId_key')
    // Refuses to proceed on unexpected state instead of guessing.
    expect(s).toContain('RAISE EXCEPTION')
    // Locks the rows it merges so a live webhook cannot interleave.
    expect(s).toContain('FOR UPDATE')
    // Lead conversations live on the Lead row — the migration must not touch
    // the Supabase messages table.
    expect(s).not.toMatch(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?"?messages"?/i)
    // …and never the Supabase 'leads' table (unquoted lowercase) — only "Lead" (review L5)
    expect(s).not.toMatch(/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?leads\b/i)
  })
})
