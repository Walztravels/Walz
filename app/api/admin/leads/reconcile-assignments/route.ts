import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import prisma from '@/lib/db'
import { isAtLeast } from '@/lib/permissions'

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

// Normalize a phone: strip all non-digits, keep last 9 digits
function tail9(phone: string): string {
  return phone.replace(/\D/g, '').slice(-9)
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const diagnose = searchParams.get('diagnose') === '1'

  const supabase = supabaseAdmin()

  // Raw leads with both assignedToId and whatsapp set
  const { data: rawLeads, error } = await supabase
    .from('leads')
    .select('id, whatsapp, assignedToId, name')
    .not('assignedToId', 'is', null)
    .not('whatsapp', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = rawLeads ?? []
  const phones = rows.map(r => r.whatsapp as string).filter(Boolean)

  // Count Prisma leads that match those phones but have no assignment
  const unassigned = await prisma.lead.count({
    where: { whatsapp: { in: phones }, assignedToId: null },
  })

  if (!diagnose) {
    return NextResponse.json({
      rawLeadsWithAssignment: rows.length,
      prismaLeadsNeedingSync: unassigned,
      message: unassigned > 0
        ? `POST to this endpoint to sync ${unassigned} assignments into the Prisma "Lead" table`
        : 'Nothing to sync — all matched leads already have assignedToId set',
      tip: 'Add ?diagnose=1 to see per-phone breakdown of why rows are not matching',
    })
  }

  // ── Diagnostic mode — per-phone analysis ──────────────────────────────────
  // Pull all Prisma Lead phones once (for efficient lookup)
  const allPrismaLeads = await prisma.lead.findMany({
    select: { id: true, whatsapp: true, name: true, assignedToId: true },
  })

  const prismaTail9Map: Record<string, { id: string; whatsapp: string | null; name: string; assignedToId: string | null }[]> = {}
  for (const pl of allPrismaLeads) {
    if (!pl.whatsapp) continue
    const key = tail9(pl.whatsapp)
    ;(prismaTail9Map[key] ??= []).push(pl)
  }

  const breakdown = rows.map(raw => {
    const rawPhone = raw.whatsapp as string
    const rawTail  = tail9(rawPhone)

    // 1. Exact match in Prisma
    const exact = allPrismaLeads.filter(pl => pl.whatsapp === rawPhone)

    // 2. Last-9-digit match (normalization fallback)
    const byTail = prismaTail9Map[rawTail] ?? []

    let matchType: string
    if (exact.length > 0) {
      matchType = exact[0].assignedToId
        ? 'exact_match_already_assigned'
        : 'exact_match_unassigned'
    } else if (byTail.length > 0) {
      matchType = 'phone_format_mismatch'
    } else {
      matchType = 'no_prisma_lead_found'
    }

    return {
      rawId:       raw.id,
      rawName:     raw.name,
      rawPhone,
      matchType,
      exactMatches: exact.length,
      tail9Matches: byTail.length,
      tail9Samples: byTail.slice(0, 2).map(p => ({ prismaId: p.id, prismaPhone: p.whatsapp })),
    }
  })

  const summary = {
    exact_match_already_assigned: 0,
    exact_match_unassigned:       0,
    phone_format_mismatch:        0,
    no_prisma_lead_found:         0,
  }
  for (const row of breakdown) {
    summary[row.matchType as keyof typeof summary]++
  }

  return NextResponse.json({
    rawLeadsWithAssignment: rows.length,
    summary,
    rows: breakdown,
    interpretation: [
      `exact_match_already_assigned (${summary.exact_match_already_assigned}): reconciled — Prisma already has assignedToId`,
      `exact_match_unassigned (${summary.exact_match_unassigned}): will be synced on next POST`,
      `phone_format_mismatch (${summary.phone_format_mismatch}): phone exists in Prisma but stored differently — reconcile needs normalisation`,
      `no_prisma_lead_found (${summary.no_prisma_lead_found}): lead only exists in raw table, never migrated to Prisma — reconcile cannot help these`,
    ],
  })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // super_admin gate — uses canonical role from ROLE_HIERARCHY in lib/permissions.ts
  // Canonical roles: sales_rep → coordinator → senior_manager → general_manager → super_admin
  // Only super_admin may execute bulk lead reconciliation.
  if (!isAtLeast(session.role as Parameters<typeof isAtLeast>[0], 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 })
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
