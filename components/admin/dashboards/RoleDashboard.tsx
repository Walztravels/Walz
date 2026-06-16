'use client'

import type { AdminRole } from '@/lib/admin/permissions'

interface Props {
  staff: { role: string; name: string; branch: string }
  stats: Record<string, unknown>
}

export default function RoleDashboard({ staff, stats }: Props) {
  const role = staff.role as AdminRole

  switch (role) {
    case 'visa_officer':     return <VisaOfficerDashboard stats={stats} />
    case 'flight_staff':     return <FlightStaffDashboard stats={stats} />
    case 'sales_agent':      return <SalesDashboard stats={stats} staff={staff} />
    case 'accountant':       return <AccountantDashboard stats={stats} />
    case 'customer_support': return <SupportDashboard stats={stats} />
    case 'tours_staff':      return <ToursDashboard stats={stats} />
    case 'hotel_staff':      return <HotelDashboard stats={stats} />
    default:                 return <ManagerDashboard stats={stats} />
  }
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className={`bg-white rounded-2xl p-5 border-l-4 shadow-sm ${color}`}>
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-[#0B1F3A] mt-1">{value ?? 0}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function VisaOfficerDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Visa Processing Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Applications"  value={stats.visaPending  as number ?? 0} color="border-amber-400"  />
        <StatCard label="Embassy Appointments"  value={stats.appointments as number ?? 0} color="border-blue-400"   />
        <StatCard label="Missing Documents"     value={stats.missingDocs  as number ?? 0} color="border-red-400"    />
        <StatCard label="Approved This Month"   value={stats.visaApproved as number ?? 0} color="border-green-400"  />
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <h3 className="font-bold text-[#0B1F3A] mb-3">Today&apos;s Interviews</h3>
        <p className="text-gray-400 text-sm">No interviews scheduled for today</p>
      </div>
    </div>
  )
}

function FlightStaffDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Flight Operations Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending Issuance"  value={stats.pendingTickets as number ?? 0} color="border-amber-400"  />
        <StatCard label="Issued Today"      value={stats.issuedToday   as number ?? 0} color="border-green-400"  />
        <StatCard label="Refund Requests"   value={stats.refunds       as number ?? 0} color="border-red-400"    />
        <StatCard label="Schedule Changes"  value={stats.changes       as number ?? 0} color="border-blue-400"   />
      </div>
    </div>
  )
}

function SalesDashboard({ stats, staff }: { stats: Record<string, unknown>; staff: { name: string } }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">My Sales Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Leads"            value={stats.myLeads     as number ?? 0}    color="border-blue-400"      />
        <StatCard label="Conversions"         value={stats.conversions as number ?? 0}    color="border-green-400" sub="This month" />
        <StatCard label="Revenue Generated"   value={`£${stats.revenue ?? 0}`}            color="border-[#C9A84C]"     />
        <StatCard label="Follow-ups Due"      value={stats.followUps   as number ?? 0}    color="border-red-400"       />
      </div>
    </div>
  )
}

function AccountantDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Finance Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue"     value={`£${stats.revenue ?? 0}`}              color="border-green-400" />
        <StatCard label="Pending Refunds"   value={stats.pendingRefunds as number ?? 0}   color="border-red-400"   />
        <StatCard label="Commissions Due"   value={`£${stats.commissions ?? 0}`}          color="border-amber-400" />
        <StatCard label="Approval Requests" value={stats.approvals as number ?? 0}        color="border-blue-400"  />
      </div>
    </div>
  )
}

function SupportDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Customer Support Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open Tickets"     value={stats.openTickets as number ?? 0} color="border-red-400"   />
        <StatCard label="Resolved Today"   value={stats.resolved    as number ?? 0} color="border-green-400" />
        <StatCard label="Pending Bookings" value={stats.pending     as number ?? 0} color="border-amber-400" />
        <StatCard label="Active Clients"   value={stats.clients     as number ?? 0} color="border-blue-400"  />
      </div>
    </div>
  )
}

function ToursDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Tours &amp; Activities Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Tours"       value={stats.activeTours as number ?? 0} color="border-green-400"  />
        <StatCard label="Upcoming Bookings"  value={stats.upcoming    as number ?? 0} color="border-blue-400"   />
        <StatCard label="Vouchers Issued"    value={stats.vouchers    as number ?? 0} color="border-[#C9A84C]"  />
        <StatCard label="Pending Requests"   value={stats.pending     as number ?? 0} color="border-amber-400"  />
      </div>
    </div>
  )
}

function HotelDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Hotel Reservations Dashboard</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Reservations" value={stats.active    as number ?? 0} color="border-green-400"  />
        <StatCard label="Check-ins Today"     value={stats.checkIns  as number ?? 0} color="border-blue-400"   />
        <StatCard label="Check-outs Today"    value={stats.checkOuts as number ?? 0} color="border-amber-400"  />
        <StatCard label="Pending Requests"    value={stats.pending   as number ?? 0} color="border-red-400"    />
      </div>
    </div>
  )
}

function ManagerDashboard({ stats }: { stats: Record<string, unknown> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#0B1F3A]">Operations Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Bookings"     value={stats.bookings as number ?? 0}  color="border-blue-400"   />
        <StatCard label="Active Clients"     value={stats.clients  as number ?? 0}  color="border-green-400"  />
        <StatCard label="Visa Applications"  value={stats.visa     as number ?? 0}  color="border-amber-400"  />
        <StatCard label="Revenue This Month" value={`£${stats.revenue ?? 0}`}       color="border-[#C9A84C]"  />
      </div>
    </div>
  )
}
