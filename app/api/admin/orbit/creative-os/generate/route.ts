import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { submitCreativeJob, refreshCreativeJob, retryCreativeJob, handoffToCampaignMedia } from '@/lib/orbit/creative-os/jobs'
import { validateReferenceBoard, composeReferenceConditioning } from '@/lib/orbit/creative-os/references'
import { ALL_CAPABILITIES } from '@/lib/orbit/creative-os/types'
import type { CapabilityKind, CostLane, RouterMode, ReferenceInput } from '@/lib/orbit/creative-os/types'

export const dynamic = 'force-dynamic'
const SUPER_ADMIN = 'super_admin'

/**
 * POST /api/admin/orbit/creative-os/generate — all studios submit here.
 * { capability, lane?|mode?, prompt?, imageUrl?, videoUrl?, audioUrl?,
 *   format?, durationSec?, campaignId?, references?: ReferenceInput[] }
 *
 * GET  ?jobId=… — poll one job (refreshes provider status)
 * GET  ?campaignId=… — list recent jobs for a campaign
 * PATCH { jobId, action: 'retry' | 'handoff' }
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    capability?: CapabilityKind; lane?: CostLane; mode?: RouterMode
    prompt?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string
    format?: string; durationSec?: number; campaignId?: string
    references?: ReferenceInput[]
  } | null
  if (!body?.capability || !ALL_CAPABILITIES.includes(body.capability)) {
    return NextResponse.json({ error: 'Valid capability required' }, { status: 400 })
  }

  const refs = body.references ?? []
  const refErrors = validateReferenceBoard(refs)
  if (refErrors.length) return NextResponse.json({ error: refErrors.join('; ') }, { status: 400 })

  // Purpose-aware conditioning: only appropriate references reach the prompt/inputs
  const cond = composeReferenceConditioning(refs)
  const prompt = [body.prompt ?? '', ...cond.promptFragments,
    ...(body.capability.includes('video') || body.capability === 'motion' ? cond.motionFragments : [])]
    .filter(Boolean).join('. ')

  const result = await submitCreativeJob({
    input: {
      capability: body.capability,
      lane:       body.lane,
      mode:       body.mode ?? cond.routerModeHint ?? undefined,
      prompt:     prompt || undefined,
      imageUrl:   body.imageUrl ?? cond.referenceImageUrls[0],
      videoUrl:   body.videoUrl,
      audioUrl:   body.audioUrl,
      format:     body.format,
      durationSec: body.durationSec,
    },
    campaignId: body.campaignId ?? null,
    staffEmail: session.email,
    inputRefs:  refs,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')
  if (jobId) {
    const status = await refreshCreativeJob(jobId)
    return NextResponse.json(status)
  }
  const campaignId = searchParams.get('campaignId')
  const jobs = await prisma.orbitCreativeJob.findMany({
    where:   campaignId ? { campaignId } : {},
    orderBy: { createdAt: 'desc' },
    take:    30,
  }).catch(() => [])
  return NextResponse.json({ jobs })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { jobId?: string; action?: string } | null
  if (!body?.jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  if (body.action === 'retry') {
    const r = await retryCreativeJob(body.jobId, session.email)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (body.action === 'handoff') {
    const r = await handoffToCampaignMedia(body.jobId)
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
