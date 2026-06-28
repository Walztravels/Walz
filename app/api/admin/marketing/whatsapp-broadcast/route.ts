import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const broadcasts = await prisma.whatsAppBroadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({ broadcasts })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    name:           string
    message:        string
    mediaUrl?:      string
    targetFilter?:  Record<string, string>
    recipientCount?: number
    scheduledAt?:   string
  }

  if (!body.name || !body.message) {
    return NextResponse.json({ error: 'name and message are required' }, { status: 400 })
  }

  const broadcast = await prisma.whatsAppBroadcast.create({
    data: {
      name:           body.name,
      message:        body.message,
      mediaUrl:       body.mediaUrl ?? null,
      targetFilter:   body.targetFilter ?? {},
      recipientCount: body.recipientCount ?? 0,
      status:         'draft',
      scheduledAt:    body.scheduledAt ? new Date(body.scheduledAt) : null,
      createdBy:      session.email,
    },
  })

  return NextResponse.json({ broadcast }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    id:      string
    name?:   string
    message?: string
    status?:  string
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const broadcast = await prisma.whatsAppBroadcast.update({
    where: { id: body.id },
    data: {
      ...(body.name    && { name:    body.name    }),
      ...(body.message && { message: body.message }),
      ...(body.status  && { status:  body.status  }),
    },
  })

  return NextResponse.json({ broadcast })
}
