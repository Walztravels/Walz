import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

async function nextTicketNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const count = await prisma.ticketRecord.count({
    where: { ticketNumber: { startsWith: `WALZ-TKT-${year}` } },
  })
  return `WALZ-TKT-${year}-${String(count + 1).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bookingId, ticketType, clientName, clientEmail, data, htmlSnapshot } = await req.json()

  const ticket = await prisma.ticketRecord.create({
    data: {
      bookingId:        bookingId || null,
      ticketType,
      ticketNumber:     await nextTicketNumber(),
      generatedByStaff: session.name ?? session.email,
      clientName,
      clientEmail,
      data:             data ?? {},
      htmlSnapshot:     htmlSnapshot ?? '',
    },
  })

  return NextResponse.json({ ticket })
}

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tickets = await prisma.ticketRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      booking: { select: { bookingReference: true, type: true } },
    },
  })

  return NextResponse.json({ tickets })
}
