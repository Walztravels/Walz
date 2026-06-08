import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import {
  DollarSign, BookOpen, CheckCircle, Clock, TrendingUp, Users,
  Globe, Compass, FileText, AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-[#0B1F3A]">{value}</div>
      <div className="text-sm font-medium text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function SectionCard({ title, href, hrefLabel, children }: {
  title: string; href?: string; hrefLabel?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-bold text-[#0B1F3A]">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-[#C9A84C] font-medium hover:underline">
            {hrefLabel ?? 'View all →'}
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:    'bg-amber-100 text-amber-700',
    CONFIRMED:  'bg-green-100 text-green-700',
    CANCELLED:  'bg-red-100 text-red-700',
    COMPLETED:  'bg-blue-100 text-blue-700',
    FAILED:     'bg-gray-100 text-gray-600',
    draft:      'bg-gray-100 text-gray-600',
    active:     'bg-blue-100 text-blue-700',
    completed:  'bg-green-100 text-green-700',
    cancelled:  'bg-red-100 text-red-700',
    submitted:  'bg-amber-100 text-amber-700',
    approved:   'bg-green-100 text-green-700',
    rejected:   'bg-red-100 text-red-700',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

function fmt(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

// ── Dashboard page ─────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const staffRole = session.staffRole ?? 'sales_rep'

  const now          = new Date()
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // ── Fetch data based on role ──────────────────────────────────────────────

  // All roles see booking counts (their own for lower roles)
  let totalBookings = 0, pendingBookings = 0, confirmedBookings = 0
  let weekRev = 0, monthRev = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recentBookings: any[] = []

  // Upper roles: visa + trip stats
  let visaTotal = 0, visaPending = 0
  let tripsActive = 0, tripsTotal = 0
  let staffCount = 0

  // My assigned items (coordinator / sales_rep)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myVisaApps: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let myTrips: any[] = []

  let dbError = false

  try {
    const isSuperOrGM   = staffRole === 'super_admin' || staffRole === 'general_manager'
    const isSeniorPlus  = isSuperOrGM || staffRole === 'senior_manager'

    // Booking stats
    ;[totalBookings, pendingBookings, confirmedBookings] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    ])

    recentBookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true, bookingReference: true, pnr: true,
        status: true, paymentStatus: true, totalAmount: true,
        currency: true, contactEmail: true, createdAt: true, passengers: true,
      },
    })

    // Revenue — only senior+ can see
    if (isSeniorPlus) {
      const [wr, mr] = await Promise.all([
        prisma.booking.aggregate({ where: { createdAt: { gte: startOfWeek }, paymentStatus: 'SUCCEEDED' }, _sum: { totalAmount: true } }),
        prisma.booking.aggregate({ where: { createdAt: { gte: startOfMonth }, paymentStatus: 'SUCCEEDED' }, _sum: { totalAmount: true } }),
      ])
      weekRev  = wr._sum.totalAmount ?? 0
      monthRev = mr._sum.totalAmount ?? 0
    }

    // Visa + trips stats — senior+
    if (isSeniorPlus) {
      ;[visaTotal, visaPending, tripsActive, tripsTotal] = await Promise.all([
        prisma.visaApplication.count(),
        prisma.visaApplication.count({ where: { status: 'submitted' } }),
        prisma.trip.count({ where: { status: 'PLANNING' } }),
        prisma.trip.count(),
      ])
    }

    // Staff count — super_admin / general_manager only
    if (isSuperOrGM) {
      staffCount = await prisma.staff.count({ where: { isActive: true } })
    }

    // Coordinator / sales_rep: their own assigned visa apps + trips
    if (!isSeniorPlus && session.email) {
      ;[myVisaApps, myTrips] = await Promise.all([
        prisma.visaApplication.findMany({
          where:   { assignedTo: session.email },
          orderBy: { createdAt: 'desc' },
          take:    8,
          select:  { id: true, firstName: true, lastName: true, status: true, visaType: true, destinationIso2: true, createdAt: true },
        }),
        prisma.trip.findMany({
          where:   { status: { in: ['PLANNING', 'CONFIRMED'] } },
          orderBy: { updatedAt: 'desc' },
          take:    8,
          select:  { id: true, title: true, destination: true, status: true, updatedAt: true, user: { select: { name: true } } },
        }),
      ])
    }
  } catch {
    dbError = true
  }

  const isSeniorPlus = staffRole === 'super_admin' || staffRole === 'general_manager' || staffRole === 'senior_manager'
  const isSuperOrGM  = staffRole === 'super_admin' || staffRole === 'general_manager'

  const greetings: Record<string, string> = {
    super_admin:     'Full system overview — all data visible.',
    general_manager: 'Operations overview — manage your team.',
    senior_manager:  'Your summary — applications, trips, and activity.',
    coordinator:     'Your assigned applications and trips.',
    sales_rep:       'Your active applications and open trips.',
  }

  return (
    <div>
      {dbError && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm">
          <strong>Database setup required.</strong> Please run the schema migration then refresh.
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{greetings[staffRole] ?? 'Welcome back.'}</p>
      </div>

      {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Bookings" value={totalBookings} icon={BookOpen}      color="bg-[#0B1F3A]" />
        <StatCard label="Pending"        value={pendingBookings} icon={Clock}       color="bg-amber-500" />
        <StatCard label="Confirmed"      value={confirmedBookings} icon={CheckCircle} color="bg-emerald-500" />

        {isSeniorPlus && (
          <>
            <StatCard label="This Week"   value={fmt(weekRev)}  icon={TrendingUp}  color="bg-[#C9A84C]" />
            <StatCard label="This Month"  value={fmt(monthRev)} icon={DollarSign}  color="bg-violet-500" />
            <StatCard label="Visa Apps"   value={visaTotal}     icon={Globe}       color="bg-blue-600" />
            <StatCard label="Visa Pending" value={visaPending}  icon={AlertCircle} color="bg-orange-500" />
            <StatCard label="Active Trips" value={tripsActive}  icon={Compass}     color="bg-teal-500" />
          </>
        )}

        {isSuperOrGM && (
          <>
            <StatCard label="Total Trips"   value={tripsTotal}  icon={Compass}     color="bg-indigo-500" />
            <StatCard label="Active Staff"  value={staffCount}  icon={Users}       color="bg-rose-500" />
          </>
        )}
      </div>

      {/* ── Role-specific content ──────────────────────────────────────────── */}

      {/* Senior+ : Recent Bookings table */}
      {isSeniorPlus && (
        <SectionCard title="Recent Bookings" href="/admin/bookings" hrefLabel="View all →">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reference</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono font-bold text-[#0B1F3A] text-xs">{b.bookingReference}</div>
                      {b.pnr && b.pnr !== b.bookingReference && (
                        <div className="text-xs text-gray-400 font-mono">PNR: {b.pnr}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-[180px] truncate">{b.contactEmail}</td>
                    <td className="px-6 py-4 font-semibold text-[#0B1F3A]">{fmt(b.totalAmount, b.currency)}</td>
                    <td className="px-6 py-4">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusBadge(b.status))}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{format(new Date(b.createdAt), 'dd MMM yyyy')}</td>
                  </tr>
                ))}
                {recentBookings.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No bookings yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Coordinator / Sales Rep: My Visa Apps + My Trips */}
      {!isSeniorPlus && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* My Visa Applications */}
          <SectionCard title="My Visa Applications" href="/admin/visa-applications">
            <div className="divide-y divide-gray-50">
              {myVisaApps.map((v) => (
                <Link key={v.id} href={`/admin/visa-applications/${v.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{[v.firstName, v.lastName].filter(Boolean).join(' ') || 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{v.destinationIso2} · {v.visaType}</p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusBadge(v.status))}>
                    {v.status}
                  </span>
                </Link>
              ))}
              {myVisaApps.length === 0 && (
                <p className="px-6 py-10 text-center text-gray-400 text-sm">No assigned applications.</p>
              )}
            </div>
          </SectionCard>

          {/* Recent Trips */}
          <SectionCard title="Recent Trips" href="/admin/trip-planner">
            <div className="divide-y divide-gray-50">
              {myTrips.map((t) => (
                <Link key={t.id} href={`/plan/${t.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">{t.title || t.destination}</p>
                    <p className="text-xs text-gray-400">{t.user?.name ?? 'Unknown client'}</p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusBadge(t.status))}>
                    {t.status}
                  </span>
                </Link>
              ))}
              {myTrips.length === 0 && (
                <p className="px-6 py-10 text-center text-gray-400 text-sm">No open trips.</p>
              )}
            </div>
          </SectionCard>

          {/* Quick links */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: '/admin/visa-applications', label: 'Visa Applications', icon: Globe,    color: 'bg-blue-50 text-blue-700 border-blue-100' },
              { href: '/admin/trip-planner',       label: 'Trip Planner',      icon: Compass,  color: 'bg-teal-50 text-teal-700 border-teal-100' },
              { href: '/admin/bookings',           label: 'Bookings',          icon: BookOpen, color: 'bg-[#0B1F3A]/5 text-[#0B1F3A] border-[#0B1F3A]/10' },
              { href: '/admin/reports',            label: 'My Reports',        icon: FileText, color: 'bg-amber-50 text-amber-700 border-amber-100' },
            ].map(({ href, label, icon: Icon, color }) => (
              <Link key={href} href={href}
                className={cn('flex flex-col items-center gap-2 p-4 rounded-xl border font-medium text-sm transition-all hover:shadow-sm', color)}>
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Super/GM extra: quick-access panels */}
      {isSuperOrGM && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: '/admin/visa-applications', label: 'Visa Apps',    icon: Globe,    color: 'bg-blue-50 text-blue-700 border-blue-100' },
            { href: '/admin/trip-planner',       label: 'Trips',        icon: Compass,  color: 'bg-teal-50 text-teal-700 border-teal-100' },
            { href: '/admin/staff',              label: 'Staff',        icon: Users,    color: 'bg-[#0B1F3A]/5 text-[#0B1F3A] border-[#0B1F3A]/10' },
            { href: '/admin/reports/all',        label: 'All Reports',  icon: FileText, color: 'bg-amber-50 text-amber-700 border-amber-100' },
          ].map(({ href, label, icon: Icon, color }) => (
            <Link key={href} href={href}
              className={cn('flex flex-col items-center gap-2 p-4 rounded-xl border font-medium text-sm transition-all hover:shadow-sm', color)}>
              <Icon className="w-5 h-5" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
