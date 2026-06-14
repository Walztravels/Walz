import { NextRequest, NextResponse } from 'next/server'
import { hotelbedsRequest } from '@/lib/hotelbeds'

export const revalidate = 604800 // Cert 5 — cache content for 1 week

export async function GET(
  _req: NextRequest,
  { params }: { params: { hotelCode: string } }
) {
  try {
    const data = await hotelbedsRequest(
      'hotel',
      `/hotels/${params.hotelCode}/details?language=ENG&useSecondaryLanguage=false`,
    )

    const h = data.hotel
    return NextResponse.json({
      code:        h.code,
      name:        h.name?.content,
      description: h.description?.content,
      address:     h.address?.content,
      postalCode:  h.postalCode?.content,
      city:        h.city?.content,
      countryCode: h.countryCode,
      phones:      h.phones,
      images:      h.images,
      facilities:  h.facilities,
      category:    h.category,
      rooms:       h.rooms,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
