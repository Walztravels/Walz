'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, RefreshCw, CheckCircle, XCircle, ExternalLink,
  Loader2, CreditCard, Building2, DollarSign, Clock, Link2,
} from 'lucide-react'
import { VISA_CONFIGS } from '@/lib/visa-config'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

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
  const { can } = useStaffPermissions()
  const [apps, setApps] = useState<PaymentApp[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [toggling,     setToggling]     = useState<string | null>(null)
  const [links,        setLinks]        = useState<PaymentLinkRecord[]>([])
  const [linksLoading, setLinksLoading] = useState(true)
  const [verifying,    setVerifying]    = useState<string | null>(null)

  const handleVerify = async (linkId: string) => {
    setVerifying(linkId)
    try {
      const res  = await fetch(`/api/admin/payment-links/${linkId}/verify`, { method: 'POST' })
      const data = await res.json()
      if (data.paid) {
        setLinks(prev => prev.map(l => l.id === linkId ? { ...l, status: 'paid', paidAt: new Date().toISOString(), payerName: data.payer ?? l.payerName } : l))
      } else {
        alert(data.found ? `Not paid yet. FLW status: ${data.flwStatus}` : 'Transaction not found on Flutterwave')
      }
    } catch {
      alert('Verification request failed')
    }
    setVerifying(null)
  }

  const handleMarkPaid = async (linkId: string, txRef: string) => {
    if (!confirm(`Manually mark ${txRef} as paid?\n\nOnly do this after confirming the payment in Flutterwave.`)) return
    try {
      const res = await fetch(`/api/admin/payment-links/${linkId}/mark-paid`, { method: 'POST' })
      if (res.ok) setLinks(prev => prev.map(l => l.id === linkId ? { ...l, status: 'paid', paidAt: new Date().toISOString() } : l))
    } catch {
      alert('Request failed')
    }
  }

  // ── Payment link generator ───────────────────────────────────────────────
  const [showPayLink,    setShowPayLink]    = useState(false)
  const [payLinkForm,    setPayLinkForm]    = useState({
    amount: '', currency: 'GBP', description: '', clientName: '', clientEmail: '', clientPhone: '',
    provider: 'stripe', isPermanent: true, paymentDeadline: '1', bvn: '', cardType: 'eu',
    pagaMethod: 'checkout', sourceAccountNumber: '', bankCode: '',
  })
  const [generatedLink,  setGeneratedLink]  = useState<{
    url?: string; accountNumber?: string; bankName?: string; expiryDate?: string | null;
    isPermanent?: boolean; expiresAt?: string | null; deadlineHours?: number | null;
    deadlineFormatted?: string | null; tx_ref?: string; provider: string; type?: string;
    amount: string | number; amountToPay?: number; requestedAmount?: number; fee?: number;
    baseAmount?: number; feeAmount?: number; totalCharge?: number; feeLabel?: string;
    currency: string; description: string;
    pagaMethod?: string; accountReference?: string; mandateReferenceNumber?: string;
  } | null>(null)
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
          {can('payments_create') && (
            <button onClick={() => { setShowPayLink(true); setGeneratedLink(null); setLinkSendOk(false); setLinkError('') }}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition">
              🔗 Generate Payment Link
            </button>
          )}
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
                      {link.status === 'pending' && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            onClick={() => handleVerify(link.id)}
                            disabled={verifying === link.id}
                            className="text-[11px] border border-amber-400/40 text-amber-600 hover:bg-amber-50 px-2 py-0.5 rounded-md transition font-medium">
                            {verifying === link.id ? '⏳' : '🔄 Verify'}
                          </button>
                          <button
                            onClick={() => handleMarkPaid(link.id, link.txRef)}
                            className="text-[11px] border border-green-400/40 text-green-700 hover:bg-green-50 px-2 py-0.5 rounded-md transition font-medium">
                            ✓ Paid
                          </button>
                        </div>
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
                  {([
                    { id: 'stripe',          label: '💳 Stripe'        },
                    { id: 'flutterwave',     label: '🌍 Flutterwave'   },
                    { id: 'virtual_account', label: '🏦 Bank Transfer' },
                    { id: 'paga',            label: '🇳🇬 Paga'         },
                  ] as { id: 'stripe' | 'flutterwave' | 'virtual_account' | 'paga'; label: string }[]).map(({ id: p, label }) => (
                    <button key={p} onClick={() => setPayLinkForm(prev => ({
                      ...prev, provider: p,
                      currency: p === 'stripe' ? 'GBP' : 'NGN',
                      cardType: 'eu',
                      pagaMethod: 'checkout',
                    }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
                        payLinkForm.provider === p ? 'bg-amber-500 text-black' : 'text-white/50 hover:text-white'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-white/30 text-xs mb-4">
                  {payLinkForm.provider === 'stripe'
                    ? '✓ Cards worldwide · GBP / USD / EUR · Best for UK & EU clients'
                    : payLinkForm.provider === 'virtual_account'
                    ? '✓ NGN only · Client sends bank transfer to a dedicated account · Expires in 1 hour'
                    : payLinkForm.provider === 'paga'
                    ? '✓ NGN · Checkout redirect, dedicated bank accounts, or direct debit · Lower fees than Flutterwave'
                    : '✓ Cards + Bank Transfer + USSD · NGN / GHS · Best for Africa clients'}
                </p>

                {/* ── Paga method sub-tabs ── */}
                {payLinkForm.provider === 'paga' && (
                  <div className="mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { id: 'checkout',    label: 'Checkout',       sub: '1.4% · max ₦2k'  },
                        { id: 'dynamic',     label: 'Dynamic Account',sub: '0.75% · max ₦1k' },
                        { id: 'persistent',  label: 'Persistent Acct',sub: '0.75% · max ₦500' },
                        { id: 'direct_debit',label: 'Direct Debit',  sub: '0.1% + ₦50'       },
                      ] as { id: string; label: string; sub: string }[]).map(({ id, label, sub }) => (
                        <button key={id} type="button"
                          onClick={() => setPayLinkForm(p => ({ ...p, pagaMethod: id }))}
                          className={`py-2.5 px-3 rounded-xl text-xs text-left border transition ${
                            payLinkForm.pagaMethod === id
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                              : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                          }`}>
                          <p className="font-bold">{label}</p>
                          <p className="opacity-60 font-normal mt-0.5">{sub}</p>
                        </button>
                      ))}
                    </div>
                    {/* Method descriptions */}
                    <div className="text-white/30 text-xs leading-relaxed">
                      {payLinkForm.pagaMethod === 'checkout' && '→ Client is redirected to Paga\'s hosted payment page to pay by card or bank transfer.'}
                      {payLinkForm.pagaMethod === 'dynamic'  && '→ One-time bank account created for this transaction. Cheapest option below ₦133k.'}
                      {payLinkForm.pagaMethod === 'persistent' && '→ Reusable bank account permanently linked to this client. Fixed ₦500 fee — cheapest for repeat or large payments.'}
                      {payLinkForm.pagaMethod === 'direct_debit' && '→ Tokenize client\'s account once; charge it any time after. Cheapest for amounts above ₦450k.'}
                    </div>
                    {/* Cost comparison — live when amount is set */}
                    {payLinkForm.amount && Number(payLinkForm.amount) > 0 && (() => {
                      const base = Number(payLinkForm.amount)
                      const fees = {
                        checkout:     Math.min(Math.ceil(base * 0.014), 2000),
                        dynamic:      Math.min(Math.ceil(base * 0.0075), 1000),
                        persistent:   Math.min(Math.ceil(base * 0.0075), 500),
                        direct_debit: Math.ceil(base * 0.001) + 50,
                      } as Record<string, number>
                      const best = (Object.keys(fees) as string[]).reduce((a, b) => fees[a] <= fees[b] ? a : b)
                      return (
                        <div className="bg-white/5 rounded-xl p-3 space-y-1.5">
                          <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold mb-2">Fee comparison for ₦{Number(base).toLocaleString()}</p>
                          {Object.entries(fees).map(([method, fee]) => (
                            <div key={method} className={`flex justify-between text-xs ${method === payLinkForm.pagaMethod ? 'text-amber-400 font-bold' : 'text-white/40'}`}>
                              <span className="capitalize">{method === 'direct_debit' ? 'Direct Debit' : method.charAt(0).toUpperCase() + method.slice(1)}</span>
                              <span>₦{fee.toLocaleString()} {method === best ? '✓ cheapest' : ''}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* VA — recommendation tip */}
                {payLinkForm.provider === 'virtual_account' && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
                    <p className="text-blue-400 text-xs font-semibold mb-1">💡 Recommendation</p>
                    <p className="text-blue-300/70 text-xs leading-relaxed">
                      Use <strong>Permanent</strong> for client payments. Temporary accounts reject payments
                      that don&apos;t match the exact amount — even by ₦1.
                    </p>
                  </div>
                )}

                {/* VA — Permanent vs Temporary toggle */}
                {payLinkForm.provider === 'virtual_account' && (
                  <div className="mb-4">
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Account Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setPayLinkForm(p => ({ ...p, isPermanent: false, paymentDeadline: '1' }))}
                        className={`py-3 px-4 rounded-xl text-sm font-bold transition border text-left ${
                          !payLinkForm.isPermanent
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
                        <p className="font-bold mb-0.5">⏱ Temporary</p>
                        <p className="text-xs opacity-70 font-normal">Expires after set time</p>
                      </button>
                      <button onClick={() => setPayLinkForm(p => ({ ...p, isPermanent: true, paymentDeadline: '' }))}
                        className={`py-3 px-4 rounded-xl text-sm font-bold transition border text-left ${
                          payLinkForm.isPermanent
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}>
                        <p className="font-bold mb-0.5">♾ Permanent</p>
                        <p className="text-xs opacity-70 font-normal">Never expires</p>
                      </button>
                    </div>

                    {/* Deadline picker — temporary only */}
                    {!payLinkForm.isPermanent && (
                      <div className="mt-3">
                        <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Payment Deadline</label>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          {['1', '2', '6', '24'].map(h => (
                            <button key={h}
                              onClick={() => setPayLinkForm(p => ({ ...p, paymentDeadline: h }))}
                              className={`py-2 rounded-xl text-xs font-bold transition ${
                                payLinkForm.paymentDeadline === h
                                  ? 'bg-amber-500 text-black'
                                  : 'bg-white/5 text-white/50 hover:text-white border border-white/10'}`}>
                              {h}hr
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max="168" placeholder="Custom hours"
                            value={!['1','2','6','24'].includes(payLinkForm.paymentDeadline) ? payLinkForm.paymentDeadline : ''}
                            onChange={e => setPayLinkForm(p => ({ ...p, paymentDeadline: e.target.value }))}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50 placeholder:text-white/20" />
                          <span className="text-white/40 text-sm">hours</span>
                        </div>
                        {payLinkForm.paymentDeadline && (
                          <p className="text-amber-400/70 text-xs mt-1.5">
                            Deadline: {new Date(Date.now() + Number(payLinkForm.paymentDeadline) * 3600000)
                              .toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Warning for temporary VAs */}
                    {!payLinkForm.isPermanent && (
                      <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        <p className="text-red-400 text-xs font-bold mb-1">⚠️ Strict Amount Matching</p>
                        <p className="text-red-300/70 text-xs leading-relaxed">
                          Client must transfer the <strong>exact amount</strong>. Any difference — even ₦1 — will be
                          automatically reversed by Flutterwave.
                        </p>
                      </div>
                    )}

                    {/* BVN — permanent NGN only */}
                    {payLinkForm.isPermanent && payLinkForm.currency === 'NGN' && (
                      <div className="mt-3">
                        <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">
                          Client BVN <span className="text-white/30 normal-case">(required for permanent accounts)</span>
                        </label>
                        <input type="text" placeholder="11-digit BVN" maxLength={11} value={payLinkForm.bvn}
                          onChange={e => setPayLinkForm(p => ({ ...p, bvn: e.target.value }))}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/50 placeholder:text-white/20" />
                        <p className="text-white/30 text-xs mt-1">BVN is required by CBN regulations for permanent virtual accounts</p>
                      </div>
                    )}
                  </div>
                )}

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
                      disabled={payLinkForm.provider === 'virtual_account'}
                      className="w-full bg-[#0d1e35] border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-50">
                      {payLinkForm.provider === 'stripe'
                        ? <><option value="GBP">GBP</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="CAD">CAD</option></>
                        : <><option value="NGN">NGN</option>{payLinkForm.provider !== 'virtual_account' && <><option value="GHS">GHS</option><option value="USD">USD</option><option value="KES">KES</option></>}</>
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

                {/* Flutterwave NGN limit warning */}
                {payLinkForm.provider === 'flutterwave' && payLinkForm.currency === 'NGN' && Number(payLinkForm.amount) > 2000000 && (
                  <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300 space-y-1">
                    <p className="font-bold text-amber-400">⚠️ Flutterwave NGN limit: ~₦2.4M per payment link</p>
                    {Number(payLinkForm.amount) <= 7000000
                      ? <p>Switch to <strong>Bank Transfer (Virtual Account)</strong> — higher limit, client sends directly to a dedicated account.</p>
                      : <>
                          <p>This amount exceeds the ₦7M account limit. Options:</p>
                          <p>• Split into {Math.ceil(Number(payLinkForm.amount) / 2000000)} separate links of ₦{Math.floor(Number(payLinkForm.amount) / Math.ceil(Number(payLinkForm.amount) / 2000000)).toLocaleString()} each</p>
                          <p>• Request direct bank transfer from client (no platform limit)</p>
                        </>
                    }
                  </div>
                )}

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

                {/* Fee section — auto-applied, no manual override */}
                {payLinkForm.provider !== 'virtual_account' && payLinkForm.provider !== 'paga' && (
                  <div className="mb-4 space-y-3">
                    {/* EU / non-EU toggle — Stripe only */}
                    {payLinkForm.provider === 'stripe' && (
                      <div>
                        <label className="text-white/50 text-xs uppercase tracking-wider block mb-2">Card Origin</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setPayLinkForm(p => ({ ...p, cardType: 'eu' }))}
                            className={`py-2.5 rounded-xl text-xs font-bold border transition text-left px-3 ${
                              payLinkForm.cardType === 'eu'
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                            }`}>
                            <span className="block">🇬🇧 UK / EU Card</span>
                            <span className="font-normal opacity-70">1.4% + £0.20</span>
                          </button>
                          <button onClick={() => setPayLinkForm(p => ({ ...p, cardType: 'non_eu' }))}
                            className={`py-2.5 rounded-xl text-xs font-bold border transition text-left px-3 ${
                              payLinkForm.cardType === 'non_eu'
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                            }`}>
                            <span className="block">🌍 International Card</span>
                            <span className="font-normal opacity-70">2.9% + £0.30</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Auto fee breakdown — live preview */}
                    {payLinkForm.amount && Number(payLinkForm.amount) > 0 && (() => {
                      const base  = Number(payLinkForm.amount)
                      const isEU  = payLinkForm.cardType !== 'non_eu'
                      const pct   = payLinkForm.provider === 'stripe' ? (isEU ? 1.4 : 2.9) : 1.4
                      const fixed = payLinkForm.provider === 'stripe'
                        ? (isEU
                            ? (payLinkForm.currency === 'EUR' ? 0.25 : 0.20)
                            : 0.30)
                        : 0
                      const feeAmt = Math.ceil((base * pct / 100 + fixed) * 100) / 100
                      const total  = Math.ceil((base + feeAmt) * 100) / 100
                      const cur    = payLinkForm.currency
                      const sym    = ({ GBP:'£', USD:'$', EUR:'€', NGN:'₦', GHS:'₵' } as Record<string,string>)[cur] ?? cur
                      const fmtLabel = `${pct}%${fixed > 0 ? ` + ${sym}${fixed.toFixed(2)}` : ''}`
                      return (
                        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 space-y-2">
                          <p className="text-amber-400/60 text-[10px] uppercase tracking-wider font-bold">Fee Pass-Through (auto)</p>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/50">Service amount</span>
                            <span className="text-white">{sym}{base.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/50">Processing fee <span className="text-white/30">({fmtLabel})</span></span>
                            <span className="text-amber-400">+ {sym}{feeAmt.toFixed(2)}</span>
                          </div>
                          <div className="border-t border-white/10 pt-2 flex justify-between items-baseline">
                            <span className="text-white text-xs font-bold">Client pays</span>
                            <span className="text-amber-400 font-bold text-base">{sym}{total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <p className="text-white/20 text-[10px]">Fee passed to client — Walz receives {sym}{base.toLocaleString('en-GB', { minimumFractionDigits: 2 })} in full</p>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Client details */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">
                      Client Name {payLinkForm.provider === 'virtual_account' && <span className="text-red-400">*</span>}
                    </label>
                    <input type="text"
                      placeholder={payLinkForm.provider === 'virtual_account' ? 'Required' : 'Optional'}
                      value={payLinkForm.clientName}
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
                {(payLinkForm.provider === 'virtual_account' || payLinkForm.provider === 'paga') && (
                  <div className="mb-4">
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">Phone Number <span className="font-normal text-white/30">(optional)</span></label>
                    <input type="tel" placeholder="+234 800 000 0000" value={payLinkForm.clientPhone}
                      onChange={e => setPayLinkForm(p => ({ ...p, clientPhone: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500/50 text-sm" />
                  </div>
                )}

                {/* Paga persistent — BVN */}
                {payLinkForm.provider === 'paga' && payLinkForm.pagaMethod === 'persistent' && (
                  <div className="mb-4">
                    <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">
                      Client BVN <span className="text-white/30 normal-case">(required by CBN for persistent accounts)</span>
                    </label>
                    <input type="text" placeholder="11-digit BVN" maxLength={11} value={payLinkForm.bvn}
                      onChange={e => setPayLinkForm(p => ({ ...p, bvn: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/50" />
                  </div>
                )}

                {/* Paga direct debit — source account + bank code */}
                {payLinkForm.provider === 'paga' && payLinkForm.pagaMethod === 'direct_debit' && (
                  <div className="mb-4 space-y-3">
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">
                        Client Account Number <span className="text-red-400">*</span>
                      </label>
                      <input type="text" placeholder="10-digit NUBAN" maxLength={10} value={payLinkForm.sourceAccountNumber}
                        onChange={e => setPayLinkForm(p => ({ ...p, sourceAccountNumber: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/50" />
                    </div>
                    <div>
                      <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">
                        Bank Code <span className="text-red-400">*</span>
                      </label>
                      <input type="text" placeholder="e.g. 058 (GTBank)" maxLength={10} value={payLinkForm.bankCode}
                        onChange={e => setPayLinkForm(p => ({ ...p, bankCode: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/50" />
                      <p className="text-white/20 text-xs mt-1">CBN bank code — e.g. 011 (Access), 058 (GTBank), 033 (UBA)</p>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300/70 leading-relaxed">
                      The client will receive an authorization request to approve this direct debit mandate before any charge is made.
                    </div>
                  </div>
                )}

                {payLinkForm.provider !== 'virtual_account' && payLinkForm.provider !== 'paga' && <div className="mb-5" />}

                {linkError && <p className="text-red-400 text-xs mb-3">{linkError}</p>}

                <button
                  onClick={async () => {
                    if (!payLinkForm.amount || !payLinkForm.description) return
                    if (payLinkForm.provider === 'virtual_account' && !payLinkForm.clientName?.trim()) {
                      setLinkError('Client name is required for bank transfer accounts')
                      return
                    }
                    if (payLinkForm.provider === 'paga' && payLinkForm.pagaMethod === 'persistent' && !payLinkForm.clientName?.trim()) {
                      setLinkError('Client name is required for persistent accounts')
                      return
                    }
                    if (payLinkForm.provider === 'paga' && payLinkForm.pagaMethod === 'direct_debit' && (!payLinkForm.sourceAccountNumber?.trim() || !payLinkForm.bankCode?.trim())) {
                      setLinkError('Account number and bank code are required for Direct Debit')
                      return
                    }
                    setGenerating(true)
                    setLinkError('')
                    try {
                      const endpoint = payLinkForm.provider === 'virtual_account'
                        ? '/api/admin/payment-links/virtual-account'
                        : payLinkForm.provider === 'paga'
                        ? '/api/admin/payment-links/paga'
                        : `/api/admin/payment-links/${payLinkForm.provider}`
                      const res  = await fetch(endpoint, {
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
                  <p className="text-white font-bold text-lg">
                    {generatedLink.mandateReferenceNumber ? 'Direct Debit Authorised'
                     : generatedLink.accountNumber ? 'Bank Account Ready'
                     : 'Payment Link Ready'}
                  </p>
                  <p className="text-white/50 text-sm mt-1">
                    {generatedLink.currency} {Number(generatedLink.amount).toLocaleString()} · {generatedLink.description}
                  </p>
                  {generatedLink.fee != null && generatedLink.fee > 0 && (
                    <p className="text-white/30 text-xs mt-1">Paga fee: ₦{Number(generatedLink.fee).toLocaleString()}</p>
                  )}
                </div>

                {/* Paga Direct Debit result */}
                {generatedLink.mandateReferenceNumber && (
                  <div className="bg-white/5 rounded-xl p-5 mb-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-sm">Mandate Reference</span>
                      <span className="text-amber-400 font-mono text-sm font-bold">{generatedLink.mandateReferenceNumber}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/40 text-sm">Amount</span>
                      <span className="text-white font-semibold">₦{Number(generatedLink.amount).toLocaleString()}</span>
                    </div>
                    <div>
                      <p className="text-white/40 text-xs mb-1">Reference</p>
                      <p className="text-white/60 font-mono text-xs">{generatedLink.tx_ref}</p>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300/70 leading-relaxed">
                      The client has been sent an authorization request. Once approved, use the mandate reference to charge via the Paga API.
                    </div>
                    <button onClick={() => {
                      navigator.clipboard.writeText(`Mandate Reference: ${generatedLink.mandateReferenceNumber}\nRef: ${generatedLink.tx_ref}`)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }} className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold py-2.5 rounded-xl transition">
                      {linkCopied ? '✓ Copied!' : '📋 Copy Mandate Reference'}
                    </button>
                  </div>
                )}

                {generatedLink.accountNumber && !generatedLink.mandateReferenceNumber ? (
                  /* Virtual account / Paga bank account result */
                  <>
                    {/* Persistent Paga account banner */}
                    {generatedLink.pagaMethod === 'persistent' && (
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3 mb-4 text-center">
                        <p className="text-purple-400 text-sm">♾ Persistent account — permanently assigned to this client</p>
                        {generatedLink.accountReference && (
                          <p className="text-purple-300/50 text-xs mt-1">Ref: {generatedLink.accountReference}</p>
                        )}
                      </div>
                    )}
                    {/* Deadline / permanent banner */}
                    {!generatedLink.isPermanent && generatedLink.expiresAt && generatedLink.pagaMethod !== 'persistent' ? (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                        <p className="text-red-400 text-xs font-bold uppercase tracking-wider mb-1">⏰ Payment Deadline</p>
                        <p className="text-red-300 font-bold text-sm">
                          {new Date(generatedLink.expiresAt).toLocaleString('en-GB', {
                            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                        <p className="text-red-400/60 text-xs mt-0.5">
                          {generatedLink.deadlineHours} hour{generatedLink.deadlineHours !== 1 ? 's' : ''} to complete payment
                        </p>
                      </div>
                    ) : generatedLink.isPermanent ? (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 mb-4 text-center">
                        <p className="text-green-400 text-sm">♾ Permanent account — never expires</p>
                      </div>
                    ) : null}

                    <div className="bg-white/5 rounded-xl p-5 mb-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white/40 text-sm">Bank</span>
                        <span className="text-white font-semibold">{generatedLink.bankName}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-white/40 text-sm">Account Number</span>
                        <span className="text-amber-400 font-mono text-xl font-bold tracking-wider">{generatedLink.accountNumber}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-white/40 text-sm pt-0.5">Amount to Transfer</span>
                        <div className="text-right">
                          <span className="text-amber-400 font-bold text-xl">
                            {generatedLink.currency} {(generatedLink.amountToPay ?? Number(generatedLink.amount)).toLocaleString()}
                          </span>
                          {(generatedLink.fee ?? 0) > 0 && (
                            <p className="text-white/30 text-xs mt-0.5">
                              incl. {generatedLink.currency} {generatedLink.fee} processing fee
                            </p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-white/40 text-xs mb-1">Reference</p>
                        <p className="text-white/60 font-mono text-xs">{generatedLink.tx_ref}</p>
                      </div>
                      {/* Exact amount warning — only for temporary VAs */}
                      {!generatedLink.isPermanent && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                          <p className="text-red-400 text-xs font-bold mb-1">⚠️ Client must pay EXACTLY:</p>
                          <p className="text-red-300 text-2xl font-bold font-mono">
                            {generatedLink.currency} {(generatedLink.amountToPay ?? Number(generatedLink.amount)).toLocaleString()}
                          </p>
                          <p className="text-red-400/60 text-xs mt-0.5">includes processing fee — any other amount will be reversed</p>
                        </div>
                      )}
                      <button onClick={() => {
                        const payAmt = (generatedLink.amountToPay ?? Number(generatedLink.amount)).toLocaleString()
                        const deadlineLine = generatedLink.deadlineFormatted ? `\nDeadline: ${generatedLink.deadlineFormatted}` : ''
                        navigator.clipboard.writeText(
                          `Bank: ${generatedLink.bankName}\nAccount Number: ${generatedLink.accountNumber}\nAmount to Transfer: ${generatedLink.currency} ${payAmt}\nRef: ${generatedLink.tx_ref}${deadlineLine}`
                        )
                        setLinkCopied(true)
                        setTimeout(() => setLinkCopied(false), 2000)
                      }}
                        className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold py-2.5 rounded-xl transition">
                        {linkCopied ? '✓ Copied!' : '📋 Copy Account Details'}
                      </button>
                    </div>
                  </>
                ) : (
                  /* URL-based result */
                  <>
                    {/* Fee breakdown */}
                    {(generatedLink.feeAmount ?? 0) > 0 && (() => {
                      const cur = generatedLink.currency
                      const sym = ({ GBP:'£', USD:'$', EUR:'€', NGN:'₦', GHS:'₵' } as Record<string,string>)[cur] ?? cur
                      return (
                        <div className="bg-white/5 rounded-xl p-4 mb-3 space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/50">Service amount</span>
                            <span className="text-white">{sym}{Number(generatedLink.baseAmount).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/50">Processing fee <span className="text-white/30">({generatedLink.feeLabel})</span></span>
                            <span className="text-amber-400">+ {sym}{Number(generatedLink.feeAmount).toFixed(2)}</span>
                          </div>
                          <div className="border-t border-white/10 pt-2 flex justify-between items-baseline">
                            <span className="text-white text-xs font-bold">Client pays</span>
                            <span className="text-amber-400 font-bold text-lg">{sym}{Number(generatedLink.totalCharge ?? generatedLink.amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="bg-white/5 rounded-xl p-4 mb-4">
                      <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Payment URL</p>
                      <p className="text-amber-400 text-sm break-all mb-3 leading-relaxed">{generatedLink.url}</p>
                      <button onClick={() => { navigator.clipboard.writeText(generatedLink.url ?? ''); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                        className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold py-2.5 rounded-xl transition">
                        {linkCopied ? '✓ Copied!' : '📋 Copy Link'}
                      </button>
                    </div>
                  </>
                )}

                {payLinkForm.clientEmail && (
                  <div className="mb-4">
                    <button
                      onClick={async () => {
                        setLinkSending(true)
                        try {
                          const isVA = !!generatedLink.accountNumber
                          const body = isVA
                            ? {
                                clientEmail:       payLinkForm.clientEmail,
                                clientName:        payLinkForm.clientName,
                                amount:            generatedLink.amountToPay ?? generatedLink.amount,
                                currency:          generatedLink.currency,
                                description:       generatedLink.description,
                                isPermanent:       generatedLink.isPermanent,
                                deadlineFormatted: generatedLink.deadlineFormatted,
                                deadlineHours:     generatedLink.deadlineHours,
                                virtualAccount: {
                                  accountNumber:   generatedLink.accountNumber,
                                  bankName:        generatedLink.bankName,
                                  tx_ref:          generatedLink.tx_ref,
                                  amountToPay:     generatedLink.amountToPay ?? generatedLink.amount,
                                  fee:             generatedLink.fee ?? 0,
                                },
                              }
                            : {
                                clientEmail: payLinkForm.clientEmail,
                                clientName:  payLinkForm.clientName,
                                amount:      generatedLink.totalCharge ?? generatedLink.amount,
                                baseAmount:  generatedLink.baseAmount,
                                feeAmount:   generatedLink.feeAmount,
                                feeLabel:    generatedLink.feeLabel,
                                currency:    generatedLink.currency,
                                description: generatedLink.description,
                                paymentUrl:  generatedLink.url,
                                provider:    generatedLink.provider,
                              }
                          const res  = await fetch('/api/admin/payment-links/send', {
                            method:  'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body:    JSON.stringify(body),
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
                      {linkSending ? '⏳ Sending…' : linkSendOk
                        ? `✓ Sent to ${payLinkForm.clientEmail}`
                        : generatedLink.accountNumber
                          ? `🏦 Email Bank Details to ${payLinkForm.clientEmail}`
                          : `📧 Email Payment Link to ${payLinkForm.clientEmail}`}
                    </button>
                  </div>
                )}

                {linkError && <p className="text-red-400 text-xs mb-3">{linkError}</p>}

                <div className="flex gap-3">
                  {generatedLink.url && (
                    <a href={generatedLink.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white text-sm font-bold py-3 rounded-xl transition text-center">
                      👁 Preview
                    </a>
                  )}
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
    stripe:              { label: 'Stripe',          cls: 'bg-indigo-50 text-indigo-700'   },
    flutterwave:         { label: 'Flutterwave',     cls: 'bg-amber-50 text-amber-700'     },
    virtual_account:     { label: 'Bank Transfer',   cls: 'bg-green-50 text-green-700'     },
    paga_checkout:       { label: 'Paga Checkout',   cls: 'bg-purple-50 text-purple-700'   },
    paga_dynamic:        { label: 'Paga Dynamic',    cls: 'bg-purple-50 text-purple-700'   },
    paga_persistent:     { label: 'Paga Persistent', cls: 'bg-purple-50 text-purple-700'   },
    paga_direct_debit:   { label: 'Paga Direct Dbt', cls: 'bg-purple-50 text-purple-700'   },
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
