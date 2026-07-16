'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams }                        from 'next/navigation'
import { CheckCircle, AlertCircle, Loader2, MessageCircle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type Stage = 'loading' | 'confirmed' | 'error'

function CryptoReturnContent() {
  const searchParams = useSearchParams()
  const ref          = searchParams.get('ref')

  const [stage, setStage] = useState<Stage>('loading')
  const called            = useRef(false)

  useEffect(() => {
    if (!ref || called.current) return
    called.current = true

    // The booking was already created by /api/flights/crypto-invoice before the
    // redirect. We just need to mark it as pending_review now the user is back.
    fetch('/api/flights/crypto-confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ref }),
    })
      .then(r => r.json())
      .then(data => setStage(data.success ? 'confirmed' : 'error'))
      .catch(() => setStage('error'))
  }, [ref])

  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#C9A84C] animate-spin mx-auto mb-4" />
          <p className="text-white/70 text-sm">Confirming your payment…</p>
        </div>
      </div>
    )
  }

  if (stage === 'confirmed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A] p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-xl">
          <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Payment Received!</h1>
          <p className="text-gray-600 mb-4">
            Your crypto payment has been received. Our team will confirm your flight booking
            within 2 business hours.
          </p>
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-sm text-gray-600">
            Booking reference: <span className="font-mono font-bold text-[#0B1F3A]">{ref}</span>
          </div>
          <p className="text-gray-500 text-sm mb-6">
            You'll receive a confirmation email with your e-ticket once the booking is placed.
          </p>
          <a
            href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi! I've paid for my flight with crypto. Reference: ${ref}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition-colors mb-3"
          >
            <MessageCircle className="w-4 h-4" />
            Message us on WhatsApp
          </a>
          <Link href="/flights" className="block text-sm text-gray-400 hover:text-[#0B1F3A] transition-colors">
            Search more flights
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-xl">
        <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Booking Issue</h1>
        <p className="text-gray-600 mb-4">
          We received your payment but had trouble saving your booking. Please contact us
          immediately with your reference.
        </p>
        {ref && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-sm text-gray-600">
            Reference: <span className="font-mono font-bold text-[#0B1F3A]">{ref}</span>
          </div>
        )}
        <a
          href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi! I paid with crypto for my flight but the booking failed. Reference: ${ref || 'unknown'}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-[#0B1F3A] hover:bg-[#1a3358] text-white font-semibold py-3 rounded-xl transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          Contact Support
        </a>
      </div>
    </div>
  )
}

export default function FlightCryptoReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A]">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    }>
      <CryptoReturnContent />
    </Suspense>
  )
}
