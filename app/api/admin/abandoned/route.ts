import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const url  = new URL(req.url)
  const type = url.searchParams.get('type')
  const skip = parseInt(url.searchParams.get('skip') ?? '0', 10)

  const where = type ? { type } : {}

  const [sessions, total] = await Promise.all([
    prisma.abandonedSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      skip,
    }),
    prisma.abandonedSession.count({ where }),
  ])

  return NextResponse.json({ sessions, total })
}

export async function PATCH(req: NextRequest) {
  const { id, converted } = await req.json() as { id: string; converted?: boolean }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updated = await prisma.abandonedSession.update({
    where: { id },
    data:  { ...(converted !== undefined ? { converted } : {}) },
  })

  return NextResponse.json({ success: true, session: updated })
}
