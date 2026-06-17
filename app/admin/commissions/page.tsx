'use client'

import { useEffect, useState, useCallback } from 'react'
import { Award, RefreshCw, Loader2, TrendingUp } from 'lucide-react'

interface Commission {
  id: string
  name: string
  email: string
  role: string
  bookings: number
  revenue: number
  rate: number
  commission: number
  status: string
}

const ROLE_LABELS: Record<string, string> = {
  sales_agent:       'Sales Agent',
  sales_rep:         'Sales Rep',
  coordinator:       'Coordinator',
  operations_manager:'Operations Manager',
  general_manager:   'General Manager',
  senior_manager:    'Senior Manager',
  visa_officer:      'Visa Officer',
  flight_staff:      'Flight Staff',
  tours_staff:       'Tours Staff',
  hotel_staff:       'Hotel Staff',
  accountant:        'Accountant',
  customer_support:  'Customer Support',
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading, setLoading]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/commissions')
    const d   = await res.json()
    setCommissions(d.commissions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const totalCommission = commissions.reduce((s, c) => s + c.commission, 0)
  const totalRevenue    = commissions.reduce((s, c) => s + c.revenue, 0)
  const activeStaff     = commissions.filter(c => c.bookings > 0).length

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Commissions</h1>
          <p className="text-sm text-gray-400 mt-0.5">Staff commission tracking — this month</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center mb-3">
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B1F3A]">£{totalCommission.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Commissions Due</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center mb-3">
            <TrendingUp className="w-4 h-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B1F3A]">£{totalRevenue.toFixed(0)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Revenue Generated (Month)</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <Award className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B1F3A]">{activeStaff}</p>
          <p className="text-xs text-gray-500 mt-0.5">Active Staff (Bookings This Month)</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : commissions.length === 0 ? (
        <div className="text-center py-32 text-gray-400 text-sm">No staff data available</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Staff Member', 'Role', 'Bookings', 'Revenue', 'Rate', 'Commission', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {commissions.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0B1F3A]">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {ROLE_LABELS[c.role] ?? c.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#0B1F3A]">{c.bookings}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#0B1F3A]">£{c.revenue.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500">{(c.rate * 100).toFixed(0)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-[#C9A84C]">£{c.commission.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${
                        c.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {c.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
