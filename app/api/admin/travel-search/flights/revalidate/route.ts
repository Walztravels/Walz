import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession }           from '@/lib/admin-auth'
import { hasPermission }             from '@/lib/admin/permissions'
import { getOffer }                  from '@/lib/flights/duffel'

export const dynamic = 'force-dynamic'

// POST /api/admin/travel-search/flights/revalidate
// Re-fetches a Duffel offer to confirm price + availability are still valid
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'quotes.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { offerId } = body
  if (!offerId) {
    return NextResponse.json({ error: 'offerId is required' }, { status: 400 })
  }

  let rawOffer: Record<string, unknown>
  try {
    rawOffer = await getOffer(offerId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('404') || msg.includes('not_found')) {
      return NextResponse.json(
        { available: false, reason: 'offer_expired', message: 'This fare is no longer available.' },
        { status: 200 },
      )
    }
    throw err
  }

  const data    = (rawOffer.data ?? rawOffer) as Record<string, unknown>
  const expires = (data.expires_at as string) ?? null
  const expired = expires ? new Date(expires) < new Date() : false

  if (expired) {
    return NextResponse.json({
      available: false,
      reason:    'offer_expired',
      message:   'This fare has expired. Please search again.',
    })
  }

  const slices      = (data.slices as Array<Record<string, unknown>>) ?? []
  const totalAmount = parseFloat(String((data.total_amount ?? data.base_amount ?? 0)))
  const currency    = (data.total_currency ?? data.base_currency ?? 'GBP') as string

  return NextResponse.json({
    available:     true,
    offerId,
    revalidatedAt: new Date().toISOString(),
    expiresAt:     expires,
    totalAmount,
    totalAmountMinor: Math.round(totalAmount * 100),
    currency,
    sliceCount: slices.length,
  })
}
