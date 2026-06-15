'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, MessageCircle, ArrowLeft, Loader2 } from 'lucide-react'

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const sessionId    = searchParams.get('session_id')

  const [session, setSession] = useState<{
    metadata?: Record<string, string>
    status?: string
    amountTotal?: number
    currency?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    fetch(`/api/stripe/activity-checkout/session?id=${sessionId}`)
      .then(r => r.json())
      .then(d => { setSession(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [sessionId])

  if (loading) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
    </div>
  )

  const meta = session?.metadata ?? {}

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full bg-white rounded-3xl p-8 text-center shadow-sm">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Booking Confirmed!</h1>
        <p className="text-gray-500 text-sm mb-8">
          Your payment was successful. The Walz Travels team will be in touch shortly with your confirmation and travel details.
        </p>

        {meta.activityTitle && (
          <div className="bg-[#F5F0E8] rounded-2xl p-5 text-left mb-8">
            <p className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wider mb-3">
              Your Booking
            </p>
            <p className="font-bold text-[#0B1F3A] text-lg mb-1">{meta.activityTitle}</p>
            <div className="space-y-1 text-sm text-gray-500">
              {meta.location   && <p>📍 {meta.location}</p>}
              {meta.duration   && <p>⏱ {meta.duration}</p>}
              {meta.travelDate && <p>📅 Travel date: {meta.travelDate}</p>}
              {meta.adults     && <p>👤 {meta.adults} guest{Number(meta.adults) > 1 ? 's' : ''}</p>}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <a
            href={`https://wa.me/447398753797?text=${encodeURIComponent(
              `Hi Walz Travels! I just booked ${meta.activityTitle ?? 'an activity'} online. My name is ${meta.clientName ?? 'a client'}. Looking forward to it!`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 bg-[#C9A84C] text-[#0B1F3A]
              font-bold py-3.5 rounded-2xl hover:bg-[#b8973f] transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Message Us on WhatsApp
          </a>
          <Link
            href="/activities"
            className="flex items-center justify-center gap-2 border border-gray-200
              text-gray-500 py-3 rounded-2xl hover:bg-gray-50 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse More Experiences
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function BookingConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  )
}
