import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) return NextResponse.json({ error: 'Missing ref' }, { status: 400 })

  const booking = await prisma.booking.findUnique({
    where:  { bookingReference: ref },
    select: {
      status:        true,
      paymentStatus: true,
      hotelDetails:  true,
      passengers:    true,
    },
  })

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const details   = booking.hotelDetails as Record<string, string> | null
  const passengers = booking.passengers  as Array<{ firstName?: string }> | null

  return NextResponse.json({
    status:        booking.status,
    paymentStatus: booking.paymentStatus,
    tourName:      details?.tourName   ?? null,
    firstName:     passengers?.[0]?.firstName ?? null,
  })
}
