import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await prisma.cabinProfile.findMany({
      orderBy: { cabinClass: 'asc' },
    })
    return NextResponse.json({ profiles: rows })
  } catch (err) {
    console.error('[cabin-profiles] GET error:', err)
    return NextResponse.json({ error: 'Failed to load profiles' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { cabinClass, ...updates } = body as {
      cabinClass: string
      label?: string
      headline?: string
      subheadline?: string
      imageUrl?: string
      badgeText?: string
      badgeColor?: string
      features?: string[]
    }

    if (!cabinClass) return NextResponse.json({ error: 'cabinClass required' }, { status: 400 })

    const data: Record<string, unknown> = {}
    if (updates.label       !== undefined) data.label       = updates.label
    if (updates.headline    !== undefined) data.headline    = updates.headline
    if (updates.subheadline !== undefined) data.subheadline = updates.subheadline
    if (updates.imageUrl    !== undefined) data.imageUrl    = updates.imageUrl
    if (updates.badgeText   !== undefined) data.badgeText   = updates.badgeText
    if (updates.badgeColor  !== undefined) data.badgeColor  = updates.badgeColor
    if (updates.features    !== undefined) data.features    = updates.features

    const row = await prisma.cabinProfile.upsert({
      where:  { cabinClass },
      update: data,
      create: {
        cabinClass,
        label:       updates.label       ?? '',
        headline:    updates.headline    ?? '',
        subheadline: updates.subheadline ?? '',
        imageUrl:    updates.imageUrl    ?? '',
        badgeText:   updates.badgeText   ?? '',
        badgeColor:  updates.badgeColor  ?? '#C9A84C',
        features:    updates.features    ?? [],
      },
    })
    return NextResponse.json({ ok: true, profile: row })
  } catch (err) {
    console.error('[cabin-profiles] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
