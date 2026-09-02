/**
 * Orbit — Reference Design Analyzer API.
 *
 * POST /api/admin/orbit/campaigns/[id]/creative/reference/analyze
 *   Body: { mediaId: string }
 *   Response: { profile: ReferenceDesignProfile }
 *
 * Calls GPT-4o Vision on the reference image and extracts a structural
 * layout profile — positions, proportions, palette, density.
 *
 * COMMERCIAL FIREWALL:
 *   The analyzer is instructed to NEVER extract commercial text.
 *   The returned profile contains NO prices, routes, phone numbers,
 *   email addresses, or any other commercial data.
 *
 * RBAC: super_admin only.
 * REQUIRES: OPENAI_API_KEY in environment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { prisma }                    from '@/lib/db'
import { analyzeReferenceDesign, defaultReferenceProfile } from '@/lib/orbit/reference/analyzer'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

export async function POST(
  req:      NextRequest,
  { params }: { params: { id: string } },
) {
  const traceId = `orb_analyze_${Date.now().toString(36).slice(-5)}`

  try {
    const session = await getAdminSession()
    if (!session)                       return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 })
    if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden',    traceId }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { mediaId?: string }
    if (!body.mediaId) {
      return NextResponse.json({ error: 'mediaId is required', traceId }, { status: 400 })
    }

    // Verify the reference image belongs to this campaign
    const ref = await prisma.orbitMedia.findFirst({
      where: { id: body.mediaId, campaignId: params.id, isReference: true },
    }).catch(() => null)

    if (!ref) {
      return NextResponse.json({ error: 'Reference image not found', traceId }, { status: 404 })
    }

    if (!ref.publicUrl) {
      return NextResponse.json({ error: 'Reference image has no public URL', traceId }, { status: 400 })
    }

    // Gate on OpenAI availability
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        error:   'OpenAI API key is not configured — cannot analyze reference image.',
        profile: defaultReferenceProfile(),
        traceId,
      }, { status: 200 })
    }

    const profile = await analyzeReferenceDesign(ref.publicUrl)

    console.info(`[reference/analyze] traceId=${traceId} campaignId=${params.id} mediaId=${body.mediaId} confidence=${profile.confidence}`)

    return NextResponse.json({ profile, traceId })

  } catch (err) {
    console.error(`[reference/analyze] traceId=${traceId} error=${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json({
      error:   'Reference design analysis failed. Please try again.',
      profile: defaultReferenceProfile(),
      traceId,
    }, { status: 200 })
  }
}
