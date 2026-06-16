'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Download, MessageCircle, Loader2 } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId    = searchParams.get('session_id')
  const gateway      = searchParams.get('gateway') ?? 'stripe'
  const txRef        = searchParams.get('tx_ref')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId && gateway !== 'flutterwave') { setLoading(false); return }
    fetch('/api/checkout/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sessionId, gateway, txRef }),
    })
      .then(r => r.json())
      .then(d => { setBooking(d); setLoading(false) })
      .catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
      <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
    </div>
  )

  const ref = booking?.bookingReference ?? ('WLZ-' + Date.now().toString(36).toUpperCase())

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-[#0B1F3A] mb-2">Booking Confirmed!</h1>
        <p className="text-gray-400 text-sm mb-2">Your booking reference is:</p>
        <p className="font-mono font-bold text-[#C9A84C] text-2xl mb-6">{ref}</p>
        <p className="text-gray-400 text-sm mb-8">
          Your vouchers and confirmation have been sent to your email and WhatsApp.
        </p>
        <div className="flex flex-col gap-3">
          {booking?.voucherUrl && (
            <a href={booking.voucherUrl}
              className="flex items-center justify-center gap-2 bg-[#0B1F3A] text-white
                font-bold py-3 rounded-xl text-sm hover:bg-[#162d52] transition-colors">
              <Download className="w-4 h-4" /> Download Voucher (PDF)
            </a>
          )}
          <a href="https://wa.me/447398753797" target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 bg-green-500 text-white
              font-bold py-3 rounded-xl text-sm hover:bg-green-600 transition-colors">
            <MessageCircle className="w-4 h-4" /> Chat with our team
          </a>
          <a href="/"
            className="text-gray-400 text-sm hover:text-[#0B1F3A] transition-colors mt-1">
            Back to homepage
          </a>
        </div>
      </div>
    </div>
  )
}

export default function BookingSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
