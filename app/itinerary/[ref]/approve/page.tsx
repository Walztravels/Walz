'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useParams } from 'next/navigation'

export default function ApprovePage() {
  const params       = useParams<{ ref: string }>()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token') ?? ''
  const ref          = params.ref

  const [name, setName]       = useState('')
  const [agreed, setAgreed]   = useState(false)
  const [submitting, setSub]  = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')
  const [itinTitle, setItinTitle] = useState('')

  useEffect(() => {
    // Pre-fetch itinerary title for display
    fetch(`/api/itinerary/${ref}/meta`)
      .then(r => r.json())
      .then((d: { title?: string }) => { if (d.title) setItinTitle(d.title) })
      .catch(() => {})
  }, [ref])

  const submit = async () => {
    if (!name.trim()) { setError('Please enter your full name'); return }
    if (!agreed) { setError('Please confirm you have read and agree to the itinerary'); return }
    setSub(true); setError('')
    try {
      const res  = await fetch(`/api/itinerary/${ref}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signature: name.trim(), name: name.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (res.ok && data.ok) {
        setDone(true)
      } else {
        setError(data.error ?? 'Something went wrong. Please contact us.')
      }
    } catch {
      setError('Network error. Please try again or contact us.')
    } finally {
      setSub(false)
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow text-center">
          <p className="text-red-500 font-semibold">Invalid approval link — token missing.</p>
          <p className="text-gray-400 text-sm mt-2">Please use the link from your itinerary email.</p>
        </div>
      </main>
    )
  }

  if (done) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[#0B1F3A] font-bold text-2xl mb-3">Booking Confirmed!</h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Thank you, <strong>{name}</strong>. Your approval has been recorded and a confirmation email is on its way.
          </p>
          <a
            href={`/itinerary/${ref}`}
            className="inline-block bg-[#C9A84C] text-[#0B1F3A] font-bold px-6 py-3 rounded-xl text-sm hover:bg-amber-400 transition"
          >
            View Your Itinerary →
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-[#0B1F3A] py-4 px-6">
        <div className="max-w-xl mx-auto">
          <img src="/walz-logo.png" alt="Walz Travels" className="h-7" />
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="mb-8">
            <p className="text-amber-600 text-xs font-bold uppercase tracking-widest mb-2">Itinerary Approval</p>
            <h1 className="text-[#0B1F3A] font-bold text-2xl mb-1">{itinTitle || 'Review & Approve'}</h1>
            <p className="text-gray-500 text-sm">
              Please review your itinerary and confirm your approval below. This is your binding agreement to proceed.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-amber-800 text-sm">
              <strong>Before approving:</strong> make sure you have read the full itinerary including the pricing,
              day-by-day plan, flights, accommodation, and terms &amp; conditions.
            </p>
            <a
              href={`/itinerary/${ref}`}
              target="_blank"
              rel="noreferrer"
              className="text-amber-700 font-semibold text-sm underline mt-2 inline-block"
            >
              Open itinerary in new tab →
            </a>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Full name (as it appears on your passport)
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Amara Johnson"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0"
              />
              <span className="text-sm text-gray-600 leading-relaxed">
                I confirm that I have read the full itinerary including the day-by-day plan, flights, hotels,
                pricing, and terms &amp; conditions, and I approve this booking.
              </span>
            </label>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              onClick={submit}
              disabled={submitting}
              className="w-full bg-[#0B1F3A] hover:bg-[#162d52] text-white font-bold py-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Confirming…</>
                : '✅ Approve & Confirm Booking'}
            </button>

            <p className="text-gray-400 text-xs text-center">
              By approving, you confirm that you have read and agreed to all terms and conditions.
              Your name above serves as your electronic signature.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
