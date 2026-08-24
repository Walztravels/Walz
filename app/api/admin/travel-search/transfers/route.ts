import { NextRequest, NextResponse }   from 'next/server'
import { getAdminSession }             from '@/lib/admin-auth'
import { hasPermission }               from '@/lib/admin/permissions'
import { hotelbedsRequest }            from '@/lib/hotelbeds'
import type { NormalizedTransferOffer } from '@/lib/travel-search/types'

export const dynamic = 'force-dynamic'

// POST /api/admin/travel-search/transfers
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    pickupType,      // IATA | ATLAS | RESORT | PORT | STATION | HOTEL
    pickupCode,
    dropoffType,
    dropoffCode,
    transferDate,    // YYYY-MM-DD
    adults = 2,
    children = 0,
    currency = 'GBP',
    language = 'en',
  } = body

  if (!pickupType || !pickupCode || !dropoffType || !dropoffCode || !transferDate) {
    return NextResponse.json(
      { error: 'pickupType, pickupCode, dropoffType, dropoffCode, transferDate are required' },
      { status: 400 },
    )
  }

  const data = await hotelbedsRequest('transfers', '/transfers/availability', {
    method: 'POST',
    body: {
      language,
      from: { type: pickupType, code: pickupCode },
      to:   { type: dropoffType, code: dropoffCode },
      transfers: [{ transferDate, paxes: [{ type: 'AD', count: adults }, ...(children > 0 ? [{ type: 'CH', count: children }] : [])] }],
      currency,
    },
  })

  const searchedAt = new Date().toISOString()
  const raw = (data.transfers ?? []) as Array<Record<string, unknown>>

  const offers: NormalizedTransferOffer[] = raw.flatMap((t: Record<string, unknown>) => {
    const categories = (t.categories as Array<Record<string, unknown>>) ?? []
    if (categories.length === 0) return []

    return categories.flatMap((cat: Record<string, unknown>) => {
      const vehicles = (cat.vehicles as Array<Record<string, unknown>>) ?? []
      return vehicles.map((v: Record<string, unknown>): NormalizedTransferOffer => {
        const price = (v.prices as Array<Record<string, unknown>>)?.[0]
        const net   = parseFloat(String(price?.totalNet ?? price?.net ?? 0))
        const cur   = (price?.currency as string) ?? currency

        return {
          provider:          'hotelbeds',
          providerRateKey:   String(v.rateKey ?? ''),
          providerContent:   (t.id as string) ?? null,
          name:              `${cat.name ?? t.name ?? ''} — ${v.description ?? ''}`.trim().replace(/^ — | — $/g, ''),
          transferType:      (t.type as string) ?? 'PRIVATE',
          category:          (cat.name as string) ?? null,
          capacity:          (v.maxPax as number) ?? null,
          vehicle:           (v.description as string) ?? null,
          pickupType,
          pickupCode,
          dropoffType,
          dropoffCode,
          transferDate,
          supplierCurrency:     cur,
          supplierAmount:       net,
          supplierAmountMinor:  Math.round(net * 100),
        }
      })
    })
  })

  return NextResponse.json({
    offers,
    searchedAt,
    totalOffers: offers.length,
    provider: 'hotelbeds',
  })
}
