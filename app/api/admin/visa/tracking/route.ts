import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const applications = await prisma.visaApplication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id:                  true,
      email:               true,
      firstName:           true,
      lastName:            true,
      destinationIso2:     true,
      visaType:            true,
      status:              true,
      openedAt:            true,
      startedAt:           true,
      submissionDate:      true,
      viewCount:           true,
      serviceFeePaid:      true,
      serviceFeeAmount:    true,
      serviceFeeCurrency:  true,
      createdAt:           true,
      tokens: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { createdAt: true, clientEmail: true, clientName: true },
      },
    },
  })

  const mapped = applications.map(a => ({
    id:                  a.id,
    clientEmail:         a.tokens[0]?.clientEmail ?? a.email ?? '',
    clientName:          a.tokens[0]?.clientName ?? (a.firstName ? `${a.firstName} ${a.lastName ?? ''}`.trim() : undefined),
    destination:         a.destinationIso2,
    visaType:            a.visaType,
    sentAt:              a.tokens[0]?.createdAt ?? null,
    openedAt:            a.openedAt,
    startedAt:           a.startedAt,
    submittedAt:         a.submissionDate,
    paymentStatus:       a.serviceFeePaid ? 'PAID' : 'UNPAID',
    viewCount:           a.viewCount,
    serviceFeeAmount:    a.serviceFeeAmount?.toString(),
    serviceFeeCurrency:  a.serviceFeeCurrency,
  }))

  return NextResponse.json({ applications: mapped })
}
