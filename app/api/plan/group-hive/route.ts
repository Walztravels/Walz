import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { tripName?: string; memberCount?: number; email?: string }
    const { tripName, memberCount, email } = body

    if (!tripName?.trim() || !memberCount) {
      return NextResponse.json({ error: 'tripName and memberCount are required' }, { status: 400 })
    }

    const count = Math.min(Math.max(Math.round(memberCount), 2), 20)

    // Generate unique slug
    let slug = ''
    for (let i = 0; i < 8; i++) {
      slug = Math.random().toString(36).substring(2, 10).toUpperCase()
      const exists = await prisma.itineraryHiveSession.findUnique({ where: { slug } })
      if (!exists) break
    }

    const session = await prisma.itineraryHiveSession.create({
      data: {
        slug,
        tripName: tripName.trim(),
        memberCount: count,
        status: 'collecting',
        members: {
          create: Array.from({ length: count }, (_, i) => ({
            slotNumber: i + 1,
          })),
        },
      },
    })

    const shareUrl = `https://www.walztravels.com/plan/group-hive/${slug}`
    const waText   = encodeURIComponent(
      `Hi! I'm planning "${tripName!.trim()}" for our group.\n\nShare your travel preferences here (takes 2 min, totally private):\n${shareUrl}\n\nJade will reveal the perfect destination for everyone once all ${count} of us have shared our preferences 🐝`
    )

    return NextResponse.json({
      id:          session.id,
      slug,
      shareUrl,
      waShareUrl:  `https://wa.me/?text=${waText}`,
      memberCount: count,
      email:       email ?? null,
    }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[plan/group-hive POST]', msg)
    return NextResponse.json({ error: 'Failed to create group hive', details: msg.slice(0, 200) }, { status: 500 })
  }
}
