import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAdminSession } from '@/lib/admin-auth'
import { duffelGet, DuffelApiError } from '@/lib/duffel/client'

export const dynamic = 'force-dynamic'

interface DuffelOffer {
  data: {
    id:            string
    expires_at?:   string
    total_amount:  string
    total_currency: string
  }
}

// GET /api/admin/flight-quotes/[id]
// Returns the quote plus a live offer verification from Duffel.
// Staff use this before proceeding to booking from an approved quote.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const quote = await prisma.flightQuote.findUnique({ where: { id: params.id } })
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // Re-verify the Duffel offer
  let offerExpired    = false
  let offerPriceChanged = false
  let currentPrice: number | null = null
  let currentCurrency: string | null = null
  let offerVerifyError: string | null = null

  try {
    const resp = await duffelGet<DuffelOffer>(`/air/offers/${quote.duffelOfferId}`)
    const offer = resp.data

    offerExpired = offer.expires_at ? new Date(offer.expires_at) < new Date() : false
    currentPrice    = parseFloat(offer.total_amount ?? '0')
    currentCurrency = offer.total_currency

    const quotedPrice = parseFloat(quote.displayPrice.toString())
    offerPriceChanged = Math.abs(currentPrice - quotedPrice) > 0.01
  } catch (err) {
    if (err instanceof DuffelApiError && err.isOfferExpired) {
      offerExpired = true
    } else {
      offerVerifyError = err instanceof Error ? err.message : 'Offer verification failed'
    }
  }

  return NextResponse.json({
    quote: {
      ...quote,
      displayPrice: quote.displayPrice.toString(),
    },
    offerVerification: {
      expired:      offerExpired,
      priceChanged: offerPriceChanged,
      currentPrice,
      currentCurrency,
      error:        offerVerifyError,
    },
  })
}
