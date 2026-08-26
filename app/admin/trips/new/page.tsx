'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, FileText } from 'lucide-react'

function generateRef(): string {
  return 'WALZ-TRIP-' + Math.random().toString(36).slice(2, 8).toUpperCase()
}

export default function NewTripWorkspacePage() {
  const router = useRouter()
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    clientName: '',
    clientEmail: '',
    departDate: '',
    returnDate: '',
    destination: '',
    notes: '',
  })

  useEffect(() => {
    setReference(generateRef())
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Trip title is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, ...form }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Server error ${res.status}`)
      }
      router.push(`/admin/trips/${reference}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#061320] text-white">
      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Back link */}
        <Link
          href="/admin/trips"
          className="inline-flex items-center gap-2 text-sm text-[#C9A84C] hover:text-[#e0be70] mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Trips
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Create Trip Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">
            A master workspace for grouping bookings, itinerary, and documents.
          </p>
        </div>

        {/* Reference badge */}
        <div className="flex items-center gap-3 mb-8 bg-[#0a1929] border border-[#1a2f4a] rounded-xl p-4">
          <FileText className="w-5 h-5 text-[#C9A84C] flex-shrink-0" />
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Trip Reference</p>
            <p className="font-mono font-bold text-[#C9A84C] text-base tracking-wider">{reference || '—'}</p>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-[#0a1929] border border-[#1a2f4a] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Trip title */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                Trip Title <span className="text-[#C9A84C]">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Dubai Family Holiday 2026"
                required
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>

            {/* Client name + email */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                  Client Name
                </label>
                <input
                  type="text"
                  name="clientName"
                  value={form.clientName}
                  onChange={handleChange}
                  placeholder="John Smith"
                  className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                  Client Email
                </label>
                <input
                  type="email"
                  name="clientEmail"
                  value={form.clientEmail}
                  onChange={handleChange}
                  placeholder="john@example.com"
                  className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
                />
              </div>
            </div>

            {/* Travel dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                  Depart Date
                </label>
                <input
                  type="date"
                  name="departDate"
                  value={form.departDate}
                  onChange={handleChange}
                  className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                  Return Date
                </label>
                <input
                  type="date"
                  name="returnDate"
                  value={form.returnDate}
                  onChange={handleChange}
                  className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Destination */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                Destination
              </label>
              <input
                type="text"
                name="destination"
                value={form.destination}
                onChange={handleChange}
                placeholder="e.g. Dubai, UAE"
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              />
            </div>

            {/* Internal notes */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
                Internal Notes
              </label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={4}
                placeholder="Any internal notes for this trip workspace..."
                className="w-full bg-[#061320] border border-[#1a2f4a] rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#C9A84C] hover:bg-[#e0be70] disabled:opacity-60 disabled:cursor-not-allowed text-[#061320] font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Workspace…
                </>
              ) : (
                'Create Trip Workspace'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
