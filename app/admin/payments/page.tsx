'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, RefreshCw, CheckCircle, XCircle, ExternalLink,
  Loader2, CreditCard, Building2, DollarSign, Clock,
} from 'lucide-react'
import { VISA_CONFIGS } from '@/lib/visa-config'

interface PaymentApp {
  id: string
  referenceNumber: string
  firstName: string | null
  lastName: string | null
  email: string | null
  destinationIso2: string | null
  visaType: string
  status: string
  serviceFeeAmount: string | null
  serviceFeeCurrency: string
  serviceFeePaid: boolean
  govtFeeAmount: string | null
  govtFeePaid: boolean
  stripePaymentIntentId: string | null
  createdAt: string
  user: { name: string | null; email: string | null } | null
}

type Filter = 'all' | 'svc_unpaid' | 'govt_unpaid' | 'fully_paid'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',         label: 'All'                },
  { key: 'svc_unpaid',  label: 'Service Fee Unpaid' },
  { key: 'govt_unpaid', label: 'Govt Fee Unpaid'    },
  { key: 'fully_paid',  label: 'Fully Paid'         },
]

function countryFlag(iso2: string | null) {
  if (!iso2) return '🌍'
  return VISA_CONFIGS[iso2]?.flag ?? '🌍'
}

function countryName(iso2: string | null) {
  if (!iso2) return '—'
  return VISA_CONFIGS[iso2]?.name ?? iso2
}

function fmt(amount: string | null, currency: string) {
  if (!amount) return '—'
  return `${currency} ${Number(amount).toLocaleString()}`
}

export default function AdminPaymentsPage() {
  const [apps, setApps] = useState<PaymentApp[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [toggling, setToggling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/visa-applications')
    const d = await res.json()
    setApps(d.applications ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(app: PaymentApp, field: 'serviceFeePaid' | 'govtFeePaid') {
    setToggling(`${app.id}-${field}`)
    await fetch(`/api/admin/visa-applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !app[field] }),
    })
    setApps(prev => prev.map(a => a.id === app.id ? { ...a, [field]: !a[field] } : a))
    setToggling(null)
  }

  const filtered = apps.filter(a => {
    if (filter === 'svc_unpaid')  return a.serviceFeeAmount && !a.serviceFeePaid
    if (filter === 'govt_unpaid') return a.govtFeeAmount && !a.govtFeePaid
    if (filter === 'fully_paid')  return a.serviceFeePaid && (!a.govtFeeAmount || a.govtFeePaid)
    return true
  }).filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return `${a.firstName} ${a.lastName} ${a.referenceNumber} ${a.email}`.toLowerCase().includes(q)
  })

  // Stats
  const svcPaid    = apps.filter(a => a.serviceFeePaid && a.serviceFeeAmount)
  const svcUnpaid  = apps.filter(a => !a.serviceFeePaid && a.serviceFeeAmount)
  const govtUnpaid = apps.filter(a => a.govtFeeAmount && !a.govtFeePaid)

  const totalCollected = svcPaid.reduce((sum, a) => sum + Number(a.serviceFeeAmount ?? 0), 0)
  const totalPending   = svcUnpaid.reduce((sum, a) => sum + Number(a.serviceFeeAmount ?? 0), 0)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Payments</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track service fees and government fees across all visa applications</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={CreditCard} label="Collected" value={`$${totalCollected.toLocaleString()}`} sub={`${svcPaid.length} payments`} color="green" />
        <StatCard icon={Clock}      label="Pending"   value={`$${totalPending.toLocaleString()}`}   sub={`${svcUnpaid.length} unpaid`}  color="amber" />
        <StatCard icon={Building2}  label="Govt Fee Unpaid" value={String(govtUnpaid.length)}        sub="applications"                  color="blue"  />
        <StatCard icon={DollarSign} label="Total Apps" value={String(apps.length)}                   sub="non-draft"                     color="gray"  />
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f.key ? 'bg-[#0B1F3A] text-white' : 'text-gray-500 hover:text-[#0B1F3A]'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, reference or email…"
            className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">No payments found</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Country</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Service Fee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Govt Fee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stripe</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(app => {
                  const clientName = [app.firstName, app.lastName].filter(Boolean).join(' ') || app.user?.name || '—'
                  const svcKey  = `${app.id}-serviceFeePaid`
                  const govtKey = `${app.id}-govtFeePaid`
                  return (
                    <tr key={app.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[#C9A84C] font-semibold">{app.referenceNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0B1F3A] text-sm">{clientName}</p>
                        <p className="text-xs text-gray-400">{app.email ?? app.user?.email ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{countryFlag(app.destinationIso2)} {countryName(app.destinationIso2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {app.serviceFeeAmount ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggle(app, 'serviceFeePaid')}
                              disabled={toggling === svcKey}
                              title={app.serviceFeePaid ? 'Mark unpaid' : 'Mark paid'}
                              className="flex-shrink-0">
                              {toggling === svcKey
                                ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                : app.serviceFeePaid
                                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                                  : <XCircle className="w-4 h-4 text-red-400" />
                              }
                            </button>
                            <div>
                              <p className={`font-semibold text-xs ${app.serviceFeePaid ? 'text-green-600' : 'text-red-500'}`}>
                                {app.serviceFeePaid ? 'Paid' : 'Unpaid'}
                              </p>
                              <p className="text-xs text-gray-500">{fmt(app.serviceFeeAmount, app.serviceFeeCurrency)}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {app.govtFeeAmount ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggle(app, 'govtFeePaid')}
                              disabled={toggling === govtKey}
                              title={app.govtFeePaid ? 'Mark unpaid' : 'Mark paid'}
                              className="flex-shrink-0">
                              {toggling === govtKey
                                ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                                : app.govtFeePaid
                                  ? <CheckCircle className="w-4 h-4 text-green-500" />
                                  : <XCircle className="w-4 h-4 text-red-400" />
                              }
                            </button>
                            <div>
                              <p className={`font-semibold text-xs ${app.govtFeePaid ? 'text-green-600' : 'text-amber-500'}`}>
                                {app.govtFeePaid ? 'Paid' : 'Pending'}
                              </p>
                              <p className="text-xs text-gray-500">USD {Number(app.govtFeeAmount).toLocaleString()}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {app.stripePaymentIntentId ? (
                          <a
                            href={`https://dashboard.stripe.com/payments/${app.stripePaymentIntentId}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-mono">
                            {app.stripePaymentIntentId.slice(0, 12)}…
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(app.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/visa-applications/${app.id}`}
                          className="text-xs text-gray-400 hover:text-[#0B1F3A] transition-colors">
                          View →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub: string
  color: 'green' | 'amber' | 'blue' | 'gray'
}) {
  const colors = {
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    blue:  'bg-blue-50 text-blue-600',
    gray:  'bg-gray-100 text-gray-500',
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-[#0B1F3A]">{value}</p>
      <p className="text-xs font-semibold text-gray-600 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  )
}
