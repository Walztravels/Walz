'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Signal, TrendingUp, DollarSign, ShoppingBag,
  Download, RefreshCw, Search, UserPlus, ChevronDown, ChevronUp, Check, AlertCircle,
  Wifi,
} from 'lucide-react'

interface AdminPkg {
  packageCode:  string
  name:         string
  durationDays: number
  dataLabel:    string
  retailUsd:    number
  wholesaleUsd: number
  dataAmount:   number | null
  dataUnit:     string
}

interface PlaceOrderForm {
  clientEmail:    string
  country:        string
  packageCode:    string
  customRetail:   string
}

interface PlaceOrderResult {
  success: boolean
  orderRef?: string
  iccid?: string | null
  qrCodeUrl?: string | null
  status?: string
  error?: string
}

interface EsimOrder {
  id:             string
  orderRef:       string
  destination:    string
  packageName:    string
  durationDays:   number
  dataGb:         number | null
  wholesaleCostUsd: number
  retailPriceUsd: number
  marginUsd:      number
  status:         string
  purchasedAt:    string
  user:           { name: string | null; email: string | null } | null
}

interface Stats {
  totalOrders:   number
  totalRevenue:  number
  totalMargin:   number
  avgOrderValue: number
  monthOrders:   number
  monthRevenue:  number
  monthMargin:   number
}

const STATUS_COLORS: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  IN_USE:    'bg-blue-100 text-blue-700',
  pending:   'bg-yellow-100 text-yellow-700',
  expired:   'bg-gray-100 text-gray-500',
  EXPIRED:   'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-600',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AdminEsimPage() {
  const [orders,  setOrders]  = useState<EsimOrder[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  // ── Place Order via Airalo ─────────────────────────────────────────────────
  const [showOrderForm, setShowOrderForm]   = useState(false)
  const [orderForm,     setOrderForm]       = useState<PlaceOrderForm>({ clientEmail: '', country: '', packageCode: '', customRetail: '' })
  const [orderPkgs,     setOrderPkgs]       = useState<AdminPkg[]>([])
  const [loadingPkgs,   setLoadingPkgs]     = useState(false)
  const [placingOrder,  setPlacingOrder]    = useState(false)
  const [orderResult,   setOrderResult]     = useState<PlaceOrderResult | null>(null)

  async function loadPackages() {
    const iso2 = orderForm.country.trim().toUpperCase()
    if (iso2.length !== 2) return
    setLoadingPkgs(true)
    setOrderPkgs([])
    setOrderForm(f => ({ ...f, packageCode: '' }))
    try {
      const res  = await fetch(`/api/esim/packages?country=${iso2}`)
      const data = await res.json()
      setOrderPkgs((data.packages ?? []) as AdminPkg[])
    } finally {
      setLoadingPkgs(false)
    }
  }

  async function placeAdminOrder() {
    const pkg = orderPkgs.find(p => p.packageCode === orderForm.packageCode)
    if (!pkg || !orderForm.clientEmail) return
    setPlacingOrder(true)
    setOrderResult(null)
    try {
      const res  = await fetch('/api/admin/esim/order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail:     orderForm.clientEmail,
          packageCode:     pkg.packageCode,
          packageName:     pkg.name,
          destination:     orderForm.country.toUpperCase(),
          destinationIso2: orderForm.country.toUpperCase(),
          durationDays:    pkg.durationDays,
          dataAmount:      pkg.dataAmount,
          dataUnit:        pkg.dataUnit,
          wholesaleUsd:    pkg.wholesaleUsd,
          retailUsd:       orderForm.customRetail ? Number(orderForm.customRetail) : pkg.retailUsd,
        }),
      })
      const data = await res.json() as PlaceOrderResult
      setOrderResult(data)
      if (data.success) {
        setOrderForm({ clientEmail: '', country: '', packageCode: '', customRetail: '' })
        setOrderPkgs([])
        load()
      }
    } finally {
      setPlacingOrder(false)
    }
  }

  // ── Place Order via eSIM Access ────────────────────────────────────────────
  const [showAccessForm,    setShowAccessForm]    = useState(false)
  const [accessForm,        setAccessForm]        = useState<PlaceOrderForm>({ clientEmail: '', country: '', packageCode: '', customRetail: '' })
  const [accessPkgs,        setAccessPkgs]        = useState<AdminPkg[]>([])
  const [loadingAccessPkgs, setLoadingAccessPkgs] = useState(false)
  const [placingAccessOrder,setPlacingAccessOrder]= useState(false)
  const [accessOrderResult, setAccessOrderResult] = useState<PlaceOrderResult | null>(null)

  async function loadAccessPackages() {
    const iso2 = accessForm.country.trim().toUpperCase()
    if (iso2.length !== 2) return
    setLoadingAccessPkgs(true)
    setAccessPkgs([])
    setAccessForm(f => ({ ...f, packageCode: '' }))
    try {
      const res  = await fetch(`/api/admin/esim/access-packages?iso2=${iso2}`)
      const data = await res.json()
      setAccessPkgs((data.packages ?? []) as AdminPkg[])
    } finally {
      setLoadingAccessPkgs(false)
    }
  }

  async function placeAccessAdminOrder() {
    const pkg = accessPkgs.find(p => p.packageCode === accessForm.packageCode)
    if (!pkg || !accessForm.clientEmail) return
    setPlacingAccessOrder(true)
    setAccessOrderResult(null)
    try {
      const res  = await fetch('/api/admin/esim/access-order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail:     accessForm.clientEmail,
          packageCode:     pkg.packageCode,
          packageName:     pkg.name,
          destination:     accessForm.country.toUpperCase(),
          destinationIso2: accessForm.country.toUpperCase(),
          durationDays:    pkg.durationDays,
          dataAmount:      pkg.dataAmount,
          dataUnit:        pkg.dataUnit,
          wholesaleUsd:    pkg.wholesaleUsd,
          retailUsd:       accessForm.customRetail ? Number(accessForm.customRetail) : pkg.retailUsd,
        }),
      })
      const data = await res.json() as PlaceOrderResult
      setAccessOrderResult(data)
      if (data.success) {
        setAccessForm({ clientEmail: '', country: '', packageCode: '', customRetail: '' })
        setAccessPkgs([])
        load()
      }
    } finally {
      setPlacingAccessOrder(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/esim')
      const data = await res.json()
      setOrders(data.orders ?? [])
      setStats(data.stats ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function exportCsv() {
    const headers = ['Order Ref', 'Client', 'Email', 'Destination', 'Plan', 'Days', 'Data', 'Wholesale', 'Retail', 'Margin', 'Status', 'Date']
    const rows = orders.map(o => [
      o.orderRef,
      o.user?.name ?? '',
      o.user?.email ?? '',
      o.destination,
      o.packageName,
      o.durationDays,
      o.dataGb ? `${o.dataGb} GB` : 'Unlimited',
      o.wholesaleCostUsd,
      o.retailPriceUsd,
      o.marginUsd,
      o.status,
      new Date(o.purchasedAt).toISOString(),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `jade-connect-esim-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = orders.filter(o =>
    !search ||
    o.destination.toLowerCase().includes(search.toLowerCase()) ||
    o.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
    o.orderRef.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center">
            <Signal className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="font-display font-bold text-[#0B1F3A] text-2xl">Jade Connect eSIM</h1>
            <p className="text-[#0B1F3A]/50 text-sm">All eSIM orders and revenue</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2.5 border border-[#E5E7EB] rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className={`w-4 h-4 text-[#0B1F3A]/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white font-semibold text-sm rounded-xl hover:bg-[#0d2345] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Provider order panels */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Airalo Panel ── */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <button
            onClick={() => { setShowOrderForm(v => !v); setOrderResult(null) }}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F8F9FA] transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-[#C9A84C]" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-[#0B1F3A] text-sm">Place Order via Airalo</p>
                <p className="text-[#0B1F3A]/40 text-xs">Primary provider · 215 countries</p>
              </div>
            </div>
            {showOrderForm ? <ChevronUp className="w-4 h-4 text-[#0B1F3A]/40" /> : <ChevronDown className="w-4 h-4 text-[#0B1F3A]/40" />}
          </button>

          {showOrderForm && (
            <div className="border-t border-[#E5E7EB] p-6">
              {orderResult && (
                <div className={`mb-5 p-4 rounded-xl flex items-start gap-3 ${orderResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {orderResult.success
                    ? <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`font-semibold text-sm ${orderResult.success ? 'text-green-700' : 'text-red-600'}`}>
                      {orderResult.success ? `Order placed — Ref: ${orderResult.orderRef}` : orderResult.error}
                    </p>
                    {orderResult.success && (
                      <p className="text-xs text-green-600 mt-1">
                        Status: {orderResult.status} {orderResult.iccid ? `· ICCID: ${orderResult.iccid}` : '· QR emailed to client'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">Client Email</label>
                  <input
                    type="email"
                    placeholder="client@example.com"
                    value={orderForm.clientEmail}
                    onChange={e => setOrderForm(f => ({ ...f, clientEmail: e.target.value }))}
                    className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#C9A84C]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">Country (ISO2)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. JP, GB, NG"
                      maxLength={2}
                      value={orderForm.country}
                      onChange={e => setOrderForm(f => ({ ...f, country: e.target.value.toUpperCase() }))}
                      className="flex-1 h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#C9A84C] uppercase"
                    />
                    <button
                      onClick={loadPackages}
                      disabled={orderForm.country.length !== 2 || loadingPkgs}
                      className="px-3 h-10 bg-[#0B1F3A] text-white text-xs font-semibold rounded-lg hover:bg-[#0d2345] transition-colors disabled:opacity-50">
                      {loadingPkgs ? '…' : 'Load'}
                    </button>
                  </div>
                </div>
              </div>

              {orderPkgs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">
                      Package ({orderPkgs.length} available)
                    </label>
                    <select
                      value={orderForm.packageCode}
                      onChange={e => setOrderForm(f => ({ ...f, packageCode: e.target.value }))}
                      className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white">
                      <option value="">Select a package…</option>
                      {orderPkgs.map(p => (
                        <option key={p.packageCode} value={p.packageCode}>
                          {p.name} — {p.durationDays}d · {p.dataLabel} · ${p.retailUsd.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">
                      Custom Retail (USD, optional)
                    </label>
                    <input
                      type="number" step="0.01" min="0"
                      placeholder={orderPkgs.find(p => p.packageCode === orderForm.packageCode)?.retailUsd.toFixed(2) ?? ''}
                      value={orderForm.customRetail}
                      onChange={e => setOrderForm(f => ({ ...f, customRetail: e.target.value }))}
                      className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={placeAdminOrder}
                disabled={!orderForm.clientEmail || !orderForm.packageCode || placingOrder}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                {placingOrder ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {placingOrder ? 'Placing order…' : 'Place Order & Email Client'}
              </button>
            </div>
          )}
        </div>

        {/* ── eSIM Access Panel ── */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
          <button
            onClick={() => { setShowAccessForm(v => !v); setAccessOrderResult(null) }}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#F8F9FA] transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                <Wifi className="w-4 h-4 text-teal-600" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-[#0B1F3A] text-sm">Place Order via eSIM Access</p>
                <p className="text-[#0B1F3A]/40 text-xs">Backup provider · use when Airalo unavailable</p>
              </div>
            </div>
            {showAccessForm ? <ChevronUp className="w-4 h-4 text-[#0B1F3A]/40" /> : <ChevronDown className="w-4 h-4 text-[#0B1F3A]/40" />}
          </button>

          {showAccessForm && (
            <div className="border-t border-[#E5E7EB] p-6">
              <div className="mb-4 p-3 rounded-lg bg-teal-50 border border-teal-100">
                <p className="text-xs text-teal-700 font-medium">eSIM Access delivers QR code via email. No LPA/manual code — client scans QR only.</p>
              </div>

              {accessOrderResult && (
                <div className={`mb-5 p-4 rounded-xl flex items-start gap-3 ${accessOrderResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {accessOrderResult.success
                    ? <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`font-semibold text-sm ${accessOrderResult.success ? 'text-green-700' : 'text-red-600'}`}>
                      {accessOrderResult.success ? `Order placed — Ref: ${accessOrderResult.orderRef}` : accessOrderResult.error}
                    </p>
                    {accessOrderResult.success && (
                      <p className="text-xs text-green-600 mt-1">
                        Status: {accessOrderResult.status} {accessOrderResult.iccid ? `· ICCID: ${accessOrderResult.iccid}` : '· QR emailed to client'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">Client Email</label>
                  <input
                    type="email"
                    placeholder="client@example.com"
                    value={accessForm.clientEmail}
                    onChange={e => setAccessForm(f => ({ ...f, clientEmail: e.target.value }))}
                    className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">Country (ISO2)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. JP, GB, NG"
                      maxLength={2}
                      value={accessForm.country}
                      onChange={e => setAccessForm(f => ({ ...f, country: e.target.value.toUpperCase() }))}
                      className="flex-1 h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-teal-500 uppercase"
                    />
                    <button
                      onClick={loadAccessPackages}
                      disabled={accessForm.country.length !== 2 || loadingAccessPkgs}
                      className="px-3 h-10 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                      {loadingAccessPkgs ? '…' : 'Load'}
                    </button>
                  </div>
                </div>
              </div>

              {accessPkgs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">
                      Package ({accessPkgs.length} available)
                    </label>
                    <select
                      value={accessForm.packageCode}
                      onChange={e => setAccessForm(f => ({ ...f, packageCode: e.target.value }))}
                      className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-teal-500 bg-white">
                      <option value="">Select a package…</option>
                      {accessPkgs.map(p => (
                        <option key={p.packageCode} value={p.packageCode}>
                          {p.name} — {p.durationDays}d · {p.dataLabel} · ${p.retailUsd.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide mb-1.5">
                      Custom Retail (USD, optional)
                    </label>
                    <input
                      type="number" step="0.01" min="0"
                      placeholder={accessPkgs.find(p => p.packageCode === accessForm.packageCode)?.retailUsd.toFixed(2) ?? ''}
                      value={accessForm.customRetail}
                      onChange={e => setAccessForm(f => ({ ...f, customRetail: e.target.value }))}
                      className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg text-sm outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              )}

              {accessPkgs.length === 0 && accessForm.country.length === 2 && !loadingAccessPkgs && (
                <p className="text-xs text-[#0B1F3A]/40 mb-4">No eSIM Access packages found for {accessForm.country}. Try a different country code.</p>
              )}

              <button
                onClick={placeAccessAdminOrder}
                disabled={!accessForm.clientEmail || !accessForm.packageCode || placingAccessOrder}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white font-bold text-sm rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {placingAccessOrder ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                {placingAccessOrder ? 'Placing order…' : 'Place Order & Email Client'}
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              icon: ShoppingBag,
              label: 'This Month Orders',
              value: stats.monthOrders,
              sub: `${stats.totalOrders} all time`,
              format: 'int',
            },
            {
              icon: DollarSign,
              label: 'This Month Revenue',
              value: stats.monthRevenue,
              sub: `$${fmt(stats.totalRevenue)} all time`,
              format: 'usd',
            },
            {
              icon: TrendingUp,
              label: 'This Month Margin',
              value: stats.monthMargin,
              sub: `$${fmt(stats.totalMargin)} all time`,
              format: 'usd',
            },
            {
              icon: Signal,
              label: 'Avg Order Value',
              value: stats.avgOrderValue,
              sub: 'all time average',
              format: 'usd',
            },
          ].map(({ icon: Icon, label, value, sub, format }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="w-4 h-4 text-[#C9A84C]" />
                <p className="text-[#0B1F3A]/50 text-xs font-medium">{label}</p>
              </div>
              <p className="font-bold text-[#0B1F3A] text-2xl mb-1">
                {format === 'usd' ? `$${fmt(value)}` : value}
              </p>
              <p className="text-[#0B1F3A]/40 text-xs">{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0B1F3A]/30" />
        <input
          type="text"
          placeholder="Search by destination, email or order ref…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 border border-[#E5E7EB] rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F8F9FA]">
                {['Client', 'Destination', 'Plan', 'Wholesale', 'Retail', 'Margin', 'Status', 'Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#0B1F3A]/50 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[#0B1F3A]/40 text-sm">
                    {search ? 'No orders match your search.' : 'No eSIM orders yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map(o => (
                  <tr key={o.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0B1F3A] text-sm">{o.user?.name ?? '—'}</p>
                      <p className="text-[#0B1F3A]/40 text-xs">{o.user?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#0B1F3A] font-medium">{o.destination}</p>
                      <p className="text-[#0B1F3A]/40 text-xs">{o.orderRef}</p>
                    </td>
                    <td className="px-4 py-3 text-[#0B1F3A]/70">
                      <p>{o.packageName}</p>
                      <p className="text-xs text-[#0B1F3A]/40">
                        {o.durationDays}d · {o.dataGb ? `${o.dataGb} GB` : 'Unlimited'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[#0B1F3A]/60 font-mono text-xs">
                      ${fmt(o.wholesaleCostUsd)}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0B1F3A]">
                      ${fmt(o.retailPriceUsd)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-green-600">
                      +${fmt(o.marginUsd)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#0B1F3A]/50 text-xs whitespace-nowrap">
                      {new Date(o.purchasedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-[#E5E7EB] text-xs text-[#0B1F3A]/40 flex items-center justify-between">
            <span>{filtered.length} orders</span>
            <span>
              Total revenue: <strong className="text-[#0B1F3A]">
                ${fmt(filtered.reduce((s, o) => s + o.retailPriceUsd, 0))}
              </strong>
              {' '}· Total margin: <strong className="text-green-600">
                ${fmt(filtered.reduce((s, o) => s + o.marginUsd, 0))}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
