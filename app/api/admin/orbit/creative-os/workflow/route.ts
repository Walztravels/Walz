import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { WORKFLOW_PRESETS, validateWorkflow, executeWorkflow } from '@/lib/orbit/creative-os/workflow'
import type { WorkflowGraph, CommercialFacts, CostLane, RouterMode } from '@/lib/orbit/creative-os/types'

export const dynamic = 'force-dynamic'
const SUPER_ADMIN = 'super_admin'

/** GET — preset library (full graphs). */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ presets: WORKFLOW_PRESETS })
}

/**
 * POST — validate or execute a workflow graph.
 * { graph, action: 'validate' | 'execute' | 'dry_run',
 *   commercialFacts?, lane?, mode?, approvals? }
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    graph?: WorkflowGraph; action?: string
    commercialFacts?: CommercialFacts; lane?: CostLane; mode?: RouterMode
    approvals?: Record<string, boolean>
  } | null
  if (!body?.graph) return NextResponse.json({ error: 'graph required' }, { status: 400 })

  if (body.action === 'validate') {
    const errors = validateWorkflow(body.graph)
    return NextResponse.json({ valid: errors.length === 0, errors })
  }

  const run = await executeWorkflow(body.graph, {
    commercialFacts: body.commercialFacts,
    lane:            body.lane,
    mode:            body.mode,
    approvals:       body.approvals,
    dryRun:          body.action === 'dry_run',
  })

  await prisma.activityLog.create({
    data: {
      staffId: null, staffName: session.email,
      action: 'Creative OS Workflow Run',
      detail: `graph=${body.graph.key} mode=${body.action ?? 'execute'} steps=${run.results.length} halted=${run.halted}`,
    },
  }).catch(() => {})

  return NextResponse.json(run)
}
