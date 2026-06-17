import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const fromCode  = searchParams.get('fromCode')
    const toCode    = searchParams.get('toCode')
    const fromType  = searchParams.get('fromType') ?? 'IATA'
    const toType    = searchParams.get('toType')   ?? 'IATA'
    const fromDate  = searchParams.get('fromDate')
    const fromTime  = searchParams.get('fromTime') ?? '12:00'
    const adults    = searchParams.get('adults')   ?? '2'
    const children  = searchParams.get('children') ?? '0'
    const language  = 'ENG'

    if (!fromCode || !toCode || !fromDate) {
      return NextResponse.json({ error: 'fromCode, toCode and fromDate are required' }, { status: 400 })
    }

    const data = await hotelbedsRequest('transfers', '/availability', {
      params: {
        from:       fromCode,
        to:         toCode,
        fromType,
        toType,
        fromDate,
        fromTime,
        language,
        adults,
        children,
        infants:    '0',
      },
    })

    const raw: any[] = data?.transfers ?? []

    const transfers = raw.map((t: any) => ({
      transferKey:  t.transferKey,
      transferType: t.transferType ?? 'PRIVATE',
      vehicleName:  t.vehicle?.name   ?? t.category?.name ?? 'Vehicle',
      vehicleDesc:  t.vehicle?.description ?? null,
      maxPax:       t.vehicle?.maxPax ?? t.category?.maxPax ?? null,
      price:        t.price?.amount   ?? 0,
      currency:     t.price?.currencyId ?? 'GBP',
      duration:     t.tripDuration    ?? null,
      imageUrl:     t.vehicle?.images?.[0]?.url ?? null,
      from:         t.from,
      to:           t.to,
    }))

    return NextResponse.json({ ok: true, total: transfers.length, transfers })
  } catch (error: any) {
    const msg = String(error.message ?? '')
    console.error('[transfers/availability]', msg)
    if (msg.includes('403') || msg.toLowerCase().includes('disallowed') || msg.toLowerCase().includes('quota')) {
      return NextResponse.json(
        { error: 'Transfer search is currently unavailable. Please contact us to arrange a transfer.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Transfer search failed. Please try again.' }, { status: 500 })
  }
}
