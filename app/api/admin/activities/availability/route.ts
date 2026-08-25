import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { HotelbedsActivityProvider } from '@/lib/activities/providers/hotelbeds'
import { ViatorActivityProvider }    from '@/lib/activities/providers/viator'
import type { ActivitySupplier }     from '@/lib/activities/types'

export const dynamic     = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { supplier, supplierProductId, destination, date, adults, children = 0, infants = 0, currency = 'GBP' } = body

  if (!supplier || !supplierProductId || !date) {
    return NextResponse.json({ error: 'supplier, supplierProductId, date required' }, { status: 400 })
  }

  const params = {
    supplier:          supplier as ActivitySupplier,
    supplierProductId: String(supplierProductId),
    destination:       destination ?? '',
    date:              String(date),
    adults:            Number(adults) || 1,
    children:          Number(children),
    infants:           Number(infants),
    currency:          String(currency),
  }

  try {
    const provider = supplier === 'VIATOR'
      ? new ViatorActivityProvider()
      : new HotelbedsActivityProvider()

    const availability = await provider.checkAvailability(params)
    return NextResponse.json(availability)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Availability check failed'
    return NextResponse.json({ error: message, available: false, options: [] }, { status: 200 })
  }
}
