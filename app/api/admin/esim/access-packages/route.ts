import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { fetchAllEsimAccessPackages } from '@/lib/esimaccess'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Admin only' }, { status: 401 })

  const iso2 = req.nextUrl.searchParams.get('iso2')?.toUpperCase()
  if (!iso2 || iso2.length !== 2) {
    return NextResponse.json({ error: 'iso2 query param required (e.g. ?iso2=JP)' }, { status: 400 })
  }

  const packages = await fetchAllEsimAccessPackages(iso2)

  return NextResponse.json({
    packages: packages.map(p => ({
      packageCode:  p.packageCode,
      name:         p.name,
      locationName: p.locationName,
      durationDays: p.durationDays,
      dataLabel:    p.dataLabel,
      dataAmount:   p.dataAmountMb,
      dataUnit:     p.dataUnit,
      wholesaleUsd: p.wholesaleUsd,
      retailUsd:    p.wholesaleUsd * 1.35,  // same markup as Airalo path
    })),
  })
}
