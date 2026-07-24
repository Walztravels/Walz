import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function POST() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!session.staffId) return NextResponse.json({ error: 'No staff record linked to this account' }, { status: 400 })

    const now = new Date()
    const windowStart = new Date(now)
    windowStart.setMinutes(0, 0, 0)

    const record = await prisma.checkInRecord.upsert({
      where:  { staffId_windowStart: { staffId: session.staffId, windowStart } },
      create: {
        staffId:       session.staffId,
        windowStart,
        present:       true,
        manualCheckin: true,
        flagged:       false,
      },
      update: {
        present:       true,
        manualCheckin: true,
        flagged:       false,
      },
    })

    return NextResponse.json({ record })
  } catch (err) {
    console.error('[check-in manual POST]', err)
    return NextResponse.json({ error: 'Check-in failed' }, { status: 500 })
  }
}
