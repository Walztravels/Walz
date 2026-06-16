import { NextRequest, NextResponse } from 'next/server'
import { getActivityBySlug }         from '@/lib/activities-data'
import prisma                        from '@/lib/db'

// Next.js 14 — params is a plain object, not a Promise
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const { slug } = params

  // 1. Static activities
  const staticAct = getActivityBySlug(slug)
  if (staticAct) return NextResponse.json({ activity: staticAct })

  // 2. DB
  try {
    const db = await prisma.activity.findUnique({ where: { slug, isPublished: true } })
    if (db) return NextResponse.json({ activity: db })
  } catch {}

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
