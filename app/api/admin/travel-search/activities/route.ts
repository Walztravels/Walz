import { NextRequest, NextResponse }  from 'next/server'
import { getAdminSession }            from '@/lib/admin-auth'
import { hasPermission }              from '@/lib/admin/permissions'
import { searchActivities }           from '@/lib/activities'
import type { NormalizedActivityOffer } from '@/lib/travel-search/types'

export const dynamic   = 'force-dynamic'
export const maxDuration = 30

// GET /api/admin/travel-search/activities?destination=Dubai&adults=2&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const destination = searchParams.get('destination') ?? ''
  const adults      = parseInt(searchParams.get('adults') ?? '2', 10)
  const dateFrom    = searchParams.get('dateFrom') ?? undefined
  const dateTo      = searchParams.get('dateTo')   ?? undefined

  if (!destination.trim()) {
    return NextResponse.json({ error: 'destination is required' }, { status: 400 })
  }

  const result = await searchActivities({ destination, adults, dateFrom, dateTo })

  const searchedAt = new Date().toISOString()

  // Map unified NormalizedActivity → NormalizedActivityOffer (admin travel-search shape).
  // We expose sellingPrice as the supplier amount so the PricingOverlay can apply an
  // additional Walz markup on top.  Supplier net cost is never sent to this endpoint.
  const offers: NormalizedActivityOffer[] = result.activities.map(a => ({
    provider:             (a.source === 'viator' ? 'viator' : 'hotelbeds') as 'hotelbeds' | 'viator',
    providerCode:         a.supplierProductId,
    // Modality detail isn't available at this search stage — resolved during booking
    providerModalityCode: '',
    providerModalityName: '',
    name:                 a.title,
    description:          a.shortDescription ?? a.description ?? null,
    imageUrl:             a.images[0]?.url ?? null,
    duration:             a.duration?.text ?? null,
    destinationCode:      a.destination?.code ?? destination,
    supplierCurrency:     a.currency,
    supplierAmount:       a.sellingPrice,
    supplierAmountMinor:  Math.round(a.sellingPrice * 100),
  }))

  return NextResponse.json({
    offers,
    searchedAt,
    totalOffers:  offers.length,
    suppliers:    result.suppliers,
  })
}
