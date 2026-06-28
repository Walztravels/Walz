import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status   = searchParams.get('status') ?? undefined
  const platform = searchParams.get('platform') ?? undefined
  const from     = searchParams.get('from')
  const to       = searchParams.get('to')

  const posts = await prisma.socialPost.findMany({
    where: {
      ...(status   ? { status }   : {}),
      ...(platform ? { platform } : {}),
      ...(from || to ? {
        scheduledAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to   ? { lte: new Date(to)   } : {}),
        },
      } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
  })

  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    platform: string
    postType: string
    caption: string
    hashtags?: string
    imageUrls?: string[]
    scheduledAt?: string
    status?: string
  }

  const post = await prisma.socialPost.create({
    data: {
      platform:    body.platform,
      postType:    body.postType,
      caption:     body.caption,
      hashtags:    body.hashtags   ?? '',
      imageUrls:   body.imageUrls  ?? [],
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      status:      body.scheduledAt ? 'pending_approval' : (body.status ?? 'draft'),
      createdBy:   session.email,
    },
  })

  return NextResponse.json({ post }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json() as {
    id: string
    scheduledAt?: string | null
    status?: string
    caption?: string
    hashtags?: string
    approvedBy?: string
  }

  const post = await prisma.socialPost.update({
    where: { id: body.id },
    data: {
      ...(body.caption    !== undefined && { caption:    body.caption    }),
      ...(body.hashtags   !== undefined && { hashtags:   body.hashtags   }),
      ...(body.status     !== undefined && { status:     body.status     }),
      ...(body.approvedBy !== undefined && { approvedBy: body.approvedBy }),
      ...(body.scheduledAt !== undefined && {
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      }),
    },
  })

  return NextResponse.json({ post })
}
