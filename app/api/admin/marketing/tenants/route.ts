import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'super_admin only' }, { status: 403 })
  }

  const tenants = await prisma.travelPostTenant.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ tenants })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'super_admin only' }, { status: 403 })
  }

  const body = await req.json() as {
    agencyName: string
    email:      string
    phone?:     string
    domain?:    string
    country?:   string
    plan?:      string
  }

  if (!body.agencyName || !body.email) {
    return NextResponse.json({ error: 'agencyName and email are required' }, { status: 400 })
  }

  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + 14)

  const tenant = await prisma.travelPostTenant.create({
    data: {
      agencyName:  body.agencyName,
      email:       body.email,
      phone:       body.phone    ?? null,
      domain:      body.domain   ?? null,
      country:     body.country  ?? 'NG',
      plan:        body.plan     ?? 'starter',
      status:      'trial',
      trialEndsAt,
      brandMemory: {},
    },
  })

  return NextResponse.json({ tenant }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'super_admin only' }, { status: 403 })
  }

  const body = await req.json() as {
    id:      string
    status?: string
    plan?:   string
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const tenant = await prisma.travelPostTenant.update({
    where: { id: body.id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.plan   && { plan:   body.plan   }),
    },
  })

  return NextResponse.json({ tenant })
}
