import { NextRequest, NextResponse }  from 'next/server'
import { getAdminSession }            from '@/lib/admin-auth'
import { hasPermission }              from '@/lib/admin/permissions'
import { hotelbedsRequest }           from '@/lib/hotelbeds'
import type { NormalizedActivityOffer } from '@/lib/travel-search/types'

export const dynamic = 'force-dynamic'

// POST /api/admin/travel-search/activities
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    destinationCode,
    from,
    to,
    limit = 20,
    offset = 0,
  } = body

  if (!destinationCode || !from || !to) {
    return NextResponse.json({ error: 'destinationCode, from, to are required' }, { status: 400 })
  }

  const data = await hotelbedsRequest('activities', '/activities', {
    method: 'POST',
    body: {
      filters: [{ searchFilterItems: [{ type: 'destination', value: destinationCode }] }],
      from,
      to,
      language: 'en',
      pagination: {
        itemsPerPage: limit,
        page: Math.floor(offset / limit) + 1,
      },
      order: 'DEFAULT',
    },
  })

  const searchedAt = new Date().toISOString()

  const offers: NormalizedActivityOffer[] = (data.activities ?? []).flatMap((a: Record<string, unknown>) => {
    const images = ((a.content as Record<string, unknown>)?.media as Record<string, unknown>)?.images as Array<Record<string, unknown>> ?? []
    const bestImage = images[0]
      ? ((images[0].urls as Array<Record<string, unknown>>) ?? [])
          .find(u => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2')?.resource
          ?? ((images[0].urls as Array<Record<string, unknown>>) ?? [])[0]?.resource
          ?? null
      : null

    const rawDesc = ((a.content as Record<string, unknown>)?.description as string) ?? ''
    const description = rawDesc ? rawDesc.replace(/<[^>]*>/g, '').trim().slice(0, 500) : null
    const currency = (a.currency as string) ?? 'EUR'

    const modalities = (a.modalities as Array<Record<string, unknown>>) ?? []
    if (modalities.length === 0) return []

    return modalities.map((m: Record<string, unknown>): NormalizedActivityOffer => {
      const rawAmount = (m.amountsFrom as Array<Record<string, unknown>>)?.[0]?.amount ?? 0
      const amount    = typeof rawAmount === 'string' ? parseFloat(rawAmount) : Number(rawAmount)
      return {
        provider:              'hotelbeds',
        providerCode:          String(a.code ?? ''),
        providerModalityCode:  String(m.code ?? ''),
        providerModalityName:  (m.name as string) ?? '',
        name:                  (a.name as string) ?? ((a.content as Record<string, unknown>)?.name as string) ?? String(a.code),
        description,
        imageUrl:              bestImage as string | null,
        duration:              (m.duration as string) ?? null,
        destinationCode,
        supplierCurrency:      currency,
        supplierAmount:        amount,
        supplierAmountMinor:   Math.round(amount * 100),
      }
    })
  })

  return NextResponse.json({
    offers,
    searchedAt,
    totalOffers: offers.length,
    provider: 'hotelbeds',
  })
}
