export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import {
  User, Plane, Hotel, Calendar, CheckCircle, Clock, XCircle,
  LayoutDashboard, LogOut, Settings, FileText, Map, Gift, ArrowRight,
} from 'lucide-react'
import { formatPrice, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; icon: React.ElementType }> = {
  PENDING:   { label: 'Pending',   color: 'text-amber-700 bg-amber-50 border-amber-200',  icon: Clock },
  CONFIRMED: { label: 'Confirmed', color: 'text-green-700 bg-green-50 border-green-200',  icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700 bg-red-50 border-red-200',        icon: XCircle },
  COMPLETED: { label: 'Completed', color: 'text-gray-600 bg-gray-50 border-gray-200',     icon: CheckCircle },
}

const VOUCHER_STATUS_COLOR: Record<string, string> = {
  ACTIVE:   'bg-green-100 text-green-700',
  REDEEMED: 'bg-gray-100 text-gray-600',
  EXPIRED:  'bg-red-100 text-red-600',
  SENT:     'bg-blue-100 text-blue-700',
}

function fmt(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

export const metadata = {
  title: 'My Dashboard — Walz Travels',
  description: 'Manage your bookings, vouchers and account',
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login?callbackUrl=/dashboard')

  const [bookings, visaApplications, vouchers] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.visaApplication.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.voucher.findMany({
      where: { recipientEmail: session.user.email! },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const activeBookings = bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'PENDING')
  const activeVouchers = vouchers.filter(v => v.status === 'ACTIVE' && new Date(v.expiresAt) > new Date())

  const stats = [
    { label: 'Total Bookings',    value: bookings.length,          icon: Plane    },
    { label: 'Active Trips',      value: activeBookings.length,     icon: Calendar },
    { label: 'Visa Applications', value: visaApplications.length,   icon: FileText },
    { label: 'Active Vouchers',   value: activeVouchers.length,     icon: Gift     },
  ]

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      {/* Header */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full walz-gold-gradient flex items-center justify-center text-[#0B1F3A] font-bold text-xl">
                {session.user.name?.[0]?.toUpperCase() || session.user.email?.[0]?.toUpperCase() || 'W'}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{session.user.name || 'Welcome back'}</h1>
                <p className="text-[#8B9BAE] text-sm">{session.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/gift">
                <button className="flex items-center gap-2 px-4 py-2 border border-[#C9A84C]/40 text-[#C9A84C] text-sm font-medium rounded-xl hover:bg-[#C9A84C]/10 transition-colors">
                  <Gift className="w-4 h-4" />
                  Gift Vouchers
                </button>
              </Link>
              <Link href="/flights">
                <button className="btn-gold text-sm px-4 py-2 rounded-xl">
                  Book a Trip
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4 lg:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl walz-gold-gradient flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#0B1F3A]" />
                </div>
                <span className="text-3xl font-bold text-[#0B1F3A]">{value}</span>
              </div>
              <p className="text-gray-500 text-sm">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── My Bookings (main column) ── */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="text-base font-bold text-[#0B1F3A] flex items-center gap-2">
                  <Plane className="w-5 h-5 text-[#C9A84C]" />
                  My Bookings
                </h2>
                <Link href="/flights" className="text-[#C9A84C] text-sm font-medium hover:underline flex items-center gap-1">
                  Book new <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {bookings.length === 0 ? (
                <div className="text-center py-12">
                  <Plane className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-[#0B1F3A] mb-1">No bookings yet</h3>
                  <p className="text-gray-400 text-sm mb-4">Start planning your next adventure</p>
                  <Link href="/flights">
                    <button className="btn-gold text-sm px-5 py-2 rounded-lg">Search Flights</button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {bookings.map((booking) => {
                    const status = booking.status as BookingStatus
                    const cfg    = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING
                    const Icon   = cfg.icon
                    const fd     = booking.flightDetails as { origin?: string; destination?: string; departureDate?: string } | null

                    return (
                      <div key={booking.id} className="p-4 lg:p-5 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                              {booking.type === 'FLIGHT'
                                ? <Plane className="w-5 h-5 text-[#C9A84C]" />
                                : <Hotel className="w-5 h-5 text-[#C9A84C]" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[#0B1F3A] text-sm">
                                {fd ? `${fd.origin ?? '?'} → ${fd.destination ?? '?'}` : booking.type}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                Ref: <span className="font-mono text-[#0B1F3A]">{booking.bookingReference}</span>
                                {booking.pnr && <> · PNR: <span className="font-mono text-[#0B1F3A]">{booking.pnr}</span></>}
                              </div>
                              {fd?.departureDate && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  <Calendar className="w-3 h-3 inline mr-1" />
                                  {formatDate(fd.departureDate)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold text-[#C9A84C] text-sm">
                              {formatPrice(booking.totalAmount, booking.currency)}
                            </div>
                            <div className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border mt-1', cfg.color)}>
                              <Icon className="w-3 h-3" />
                              {cfg.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── My Vouchers ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <h2 className="text-base font-bold text-[#0B1F3A] flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#C9A84C]" />
                  My Vouchers
                </h2>
                <Link href="/gift" className="text-[#C9A84C] text-sm font-medium hover:underline flex items-center gap-1">
                  Buy a gift <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {vouchers.length === 0 ? (
                <div className="text-center py-10">
                  <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-[#0B1F3A] mb-1">No vouchers yet</h3>
                  <p className="text-gray-400 text-sm mb-4">Gift vouchers and travel credits appear here</p>
                  <Link href="/gift">
                    <button className="text-[#C9A84C] text-sm font-semibold hover:underline">Shop Gift Vouchers</button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {vouchers.map((v) => {
                    const expired = new Date(v.expiresAt) < new Date()
                    const statusKey = expired && v.status === 'ACTIVE' ? 'EXPIRED' : v.status
                    return (
                      <div key={v.id} className="p-4 lg:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#0B1F3A] text-sm tracking-widest">
                                {v.code}
                              </span>
                              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', VOUCHER_STATUS_COLOR[statusKey] ?? 'bg-gray-100 text-gray-600')}>
                                {statusKey}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {v.name ?? (v.voucherKind === 'credit' ? 'Travel Credit' : 'Gift Voucher')}
                              {' · '}Expires {new Date(v.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold text-[#C9A84C]">{fmt(v.remainingAmount, v.currency)}</div>
                            {v.remainingAmount < v.amount && (
                              <p className="text-xs text-gray-400">{fmt(v.amount, v.currency)} original</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-5">

            {/* Account */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-base font-bold text-[#0B1F3A] mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-[#C9A84C]" />
                Account
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400">Name</p>
                  <p className="text-sm font-medium text-[#0B1F3A]">{session.user.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm font-medium text-[#0B1F3A] truncate">{session.user.email}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
                <Link href="/dashboard/settings">
                  <button className="w-full flex items-center gap-2 text-sm text-gray-500 hover:text-[#C9A84C] transition-colors py-1.5">
                    <Settings className="w-4 h-4" />
                    Profile Settings
                  </button>
                </Link>
                <Link href="/api/auth/signout">
                  <button className="w-full flex items-center gap-2 text-sm text-red-400 hover:text-red-600 transition-colors py-1.5">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </Link>
              </div>
            </div>

            {/* Visa Applications */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-base font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#C9A84C]" />
                Visa Applications
              </h3>
              {visaApplications.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-sm mb-3">No applications yet</p>
                  <Link href="/visa">
                    <button className="text-[#C9A84C] text-sm font-semibold hover:underline">Apply for a visa</button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {visaApplications.slice(0, 4).map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-[#0B1F3A] font-medium">{app.destinationCountry}</span>
                        <span className="text-gray-400 text-xs ml-1">— {app.visaType}</span>
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium',
                        app.status === 'APPROVED'   ? 'bg-green-100 text-green-700' :
                        app.status === 'REJECTED'   ? 'bg-red-100 text-red-700'    :
                        app.status === 'SUBMITTED'  ? 'bg-blue-100 text-blue-700'  :
                        'bg-amber-100 text-amber-700'
                      )}>
                        {app.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                  {visaApplications.length > 4 && (
                    <p className="text-xs text-gray-400 pt-1">+{visaApplications.length - 4} more</p>
                  )}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-base font-bold text-[#0B1F3A] mb-3 flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-[#C9A84C]" />
                Quick Links
              </h3>
              <div className="space-y-1">
                {[
                  { href: '/flights', icon: Plane,    label: 'Book a Flight'   },
                  { href: '/hotels',  icon: Hotel,    label: 'Find a Hotel'    },
                  { href: '/tours',   icon: Map,      label: 'Explore Tours'   },
                  { href: '/visa',    icon: FileText, label: 'Visa Services'   },
                  { href: '/gift',    icon: Gift,     label: 'Gift Vouchers'   },
                ].map(({ href, icon: Icon, label }) => (
                  <Link key={href} href={href}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#C9A84C] transition-colors py-1.5">
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
