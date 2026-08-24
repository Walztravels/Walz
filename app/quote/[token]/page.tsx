'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const SYM: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', AED: 'AED ', CAD: 'CA$' }
function fmt(amount: string, currency: string) {
  const n = parseFloat(amount)
  const sym = SYM[currency.toUpperCase()] ?? currency + ' '
  return `${sym}${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtDate(d: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(d))
}

const CABIN_LABELS: Record<string, string> = {
  ECONOMY:         'Economy',
  PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS:        'Business',
  FIRST:           'First Class',
}

interface QuoteData {
  id:            string
  status:        string
  clientName:    string | null
  origin:        string
  destination:   string
  departureDate: string
  returnDate:    string | null
  airline:       string
  cabinClass:    string
  displayPrice:  string
  currency:      string
  expiresAt:     string
}

type PageState = 'loading' | 'ready' | 'approving' | 'approved' | 'already_approved' | 'expired' | 'error'

export default function FlightQuotePage() {
  const { token } = useParams<{ token: string }>()
  const [quote,    setQuote]    = useState<QuoteData | null>(null)
  const [state,    setState]    = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/flight-quote/${token}`)
        const d = await r.json()

        if (r.status === 410) {
          setState('expired'); setErrorMsg(d.error); return
        }
        if (!r.ok) {
          setState('error'); setErrorMsg(d.error ?? 'Unable to load quote.'); return
        }

        if (d.status === 'approved' || d.status === 'booked') {
          setQuote(d); setState('already_approved'); return
        }

        setQuote(d)
        setState('ready')
      } catch {
        setState('error')
        setErrorMsg('Could not load quote. Please try again.')
      }
    }
    void load()
  }, [token])

  async function handleApprove() {
    setState('approving')
    try {
      const r = await fetch(`/api/flight-quote/${token}`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Approval failed')
      setState('approved')
    } catch (err) {
      setState('ready')
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed. Please try again.')
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading your quote…</p>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (state === 'error' || state === 'expired') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {state === 'expired' ? 'Quote Expired' : 'Quote Not Available'}
          </h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
          <p className="mt-5 text-xs text-gray-400">
            Contact <a href="mailto:contact@walztravels.com" className="text-[#C9A84C]">contact@walztravels.com</a> for help.
          </p>
        </div>
      </div>
    )
  }

  // ── Already approved ──────────────────────────────────────────────────────
  if (state === 'already_approved') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Already Approved</h2>
          <p className="text-gray-500 text-sm">
            You have already approved this quote. Your travel agent will be in touch to confirm the booking.
          </p>
        </div>
      </div>
    )
  }

  // ── Approved (just now) ───────────────────────────────────────────────────
  if (state === 'approved') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Quote Approved!</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Thank you for approving your flight quote. Your Walz Travels agent has been notified
            and will contact you shortly to collect your travel details and confirm the booking.
          </p>
          <p className="mt-5 text-xs text-gray-400">
            Questions? <a href="mailto:contact@walztravels.com" className="text-[#C9A84C]">contact@walztravels.com</a>
          </p>
        </div>
      </div>
    )
  }

  // ── Ready / Approving ─────────────────────────────────────────────────────
  if (!quote) return null

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {/* Header */}
      <div className="bg-[#0A1628] py-4 px-6">
        <img src="/walz-logo.png" alt="Walz Travels" className="h-8" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Title */}
        <div className="text-center mb-8">
          <p className="text-xs text-[#C9A84C] font-semibold uppercase tracking-widest mb-2">Flight Quote</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {quote.origin} → {quote.destination}
          </h1>
          {quote.clientName && (
            <p className="text-gray-500 text-sm">Prepared for {quote.clientName}</p>
          )}
        </div>

        {/* Quote card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          {/* Price */}
          <div className="mb-6 pb-6 border-b border-gray-100">
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Total Price</p>
            <p className="text-4xl font-bold text-gray-900 tabular-nums">
              {fmt(quote.displayPrice, quote.currency)}
            </p>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-y-4 text-sm mb-6">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">From</p>
              <p className="font-mono font-bold text-gray-900">{quote.origin}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">To</p>
              <p className="font-mono font-bold text-gray-900">{quote.destination}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Departure</p>
              <p className="font-semibold text-gray-900">{fmtDate(quote.departureDate)}</p>
            </div>
            {quote.returnDate && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Return</p>
                <p className="font-semibold text-gray-900">{fmtDate(quote.returnDate)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Airline</p>
              <p className="font-semibold text-gray-900">{quote.airline}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cabin</p>
              <p className="font-semibold text-gray-900">{CABIN_LABELS[quote.cabinClass] ?? quote.cabinClass}</p>
            </div>
          </div>

          {/* Expiry note */}
          <p className="text-xs text-gray-400 mb-6">
            Quote valid until {fmtDate(quote.expiresAt)}
          </p>

          {/* Error */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              {errorMsg}
            </div>
          )}

          {/* Approve button */}
          <button
            onClick={handleApprove}
            disabled={state === 'approving'}
            className="w-full bg-[#C9A84C] text-[#0A1628] font-bold text-base py-4 rounded-xl hover:bg-[#b8973d] disabled:opacity-50 transition-colors"
          >
            {state === 'approving' ? 'Submitting approval…' : 'Approve This Quote'}
          </button>

          <p className="text-xs text-center text-gray-400 mt-4">
            Approving this quote does not charge your card. Your travel agent will
            contact you to collect payment details.
          </p>
        </div>

        {/* Trust marks */}
        <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
          <span>🔒 Secure</span>
          <span>✈️ 400+ Airlines</span>
          <span>🌍 Walz Travels</span>
        </div>
      </div>
    </div>
  )
}
