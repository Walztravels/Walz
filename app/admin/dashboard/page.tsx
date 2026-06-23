import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import {
  DollarSign, BookOpen, CheckCircle, Clock, TrendingUp, Users,
  Globe, Compass, FileText, AlertCircle, UserCheck,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, href }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color?: string; href?: string
}) {
  const inner = (
    <div className={`bg-[#112240] rounded-2xl p-4 ring-1 ring-white/5 flex items-start gap-3 ${href ? 'hover:ring-amber-400/30 transition-all' : ''}`}>
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
        <Icon size={18} className="text-amber-400" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
        <p className="text-white text-2xl font-semibold leading-none">{value}</p>
        {sub && <p className="text-xs mt-1 text-emerald-400">{sub}</p>}
      </div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function SectionCard({ title, href, hrefLabel, children }: {
  title: string; href?: string; hrefLabel?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="font-bold text-white">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-amber-400 font-medium hover:text-amber-300 transition-colors">
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
  let clientAccountCount = 0

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

    // Staff count + client accounts — super_admin / general_manager only
    if (isSuperOrGM) {
      ;[staffCount, clientAccountCount] = await Promise.all([
        prisma.staff.count({ where: { isActive: true } }),
        prisma.clientAccount.count(),
      ])
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

  const hour = new Date().getHours()
  const mobileTimeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = session.name?.split(' ')[0] ?? 'there'

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

      {/* Mobile greeting */}
      <div className="md:hidden mb-6 px-1">
        <p className="text-[11px] text-amber-400 font-semibold uppercase tracking-widest">{mobileTimeGreeting}</p>
        <h1 className="text-2xl font-bold text-white mt-0.5">{firstName}</h1>
        <p className="text-white/40 text-sm mt-1">{greetings[staffRole] ?? 'Welcome back.'}</p>
      </div>

      {/* Desktop header */}
      <div className="hidden md:block mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">{greetings[staffRole] ?? 'Welcome back.'}</p>
      </div>

      {/* ── Stats Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Bookings"  value={totalBookings}    icon={BookOpen}   />
        <StatCard label="Pending"         value={pendingBookings}  icon={Clock}      />
        <StatCard label="Confirmed"       value={confirmedBookings} icon={CheckCircle} />

        {isSeniorPlus && (
          <>
            <StatCard label="This Week"    value={fmt(weekRev)}  icon={TrendingUp}  />
            <StatCard label="This Month"   value={fmt(monthRev)} icon={DollarSign}  />
            <StatCard label="Visa Apps"    value={visaTotal}     icon={Globe}       />
            <StatCard label="Visa Pending" value={visaPending}   icon={AlertCircle} />
            <StatCard label="Active Trips" value={tripsActive}   icon={Compass}     />
          </>
        )}

        {isSuperOrGM && (
          <>
            <StatCard label="Total Trips"      value={tripsTotal}          icon={Compass}    />
            <StatCard label="Active Staff"     value={staffCount}          icon={Users}      />
            <StatCard label="Client Accounts"  value={clientAccountCount}  icon={UserCheck}  href="/admin/client-accounts" />
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
                <tr className="border-b border-white/5">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Reference</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Client</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono font-bold text-amber-400 text-xs">{b.bookingReference}</div>
                      {b.pnr && b.pnr !== b.bookingReference && (
                        <div className="text-xs text-white/30 font-mono">PNR: {b.pnr}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-white/60 max-w-[180px] truncate">{b.contactEmail}</td>
                    <td className="px-6 py-4 font-semibold text-white">{fmt(b.totalAmount, b.currency)}</td>
                    <td className="px-6 py-4">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusBadge(b.status))}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/30 text-xs">{format(new Date(b.createdAt), 'dd MMM yyyy')}</td>
                  </tr>
                ))}
                {recentBookings.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-white/30">No bookings yet.</td></tr>
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
            <div className="divide-y divide-white/5">
              {myVisaApps.map((v) => (
                <Link key={v.id} href={`/admin/visa-applications/${v.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-white/3 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-white">{[v.firstName, v.lastName].filter(Boolean).join(' ') || 'Unknown'}</p>
                    <p className="text-xs text-white/40">{v.destinationIso2} · {v.visaType}</p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusBadge(v.status))}>
                    {v.status}
                  </span>
                </Link>
              ))}
              {myVisaApps.length === 0 && (
                <p className="px-6 py-10 text-center text-white/30 text-sm">No assigned applications.</p>
              )}
            </div>
          </SectionCard>

          {/* Recent Trips */}
          <SectionCard title="Recent Trips" href="/admin/trip-planner">
            <div className="divide-y divide-white/5">
              {myTrips.map((t) => (
                <Link key={t.id} href={`/plan/${t.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-white/3 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-white">{t.title || t.destination}</p>
                    <p className="text-xs text-white/40">{t.user?.name ?? 'Unknown client'}</p>
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', statusBadge(t.status))}>
                    {t.status}
                  </span>
                </Link>
              ))}
              {myTrips.length === 0 && (
                <p className="px-6 py-10 text-center text-white/30 text-sm">No open trips.</p>
              )}
            </div>
          </SectionCard>

          {/* Quick links */}
          <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: '/admin/visa-applications', label: 'Visa Applications', icon: Globe },
              { href: '/admin/trip-planner',       label: 'Trip Planner',      icon: Compass },
              { href: '/admin/bookings',           label: 'Bookings',          icon: BookOpen },
              { href: '/admin/reports',            label: 'My Reports',        icon: FileText },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#112240] ring-1 ring-white/5 text-white/60 font-medium text-sm transition-all hover:bg-[#152a4e] hover:text-white active:scale-95">
                <Icon className="w-5 h-5 text-amber-400" strokeWidth={1.5} />
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
            { href: '/admin/visa-applications', label: 'Visa Apps',   icon: Globe },
            { href: '/admin/trip-planner',       label: 'Trips',       icon: Compass },
            { href: '/admin/staff',              label: 'Staff',       icon: Users },
            { href: '/admin/reports/all',        label: 'All Reports', icon: FileText },
          ].map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#112240] ring-1 ring-white/5 text-white/60 font-medium text-sm transition-all hover:bg-[#152a4e] hover:text-white active:scale-95">
              <Icon className="w-5 h-5 text-amber-400" strokeWidth={1.5} />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
