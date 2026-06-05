'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, AlertCircle, Loader2, Smartphone, Calendar } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface BookingResult {
  bookingReference: string
  tourName: string
  tourSlug: string
  tourLocation: string
  date: string
  groupSize: number
  firstName: string
  lastName: string
  email: string
  totalAmount: number
  currency: string
  addons: { id: string; name: string; price: number }[]
}

function fmt(n: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function ReturnContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [result, setResult] = useState<BookingResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!sessionId) { setErrorMsg('No payment session found.'); setState('error'); return }

    fetch(`/api/tours/stripe-verify?session_id=${sessionId}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Verification failed')
        setResult(data)
        setState('success')
      })
      .catch((err) => {
        setErrorMsg(err.message ?? 'Something went wrong. Please contact us.')
        setState('error')
      })
  }, [sessionId])

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#C9A84C]" />
        <p className="text-gray-500 text-sm font-medium">Confirming your booking…</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#0B1F3A] mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>
          <p className="text-gray-500 text-sm mb-6">
            If your payment went through, don&apos;t worry — contact us with your payment reference and we&apos;ll sort it immediately.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="https://wa.me/447398753797"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold py-3.5 rounded-xl transition-colors"
            >
              <Smartphone className="w-4 h-4" /> Contact Us on WhatsApp
            </a>
            <a
              href="/tours"
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              ← Back to tours
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (!result) return null

  const waMsg = `Hi! I just booked ${result.tourName}. My booking reference is ${result.bookingReference}. Date: ${fmtDate(result.date)}`

  function addToCalendar() {
    const d = result!.date.replace(/-/g, '')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(result!.tourName)}&dates=${d}T090000/${d}T180000&details=${encodeURIComponent('Walz Travels booking. Ref: ' + result!.bookingReference)}&location=${encodeURIComponent(result!.tourLocation)}`
    window.open(url, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-10">

        {/* Success icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Booking Confirmed! 🎉</h1>
          <p className="text-gray-500 text-sm">
            A confirmation has been sent to <span className="font-medium">{result.email}</span>
          </p>
        </div>

        {/* Booking reference */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex flex-col items-center bg-[#0B1F3A] rounded-2xl px-10 py-5">
            <span className="text-white/60 text-xs tracking-wider uppercase mb-1">Booking Reference</span>
            <span className="text-[#C9A84C] font-mono text-2xl font-bold tracking-widest">
              {result.bookingReference}
            </span>
          </div>
        </div>

        {/* Tour details */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm mb-4">
          <h3 className="font-bold text-[#0B1F3A] mb-4">Your Booking</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Tour</span>
              <span className="font-semibold text-right max-w-[55%]">{result.tourName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Date</span>
              <span className="font-semibold">{fmtDate(result.date)}</span>
            </div>
            {result.tourLocation && (
              <div className="flex justify-between">
                <span className="text-gray-400">Location</span>
                <span className="font-semibold">{result.tourLocation}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Group</span>
              <span className="font-semibold">{result.groupSize} {result.groupSize === 1 ? 'person' : 'people'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Lead traveller</span>
              <span className="font-semibold">{result.firstName} {result.lastName}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-3">
              <span className="font-bold text-[#0B1F3A]">Total Paid</span>
              <span className="font-bold text-[#C9A84C] text-lg">{fmt(result.totalAmount, result.currency)}</span>
            </div>
          </div>
        </div>

        {/* What happens next */}
        <div className="bg-[#0B1F3A]/5 border border-[#0B1F3A]/10 rounded-2xl p-5 mb-6">
          <h3 className="font-bold text-[#0B1F3A] mb-3">What happens next?</h3>
          <div className="space-y-3 text-sm text-gray-600">
            {[
              'Our team will contact you within 2 hours to confirm all details.',
              "You'll receive your full itinerary, guide info and meeting point by email and WhatsApp.",
              'Your guide will meet you at the agreed location on the day.',
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#C9A84C] text-[#0B1F3A] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <a
            href={`https://wa.me/447398753797?text=${encodeURIComponent(waMsg)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bc59] text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            <Smartphone className="w-4 h-4" /> WhatsApp Us
          </a>
          <button
            onClick={addToCalendar}
            className="flex-1 flex items-center justify-center gap-2 border-2 border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            <Calendar className="w-4 h-4" /> Add to Calendar
          </button>
        </div>

        <div className="text-center">
          <a href="/tours" className="text-sm text-gray-400 hover:text-gray-600 underline">← Explore more tours</a>
        </div>
      </div>
    </div>
  )
}

export default function ReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <ReturnContent />
    </Suspense>
  )
}
