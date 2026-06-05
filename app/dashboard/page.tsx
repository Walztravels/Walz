export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import {
  User,
  Plane,
  Hotel,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  LayoutDashboard,
  LogOut,
  Settings,
  FileText,
  Map,
} from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: 'Pending', color: 'text-walz-warning bg-yellow-50 border-yellow-200', icon: Clock },
  CONFIRMED: { label: 'Confirmed', color: 'text-walz-success bg-green-50 border-green-200', icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', color: 'text-walz-error bg-red-50 border-red-200', icon: XCircle },
  COMPLETED: { label: 'Completed', color: 'text-walz-muted bg-walz-off-white border-walz-border', icon: CheckCircle },
}

export const metadata = {
  title: 'My Dashboard',
  description: 'Manage your bookings and account',
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/login?callbackUrl=/dashboard')
  }

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  const visaApplications = await prisma.visaApplication.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const tourEnquiries = await prisma.tourEnquiry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const activeBookings = bookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'PENDING'
  )

  const stats = [
    { label: 'Total Bookings', value: bookings.length, icon: Plane, color: 'walz-gold' },
    { label: 'Active Trips', value: activeBookings.length, icon: Calendar, color: 'walz-success' },
    { label: 'Visa Applications', value: visaApplications.length, icon: FileText, color: 'walz-muted' },
    { label: 'Tour Enquiries', value: tourEnquiries.length, icon: Map, color: 'walz-muted' },
  ]

  return (
    <div className="min-h-screen bg-walz-off-white">
      {/* Header */}
      <div className="bg-walz-deep-navy">
        <div className="container-walz py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full walz-gold-gradient flex items-center justify-center text-walz-deep-navy font-bold text-xl">
                {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || 'W'}
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-walz-white">
                  {session.user.name || 'Welcome back'}
                </h1>
                <p className="text-walz-muted text-sm">{session.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/flights">
                <button className="btn-gold text-sm px-4 py-2 rounded-lg">
                  Book a Trip
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-walz-border p-4 lg:p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl walz-gold-gradient flex items-center justify-center">
                  <Icon className="w-5 h-5 text-walz-deep-navy" />
                </div>
                <span className="text-3xl font-bold text-walz-deep-navy">{value}</span>
              </div>
              <p className="text-walz-muted text-sm">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Bookings */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-walz-border shadow-card overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-walz-border">
                <h2 className="font-display text-lg font-bold text-walz-deep-navy flex items-center gap-2">
                  <Plane className="w-5 h-5 text-walz-gold" />
                  My Bookings
                </h2>
                <Link href="/flights" className="text-walz-gold text-sm font-medium hover:underline">
                  Book new →
                </Link>
              </div>

              {bookings.length === 0 ? (
                <div className="text-center py-12">
                  <Plane className="w-12 h-12 text-walz-muted mx-auto mb-3" />
                  <h3 className="font-semibold text-walz-deep-navy mb-1">No bookings yet</h3>
                  <p className="text-walz-muted text-sm mb-4">
                    Start planning your next adventure
                  </p>
                  <Link href="/flights">
                    <button className="btn-gold text-sm px-5 py-2.5 rounded-lg">
                      Search Flights
                    </button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-walz-border">
                  {bookings.map((booking) => {
                    const status = booking.status as BookingStatus
                    const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING
                    const StatusIcon = statusConfig.icon
                    const flightDetails = booking.flightDetails as {
                      origin?: string
                      destination?: string
                      departureDate?: string
                    } | null

                    return (
                      <div key={booking.id} className="p-4 lg:p-5 hover:bg-walz-off-white transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-walz-off-white border border-walz-border flex items-center justify-center flex-shrink-0">
                              {booking.type === 'FLIGHT' ? (
                                <Plane className="w-5 h-5 text-walz-gold" />
                              ) : (
                                <Hotel className="w-5 h-5 text-walz-gold" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-walz-deep-navy text-sm">
                                {flightDetails
                                  ? `${flightDetails.origin || '?'} → ${flightDetails.destination || '?'}`
                                  : booking.type}
                              </div>
                              <div className="text-xs text-walz-muted mt-0.5">
                                Ref: <span className="font-mono text-walz-deep-navy">{booking.bookingReference}</span>
                                {booking.pnr && (
                                  <> · PNR: <span className="font-mono text-walz-deep-navy">{booking.pnr}</span></>
                                )}
                              </div>
                              {flightDetails?.departureDate && (
                                <div className="text-xs text-walz-muted mt-0.5">
                                  <Calendar className="w-3 h-3 inline mr-1" />
                                  {formatDate(flightDetails.departureDate)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold text-walz-gold text-sm">
                              {formatPrice(booking.totalAmount, booking.currency)}
                            </div>
                            <div className={cn(
                              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border mt-1',
                              statusConfig.color
                            )}>
                              <StatusIcon className="w-3 h-3" />
                              {statusConfig.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Account Info */}
            <div className="bg-white rounded-2xl border border-walz-border shadow-card p-5">
              <h3 className="font-display text-base font-bold text-walz-deep-navy mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-walz-gold" />
                Account
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-walz-muted">Name</p>
                  <p className="text-sm font-medium text-walz-deep-navy">{session.user.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-walz-muted">Email</p>
                  <p className="text-sm font-medium text-walz-deep-navy truncate">{session.user.email}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-walz-border space-y-2">
                <Link href="/dashboard/settings">
                  <button className="w-full flex items-center gap-2 text-sm text-walz-slate hover:text-walz-gold transition-colors py-1.5">
                    <Settings className="w-4 h-4" />
                    Account Settings
                  </button>
                </Link>
                <Link href="/api/auth/signout">
                  <button className="w-full flex items-center gap-2 text-sm text-walz-error hover:text-red-600 transition-colors py-1.5">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </Link>
              </div>
            </div>

            {/* Visa Applications */}
            {visaApplications.length > 0 && (
              <div className="bg-white rounded-2xl border border-walz-border shadow-card p-5">
                <h3 className="font-display text-base font-bold text-walz-deep-navy mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-walz-gold" />
                  Visa Applications
                </h3>
                <div className="space-y-2">
                  {visaApplications.slice(0, 3).map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-sm">
                      <span className="text-walz-slate">{app.destinationCountry}</span>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        app.status === 'APPROVED' ? 'bg-green-100 text-walz-success' :
                        app.status === 'REJECTED' ? 'bg-red-100 text-walz-error' :
                        'bg-yellow-50 text-walz-warning'
                      )}>
                        {app.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Links */}
            <div className="bg-white rounded-2xl border border-walz-border shadow-card p-5">
              <h3 className="font-display text-base font-bold text-walz-deep-navy mb-3 flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-walz-gold" />
                Quick Links
              </h3>
              <div className="space-y-2">
                {[
                  { href: '/flights', icon: Plane, label: 'Book a Flight' },
                  { href: '/hotels', icon: Hotel, label: 'Find a Hotel' },
                  { href: '/tours', icon: Map, label: 'Explore Tours' },
                  { href: '/visa', icon: FileText, label: 'Visa Services' },
                ].map(({ href, icon: Icon, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-2 text-sm text-walz-slate hover:text-walz-gold transition-colors py-1"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
