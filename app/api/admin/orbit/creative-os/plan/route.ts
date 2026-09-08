import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { buildCreativePlan } from '@/lib/orbit/creative-os/director'
import { buildCampaignKit } from '@/lib/orbit/creative-os/kit'
import { runQualityGate } from '@/lib/orbit/creative-os/quality-gate'
import type { CreativePlan, CommercialFacts, RouterMode, CostLane } from '@/lib/orbit/creative-os/types'

export const dynamic = 'force-dynamic'
const SUPER_ADMIN = 'super_admin'

/**
 * POST /api/admin/orbit/creative-os/plan — Creative Director:
 * { brief, commercialFacts, campaignId?, routerMode?, lane? } → CreativePlan
 * (editable; generation gated on approval).
 *
 * PUT — approve + build the campaign kit from an (edited) plan:
 * { plan: CreativePlan, visualAssetUrl? } → kit (statics run the
 * deterministic compositor; jobs are returned as capability specs) plus a
 * quality-gate pre-check across all statics.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    brief?: string; commercialFacts?: CommercialFacts
    campaignId?: string; routerMode?: RouterMode; lane?: CostLane
  } | null
  if (!body?.brief?.trim()) return NextResponse.json({ error: 'brief required' }, { status: 400 })

  const plan = await buildCreativePlan({
    brief:           body.brief.trim(),
    commercialFacts: body.commercialFacts ?? {},
    campaignId:      body.campaignId ?? null,
    routerMode:      body.routerMode,
    defaultLane:     body.lane,
  })

  await prisma.activityLog.create({
    data: {
      staffId: null, staffName: session.email,
      action: 'Creative OS Plan Created',
      detail: `plan=${plan.id} deliverables=${plan.deliverables.length} campaign=${plan.campaignId ?? '-'}`,
    },
  }).catch(() => {})

  return NextResponse.json({ plan })
}

export async function PUT(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { plan?: CreativePlan; visualAssetUrl?: string } | null
  if (!body?.plan) return NextResponse.json({ error: 'plan required' }, { status: 400 })

  const approved: CreativePlan = { ...body.plan, approved: true, approvedBy: session.email }
  const kit = buildCampaignKit(approved, body.visualAssetUrl ? { visualAsset: { url: body.visualAssetUrl } } : undefined)
  if ('error' in kit) return NextResponse.json({ error: kit.error }, { status: 400 })

  // Pre-publication gate across every static — commercial facts identical by construction
  const gate = runQualityGate({
    masterFacts: approved.commercialFacts,
    assets: kit.statics.map(s => ({ format: s.format, facts: s.facts, composition: s.composition })),
  })

  await prisma.activityLog.create({
    data: {
      staffId: null, staffName: session.email,
      action: 'Creative OS Plan Approved',
      detail: `plan=${approved.id} statics=${kit.statics.length} jobs=${kit.jobs.length} gate=${gate.blocked ? 'BLOCKED' : 'clean'}`,
    },
  }).catch(() => {})

  return NextResponse.json({ plan: approved, kit, gate })
}
