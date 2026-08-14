import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const campaigns = await prisma.orbitCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, status: true, objective: true, destination: true,
      audience: true, country: true, platforms: true, tone: true,
      tokensUsed: true, costUsd: true,
      generatedAt: true, approvedBy: true, publishedAt: true,
      createdBy: true, createdAt: true,
    },
  })

  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { objective, destination, audience, country, platforms, tone, promotionDetails, cta, landingPage, startDate, endDate } = body

  if (!objective) return NextResponse.json({ error: 'objective is required' }, { status: 400 })

  const campaign = await prisma.orbitCampaign.create({
    data: {
      objective,
      destination: destination ?? '',
      audience: audience ?? '',
      country: country ?? '',
      platforms: platforms ?? [],
      tone: tone ?? 'professional',
      promotionDetails: promotionDetails ?? '',
      cta: cta ?? '',
      landingPage: landingPage ?? '',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      createdBy: session.email,
    },
  })

  return NextResponse.json({ campaignId: campaign.id }, { status: 201 })
}
