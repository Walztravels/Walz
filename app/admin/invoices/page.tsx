'use client'
import { useState, useEffect } from 'react'
import {
  Plus, Search, Loader2, FileText, DollarSign, CheckCircle,
  Clock, AlertCircle, Send, Trash2, X, ChevronDown,
} from 'lucide-react'

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
  category: string
}

interface Invoice {
  id: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  clientPhone: string | null
  staffName: string | null
  items: LineItem[]
  subtotal: number
  taxRate: number
  taxAmount: number
  discountAmount: number
  totalAmount: number
  currency: string
  depositAmount: number
  balanceDue: number
  status: string
  dueDate: string | null
  notes: string | null
  sentAt: string | null
  paidAt: string | null
  paymentLink: string | null
  createdAt: string
}

interface Stats {
  _sum: { totalAmount: number | null; paidAmount: number | null }
  _count: number
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Draft',    cls: 'bg-gray-100 text-gray-600'    },
  sent:     { label: 'Sent',     cls: 'bg-blue-100 text-blue-700'    },
  viewed:   { label: 'Viewed',   cls: 'bg-purple-100 text-purple-700'},
  paid:     { label: 'Paid',     cls: 'bg-green-100 text-green-700'  },
  partial:  { label: 'Partial',  cls: 'bg-amber-100 text-amber-700'  },
  overdue:  { label: 'Overdue',  cls: 'bg-red-100 text-red-700'      },
  cancelled:{ label: 'Cancelled',cls: 'bg-gray-100 text-gray-400'    },
}

const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AED', 'NGN', 'GHS']
const CATEGORIES = ['Flight', 'Hotel', 'Visa Fee', 'Tour', 'Transfer', 'Service Fee', 'Other']
const COMMON_ITEMS = [
  { description: 'Walz Travels Service Fee — Visa Processing', unitPrice: 150, category: 'Service Fee' },
  { description: 'Walz Travels Service Fee — Flight Booking', unitPrice: 50, category: 'Service Fee' },
  { description: 'Visa Application Fee', unitPrice: 115, category: 'Visa Fee' },
  { description: 'Document Preparation Fee', unitPrice: 75, category: 'Service Fee' },
]

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
}

const blankItem = (): LineItem => ({ description: '', quantity: 1, unitPrice: 0, total: 0, category: 'Other' })

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('')

  // Create invoice
  const [showCreate, setShowCreate] = useState(false)
  const [creating,   setCreating]   = useState(false)
  const [form, setForm] = useState({
    clientName: '', clientEmail: '', clientPhone: '',
    currency: 'GBP', taxRate: 0, discountAmount: 0, depositAmount: 0,
    dueDate: '', notes: '', internalNotes: '',
    items: [blankItem()] as LineItem[],
  })

  // Send / actions
  const [sending, setSending] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filter) params.set('status', filter)
    const res  = await fetch(`/api/admin/invoices?${params}`)
    const data = await res.json()
    setInvoices(data.invoices ?? [])
    setStats(data.stats ?? null)
    setLoading(false)
  }

  useEffect(() => { void load() }, [search, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  function calcTotals(items: LineItem[], taxRate: number, discountAmount: number, depositAmount: number) {
    const subtotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0)
    const taxAmount = subtotal * taxRate / 100
    const totalAmount = subtotal + taxAmount - discountAmount
    const balanceDue = totalAmount - depositAmount
    return { subtotal, taxAmount, totalAmount, balanceDue }
  }

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setForm(f => {
      const items = f.items.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: value }
        updated.total = updated.unitPrice * updated.quantity
        return updated
      })
      return { ...f, items }
    })
  }

  function addItem(preset?: { description: string; unitPrice: number; category: string }) {
    setForm(f => ({
      ...f,
      items: [...f.items, preset
        ? { description: preset.description, unitPrice: preset.unitPrice, quantity: 1, total: preset.unitPrice, category: preset.category }
        : blankItem()],
    }))
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  async function createInvoice() {
    if (!form.clientName || !form.clientEmail) return
    setCreating(true)
    await fetch('/api/admin/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setCreating(false)
    setShowCreate(false)
    setForm({ clientName: '', clientEmail: '', clientPhone: '', currency: 'GBP', taxRate: 0, discountAmount: 0, depositAmount: 0, dueDate: '', notes: '', internalNotes: '', items: [blankItem()] })
    void load()
  }

  async function sendInvoice(id: string) {
    setSending(id)
    await fetch(`/api/admin/invoices/${id}/send`, { method: 'POST' })
    setSending(null)
    void load()
  }

  async function markPaid(id: string) {
    await fetch(`/api/admin/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', paidAt: new Date().toISOString(), paidAmount: invoices.find(i => i.id === id)?.totalAmount ?? 0 }),
    })
    void load()
  }

  async function deleteInvoice(id: string) {
    setDeleting(id)
    await fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' })
    setDeleting(null)
    void load()
  }

  const totals = calcTotals(form.items, form.taxRate, form.discountAmount, form.depositAmount)
  const totalOutstanding = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + i.balanceDue, 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.totalAmount, 0)
  const overdueCount = invoices.filter(i => i.status === 'overdue').length

  const inputCls = 'w-full h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Invoices</h1>
          <p className="text-gray-400 text-sm mt-0.5">Create and send professional invoices to clients</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#b8943d] transition-colors">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Outstanding', val: fmt(totalOutstanding), icon: AlertCircle, cls: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Paid', val: fmt(totalPaid), icon: CheckCircle, cls: 'text-green-500', bg: 'bg-green-50' },
          { label: 'Overdue', val: String(overdueCount), icon: Clock, cls: 'text-red-500', bg: 'bg-red-50' },
          { label: 'Total Invoices', val: String(invoices.length), icon: FileText, cls: 'text-blue-500', bg: 'bg-blue-50' },
        ].map(({ label, val, icon: Icon, cls, bg }) => (
          <div key={label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${cls}`} />
            </div>
            <div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-lg font-bold text-[#0B1F3A]">{val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, invoice no…"
            className="w-full pl-9 pr-4 h-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white"
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] bg-white text-gray-600">
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Invoice table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
          <FileText className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="font-bold text-[#0B1F3A]">No invoices yet</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Create your first invoice to get started.</p>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2 rounded-xl text-sm">
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Invoice No.', 'Client', 'Amount', 'Status', 'Due Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const s = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.draft
                  return (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-[#0B1F3A]">{inv.invoiceNumber}</p>
                        <p className="text-xs text-gray-400">{new Date(inv.createdAt).toLocaleDateString('en-GB')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#0B1F3A]">{inv.clientName}</p>
                        <p className="text-xs text-gray-400">{inv.clientEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-[#0B1F3A]">{fmt(inv.totalAmount, inv.currency)}</p>
                        {inv.balanceDue !== inv.totalAmount && (
                          <p className="text-xs text-gray-400">Balance: {fmt(inv.balanceDue, inv.currency)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${s.cls}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button onClick={() => sendInvoice(inv.id)} disabled={sending === inv.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 disabled:opacity-50">
                              {sending === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              Send
                            </button>
                          )}
                          {inv.status === 'sent' || inv.status === 'viewed' ? (
                            <button onClick={() => markPaid(inv.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-600 text-xs font-semibold rounded-lg hover:bg-green-100">
                              <CheckCircle className="w-3 h-3" /> Paid
                            </button>
                          ) : null}
                          {inv.paymentLink && (
                            <a href={inv.paymentLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#C9A84C]/10 text-[#C9A84C] text-xs font-semibold rounded-lg hover:bg-[#C9A84C]/20">
                              <DollarSign className="w-3 h-3" /> Pay Link
                            </a>
                          )}
                          <button onClick={() => deleteInvoice(inv.id)} disabled={deleting === inv.id}
                            className="w-7 h-7 flex items-center justify-center bg-red-50 text-red-400 rounded-lg hover:bg-red-100 disabled:opacity-50">
                            {deleting === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create invoice modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl my-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#0B1F3A]">New Invoice</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Client details */}
            <div className="mb-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Client Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] text-gray-400 block mb-1">Client Name *</label>
                  <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                    placeholder="John Adeyemi" className={inputCls} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Email *</label>
                  <input type="email" value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))}
                    placeholder="client@email.com" className={inputCls} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Phone</label>
                  <input value={form.clientPhone} onChange={e => setForm(f => ({ ...f, clientPhone: e.target.value }))}
                    placeholder="+44 7..." className={inputCls} />
                </div>
              </div>
            </div>

            {/* Line items */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Line Items</p>
                <div className="relative group">
                  <button className="text-xs text-[#C9A84C] font-semibold flex items-center gap-1">
                    + Quick Add <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="absolute right-0 top-6 bg-white border border-gray-100 shadow-xl rounded-xl py-1 z-10 min-w-[220px] hidden group-hover:block">
                    {COMMON_ITEMS.map((ci, i) => (
                      <button key={i} onClick={() => addItem(ci)}
                        className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                        {ci.description} — £{ci.unitPrice}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Price</div>
                  <div className="col-span-1" />
                </div>
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      placeholder="Description…"
                      className="col-span-5 h-9 px-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C]"
                    />
                    <select value={item.category} onChange={e => updateItem(idx, 'category', e.target.value)}
                      className="col-span-2 h-9 px-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#C9A84C] bg-white">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" value={item.quantity} min={1}
                      onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 1)}
                      className="col-span-2 h-9 px-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C] text-center"
                    />
                    <input type="number" value={item.unitPrice}
                      onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="col-span-2 h-9 px-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#C9A84C]"
                    />
                    <button onClick={() => removeItem(idx)}
                      className="col-span-1 h-9 w-9 flex items-center justify-center bg-red-50 text-red-400 rounded-lg hover:bg-red-100">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={() => addItem()}
                className="mt-2 flex items-center gap-1.5 text-sm text-[#C9A84C] font-semibold hover:underline">
                <Plus className="w-4 h-4" /> Add Row
              </button>
            </div>

            {/* Totals + settings */}
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className={inputCls}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Due Date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Notes (shown to client)</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] resize-none"
                  />
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Summary</p>
                {[
                  { label: 'Subtotal', val: fmt(totals.subtotal, form.currency) },
                  ...(form.taxRate > 0 ? [{ label: `VAT (${form.taxRate}%)`, val: fmt(totals.taxAmount, form.currency) }] : []),
                  ...(form.discountAmount > 0 ? [{ label: 'Discount', val: `-${fmt(form.discountAmount, form.currency)}` }] : []),
                ].map(({ label, val }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}</span>
                    <span className="text-[#0B1F3A]">{val}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 flex justify-between font-bold">
                  <span className="text-[#0B1F3A]">Total</span>
                  <span className="text-[#0B1F3A]">{fmt(totals.totalAmount, form.currency)}</span>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">VAT %</span>
                    <select value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: parseFloat(e.target.value) }))}
                      className="h-7 px-2 border border-gray-200 rounded-lg text-xs bg-white">
                      {[0, 5, 20].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Discount</span>
                    <input type="number" value={form.discountAmount}
                      onChange={e => setForm(f => ({ ...f, discountAmount: parseFloat(e.target.value) || 0 }))}
                      className="h-7 w-24 px-2 border border-gray-200 rounded-lg text-xs text-right" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Deposit Paid</span>
                    <input type="number" value={form.depositAmount}
                      onChange={e => setForm(f => ({ ...f, depositAmount: parseFloat(e.target.value) || 0 }))}
                      className="h-7 w-24 px-2 border border-gray-200 rounded-lg text-xs text-right" />
                  </div>
                  {form.depositAmount > 0 && (
                    <div className="flex justify-between font-bold text-sm pt-1 border-t border-gray-200">
                      <span className="text-green-600">Balance Due</span>
                      <span className="text-green-600">{fmt(totals.balanceDue, form.currency)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 h-11 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={createInvoice} disabled={creating || !form.clientName || !form.clientEmail}
                className="flex-1 h-11 bg-[#C9A84C] text-[#0B1F3A] font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create Invoice →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
