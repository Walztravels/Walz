import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import prisma from '@/lib/db'
import { DollarSign, BookOpen, CheckCircle, Clock, TrendingUp, Users } from 'lucide-react'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-[#0B1F3A]">{value}</div>
      <div className="text-sm font-medium text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function fmt(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount)
}

export default async function DashboardPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const now = new Date()
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let total = 0, pending = 0, confirmed = 0, cancelled = 0
  let weekRev = { _sum: { totalAmount: null as number | null } }
  let monthRev = { _sum: { totalAmount: null as number | null } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recentBookings: any[] = []
  let dbError = false

  try {
    ;[total, pending, confirmed, cancelled, weekRev, monthRev, recentBookings] = await Promise.all([
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'CONFIRMED' } }),
      prisma.booking.count({ where: { status: 'CANCELLED' } }),
      prisma.booking.aggregate({ where: { createdAt: { gte: startOfWeek }, paymentStatus: 'SUCCEEDED' }, _sum: { totalAmount: true } }),
      prisma.booking.aggregate({ where: { createdAt: { gte: startOfMonth }, paymentStatus: 'SUCCEEDED' }, _sum: { totalAmount: true } }),
      prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, bookingReference: true, pnr: true, status: true, paymentStatus: true, totalAmount: true, currency: true, contactEmail: true, createdAt: true, passengers: true } }),
    ])
  } catch {
    dbError = true
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-700',
      CONFIRMED: 'bg-green-100 text-green-700',
      CANCELLED: 'bg-red-100 text-red-700',
      COMPLETED: 'bg-blue-100 text-blue-700',
      FAILED: 'bg-gray-100 text-gray-600',
    }
    return map[status] ?? 'bg-gray-100 text-gray-600'
  }

  return (
    <div>
      {dbError && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm">
          <strong>Database setup required.</strong> Run the schema SQL in your{' '}
          <a href="https://supabase.com/dashboard/project/bxacijnrgqgmyqyfgumg/sql/new" target="_blank" rel="noreferrer" className="underline font-medium">Supabase SQL Editor</a>
          {' '}(file: <code className="bg-amber-100 px-1 rounded">prisma/walz_schema.sql</code>) then refresh.
        </div>
      )}
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Good day — here&apos;s what&apos;s happening with Walz Travels.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Bookings" value={total} icon={BookOpen} color="bg-[#0B1F3A]" />
        <StatCard label="Pending" value={pending} icon={Clock} color="bg-amber-500" />
        <StatCard label="Confirmed" value={confirmed} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard label="Cancelled" value={cancelled} icon={Users} color="bg-red-500" />
        <StatCard
          label="This Week"
          value={fmt(weekRev._sum.totalAmount ?? 0)}
          icon={TrendingUp}
          color="bg-[#C9A84C]"
        />
        <StatCard
          label="This Month"
          value={fmt(monthRev._sum.totalAmount ?? 0)}
          icon={DollarSign}
          color="bg-violet-500"
        />
      </div>

      {/* Recent Bookings */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-[#0B1F3A]">Recent Bookings</h2>
          <a href="/admin/bookings" className="text-sm text-[#C9A84C] font-medium hover:underline">View all →</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reference</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Passengers</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentBookings.map((b) => {
                const pax = Array.isArray(b.passengers) ? b.passengers : []
                return (
                  <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-mono font-bold text-[#0B1F3A] text-xs">{b.bookingReference}</div>
                      {b.pnr && b.pnr !== b.bookingReference && (
                        <div className="text-xs text-gray-400 font-mono">PNR: {b.pnr}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-[180px] truncate">{b.contactEmail}</td>
                    <td className="px-6 py-4 text-gray-600">{pax.length}</td>
                    <td className="px-6 py-4 font-semibold text-[#0B1F3A]">{fmt(b.totalAmount, b.currency)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(b.status)}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-xs">{format(new Date(b.createdAt), 'dd MMM yyyy')}</td>
                  </tr>
                )
              })}
              {recentBookings.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No bookings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
