// app/dashboard/bookings/[id]/page.tsx — Release 6.3: Booking detail (IDOR-protected RSC)

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowLeft, Plane, Hotel, Map, Package2, Ticket,
  AlertCircle, CheckCircle, Clock, MessageCircle,
} from 'lucide-react'
import prisma from '@/lib/db'
import { toCustomerBookingDetail } from '@/lib/portal/booking-dto'
import { BUSINESS, waLink } from '@/lib/config/business'

export const dynamic = 'force-dynamic'

function TypeIcon({ type }: { type: string }) {
  if (type === 'FLIGHT')   return <Plane    className="w-5 h-5 text-blue-400" />
  if (type === 'HOTEL')    return <Hotel    className="w-5 h-5 text-purple-400" />
  if (type === 'PACKAGE')  return <Package2 className="w-5 h-5 text-green-400" />
  if (type === 'ACTIVITY') return <Ticket   className="w-5 h-5 text-orange-400" />
  return <Map className="w-5 h-5 text-green-400" />
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    FLIGHT: 'Flight', HOTEL: 'Hotel', PACKAGE: 'Package',
    ACTIVITY: 'Activity', TRANSFER: 'Transfer',
  }
  return map[type] ?? type
}

function StatusIcon({ state }: { state: string }) {
  if (state === 'CONFIRMED' || state === 'COMPLETED' || state === 'REFUNDED')
    return <CheckCircle className="w-4 h-4" />
  if (state === 'ACTION_REQUIRED')
    return <AlertCircle className="w-4 h-4" />
  return <Clock className="w-4 h-4" />
}

export default async function BookingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=/dashboard/bookings/${params.id}`)
  }

  const userId = session.user.id
  const lowerEmail = session.user.email?.toLowerCase() ?? ''

  const raw = await prisma.booking.findFirst({
    where: {
      id: params.id,
      OR: [
        { userId },
        ...(lowerEmail ? [{ contactEmail: lowerEmail }] : []),
      ],
    },
    select: {
      id: true,
      bookingReference: true,
      type: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      currency: true,
      pnr: true,
      contactEmail: true,
      contactPhone: true,
      flightDetails: true,
      hotelDetails: true,
      passengers: true,
      createdAt: true,
      tickets: {
        select: { id: true, htmlSnapshot: true, createdAt: true },
      },
    },
  })

  // IDOR: if not found (wrong owner or non-existent) → redirect to list
  if (!raw) {
    redirect('/dashboard/bookings')
  }

  const b = toCustomerBookingDetail(raw as Parameters<typeof toCustomerBookingDetail>[0])

  const waUrl = waLink(BUSINESS.contacts.globalWhatsapp.e164)
  const waMessage = `Hi, I need help with booking ${b.reference}`
  const supportUrl = `${waUrl}?text=${encodeURIComponent(waMessage)}`

  const flightTitle = b.flightDetails?.origin && b.flightDetails?.destination
    ? `${b.flightDetails.origin} → ${b.flightDetails.destination}`
    : b.flightDetails?.outbound?.[0]
      ? `${b.flightDetails.outbound[0].departureAirport} → ${b.flightDetails.outbound[b.flightDetails.outbound.length - 1]?.arrivalAirport}`
      : null

  const hotelTitle = b.hotelDetails?.name ?? null

  const pageTitle = flightTitle ?? hotelTitle ?? typeLabel(b.type)

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-2xl">
        {/* Back */}
        <Link href="/dashboard/bookings"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to bookings
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TypeIcon type={b.type} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-white/50 text-xs font-medium uppercase tracking-wider">
                {typeLabel(b.type)}
              </span>
              <span className="text-white/20 text-xs font-mono">{b.reference}</span>
            </div>
            <h1 className="text-white font-bold text-xl leading-tight">{pageTitle}</h1>
          </div>
        </div>

        {/* Status card */}
        <div className={`p-4 rounded-2xl border mb-6 ${
          b.state === 'ACTION_REQUIRED'
            ? 'bg-red-500/10 border-red-500/20'
            : b.state === 'CONFIRMED' || b.state === 'COMPLETED'
              ? 'bg-green-500/8 border-green-500/15'
              : b.state === 'PAYMENT_RECEIVED'
                ? 'bg-blue-500/8 border-blue-500/15'
                : 'bg-white/4 border-white/8'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${
              b.state === 'ACTION_REQUIRED' ? 'text-red-400' :
              b.state === 'CONFIRMED' || b.state === 'COMPLETED' ? 'text-green-400' :
              b.state === 'PAYMENT_RECEIVED' ? 'text-blue-400' : 'text-white/70'
            }`}>
              <StatusIcon state={b.state} />
              {b.stateLabel}
            </span>
          </div>
          <p className="text-white/50 text-sm">{b.stateDescription}</p>
          {b.needsAction && (
            <a href={supportUrl} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 transition-colors">
              <MessageCircle className="w-4 h-4" />
              Contact Support Now
            </a>
          )}
        </div>

        {/* Booking summary */}
        <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5 mb-4">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Booking Summary</h2>
          <div className="space-y-3">
            <Row label="Reference" value={b.reference} mono />
            {b.pnr && b.pnr !== b.reference && (
              <Row label="Booking / PNR" value={b.pnr} mono />
            )}
            <Row label="Amount" value={`${b.currency} ${Number(b.totalAmount).toLocaleString()}`} />
            <Row label="Booked" value={format(new Date(b.createdAt), 'd MMMM yyyy')} />
            <Row label="Contact email" value={b.contactEmail} />
            {b.contactPhone && <Row label="Contact phone" value={b.contactPhone} />}
          </div>
        </div>

        {/* Flight segments */}
        {b.flightDetails && b.flightDetails.outbound.length > 0 && (
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5 mb-4">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Itinerary</h2>
            <div className="space-y-4">
              {b.flightDetails.outbound.map((seg, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Plane className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">
                      {seg.departureAirport} → {seg.arrivalAirport}
                    </p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {seg.airline} {seg.flightNumber}
                      {seg.departureTime && ` · ${format(new Date(seg.departureTime), 'd MMM yyyy HH:mm')}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hotel details */}
        {b.hotelDetails && (
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5 mb-4">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Hotel</h2>
            <div className="space-y-3">
              {b.hotelDetails.name && <Row label="Property" value={b.hotelDetails.name} />}
              {b.hotelDetails.location && <Row label="Location" value={b.hotelDetails.location} />}
              {b.hotelDetails.checkIn && <Row label="Check-in" value={b.hotelDetails.checkIn} />}
              {b.hotelDetails.checkOut && <Row label="Check-out" value={b.hotelDetails.checkOut} />}
            </div>
          </div>
        )}

        {/* Passengers */}
        {b.passengers.length > 0 && (
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5 mb-4">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">
              Travellers
              <span className="ml-2 text-white/20 font-normal normal-case">{b.passengers.length}</span>
            </h2>
            <div className="space-y-2">
              {b.passengers.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className="text-white text-sm">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-white/30 text-xs">{
                    p.type === 'ADT' ? 'Adult' : p.type === 'CHD' ? 'Child' : 'Infant'
                  }</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tickets / vouchers */}
        {b.tickets.length > 0 && (
          <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5 mb-4">
            <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">Ticket / Voucher</h2>
            <div className="space-y-3">
              {b.tickets.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-white/4 border border-white/8">
                  <div>
                    <p className="text-white text-sm font-medium">E-Ticket</p>
                    <p className="text-white/30 text-xs mt-0.5">Issued {format(new Date(t.issuedAt), 'd MMM yyyy')}</p>
                  </div>
                  <Link href={`/dashboard/bookings/${b.id}/ticket/${t.id}`}
                    className="text-xs font-semibold text-[#C9A84C] hover:text-[#b8943d] transition-colors">
                    View →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Support / Jade */}
        <div className="bg-[#0B1F3A] rounded-2xl border border-white/8 p-5">
          <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">Need Help?</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href={supportUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/20 transition-colors">
              <MessageCircle className="w-4 h-4" />
              WhatsApp Support
            </a>
            <Link href={`/dashboard/jade?booking=${b.id}`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/20 text-[#C9A84C] text-sm font-semibold hover:bg-[#C9A84C]/20 transition-colors">
              Ask Jade
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/40 text-sm flex-shrink-0">{label}</span>
      <span className={`text-white text-sm text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
