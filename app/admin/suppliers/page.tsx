'use client'

import { useEffect, useState, useCallback } from 'react'
import { Package, RefreshCw, Loader2, Plus, Edit2, Trash2, X, Check, Mail, ChevronDown } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

interface Supplier {
  id: string; name: string; type: string
  contact: string | null; email: string | null
  phone: string | null; website: string | null
  status: string; notes: string | null; createdAt: string
}

interface SupplierMessage {
  id: string; subject: string; purpose: string; status: string; sentAt: string
}

const EMPTY: Omit<Supplier, 'id' | 'createdAt'> = {
  name: '', type: '', contact: '', email: '', phone: '', website: '', status: 'active', notes: '',
}

const SEED = [
  { name: 'Hotelbeds',     type: 'Activities & Hotels',  contact: 'integrations.btb@hotelbeds.com',  status: 'active', notes: 'TEST environment — certification pending' },
  { name: 'Duffel',        type: 'Flights',              contact: 'api@duffel.com',                  status: 'active', notes: 'Live API connected' },
  { name: 'Stripe',        type: 'Payments',             contact: 'support@stripe.com',              status: 'active', notes: 'Live' },
  { name: 'Flutterwave',   type: 'Payments',             contact: 'developers@flutterwave.com',      status: 'active', notes: 'Live' },
  { name: 'Viator',        type: 'Tours & Activities',   contact: 'partners@viator.com',             status: 'active', notes: 'Affiliate integration' },
  { name: 'TravelPayouts', type: 'Affiliate Network',    contact: 'support@travelpayouts.com',       status: 'active', notes: 'Marker: 539656' },
  { name: 'Resend',        type: 'Email Service',        contact: 'support@resend.com',              status: 'active', notes: 'bookings@walztravels.com sender' },
  { name: 'Supabase',      type: 'Database & Storage',   contact: 'support@supabase.com',            status: 'active', notes: 'Production DB' },
]

const PURPOSE_LABELS: Record<string, string> = {
  discount_request:  'Group/volume discount request',
  special_request:   'Special request confirmation',
  upgrade_ask:       'Upgrade availability enquiry',
  general_followup:  'General follow-up',
  other:             'Other',
}

const STATUS_COLORS: Record<string, string> = {
  sent:   'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  replied:'bg-green-100 text-green-700',
}

// ── Message panel ─────────────────────────────────────────────────────────────
function MessagePanel({ supplier, bookingId, onClose }: {
  supplier: Supplier; bookingId?: string; onClose: () => void
}) {
  const [purpose, setPurpose]     = useState('discount_request')
  const [mode, setMode]           = useState<'template' | 'ai_draft'>('template')
  const [aiPrompt, setAiPrompt]   = useState('')
  const [subject, setSubject]     = useState('')
  const [body, setBody]           = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [history, setHistory]     = useState<SupplierMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const hasEmail = !!(supplier.email || (supplier.contact && supplier.contact.includes('@')))

  useEffect(() => {
    loadHistory()
    if (hasEmail) previewTemplate(purpose)
  }, [])

  async function loadHistory() {
    setHistoryLoading(true)
    const res = await fetch(`/api/admin/suppliers/${supplier.id}/message`)
    const d = await res.json()
    setHistory(d.messages ?? [])
    setHistoryLoading(false)
  }

  async function previewTemplate(p: string) {
    setError('')
    const res = await fetch(`/api/admin/suppliers/${supplier.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'template', purpose: p, bookingId }),
    })
    const d = await res.json()
    if (d.draft) { setSubject(d.draft.subject); setBody(d.draft.body) }
  }

  async function generateAi() {
    if (!aiPrompt.trim()) return
    setGenerating(true); setError('')
    try {
      const res = await fetch(`/api/admin/suppliers/${supplier.id}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ai_draft', purpose, prompt: aiPrompt, bookingId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSubject(d.draft.subject); setBody(d.draft.body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setGenerating(false) }
  }

  async function send() {
    if (!subject.trim() || !body.trim()) { setError('Subject and message are required'); return }
    setSending(true); setError('')
    try {
      const res = await fetch(`/api/admin/suppliers/${supplier.id}/message`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'send', purpose, subject, messageBody: body, bookingId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSuccess(true)
      await loadHistory()
      setSubject(''); setBody(''); setAiPrompt('')
      setTimeout(() => setSuccess(false), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSending(false) }
  }

  async function markReplied(messageId: string) {
    setMarkingId(messageId)
    await fetch(`/api/admin/suppliers/${supplier.id}/message`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, status: 'replied' }),
    })
    await loadHistory()
    setMarkingId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="font-bold text-[#0B1F3A] text-sm">Message {supplier.name}</p>
            {hasEmail ? (
              <p className="text-xs text-gray-500">{supplier.email || supplier.contact}</p>
            ) : (
              <p className="text-xs text-red-500">No contact email on file</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {!hasEmail && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              This supplier has no contact email. Add one by editing the supplier record before sending.
            </div>
          )}

          {hasEmail && (
            <>
              {/* Purpose */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Purpose</label>
                <select value={purpose} onChange={e => { setPurpose(e.target.value); if (mode === 'template') previewTemplate(e.target.value) }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]">
                  {Object.entries(PURPOSE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {(['template', 'ai_draft'] as const).map(m => (
                  <button key={m} onClick={() => { setMode(m); if (m === 'template') previewTemplate(purpose) }}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${mode === m ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    {m === 'template' ? 'Template' : 'AI draft'}
                  </button>
                ))}
              </div>

              {/* AI prompt */}
              {mode === 'ai_draft' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-600">Instruction for AI</label>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={2}
                    placeholder="e.g. Ask for a late checkout for our client who has an evening flight"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
                  <button onClick={generateAi} disabled={generating || !aiPrompt.trim()}
                    className="w-full py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0B1F3A]/90 disabled:opacity-50 flex items-center justify-center gap-2">
                    {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</> : 'Generate draft'}
                  </button>
                  <p className="text-[11px] text-gray-400">Draft shown below for review. You can edit before sending.</p>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#C9A84C]" />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={12}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:border-[#C9A84C] resize-y" />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
              )}
              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
                  Message sent and logged successfully.
                </div>
              )}

              <button onClick={send} disabled={sending || !subject.trim() || !body.trim()}
                className="w-full py-2.5 bg-[#C9A84C] text-white text-sm font-bold rounded-xl hover:bg-[#b8943f] disabled:opacity-50 flex items-center justify-center gap-2">
                {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4" /> Send message</>}
              </button>
            </>
          )}

          {/* Message history */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Message history</p>
            {historyLoading ? (
              <div className="py-4 text-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" /></div>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No messages sent yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(m => (
                  <div key={m.id} className="bg-gray-50 rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#0B1F3A] truncate">{m.subject}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {PURPOSE_LABELS[m.purpose] ?? m.purpose} · {new Date(m.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[m.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {m.status}
                      </span>
                      {m.status === 'sent' && (
                        <button onClick={() => markReplied(m.id)} disabled={markingId === m.id}
                          className="text-[11px] text-gray-400 hover:text-green-600 transition-colors">
                          {markingId === m.id ? '…' : 'Mark replied'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  const { can }                   = useStaffPermissions()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<Supplier | null>(null)
  const [form, setForm]           = useState<typeof EMPTY>(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [messaging, setMessaging] = useState<Supplier | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/suppliers')
    const d   = await res.json()
    let list  = d.suppliers ?? []
    if (list.length === 0) {
      const seed = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: SEED }),
      })
      const s = await seed.json()
      list = s.suppliers ?? []
    }
    setSuppliers(list)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const canEdit = can('settings_edit')

  function openAdd() { setForm(EMPTY); setEditing(null); setModal('add') }

  function openEdit(s: Supplier) {
    setForm({ name: s.name, type: s.type, contact: s.contact ?? '', email: s.email ?? '', phone: s.phone ?? '', website: s.website ?? '', status: s.status, notes: s.notes ?? '' })
    setEditing(s); setModal('edit')
  }

  async function save() {
    setSaving(true)
    if (modal === 'add') {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const d = await res.json()
      if (d.supplier) setSuppliers(prev => [d.supplier, ...prev])
    } else if (modal === 'edit' && editing) {
      const res = await fetch(`/api/admin/suppliers/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const d = await res.json()
      if (d.supplier) setSuppliers(prev => prev.map(s => s.id === editing.id ? d.supplier : s))
    }
    setSaving(false); setModal(null)
  }

  async function remove(id: string) {
    if (!confirm('Delete this supplier?')) return
    await fetch(`/api/admin/suppliers/${id}`, { method: 'DELETE' })
    setSuppliers(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Suppliers & Partners</h1>
          <p className="text-sm text-gray-400 mt-0.5">{suppliers.length} integrations and supplier contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:border-[#C9A84C] transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canEdit && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold hover:bg-[#0B1F3A]/90 transition-colors">
              <Plus className="w-4 h-4" /> Add Supplier
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map(s => {
            const hasEmail = !!(s.email || (s.contact && s.contact.includes('@')))
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#0B1F3A] rounded-xl flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-[#C9A84C]" />
                    </div>
                    <div>
                      <p className="font-bold text-[#0B1F3A]">{s.name}</p>
                      <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.status}
                    </span>
                    <button onClick={() => setMessaging(s)}
                      className={`p-1.5 transition-colors ${hasEmail ? 'text-[#C9A84C] hover:text-[#0B1F3A]' : 'text-gray-200 cursor-not-allowed'}`}
                      title={hasEmail ? 'Message supplier' : 'No email on file'}>
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                    {canEdit && (
                      <>
                        <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {s.email   && <p className="text-xs text-gray-500 mt-3">✉️ {s.email}</p>}
                {s.contact && !s.email && <p className="text-xs text-gray-500 mt-3">📧 {s.contact}</p>}
                {s.phone   && <p className="text-xs text-gray-500">📱 {s.phone}</p>}
                {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-[#C9A84C] hover:underline">🔗 {s.website}</a>}
                {s.notes   && <p className="text-xs text-gray-400 mt-2 italic">{s.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A]">{modal === 'add' ? 'Add Supplier' : 'Edit Supplier'}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(['name', 'type', 'email', 'contact', 'phone', 'website'] as const).map(field => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 capitalize">
                    {field === 'email' ? 'Email (for outreach)' : field === 'contact' ? 'Contact / phone notes' : field}
                  </label>
                  <input value={form[field] ?? ''} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    type={field === 'email' ? 'email' : 'text'}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C]">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                <textarea value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] resize-none" />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving || !form.name}
                className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold hover:bg-[#0B1F3A]/90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {modal === 'add' ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message panel */}
      {messaging && <MessagePanel supplier={messaging} onClose={() => setMessaging(null)} />}
    </div>
  )
}
