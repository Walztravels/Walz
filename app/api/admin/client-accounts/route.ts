import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const url    = new URL(req.url)
  const search = url.searchParams.get('q') ?? ''
  const skip   = parseInt(url.searchParams.get('skip') ?? '0', 10)

  const where = search
    ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] }
    : {}

  const [accounts, total] = await Promise.all([
    prisma.clientAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    50,
      skip,
      include: {
        _count: { select: { visaApplications: true } },
      },
    }),
    prisma.clientAccount.count({ where }),
  ])

  return NextResponse.json({ accounts, total })
}
