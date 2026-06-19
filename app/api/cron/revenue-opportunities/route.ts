import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const usersWithVisa = await prisma.user.findMany({
    where: {
      visaApplications: { some: {} },
      bookings: {
        none: {
          createdAt: { gte: ninetyDaysAgo },
        },
      },
    },
    select: { id: true, name: true },
    take: 20,
  })

  let created = 0

  for (const user of usersWithVisa) {
    await prisma.revenueOpportunity.create({
      data: {
        userId: user.id,
        type: 're_engagement',
        priority: 'medium',
        title: `Re-engage: ${user.name}`,
        description: 'Client has visa history but no recent booking',
        estimatedValue: 500,
        currency: 'GBP',
        actionRequired: 'Send personalised WhatsApp re-engagement message',
        status: 'open',
      },
    })
    created++
  }

  return NextResponse.json({ created })
}
