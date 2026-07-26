// Internal booking creation — called by admin/Concierge Core after customer payment confirmed.
// Not a public customer-facing endpoint. Requires admin session.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }    from '@/lib/admin-auth'
import { isEnabled }          from '@/lib/concierge/suppliers/comfortpass/config'
import { ComfortPassAdapter } from '@/lib/concierge/suppliers/comfortpass/adapter'
import { validateBookingRequest } from '@/lib/concierge/suppliers/comfortpass/schemas'
import type { CPBookingRequest } from '@/lib/concierge/suppliers/comfortpass/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isEnabled()) {
    return NextResponse.json({ error: 'ComfortPass integration is disabled' }, { status: 503 })
  }

  const body = await req.json() as unknown

  // Ensure paymentMethod is always 'balance'
  const payload = { ...(body as Record<string, unknown>), paymentMethod: 'balance' } as CPBookingRequest

  const validation = validateBookingRequest(payload)
  if (!validation.valid) {
    return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 422 })
  }

  // requestId is required to associate the CP booking with a concierge request
  const requestId = (body as Record<string, unknown>).requestId as string | undefined
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 422 })
  }

  const adapter = new ComfortPassAdapter()

  try {
    // dispatch() handles duplicate prevention and timeout → manual_review logic
    const result = await adapter.dispatch({
      requestId,
      requestReference: payload.reference,
      category:    { id: '', slug: '', name: '', description: '', fulfilmentModes: [], requiredFields: [], isActive: true, displayOrder: 0, metadata: {} },
      supplier:    { id: '', slug: 'comfortpass', name: 'ComfortPass', adapterType: 'comfortpass', categorySlugs: [], isActive: true, metadata: {} },
      fulfilmentMode: 'instant',
      fields:      {
        service_code:  payload.serviceCode,
        airport_code:  payload.airportCode,
        date:          payload.date,
        time:          payload.time,
        flight_number: payload.flightNumber,
        passengers:    payload.passengers,
      },
      clientName:  (body as Record<string, unknown>).clientName as string | undefined,
      clientEmail: (body as Record<string, unknown>).clientEmail as string | undefined,
      clientPhone: (body as Record<string, unknown>).clientPhone as string | undefined,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Booking failed', metadata: result.metadata }, { status: 502 })
    }

    return NextResponse.json({ booking: result.metadata, supplierRef: result.supplierRef })
  } catch (err) {
    console.error('[/api/concierge/bookings POST]', (err as Error).message)
    return NextResponse.json({ error: 'Booking failed' }, { status: 502 })
  }
}
