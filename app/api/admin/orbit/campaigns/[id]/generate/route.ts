import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'
import { generateCampaign } from '@/lib/orbit/campaign-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaign = await prisma.orbitCampaign.findUnique({ where: { id: params.id } })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const tokenCap = settings?.tokenCapPerCampaign ?? 4000
  const brandVoice = settings?.brandVoice ?? ''

  try {
    const result = await generateCampaign(
      params.id,
      {
        objective: campaign.objective,
        destination: campaign.destination,
        audience: campaign.audience,
        country: campaign.country,
        platforms: campaign.platforms,
        tone: campaign.tone,
        promotionDetails: campaign.promotionDetails,
        cta: campaign.cta,
        landingPage: campaign.landingPage,
      },
      session.email,
      tokenCap,
      brandVoice,
    )

    return NextResponse.json({
      ok: true,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
