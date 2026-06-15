import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const {
      destinationCode,
      from,
      to,
      offset = 0,
      limit = 20,
    } = await req.json()

    if (!destinationCode || !from || !to) {
      return NextResponse.json({ error: 'destinationCode, from, and to are required' }, { status: 400 })
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

    const activities = (data.activities ?? []).map((a: any) => {
      const images: any[] = a.content?.media?.images ?? []
      const bestImage = images[0]?.urls?.find((u: any) => u.sizeType === 'LARGE' || u.sizeType === 'LARGE2')?.resource
        ?? images[0]?.urls?.[0]?.resource
        ?? null
      const rawDesc: string | undefined = a.content?.description
      const description = rawDesc ? rawDesc.replace(/<[^>]*>/g, '').trim().slice(0, 500) : null
      const currency: string | null = a.currency ?? null
      const minAmountRaw = a.amountsFrom?.[0]?.amount
      const minAmount = minAmountRaw != null ? String(minAmountRaw) : null

      return {
        code:     a.code,
        name:     a.name ?? a.content?.name ?? a.code,
        description,
        imageUrl: bestImage,
        modalities: (a.modalities ?? []).map((m: any) => ({
          code:       m.code,
          name:       m.name,
          amountFrom: m.amountsFrom?.[0]?.amount != null ? String(m.amountsFrom[0].amount) : null,
          currency,
          duration:   m.duration ?? null,
        })),
        minAmount,
        currency,
      }
    })

    const total = data.pagination?.totalItems ?? data.total ?? activities.length
    return NextResponse.json({ ok: true, total, activities })
  } catch (e: any) {
    console.error('[activities/search]', e.message)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
