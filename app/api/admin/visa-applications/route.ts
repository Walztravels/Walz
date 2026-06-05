import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const token = cookies().get('admin_token')?.value
  return !!token
}

export async function GET(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status      = searchParams.get('status')      // filter by status
  const destination = searchParams.get('destination')  // filter by ISO2
  const assignedTo  = searchParams.get('assignedTo')
  const search      = searchParams.get('search')

  const where: Record<string, unknown> = { isDraft: false }
  if (status && status !== 'all')           where.status          = status
  if (destination && destination !== 'all') where.destinationIso2 = destination
  if (assignedTo && assignedTo !== 'all')   where.assignedTo      = assignedTo === 'unassigned' ? null : assignedTo

  const applications = await prisma.visaApplication.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { name: true, email: true } },
      notes: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  // Client-side search filter (name / reference)
  const filtered = search
    ? applications.filter(a =>
        `${a.firstName} ${a.lastName} ${a.referenceNumber} ${a.email}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : applications

  return NextResponse.json({ applications: filtered })
}
