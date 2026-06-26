'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, RefreshCw, CheckCircle, XCircle, ExternalLink,
  Loader2, CreditCard, Building2, DollarSign, Clock, Link2,
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

interface PaymentLinkRecord {
  id:            string
  txRef:         string
  paymentUrl:    string | null
  accountNumber: string | null
  bankName:      string | null
  amount:        string | null
  currency:      string
  clientName:    string | null
  clientEmail:   string | null
  description:   string | null
  type:          string
  status:        string
  provider:      string | null
  paidAt:        string | null
  payerName:     string | null
  payerBank:     string | null
  createdAt:     string
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
  const [toggling,     setToggling]     = useState<string | null>(null)
  const [links,        setLinks]        = useState<PaymentLinkRecord[]>([])
  const [linksLoading, setLinksLoading] = useState(true)

  // ── Payment link generator ───────────────────────────────────────────────
  const [showPayLink,    setShowPayLink]    = useState(false)
  const [payLinkForm,    setPayLinkForm]    = useState({
    amount: '', currency: 'GBP', description: '', clientName: '', clientEmail: '', provider: 'stripe',
  })
  const [generatedLink,  setGeneratedLink]  = useState<{ url: string; provider: string; amount: string | number; currency: string; description: string } | null>(null)
  const [generating,     setGenerating]     = useState(false)
  const [linkSending,    setLinkSending]    = useState(false)
  const [linkSendOk,     setLinkSendOk]     = useState(false)
  const [linkCopied,     setLinkCopied]     = useState(false)
  const [linkError,      setLinkError]      = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLinksLoading(true)
    const [appsRes, linksRes] = await Promise.all([
      fetch('/api/admin/visa-applications'),
      fetch('/api/admin/payment-links'),
    ])
    const appsData  = await appsRes.json()
    const linksData = await linksRes.json()
    setApps(appsData.applications ?? [])
    setLinks(linksData.links ?? [])
    setLoading(false)
    setLinksLoading(false)
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
        <div className="flex items-center gap-3">
          <button onClick={() => { setShowPayLink(true); setGeneratedLink(null); setLinkSendOk(false); setLinkError('') }}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition">
            🔗 Generate Payment Link
          </button>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
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

      {/* ── Payment Links History ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#C9A84C]" />
            <div>
              <h2 className="font-bold text-[#0B1F3A] text-sm">Payment Links</h2>
              <p className="text-[11px] text-gray-400">Stripe · Flutterwave · Virtual Accounts</p>
            </div>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-semibold">
            {links.length} total
          </span>
        </div>

        {linksLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-[#C9A84C]" />
          </div>
        ) : links.length === 0 ? (
          <p className="text-center py-12 text-gray-400 text-sm">No payment links generated yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {links.map(link => (
                  <tr key={link.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[11px] font-bold text-[#C9A84C]">
                        {link.txRef.length > 22 ? link.txRef.slice(0, 22) + '…' : link.txRef}
                      </p>
                      {link.accountNumber && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {link.accountNumber} · {link.bankName}
                        </p>
                      )}
                      {link.paymentUrl && (
                        <a href={link.paymentUrl} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 mt-0.5">
                          <ExternalLink className="w-2.5 h-2.5" /> Open link
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#0B1F3A] text-sm">{link.clientName || '—'}</p>
                      <p className="text-[11px] text-gray-400">{link.clientEmail || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0B1F3A] whitespace-nowrap">
                      {link.currency} {Number(link.amount ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <PLTypeBadge type={link.type} />
                    </td>
                    <td className="px-4 py-3">
                      <PLStatusBadge status={link.status} />
                      {link.payerName && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {link.payerName}
                          {link.payerBank ? ` · ${link.payerBank}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                      <p>{new Date(link.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                      {link.paidAt && (
                        <p className="text-green-600 mt-0.5">
                          Paid {new Date(link.paidAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Payment Link Modal ── */}
      {showPayLink && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B1F3A] rounded-2xl w-full max-w-md p-7 border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-white font-bold text-lg">Generate Payment Link</h3>
                <p className="text-white/40 text-sm mt-0.5">Create a secure link to send to your client</p>
              </div>
              <button onClick={() => { setShowPayLink(false); setGeneratedLink(null); setLinkSendOk(false); setLinkError('') }}
                className="text-white/40 hover:text-white text-2xl leading-none">×</button>
            </div>

            {!generatedLink ? (
              <>
                {/* Provider toggle */}
                <div className="flex gap-1 mb-4 bg-white/5 p-1 rounded-xl">
                  {(['stripe', 'flutterwave'] as const).map(p => (
                    <button key={p} onClick={() => setPayLinkForm(prev => ({
                      ...prev, provider: p,
                      currency: p === 'stripe' ? 'GBP' : 'NGN',
                    }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                        payLinkForm.provider === p ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'
                      }`}>
                      {p === 'stripe' ? '💳 Stripe' : '🌍 Flutterwave'}
                    </button>
                  ))}
                </div>
                <p className="text-white/30 text-xs mb-4">
                  {payLinkForm.provider === 'stripe'
                    ? '✓ Cards worldwide · GBP / USD / EUR · Best for UK & EU clients'
                    : '✓ Cards + Bank Transfer + USSD · NGN / GHS · Best for Africa clients'}
                </p>

                {/* Amount + Currency */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Amount</label>
                    <input type="number" placeholder="0.00" value={payLinkForm.amount}
                      onChange={e => setPayLinkForm(p => ({ ...p, amount: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Currency</label>
                    <select value={payLinkForm.currency}
                      onChange={e => setPayLinkForm(p => ({ ...p, currency: e.target.value }))}
                      className="w-full bg-[#0d1e35] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-amber-500/50">
                      {payLinkForm.provider === 'stripe'
                        ? <><option value="GBP">GBP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="CAD">CAD</option></>
                        : <><option value="NGN">NGN</option><option value="GHS">GHS</option><option value="USD">USD</option><option value="KES">KES</option></>
                      }
                    </select>
                  </div>
                </div>

                {/* Quick amounts */}
                <div className="flex gap-2 flex-wrap mb-4">
                  {(payLinkForm.currency === 'NGN' ? [5000, 10000, 25000, 50000, 100000] : [50, 100, 150, 231, 500]).map(amt => (
                    <button key={amt} onClick={() => setPayLinkForm(p => ({ ...p, amount: String(amt) }))}
                      className="bg-white/5 hover:bg-amber-500/20 hover:text-amber-400 text-white/50 text-xs px-3 py-1.5 rounded-lg transition border border-white/5">
                      {amt.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Description */}
                <div className="mb-3">
                  <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Description</label>
                  <input type="text" placeholder="e.g. UK Visitor Visa Service Fee" value={payLinkForm.description}
                    onChange={e => setPayLinkForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50" />
                  <div className="flex gap-2 flex-wrap mt-2">
                    {['Visa Service Fee', 'Booking Deposit', 'Balance Payment', 'Government Fee', 'Flight Booking'].map(d => (
                      <button key={d} onClick={() => setPayLinkForm(p => ({ ...p, description: d }))}
                        className="bg-white/5 hover:bg-white/10 text-white/40 text-xs px-2.5 py-1 rounded-lg transition">
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Client details */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Client Name</label>
                    <input type="text" placeholder="Optional" value={payLinkForm.clientName}
                      onChange={e => setPayLinkForm(p => ({ ...p, clientName: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 text-sm" />
                  </div>
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Client Email <span className="font-normal text-white/30">(to send)</span></label>
                    <input type="email" placeholder="email@example.com" value={payLinkForm.clientEmail}
                      onChange={e => setPayLinkForm(p => ({ ...p, clientEmail: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 text-sm" />
                  </div>
                </div>

                {linkError && <p className="text-red-400 text-xs mb-3">{linkError}</p>}

                <button
                  onClick={async () => {
                    if (!payLinkForm.amount || !payLinkForm.description) return
                    setGenerating(true)
                    setLinkError('')
                    try {
                      const res  = await fetch(`/api/admin/payment-links/${payLinkForm.provider}`, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify(payLinkForm),
                      })
                      const data = await res.json()
                      if (data.success) setGeneratedLink(data)
                      else setLinkError(data.error || 'Failed to generate link')
                    } catch (e: unknown) {
                      setLinkError(e instanceof Error ? e.message : 'Request failed')
                    }
                    setGenerating(false)
                  }}
                  disabled={generating || !payLinkForm.amount || !payLinkForm.description}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3.5 rounded-xl transition disabled:opacity-40 text-sm">
                  {generating ? '⏳ Generating…' : '🔗 Generate Payment Link'}
                </button>
              </>
            ) : (
              /* ── Generated link result ── */
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 mb-5 text-center">
                  <p className="text-emerald-400 text-2xl mb-1">✓</p>
                  <p className="text-white font-bold text-lg">Payment Link Ready</p>
                  <p className="text-white/50 text-sm mt-1">
                    {generatedLink.currency} {Number(generatedLink.amount).toLocaleString()} · {generatedLink.description}
                  </p>
                </div>

                <div className="bg-white/5 rounded-xl p-4 mb-4">
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Payment URL</p>
                  <p className="text-amber-400 text-sm break-all mb-3 leading-relaxed">{generatedLink.url}</p>
                  <button onClick={() => { navigator.clipboard.writeText(generatedLink.url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                    className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold py-2.5 rounded-xl transition">
                    {linkCopied ? '✓ Copied!' : '📋 Copy Link'}
                  </button>
                </div>

                {payLinkForm.clientEmail && (
                  <div className="mb-4">
                    <button
                      onClick={async () => {
                        setLinkSending(true)
                        try {
                          const res  = await fetch('/api/admin/payment-links/send', {
                            method:  'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body:    JSON.stringify({ ...payLinkForm, paymentUrl: generatedLink.url, provider: generatedLink.provider }),
                          })
                          const data = await res.json()
                          if (data.success) setLinkSendOk(true)
                          else setLinkError(data.error ?? 'Failed to send')
                        } catch (e: unknown) {
                          setLinkError(e instanceof Error ? e.message : 'Request failed')
                        }
                        setLinkSending(false)
                      }}
                      disabled={linkSending || linkSendOk}
                      className={`w-full font-bold py-3.5 rounded-xl transition text-sm ${
                        linkSendOk ? 'bg-emerald-500 text-black' : 'bg-amber-500 hover:bg-amber-400 text-black'
                      }`}>
                      {linkSending ? '⏳ Sending…' : linkSendOk ? `✓ Sent to ${payLinkForm.clientEmail}` : `📧 Email to ${payLinkForm.clientEmail}`}
                    </button>
                  </div>
                )}

                {linkError && <p className="text-red-400 text-xs mb-3">{linkError}</p>}

                <div className="flex gap-3">
                  <a href={generatedLink.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white text-sm font-bold py-3 rounded-xl transition text-center">
                    👁 Preview
                  </a>
                  <button onClick={() => { setGeneratedLink(null); setLinkSendOk(false); setLinkCopied(false); setLinkError('') }}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white text-sm py-3 rounded-xl transition">
                    + New Link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PLTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    stripe:          { label: 'Stripe',       cls: 'bg-indigo-50 text-indigo-700' },
    flutterwave:     { label: 'Flutterwave',  cls: 'bg-amber-50 text-amber-700'   },
    virtual_account: { label: 'Bank Transfer', cls: 'bg-green-50 text-green-700'  },
  }
  const { label, cls } = map[type] ?? { label: type, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

function PLStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '⏳ Pending', cls: 'bg-amber-50 text-amber-700'  },
    paid:    { label: '✓ Paid',     cls: 'bg-green-50 text-green-700'  },
    expired: { label: 'Expired',    cls: 'bg-gray-100 text-gray-500'   },
    failed:  { label: '✗ Failed',   cls: 'bg-red-50 text-red-600'      },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
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
