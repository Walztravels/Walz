import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const [portals, advisories] = await Promise.all([
    prisma.countryPortal.findMany({ orderBy: { countryName: 'asc' } }),
    prisma.travelAdvisory.findMany({ orderBy: { destinationIso2: 'asc' } }),
  ])
  return NextResponse.json({ portals, advisories })
}

export async function PATCH(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const body = await req.json()
    const { type, iso2, ...data } = body

    if (type === 'portal') {
      const portal = await prisma.countryPortal.update({
        where: { destinationIso2: iso2 },
        data: { ...data, updatedAt: new Date() },
      })
      return NextResponse.json({ portal })
    }

    if (type === 'advisory') {
      const advisory = await prisma.travelAdvisory.upsert({
        where:  { destinationIso2: iso2 },
        update: { ...data, cachedAt: new Date() },
        create: { destinationIso2: iso2, ...data, cachedAt: new Date() },
      })
      return NextResponse.json({ advisory })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (err) {
    console.error('visa-intelligence PATCH error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
