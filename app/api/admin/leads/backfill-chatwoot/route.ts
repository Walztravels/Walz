import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }          from '@/lib/admin-auth'
import { createClient }             from '@supabase/supabase-js'
import prisma                       from '@/lib/db'
import { isAtLeast }                from '@/lib/permissions'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// Backfills Prisma Lead records for Chatwoot-sourced leads that exist in the
// raw `leads` table (with an assignedToId) but have no corresponding row in
// the Prisma "Lead" table.
//
// GET  ?dry=1   → preview: shows count + sample of rows that would be created
// POST          → create the missing Prisma Lead rows (super_admin only)

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/** Normalise to last 9 digits for fuzzy dedup */
function tail9(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9)
}

type RawLead = {
  id:             string
  name:           string | null
  whatsapp:       string | null
  assignedToId:   string | null
  status:         string | null
  created_at:     string | null
  last_message_at: string | null
  next_follow_up_at: string | null
  last_contacted_at:  string | null
}

async function fetchUnmatchedRawLeads(): Promise<{
  unmatched: RawLead[]
  totalRaw: number
  exactMatched: number
  tail9Matched: number
}> {
  const supabase = supabaseAdmin()

  // All raw leads with both whatsapp and assignedToId
  const { data: rawLeads, error } = await supabase
    .from('leads')
    .select('id, name, whatsapp, assignedToId, status, created_at, last_message_at, next_follow_up_at, last_contacted_at')
    .not('assignedToId', 'is', null)
    .not('whatsapp', 'is', null)

  if (error) throw new Error(`Supabase error: ${error.message}`)

  const rows = (rawLeads ?? []) as RawLead[]

  // All Prisma Lead phones for dedup
  const prismaLeads = await prisma.lead.findMany({
    select: { whatsapp: true },
  })
  const exactSet  = new Set(prismaLeads.map(l => l.whatsapp).filter(Boolean) as string[])
  const tail9Set  = new Set(prismaLeads.map(l => l.whatsapp ? tail9(l.whatsapp) : '').filter(Boolean))

  let exactMatched = 0
  let tail9Matched = 0
  const unmatched: RawLead[] = []

  for (const row of rows) {
    const phone = row.whatsapp!
    if (exactSet.has(phone)) { exactMatched++; continue }
    if (tail9Set.has(tail9(phone))) { tail9Matched++; continue }
    unmatched.push(row)
  }

  return { unmatched, totalRaw: rows.length, exactMatched, tail9Matched }
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dry = new URL(req.url).searchParams.get('dry') !== '0'

  try {
    const { unmatched, totalRaw, exactMatched, tail9Matched } = await fetchUnmatchedRawLeads()

    return NextResponse.json({
      totalRaw,
      exactMatched,
      tail9Matched,
      willCreate: unmatched.length,
      sample: unmatched.slice(0, 5).map(r => ({
        rawId:    r.id,
        name:     r.name ?? '(no name)',
        phone:    r.whatsapp,
        assignedToId: r.assignedToId,
        created:  r.created_at,
        lastMsg:  r.last_message_at,
      })),
      message: dry
        ? `POST to this endpoint to create ${unmatched.length} missing Prisma Lead records`
        : undefined,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAtLeast(session.role as Parameters<typeof isAtLeast>[0], 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 })
  }

  try {
    const { unmatched } = await fetchUnmatchedRawLeads()

    if (unmatched.length === 0) {
      return NextResponse.json({ created: 0, message: 'Nothing to backfill — all raw leads already have Prisma records' })
    }

    let created   = 0
    let skipped   = 0
    const errors: string[] = []

    for (const raw of unmatched) {
      const phone = raw.whatsapp!
      const name  = (raw.name ?? '').trim() || 'Unknown Client'

      try {
        await prisma.lead.create({
          data: {
            name,
            whatsapp:       phone,
            assignedToId:   raw.assignedToId,
            source:         'whatsapp',
            platform:       'WhatsApp',
            status:         'Contacted',
            service:        'Other',
            // Preserve timestamps from the raw table where available
            ...(raw.last_message_at   ? { lastContactedAt:  new Date(raw.last_message_at)   } : {}),
            ...(raw.next_follow_up_at ? { nextFollowUpAt:   new Date(raw.next_follow_up_at) } : {}),
          },
        })
        created++
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        errors.push(`${phone}: ${reason}`)
        skipped++
      }
    }

    return NextResponse.json({
      created,
      skipped,
      errors: errors.length ? errors.slice(0, 20) : undefined,
      message: `Backfill complete. ${created} Prisma Lead records created. Run POST /api/admin/leads/reconcile-assignments to confirm assignments are visible.`,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
