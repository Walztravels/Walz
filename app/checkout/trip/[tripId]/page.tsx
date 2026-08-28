// app/checkout/trip/[tripId]/page.tsx
// Jade Checkout Review Page — Release 4D-B
//
// Server component: verifies token + reads trip from DB.
// Passes data to <CheckoutTripReview> client component which runs
// revalidation and handles the pay flow.

import { redirect }       from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions }    from '@/lib/auth'
import prisma             from '@/lib/db'
import { decodeCheckoutToken } from '@/lib/checkout/token'
import CheckoutTripReview from './CheckoutReview'

interface Props {
  params:      { tripId: string }
  searchParams: { ct?: string; cancelled?: string }
}

export const dynamic = 'force-dynamic'

export default async function TripCheckoutPage({ params, searchParams }: Props) {
  const { tripId }       = params
  const checkoutToken    = searchParams.ct ?? ''
  const wasCancelled     = searchParams.cancelled === '1'

  if (!checkoutToken) redirect('/')

  // Soft auth — determine current user for ownership hint
  const authSession = await getServerSession(authOptions).catch(() => null)
  let userId: string | null = null
  if (authSession?.user?.email) {
    const user = await prisma.user.findUnique({
      where:  { email: authSession.user.email },
      select: { id: true },
    })
    userId = user?.id ?? null
  }

  // Decode (not verify) the token to get ownerId for display
  const tokenPayload = decodeCheckoutToken(checkoutToken)
  if (!tokenPayload || tokenPayload.tripId !== tripId) redirect('/')

  // If user is authenticated, verify they own this token
  if (userId && tokenPayload.ownerId !== userId) {
    redirect('/')
  }

  // Load trip from DB
  const trip = await prisma.trip.findUnique({
    where:  { id: tripId },
    select: {
      id:          true,
      title:       true,
      destination: true,
      currency:    true,
      status:      true,
      leadId:      true,
      items: {
        select: {
          id:          true,
          type:        true,
          title:       true,
          description: true,
          cost:        true,
          currency:    true,
          confirmed:   true,
          bookingRef:  true,
          location:    true,
          startTime:   true,
          sourceType:  true,
        },
        orderBy: { order: 'asc' },
      },
    },
  })

  if (!trip) redirect('/')

  // Verify ownership in DB if no userId (anonymous session can't be verified server-side)
  if (userId) {
    const ownedTrip = await prisma.trip.findUnique({
      where:  { id: tripId },
      select: { userId: true },
    })
    if (ownedTrip?.userId && ownedTrip.userId !== userId) redirect('/')
  }

  // Already past a terminal state
  if (['CANCELLED', 'COMPLETED'].includes(trip.status)) redirect('/')

  const pageTitle = trip.title || trip.destination || 'Your Trip'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-1">
            Walz Travels — Secure Checkout
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          {trip.destination && trip.title && (
            <p className="text-gray-500 mt-1">{trip.destination}</p>
          )}
        </div>

        <CheckoutTripReview
          tripId={tripId}
          checkoutToken={checkoutToken}
          wasCancelled={wasCancelled}
          initialItems={trip.items.map(i => ({
            id:          i.id,
            type:        i.type,
            title:       i.title,
            description: i.description ?? null,
            cost:        i.cost,
            currency:    i.currency,
            confirmed:   i.confirmed,
            bookingRef:  i.bookingRef,
            location:    i.location ?? null,
            startTime:   i.startTime ?? null,
            sourceType:  i.sourceType ?? null,
          }))}
          tripCurrency={trip.currency}
        />
      </div>
    </div>
  )
}
