'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Search, Download, Tag, Gift, ToggleLeft, ToggleRight, ChevronDown } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Voucher {
  id:              string
  code:            string
  name:            string | null
  voucherKind:     string
  serviceType:     string
  discountType:    string
  amount:          number
  currency:        string
  remainingAmount: number
  maxUses:         number
  usedCount:       number
  status:          string
  active:          boolean
  tourName:        string | null
  senderName:      string | null
  senderEmail:     string | null
  recipientName:   string | null
  recipientEmail:  string | null
  validFrom:       string
  expiresAt:       string
  createdAt:       string
  paidAmount:      number | null
  paymentGateway:  string | null
}

interface FormData {
  name:            string
  voucherKind:     string
  serviceType:     string
  discountType:    string
  amount:          number
  currency:        string
  maxUses:         number
  active:          boolean
  tourName:        string
  validFrom:       string
  expiresAt:       string
  senderName:      string
  senderEmail:     string
  recipientName:   string
  recipientEmail:  string
  personalMessage: string
}

const today = new Date().toISOString().split('T')[0]
const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0]

const EMPTY: FormData = {
  name: '', voucherKind: 'credit', serviceType: 'all', discountType: 'fixed',
  amount: 0, currency: 'GBP', maxUses: 1, active: true, tourName: '',
  validFrom: today, expiresAt: nextYear,
  senderName: '', senderEmail: '', recipientName: '', recipientEmail: '', personalMessage: '',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:    'bg-green-100 text-green-700',
  PURCHASED: 'bg-blue-100 text-blue-700',
  SENT:      'bg-purple-100 text-purple-700',
  REDEEMED:  'bg-gray-100 text-gray-500',
  EXPIRED:   'bg-red-100 text-red-600',
  CANCELLED: 'bg-orange-100 text-orange-600',
}

const SERVICE_LABELS: Record<string, string> = {
  visa: 'Visa', flight: 'Flight', tour: 'Tour', all: 'All Services',
}

const DISCOUNT_LABELS: Record<string, string> = {
  fixed: 'Fixed £', percentage: '% Off', free: 'Free',
}

function fmtAmount(v: Voucher) {
  if (v.discountType === 'percentage') return `${v.amount}%`
  if (v.discountType === 'free') return 'FREE'
  return `${v.currency} ${v.amount.toFixed(2)}`
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Export to CSV ─────────────────────────────────────────────────────────────

function exportCSV(vouchers: Voucher[]) {
  const headers = ['Code','Name','Kind','Service','Discount Type','Amount','Currency','Used','Max Uses','Status','Active','Sender','Recipient','Valid From','Expires','Created']
  const rows = vouchers.map(v => [
    v.code,
    v.name ?? '',
    v.voucherKind,
    SERVICE_LABELS[v.serviceType] ?? v.serviceType,
    DISCOUNT_LABELS[v.discountType] ?? v.discountType,
    v.amount,
    v.currency,
    v.usedCount,
    v.maxUses,
    v.status,
    v.active ? 'Yes' : 'No',
    v.senderName ?? '',
    v.recipientName ?? '',
    fmtDate(v.validFrom),
    fmtDate(v.expiresAt),
    fmtDate(v.createdAt),
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `walz-vouchers-${today}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState<(FormData & { id?: string }) | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [tab, setTab]           = useState<'all' | 'gift' | 'credit'>('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tab !== 'all') params.set('kind', tab)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/vouchers?${params}`)
    setVouchers(await res.json())
    setLoading(false)
  }, [tab, statusFilter, search])

  useEffect(() => { load() }, [load])

  function openNew() { setModal({ ...EMPTY }); setError(null) }
  function openEdit(v: Voucher) {
    setModal({
      id: v.id,
      name:           v.name ?? '',
      voucherKind:    v.voucherKind,
      serviceType:    v.serviceType,
      discountType:   v.discountType,
      amount:         v.amount,
      currency:       v.currency,
      maxUses:        v.maxUses,
      active:         v.active,
      tourName:       v.tourName ?? '',
      validFrom:      v.validFrom.split('T')[0],
      expiresAt:      v.expiresAt.split('T')[0],
      senderName:     v.senderName ?? '',
      senderEmail:    v.senderEmail ?? '',
      recipientName:  v.recipientName ?? '',
      recipientEmail: v.recipientEmail ?? '',
      personalMessage: '',
    })
    setError(null)
  }

  async function save() {
    if (!modal) return
    setError(null)
    setSaving(true)
    try {
      const body = modal.id ? { id: modal.id, ...modal } : modal
      const res = await fetch('/api/admin/vouchers', {
        method: modal.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Save failed')
        return
      }
      setModal(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    await fetch('/api/admin/vouchers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteId }),
    })
    setDeleteId(null)
    setDeleting(false)
    load()
  }

  async function toggleActive(v: Voucher) {
    await fetch('/api/admin/vouchers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: v.id, active: !v.active }),
    })
    load()
  }

  const set = (k: keyof FormData, val: unknown) => setModal(m => m ? { ...m, [k]: val } : m)

  // Stats
  const active   = vouchers.filter(v => v.active && !['REDEEMED','EXPIRED','CANCELLED'].includes(v.status)).length
  const redeemed = vouchers.filter(v => v.status === 'REDEEMED').length
  const expired  = vouchers.filter(v => v.status === 'EXPIRED' || (v.expiresAt && new Date(v.expiresAt) < new Date())).length
  const giftsOnly = vouchers.filter(v => v.voucherKind === 'gift')
  const totalRevenue = giftsOnly.reduce((s, v) => s + (v.paidAmount ?? 0), 0)

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Vouchers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{vouchers.length} voucher{vouchers.length !== 1 ? 's' : ''} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(vouchers)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors"
          >
            <Plus className="w-4 h-4" /> New Voucher
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active', value: active, color: 'text-green-600' },
          { label: 'Redeemed', value: redeemed, color: 'text-gray-500' },
          { label: 'Expired', value: expired, color: 'text-red-500' },
          { label: 'Gift Revenue', value: `£${totalRevenue.toFixed(0)}`, color: 'text-[#C9A84C]' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['all', 'credit', 'gift'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                tab === t ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'all' ? 'All Vouchers' : t === 'credit' ? 'Discount Codes' : 'Gift Vouchers'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 p-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, name, or client…"
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="appearance-none pl-4 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white text-gray-600"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="purchased">Purchased</option>
              <option value="sent">Sent</option>
              <option value="redeemed">Redeemed</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-4xl mb-3">🎟️</div>
          <h3 className="font-bold text-[#0B1F3A] text-lg mb-1">No vouchers found</h3>
          <p className="text-gray-500 text-sm mb-4">Create your first voucher to get started.</p>
          <button onClick={openNew} className="px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors">
            Create Voucher
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F7F8FA] border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Code / Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Uses</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Expires</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vouchers.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-mono text-[#0B1F3A] font-semibold text-xs tracking-wide">{v.code}</p>
                      {v.name && <p className="text-xs text-gray-500 mt-0.5">{v.name}</p>}
                      {v.voucherKind === 'gift' && v.recipientName && (
                        <p className="text-xs text-purple-500 mt-0.5">→ {v.recipientName}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${
                          v.voucherKind === 'gift' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {v.voucherKind === 'gift' ? <Gift className="w-3 h-3" /> : <Tag className="w-3 h-3" />}
                          {v.voucherKind === 'gift' ? 'Gift' : 'Code'}
                        </span>
                        <span className="text-xs text-gray-400">{SERVICE_LABELS[v.serviceType]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-bold text-[#0B1F3A]">{fmtAmount(v)}</p>
                      {v.remainingAmount !== v.amount && (
                        <p className="text-xs text-gray-400">{v.currency} {v.remainingAmount.toFixed(2)} left</p>
                      )}
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell">
                      <span className={`text-sm font-semibold ${v.usedCount >= v.maxUses ? 'text-red-500' : 'text-gray-600'}`}>
                        {v.usedCount}/{v.maxUses}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-500 hidden md:table-cell">
                      {fmtDate(v.expiresAt)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[v.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleActive(v)}
                          title={v.active ? 'Deactivate' : 'Activate'}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 transition-colors"
                        >
                          {v.active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(v.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A] text-lg">{modal.id ? 'Edit Voucher' : 'Create New Voucher'}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">{error}</div>}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Voucher Name *</label>
                <input value={modal.name} onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Summer Special 2025"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
              </div>

              {/* Kind + Service */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type</label>
                  <select value={modal.voucherKind} onChange={e => set('voucherKind', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white">
                    <option value="credit">Discount Code</option>
                    <option value="gift">Gift Voucher</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Applies To</label>
                  <select value={modal.serviceType} onChange={e => set('serviceType', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white">
                    <option value="all">All Services</option>
                    <option value="visa">Visa Only</option>
                    <option value="flight">Flight Only</option>
                    <option value="tour">Tour Only</option>
                  </select>
                </div>
              </div>

              {/* Tour name if tour specific */}
              {modal.serviceType === 'tour' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tour Name</label>
                  <input value={modal.tourName} onChange={e => set('tourName', e.target.value)}
                    placeholder="e.g. Niagara VIP Tour"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                </div>
              )}

              {/* Discount type + Amount + Currency */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Discount Type</label>
                  <select value={modal.discountType} onChange={e => set('discountType', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white">
                    <option value="fixed">Fixed Amount</option>
                    <option value="percentage">Percentage</option>
                    <option value="free">Free Service</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {modal.discountType === 'percentage' ? 'Percentage (%)' : 'Amount'}
                  </label>
                  <input type="number" min={0} value={modal.amount} onChange={e => set('amount', Number(e.target.value))}
                    disabled={modal.discountType === 'free'}
                    placeholder={modal.discountType === 'percentage' ? '10' : '150'}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] disabled:opacity-50" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Currency</label>
                  <select value={modal.currency} onChange={e => set('currency', e.target.value)}
                    disabled={modal.discountType === 'percentage' || modal.discountType === 'free'}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white disabled:opacity-50">
                    {['GBP','USD','CAD','NGN','AED'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Max uses + Dates */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Max Uses</label>
                  <input type="number" min={1} value={modal.maxUses} onChange={e => set('maxUses', Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Valid From</label>
                  <input type="date" value={modal.validFrom} onChange={e => set('validFrom', e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Expiry Date *</label>
                  <input type="date" value={modal.expiresAt} onChange={e => set('expiresAt', e.target.value)}
                    min={today}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                </div>
              </div>

              {/* Gift voucher — sender / recipient */}
              {modal.voucherKind === 'gift' && (
                <>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sender (optional)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={modal.senderName} onChange={e => set('senderName', e.target.value)}
                        placeholder="Sender name"
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                      <input type="email" value={modal.senderEmail} onChange={e => set('senderEmail', e.target.value)}
                        placeholder="Sender email"
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Recipient (optional)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={modal.recipientName} onChange={e => set('recipientName', e.target.value)}
                        placeholder="Recipient name"
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                      <input type="email" value={modal.recipientEmail} onChange={e => set('recipientEmail', e.target.value)}
                        placeholder="Recipient email"
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]" />
                    </div>
                  </div>
                </>
              )}

              {/* Active toggle */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <button type="button" onClick={() => set('active', !modal.active)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${modal.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${modal.active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <div>
                  <p className="text-sm font-semibold text-[#0B1F3A]">{modal.active ? 'Active' : 'Inactive'}</p>
                  <p className="text-xs text-gray-500">{modal.active ? 'Voucher can be used' : 'Voucher is disabled'}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !modal.name || !modal.expiresAt}
                className="px-5 py-2.5 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#1a3a5c] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : modal.id ? 'Save Changes' : 'Create Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-[#0B1F3A] text-lg mb-2">Delete Voucher?</h3>
            <p className="text-sm text-gray-500 mb-6">This is permanent and cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 border border-gray-200 text-sm font-semibold text-gray-600 rounded-xl hover:bg-gray-50">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
