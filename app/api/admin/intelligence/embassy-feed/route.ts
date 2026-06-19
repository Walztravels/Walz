import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const destination = searchParams.get('destination')
  const severity = searchParams.get('severity')
  const limit = parseInt(searchParams.get('limit') ?? '20', 10)

  const where: Record<string, string> = {}
  if (destination) where.destination = destination
  if (severity) where.severity = severity

  const feeds = await prisma.embassyIntelligenceFeed.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ feeds })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    destination,
    alertType,
    severity,
    title,
    detail,
    previousValue,
    newValue,
    sourceUrl,
    affectedClients,
    expiresAt,
  } = await req.json()

  const feed = await prisma.embassyIntelligenceFeed.create({
    data: {
      destination,
      alertType,
      severity,
      title,
      detail,
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      sourceUrl: sourceUrl ?? null,
      affectedClients: affectedClients ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      publishedAt: new Date(),
    },
  })

  return NextResponse.json({ feed })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, notificationSent } = await req.json()

  const feed = await prisma.embassyIntelligenceFeed.update({
    where: { id },
    data: {
      ...(notificationSent !== undefined && { notificationSent }),
    },
  })

  return NextResponse.json({ feed })
}
