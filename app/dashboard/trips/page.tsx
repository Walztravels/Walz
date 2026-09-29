// app/dashboard/trips/page.tsx — My Walz Phase 1: My Trips (read-only)
//
// Reads the EXISTING Trip model (userId-scoped) — Upcoming / Past / Saved
// (Planning) grouping. Does not create trips, duplicate booking records, or
// a parallel trip concept. Trip Planner (/plan/library) remains the place
// customers build/edit trips — this page is the read-only overview.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Compass, Sparkles, ChevronRight, MapPin, Calendar, Users } from 'lucide-react'
import prisma from '@/lib/db'

export const dynamic = 'force-dynamic'

interface TripRow {
  id: string
  title: string
  destination: string
  startDate: Date | null
  endDate: Date | null
  status: string
  adults: number
  children: number
  infants: number
  itemCount: number
  confirmedItemCount: number
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft', PLANNING: 'Planning', CHECKOUT_STARTED: 'Checkout started',
    PAID: 'Paid', CONFIRMING: 'Confirming', CONFIRMED: 'Confirmed',
    PARTIALLY_CONFIRMED: 'Partially confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
  }
  return labels[status] ?? status
}

function statusColor(status: string): string {
  if (status === 'CONFIRMED' || status === 'COMPLETED') return 'bg-green-500/10 text-green-400'
  if (status === 'CANCELLED') return 'bg-red-500/10 text-red-400'
  if (status === 'PARTIALLY_CONFIRMED' || status === 'CONFIRMING') return 'bg-amber-500/10 text-amber-400'
  if (status === 'PAID' || status === 'CHECKOUT_STARTED') return 'bg-blue-500/10 text-blue-400'
  return 'bg-white/10 text-white/50'
}

function TripCard({ trip }: { trip: TripRow }) {
  const travellers = trip.adults + trip.children + trip.infants
  return (
    <div className="rounded-xl bg-[#0B1F3A] border border-white/8 p-4 hover:border-[#C9A84C]/30 transition-all">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(trip.status)}`}>
              {statusLabel(trip.status)}
            </span>
            {trip.itemCount > 0 && (
              <span className="text-xs text-white/30">{trip.confirmedItemCount}/{trip.itemCount} confirmed</span>
            )}
          </div>
          <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
            {trip.destination || trip.title}
          </h3>
          <div className="flex items-center gap-3 text-xs text-white/40 mt-1 flex-wrap">
            {(trip.startDate || trip.endDate) && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {trip.startDate ? format(new Date(trip.startDate), 'd MMM yyyy') : 'TBD'}
                {trip.endDate && <> – {format(new Date(trip.endDate), 'd MMM yyyy')}</>}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {travellers} traveller{travellers !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Link href={`/plan/${trip.id}`}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-white/15 text-xs font-medium text-white/70 rounded-lg hover:bg-white/8 transition-colors">
          View Trip <ChevronRight className="w-3 h-3" />
        </Link>
        <Link href={`/dashboard/jade?trip=${trip.id}`}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#C9A84C]/10 border border-[#C9A84C]/25 text-xs font-semibold text-[#C9A84C] rounded-lg hover:bg-[#C9A84C]/15 transition-colors">
          <Sparkles className="w-3 h-3" /> Ask Jade
        </Link>
      </div>
    </div>
  )
}

function Section({ title, trips }: { title: string; trips: TripRow[] }) {
  if (trips.length === 0) return null
  return (
    <div>
      <h2 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-3">
        {title}
        <span className="ml-2 text-white/20 font-normal normal-case">{trips.length}</span>
      </h2>
      <div className="space-y-3">
        {trips.map(t => <TripCard key={t.id} trip={t} />)}
      </div>
    </div>
  )
}

export default async function TripsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login?callbackUrl=/dashboard/trips')

  // Ownership: Trip.userId === session.user.id — never a client-supplied id.
  const rawTrips = await prisma.trip.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    include: { items: { select: { confirmed: true } } },
    take: 100,
  })

  const trips: TripRow[] = rawTrips.map(t => ({
    id: t.id,
    title: t.title,
    destination: t.destination,
    startDate: t.startDate,
    endDate: t.endDate,
    status: t.status,
    adults: t.adults,
    children: t.children,
    infants: t.infants,
    itemCount: t.items.length,
    confirmedItemCount: t.items.filter(i => i.confirmed).length,
  }))

  const now = Date.now()
  const upcoming = trips.filter(t =>
    !['CANCELLED', 'COMPLETED', 'DRAFT', 'PLANNING'].includes(t.status)
    || (t.startDate != null && new Date(t.startDate).getTime() >= now),
  ).filter(t => t.status !== 'CANCELLED')
  const saved = trips.filter(t => (t.status === 'DRAFT' || t.status === 'PLANNING') && !upcoming.includes(t))
  const past = trips.filter(t =>
    t.status === 'COMPLETED'
    || t.status === 'CANCELLED'
    || (t.endDate != null && new Date(t.endDate).getTime() < now && !upcoming.includes(t) && !saved.includes(t)),
  )

  return (
    <div className="min-h-screen bg-[#060e1c] px-5 lg:px-8 py-8 pb-24">
      <div className="max-w-3xl">
        <Link href="/dashboard"
          className="flex items-center gap-2 text-white/40 hover:text-white text-sm mb-6 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <Compass className="w-5 h-5 text-[#C9A84C]" />
            <h1 className="text-white font-bold text-2xl">My Trips</h1>
          </div>
          <Link href="/plan/library"
            className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
            <Compass className="w-4 h-4" />
            Trip Planner
          </Link>
        </div>

        {trips.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">🧭</p>
            <h3 className="text-white font-semibold text-base mb-2">No trips yet</h3>
            <p className="text-white/40 text-sm max-w-xs mx-auto mb-6">
              Plan and manage your personal trips with our AI-powered trip planner.
            </p>
            <Link href="/plan/library"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold rounded-xl hover:bg-[#b8943d] transition-colors">
              Open Trip Planner
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            <Section title="Upcoming" trips={upcoming} />
            <Section title="Saved / Planning" trips={saved} />
            <Section title="Past" trips={past} />
          </div>
        )}
      </div>
    </div>
  )
}
