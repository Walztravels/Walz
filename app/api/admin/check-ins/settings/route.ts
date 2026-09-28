import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SETTINGS_ADMIN_ROLES = new Set(['super_admin', 'operations_manager'])

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
    if (!SETTINGS_ADMIN_ROLES.has(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json() as {
      enabled?:                boolean
      workStartHour?:          number
      workEndHour?:            number
      satEnabled?:             boolean
      satStartHour?:           number
      satEndHour?:             number
      sunEnabled?:             boolean
      deductionPerMiss?:       number
      graceMinutes?:           number
      effectiveDeductionDate?: string | null
    }

    // Activating (or moving) the financial effective date is a Super-Admin-
    // only action — it is the single switch that turns missed-check-in
    // deductions from inert to real money for every tracked staff member.
    if ('effectiveDeductionDate' in body && session.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only a Super Admin can set the deduction effective date' }, { status: 403 })
    }

    // Found by independent financial review: nothing previously stopped a
    // Super Admin from setting this date in the past. Today's own cron
    // scope makes that currently harmless (it never re-scans prior days),
    // but that's an incidental property of the cron, not an explicit
    // guarantee — reject a past date outright rather than rely on it,
    // exactly per the brief's "no retroactive backfill" rule (§19).
    if ('effectiveDeductionDate' in body && body.effectiveDeductionDate) {
      const requested = new Date(body.effectiveDeductionDate)
      const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0)
      if (Number.isNaN(requested.getTime())) {
        return NextResponse.json({ error: 'effectiveDeductionDate is not a valid date' }, { status: 400 })
      }
      if (requested.getTime() < startOfToday.getTime()) {
        return NextResponse.json({ error: 'The deduction effective date cannot be set in the past — this would retroactively charge already-recorded missed check-ins.' }, { status: 400 })
      }
    }

    const data: Record<string, unknown> = { ...body }
    if ('effectiveDeductionDate' in body) {
      data.effectiveDeductionDate = body.effectiveDeductionDate ? new Date(body.effectiveDeductionDate) : null
    }

    const settings = await prisma.checkInSettings.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', ...data },
      update: data,
    })

    return NextResponse.json({ settings })
  } catch (err) {
    console.error('[check-in settings PUT]', err)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
