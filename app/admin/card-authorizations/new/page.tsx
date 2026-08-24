'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import Link from 'next/link'

const CURRENCIES = ['gbp', 'usd', 'eur', 'ngn', 'aed']

export default function NewCardAuthorizationPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    clientName:   '',
    clientEmail:  '',
    clientPhone:  '',
    amount:       '',
    currency:     'gbp',
    description:  '',
    bookingRef:   '',
    bookingId:    '',
    applicationId: '',
    notes:        '',
  })
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) { setError('Amount must be a positive number'); return }
    if (!form.clientEmail.includes('@')) { setError('Valid client email required'); return }

    setSending(true)
    try {
      const r = await fetch('/api/admin/card-authorizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount,
          bookingRef:    form.bookingRef    || undefined,
          bookingId:     form.bookingId     || undefined,
          applicationId: form.applicationId || undefined,
          clientPhone:   form.clientPhone   || undefined,
          notes:         form.notes         || undefined,
        }),
      })
      const d = await r.json() as { auth?: { id: string }; error?: string }
      if (!r.ok) { setError(d.error ?? 'Failed to create authorization'); return }
      router.push(`/admin/card-authorizations/${d.auth!.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/card-authorizations" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">New Card Authorisation</h1>
          <p className="text-gray-400 text-sm">The client will receive an email with a secure link to authorise their card.</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {/* Client details */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Client Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Full Name *</label>
              <input
                type="text"
                value={form.clientName}
                onChange={e => set('clientName', e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Email Address *</label>
              <input
                type="email"
                value={form.clientEmail}
                onChange={e => set('clientEmail', e.target.value)}
                required
                placeholder="jane@example.com"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Phone (optional)</label>
            <input
              type="tel"
              value={form.clientPhone}
              onChange={e => set('clientPhone', e.target.value)}
              placeholder="+44 7xxx xxxxxx"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        {/* Charge details */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Charge Details</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 block mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                required
                placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Currency *</label>
              <select
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#C9A84C]"
              >
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Description (shown to client) *</label>
            <input
              type="text"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              required
              placeholder="e.g. Flight booking deposit — Dubai, Dec 2026"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        {/* Reference links */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Reference (optional)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Booking Ref</label>
              <input
                type="text"
                value={form.bookingRef}
                onChange={e => set('bookingRef', e.target.value)}
                placeholder="WZ-2026-0001"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Booking ID</label>
              <input
                type="text"
                value={form.bookingId}
                onChange={e => set('bookingId', e.target.value)}
                placeholder="cuid from database"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Visa Application ID</label>
            <input
              type="text"
              value={form.applicationId}
              onChange={e => set('applicationId', e.target.value)}
              placeholder="cuid from database"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        {/* Internal notes */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Internal Notes (optional)</h2>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Notes visible only to staff…"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#C9A84C] resize-y"
          />
        </div>

        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Link
            href="/admin/card-authorizations"
            className="px-5 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 bg-[#C9A84C] hover:bg-amber-500 disabled:opacity-50 text-[#0A1628] font-semibold text-sm px-6 py-2 rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending…' : 'Send Authorisation Link'}
          </button>
        </div>
      </form>
    </div>
  )
}
