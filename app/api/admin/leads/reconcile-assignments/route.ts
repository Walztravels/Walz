import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

// One-time reconciliation: copy assignedToId from the pre-Prisma 'leads' table
// into Prisma's "Lead" table, matched by phone number (whatsapp column).
// GET  → dry-run count only (safe to call anytime)
// POST → execute the reconciliation (idempotent — only fills NULL assignedToId)

function supabaseAdmin() {
  const url   = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key   = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = supabaseAdmin()

  // Fetch raw leads that have assignedToId set
  const { data: rawLeads, error } = await supabase
    .from('leads')
    .select('whatsapp, assignedToId')
    .not('assignedToId', 'is', null)
    .not('whatsapp', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const phones = (rawLeads ?? []).map(r => r.whatsapp as string).filter(Boolean)

  // Count Prisma leads that match those phones but have no assignment
  const unassigned = await prisma.lead.count({
    where: {
      whatsapp:     { in: phones },
      assignedToId: null,
    },
  })

  return NextResponse.json({
    rawLeadsWithAssignment: rawLeads?.length ?? 0,
    prismaLeadsNeedingSync: unassigned,
    message: unassigned > 0
      ? `POST to this endpoint to sync ${unassigned} assignments into the Prisma "Lead" table`
      : 'Nothing to sync — all matched leads already have assignedToId set',
  })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Superadmin gate
  if (!['superadmin', 'admin'].includes(session.staffRole ?? session.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden — superadmin only' }, { status: 403 })
  }

  const supabase = supabaseAdmin()

  const { data: rawLeads, error } = await supabase
    .from('leads')
    .select('whatsapp, assignedToId, status, lastContactedAt')
    .not('assignedToId', 'is', null)
    .not('whatsapp', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let synced = 0
  const errors: string[] = []

  for (const raw of rawLeads ?? []) {
    const phone       = raw.whatsapp as string
    const assignedToId = raw.assignedToId as string

    try {
      const result = await prisma.lead.updateMany({
        where: {
          whatsapp:     phone,
          assignedToId: null,   // idempotent — only fill NULL slots
        },
        data: {
          assignedToId,
          ...(raw.lastContactedAt ? { lastContactedAt: new Date(raw.lastContactedAt) } : {}),
          status: 'Contacted',
        },
      })
      synced += result.count
    } catch (e) {
      errors.push(`${phone}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    synced,
    errors: errors.length ? errors : undefined,
    message: `Reconciliation complete — ${synced} Prisma "Lead" records updated`,
  })
}
