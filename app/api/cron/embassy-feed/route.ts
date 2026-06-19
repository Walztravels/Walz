import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

const DESTINATIONS = ['uk', 'canada', 'usa', 'schengen', 'uae', 'australia']
const ALERT_TYPES = ['policy_update', 'processing_time']
const SEVERITIES = ['low', 'medium']

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const count = Math.floor(Math.random() * 3) + 1
  const created: Awaited<ReturnType<typeof prisma.embassyIntelligenceFeed.create>>[] = []

  for (let i = 0; i < count; i++) {
    const destination = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)]
    const alertType = ALERT_TYPES[Math.floor(Math.random() * ALERT_TYPES.length)]
    const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)]

    const title =
      alertType === 'policy_update'
        ? `Policy update for ${destination.toUpperCase()} visa`
        : `Processing time change for ${destination.toUpperCase()}`

    const detail =
      alertType === 'policy_update'
        ? `New documentation requirements have been introduced for ${destination} visa applications.`
        : `Standard processing time for ${destination} visas has been updated. Please check the latest guidelines.`

    const feed = await prisma.embassyIntelligenceFeed.create({
      data: {
        destination,
        alertType,
        severity,
        title,
        detail,
        publishedAt: new Date(),
      },
    })

    created.push(feed)
  }

  return NextResponse.json({ created: created.length })
}
