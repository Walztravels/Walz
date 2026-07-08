'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, AlertCircle, Loader2, MessageCircle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type Stage = 'loading' | 'confirmed' | 'pending' | 'error'

function CryptoReturnContent() {
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')

  const [stage, setStage] = useState<Stage>('loading')
  const [booking, setBooking] = useState<{ tourName?: string; firstName?: string } | null>(null)

  useEffect(() => {
    if (!ref) { setStage('error'); return }

    async function poll() {
      // Poll up to 5× (10s) for the IPN to land.
      // Blockchain confirmations can take minutes — if still pending,
      // we show a "we'll email you" message rather than spinning forever.
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`/api/tours/crypto-booking-status?ref=${ref}`)
        if (res.ok) {
          const data = await res.json() as { status: string; paymentStatus: string; tourName?: string; firstName?: string }
          setBooking({ tourName: data.tourName, firstName: data.firstName })
          if (data.paymentStatus === 'SUCCEEDED') { setStage('confirmed'); return }
          if (data.paymentStatus === 'FAILED' || data.paymentStatus === 'CANCELLED') { setStage('error'); return }
        }
        if (i < 4) await new Promise(r => setTimeout(r, 2000))
      }
      // Timed out polling — payment likely still confirming on-chain
      setStage('pending')
    }

    poll()
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
          <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Payment Confirmed!</h1>
          <p className="text-gray-600 mb-1">
            {booking?.firstName ? `Hi ${booking.firstName}, your` : 'Your'} booking is confirmed.
          </p>
          {booking?.tourName && (
            <p className="text-[#C9A84C] font-semibold mb-4">{booking.tourName}</p>
          )}
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-sm text-gray-600">
            Booking reference: <span className="font-mono font-bold text-[#0B1F3A]">{ref}</span>
          </div>
          <p className="text-gray-500 text-sm mb-6">
            A confirmation email is on its way. Our team will be in touch with your tour details.
          </p>
          <a
            href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi! I've just paid for my tour booking. Reference: ${ref}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition-colors mb-3"
          >
            <MessageCircle className="w-4 h-4" />
            Message us on WhatsApp
          </a>
          <Link href="/tours" className="block text-sm text-gray-400 hover:text-[#0B1F3A] transition-colors">
            Browse more tours
          </Link>
        </div>
      </div>
    )
  }

  if (stage === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A] p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-xl">
          <Clock className="w-14 h-14 text-[#C9A84C] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Payment Received</h1>
          <p className="text-gray-600 mb-4">
            Your crypto payment is awaiting blockchain confirmation — this usually takes 1–15 minutes.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800">
            Booking reference: <span className="font-mono font-bold">{ref}</span>
            <br />Keep this for your records.
          </div>
          <p className="text-gray-500 text-sm mb-6">
            We'll email you as soon as the payment clears. No further action needed.
          </p>
          <a
            href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi! I've sent a crypto payment for my tour. Reference: ${ref}. Please confirm when received.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Message us on WhatsApp
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1F3A] p-4">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-xl">
        <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Payment Issue</h1>
        <p className="text-gray-600 mb-4">
          We couldn't confirm your payment. If you completed the transaction, please contact us with your reference number.
        </p>
        {ref && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 text-sm text-gray-600">
            Reference: <span className="font-mono font-bold text-[#0B1F3A]">{ref}</span>
          </div>
        )}
        <a
          href={`https://wa.me/12317902336?text=${encodeURIComponent(`Hi! I have an issue with my crypto payment. Reference: ${ref || 'unknown'}`)}`}
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

export default function CryptoReturnPage() {
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
