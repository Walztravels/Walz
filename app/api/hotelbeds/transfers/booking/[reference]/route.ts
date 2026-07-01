import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export async function GET(
  _req: NextRequest,
  { params }: { params: { reference: string } },
) {
  try {
    const data = await hotelbedsRequest(
      'transfers',
      `/bookings/en/reference/${params.reference}`,
    )
    return NextResponse.json({
      ok:      true,
      booking: data?.bookings?.[0] ?? data?.booking ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
