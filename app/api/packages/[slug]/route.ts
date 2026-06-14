import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export const revalidate = 60

type RouteContext = { params: { slug: string } }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const pkg = await prisma.tourListing.findUnique({
      where: { slug: params.slug },
    })
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(pkg)
  } catch (err) {
    console.error('[api/packages/[slug] GET]', err)
    return NextResponse.json({ error: 'Failed to fetch package' }, { status: 500 })
  }
}
