// app/dashboard/bookings/page.tsx — Release 6.3: Categorized booking hub

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { Plane, Hotel, Map, Package2, ArrowLeft, AlertCircle, ChevronRight, Ticket } from 'lucide-react'
import prisma from '@/lib/db'
import {
  getCustomerBookingState,
  getCustomerBookingStateLabel,
  getCustomerBookingStateColor,
  type CustomerBookingState,
} from '@/lib/portal/booking-states'

export const dynamic = 'force-dynamic'

function TypeIcon({ type }: { type: string }) {
  if (type === 'FLIGHT')   return <Plane    className="w-4 h-4 text-blue-400" />
  if (type === 'HOTEL')    return <Hotel    className="w-4 h-4 text-purple-400" />
  if (type === 'PACKAGE')  return <Package2 className="w-4 h-4 text-green-400" />
  if (type === 'ACTIVITY') return <Ticket   className="w-4 h-4 text-orange-400" />
  return <Map className="w-4 h-4 text-green-400" />
}

function typeLabel(type: string) {
  if (type === 'FLIGHT')   return 'Flight'
  if (type === 'HOTEL')    return 'Hotel'
  if (type === 'PACKAGE')  return 'Package'
  if (type === 'ACTIVITY') return 'Activity'
  if (type === 'TRANSFER') return 'Transfer'
  return type
}

interface BookingRow {
  id: string
  type: string
  bookingReference: string
  status: string
  paymentStatus: string
  totalAmount: number
  currency: string
  pnr: string | null
  flightDetails: unknown
  hotelDetails: unknown
  createdAt: Date
}

function routeLabel(b: BookingRow): string {
  const det = ((b.flightDetails ?? b.hotelDetails ?? {}) as Record<string, unknown>)
  if (b.type === 'FLIGHT') {
    const origin = det.origin ?? ''
    const destination = det.destination ?? ''
    if (origin || destination) return `${origin} → ${destination}`.trim()
  }
  if (b.type === 'HOTEL') {
    return String(det.name ?? det.hotelName ?? '').trim()
  }
  return ''
}

interface BookingCardProps {
  b: BookingRow
  state: CustomerBookingState
}

function BookingCard({ b, state }: BookingCardProps) {
  const label = routeLabel(b)
  return (
    <Link
      href={`/dashboard/bookings/${b.id}`}
      className="flex items-center gap-4 p-4 rounded-xl bg-[#0B1F3A] border border-white/8 hover:border-[#C9A84C]/30 transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
        <TypeIcon type={b.type} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-semibold text-white text-sm group-hover:text-[#C9A84C] transition-colors">
            {typeLabel(b.type)}
          </span>
          {label && <span className="text-white/40 text-xs truncate max-w-[180px]">{label}</span>}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCustomerBookingStateColor(state)}`}>
            {getCustomerBookingStateLabel(state)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/30">
          <span className="font-mono">{b.bookingReference}</span>
          <span>{b.currency} {Number(b.totalAmount).toLocaleString()}</span>
          <span>{format(new Date(b.createdAt), 'd MMM yyyy')}</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-[#C9A84C] flex-shrink-0 transition-colors" />
    </Link>
  )
}

interface SectionProps {
  title: string
  bookings: Array<{ b: BookingRow; state: CustomerBookingState }>
  emptyText?: string
}

function Section({ title, bookings, emptyText }: SectionProps) {
  if (bookings.length === 0 && !emptyText) return null
  return (
    <div>
      <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
        {title}
        <span className="ml-2 text-white/20 font-normal normal-case">{bookings.length}</span>
      </h2>
      {bookings.length === 0 ? (
        <p className="text-white/20 text-sm py-4">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {bookings.map(({ b, state }) => (
            <BookingCard key={b.id} b={b} state={state} />
          ))}
        </div>
      )}
    </div>
  )
}

export default async function BookingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/bookings')

  const lowerEmail = session.user.email?.toLowerCase() ?? ''

  const rawBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { userId: session.user.id },
        ...(lowerEmail ? [{ contactEmail: lowerEmail }] : []),
      ],
    },
    select: {
      id: true,
      type: true,
      bookingReference: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      currency: true,
      pnr: true,
      flightDetails: true,
      hotelDetails: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const bookings = rawBookings.map(b => ({
    b: b as BookingRow,
    state: getCustomerBookingState({ status: b.status, paymentStatus: b.paymentStatus }),
  }))

  const actionRequired   = bookings.filter(x => x.state === 'ACTION_REQUIRED')
  const paymentReceived  = bookings.filter(x => x.state === 'PAYMENT_RECEIVED')
  const confirmed        = bookings.filter(x => x.state === 'CONFIRMED')
  const completed        = bookings.filter(x => x.state === 'COMPLETED')
  const other            = bookings.filter(x =>
    !['ACTION_REQUIRED', 'PAYMENT_RECEIVED', 'CONFIRMED', 'COMPLETED'].includes(x.state)
  )

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-3xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <Plane className="w-5 h-5 text-[#C9A84C]" />
          <h1 className="text-white font-bold text-2xl">My Bookings</h1>
          {rawBookings.length > 0 && (
            <span className="text-xs bg-[#C9A84C] text-[#0B1F3A] px-2 py-0.5 rounded-full font-bold">
              {rawBookings.length}
            </span>
          )}
        </div>

        {rawBookings.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">✈️</p>
            <h3 className="text-white font-semibold text-base mb-2">No bookings yet</h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto mb-6">
              Flights, hotels and tours booked through Walz Travels will appear here.
            </p>
            <Link href="/flights"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
              Search Flights
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {actionRequired.length > 0 && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 font-semibold text-sm">Action Required</span>
                </div>
                <div className="space-y-2">
                  {actionRequired.map(({ b, state }) => (
                    <BookingCard key={b.id} b={b} state={state} />
                  ))}
                </div>
              </div>
            )}

            {paymentReceived.length > 0 && (
              <Section title="Awaiting Confirmation" bookings={paymentReceived} />
            )}

            {confirmed.length > 0 && (
              <Section title="Confirmed" bookings={confirmed} />
            )}

            {completed.length > 0 && (
              <Section title="Completed" bookings={completed} />
            )}

            {other.length > 0 && (
              <Section title="Other" bookings={other} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
