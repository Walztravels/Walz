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

    if (!fromCode || !toCode || !fromDate) {
      return NextResponse.json({ error: 'fromCode, toCode and fromDate are required' }, { status: 400 })
    }

    // Hotelbeds Transfers API uses a path-based URL, not query params
    const datetime = `${fromDate}T${fromTime}:00`
    const path = `/availability/ENG/from/${fromType}/${fromCode}/to/${toType}/${toCode}/${datetime}/${adults}/${children}/0`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await hotelbedsRequest('transfers', path)

    console.log('[HB Transfers inline] GET', path, 'services:', data?.services?.length ?? 0, 'error:', data?.errors?.[0]?.message ?? null)

    if (data?.errors?.length) {
      return NextResponse.json({ ok: false, error: data.errors[0].message, transfers: [] })
    }

    const services: unknown[] = Array.isArray(data?.services) ? data.services : []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transfers = services.map((s: any) => ({
      transferKey:  s.rateKey ?? s.id ?? '',
      transferType: s.transferType ?? 'PRIVATE',
      vehicleName:  s.vehicle?.name ?? s.category?.name ?? 'Vehicle',
      vehicleDesc:  s.vehicle?.description ?? null,
      maxPax:       s.vehicle?.maxPax ?? null,
      price:        parseFloat(s.price?.totalAmount ?? s.minPrice ?? '0'),
      currency:     s.price?.currency ?? 'GBP',
      // travelTime from Hotelbeds is in seconds
      duration:     s.travelTime ? Math.round(s.travelTime / 60) : null,
      imageUrl:     s.vehicle?.images?.[0]?.url ?? null,
      from:         s.from,
      to:           s.to,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })).filter((t: any) => t.price > 0)

    return NextResponse.json({ ok: true, total: transfers.length, transfers })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[transfers/availability]', msg)
    if (msg.includes('403') || msg.toLowerCase().includes('disallowed') || msg.toLowerCase().includes('quota')) {
      return NextResponse.json(
        { ok: false, error: 'Transfer search is currently unavailable. Please contact us to arrange a transfer.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ ok: false, error: 'Transfer search failed. Please try again.' }, { status: 500 })
  }
}
