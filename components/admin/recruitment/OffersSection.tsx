'use client'
import { useState, useEffect, useCallback } from 'react'
import { BadgeCheck, Plus } from 'lucide-react'

/**
 * Offers for one application: draft (management-only), send with a
 * personal token link, track the candidate's recorded response, withdraw.
 * The pipeline stage is never moved from here — staff act on responses.
 */

interface Offer {
  id: string; status: string; jobTitle: string; compensationType: string
  compensationAmount: string | number | null; currency: string
  compensationNotes: string | null; startDate: string | null; terms: string | null
  tokenExpiresAt: string | null; createdBy: string; sentAt: string | null
  respondedAt: string | null; candidateNote: string | null; createdAt: string
}

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-500',
  sent:      'bg-blue-50 text-blue-600',
  accepted:  'bg-green-50 text-green-700',
  declined:  'bg-amber-50 text-amber-700',
  withdrawn: 'bg-gray-100 text-gray-400',
  expired:   'bg-gray-100 text-gray-400',
}

export default function OffersSection({ applicationId }: { applicationId: string }) {
  const [offers,   setOffers]   = useState<Offer[]>([])
  const [error,    setError]    = useState('')
  const [notice,   setNotice]   = useState('')
  const [busy,     setBusy]     = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    compensationType: 'commission', compensationAmount: '', currency: 'NGN',
    compensationNotes: '', startDate: '', terms: '',
  })

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/offers`)
      const data = await res.json()
      if (res.ok) setOffers(data.offers ?? [])
    } catch { /* stays empty */ }
  }, [applicationId])
  useEffect(() => { void load() }, [load])

  async function createDraft() {
    setBusy(true); setError(''); setNotice('')
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/offers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        compensationAmount: form.compensationAmount || undefined,
        startDate: form.startDate || undefined,
      }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed to create offer'); return }
    setShowForm(false)
    setNotice('Draft offer created — review it below, then send.')
    await load()
  }

  async function act(offerId: string, action: 'send' | 'withdraw') {
    const messages = {
      send: 'Send this offer to the candidate now? They will receive an email with a personal link to accept or decline.',
      withdraw: 'Withdraw this offer? The candidate link stops working.',
    }
    if (!confirm(messages[action])) return
    setBusy(true); setError(''); setNotice('')
    const res  = await fetch(`/api/admin/recruitment/applications/${applicationId}/offers`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId, action }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Action failed'); return }
    if (action === 'send') {
      setNotice(data.emailed
        ? 'Offer sent and emailed to the candidate.'
        : 'Offer marked sent, but the email could not be delivered — contact the candidate manually.')
    }
    await load()
  }

  const fmt = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—'
  const money = (o: Offer) => {
    const n = Number(o.compensationAmount)
    return o.compensationAmount && Number.isFinite(n) ? `${o.currency} ${n.toLocaleString('en-GB')}` : null
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-1.5">
          <BadgeCheck className="w-4 h-4 text-[#C9A84C]" /> Offers
        </h2>
        <button onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-bold text-[#0B1F3A] bg-[#C9A84C] px-3 py-1.5 rounded-lg">
          <Plus className="w-3.5 h-3.5" /> Draft offer
        </button>
      </div>
      {error  && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {notice && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{notice}</p>}

      {showForm && (
        <div className="border border-gray-100 rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-gray-500">Compensation type
              <select value={form.compensationType}
                onChange={e => setForm(f => ({ ...f, compensationType: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                <option value="salary">Salary</option><option value="hourly">Hourly</option>
                <option value="commission">Commission</option><option value="mixed">Mixed</option>
              </select>
            </label>
            <label className="text-xs text-gray-500">Amount (optional)
              <input type="number" min={0} value={form.compensationAmount}
                onChange={e => setForm(f => ({ ...f, compensationAmount: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
            <label className="text-xs text-gray-500">Currency
              <input value={form.currency} maxLength={3}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
          </div>
          <label className="text-xs text-gray-500 block">Compensation details
            <textarea value={form.compensationNotes} rows={2} maxLength={5000}
              onChange={e => setForm(f => ({ ...f, compensationNotes: e.target.value }))}
              placeholder="e.g. commission structure, bonuses, review period…"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Proposed start date
              <input type="date" value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
            </label>
          </div>
          <label className="text-xs text-gray-500 block">Terms
            <textarea value={form.terms} rows={4} maxLength={10000}
              onChange={e => setForm(f => ({ ...f, terms: e.target.value }))}
              placeholder="Key terms the candidate should read before responding…"
              className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5" />
          </label>
          <button onClick={() => void createDraft()} disabled={busy}
            className="text-sm font-bold bg-[#0B1F3A] text-white px-4 py-2 rounded-xl disabled:opacity-40">
            {busy ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      )}

      {offers.length === 0 && !showForm && <p className="text-xs text-gray-300">No offers yet.</p>}

      {offers.map(o => (
        <div key={o.id} className="border border-gray-100 rounded-xl p-4 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-sm font-semibold text-[#0B1F3A]">{o.jobTitle}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[o.status] ?? STATUS_STYLE.draft}`}>{o.status}</span>
            <span className="text-gray-400">
              {o.compensationType}{money(o) ? ` · ${money(o)}` : ''} · drafted by {o.createdBy}
              {o.sentAt ? ` · sent ${fmt(o.sentAt)}` : ''}
              {o.respondedAt ? ` · answered ${fmt(o.respondedAt)}` : ''}
            </span>
          </div>
          {o.candidateNote && (
            <p className="text-xs text-gray-500 bg-[#F5F0E8]/60 rounded-lg px-3 py-2">
              <span className="font-semibold">Candidate note:</span> {o.candidateNote}
            </p>
          )}
          <div className="flex gap-1.5">
            {o.status === 'draft' && (
              <button onClick={() => void act(o.id, 'send')} disabled={busy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#C9A84C] text-[#0B1F3A] disabled:opacity-40">
                Send to candidate
              </button>
            )}
            {(o.status === 'draft' || o.status === 'sent') && (
              <button onClick={() => void act(o.id, 'withdraw')} disabled={busy}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-red-500 disabled:opacity-40">
                Withdraw
              </button>
            )}
            {(o.status === 'accepted' || o.status === 'declined') && (
              <p className="text-[10px] text-gray-400">Response recorded — move the pipeline stage above to act on it.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
