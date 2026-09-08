import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { capabilityMatrix, resolveRoute } from '@/lib/orbit/creative-os/registry'
import { getProviderHealthSummary } from '@/lib/orbit/creative-os/provider-health'
import { WORKFLOW_PRESETS } from '@/lib/orbit/creative-os/workflow'
import type { CapabilityKind, CostLane, RouterMode } from '@/lib/orbit/creative-os/types'

export const dynamic = 'force-dynamic'
const SUPER_ADMIN = 'super_admin'

/**
 * GET /api/admin/orbit/creative-os — Creative OS status surface:
 * capability matrix (what's available per lane), sanitized provider health,
 * presets. Same RBAC gate as the rest of Orbit. No provider keys, URLs,
 * tokens, or raw provider errors ever leave the server.
 */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const providers = await getProviderHealthSummary()
  return NextResponse.json({
    capabilities: capabilityMatrix(),
    providers,
    presets:      WORKFLOW_PRESETS.map(p => ({ key: p.key, label: p.label, nodes: p.nodes.length })),
    lanes:        ['LOCAL', 'STANDARD', 'PREMIUM', 'AUTO'],
    modes:        ['AUTO', 'BEST_VALUE', 'BEST_QUALITY', 'BEST_TYPOGRAPHY', 'CINEMATIC', 'FAST', 'LOCAL_ONLY'],
  })
}

/** POST — dry-resolve a route (staff preview of what would run, no execution). */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { capability?: CapabilityKind; lane?: CostLane; mode?: RouterMode } | null
  if (!body?.capability) return NextResponse.json({ error: 'capability required' }, { status: 400 })
  const route = resolveRoute({ capability: body.capability, lane: body.lane, mode: body.mode })
  if ('error' in route) return NextResponse.json({ ok: false, error: route.error, code: route.code })
  return NextResponse.json({
    ok: true,
    // Staff-facing: label + lane + cost only. Raw provider model IDs stay server-side.
    choice:   { label: route.entry.label, lane: route.lane, costUsd: route.entry.costUsd, provider: route.entry.provider },
    failover: route.failover.map(f => f.label),
    reason:   route.reason,
  })
}
