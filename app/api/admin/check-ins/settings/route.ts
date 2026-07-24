import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const settings = await prisma.checkInSettings.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    })

    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[check-in settings GET]', err)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'super_admin' && session.role !== 'operations_manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as {
      enabled?:       boolean
      workStartHour?: number
      workEndHour?:   number
      deductionPerMiss?: number
    }

    const settings = await prisma.checkInSettings.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', ...body },
      update: body,
    })

    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[check-in settings PUT]', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
