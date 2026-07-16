'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams }               from 'next/navigation'
import Link                              from 'next/link'

function PaymentSuccessContent() {
  const searchParams   = useSearchParams()
  const status         = searchParams.get('status')
  const txRef          = searchParams.get('tx_ref')
  const transactionId  = searchParams.get('transaction_id')

  const [verified, setVerified] = useState<boolean | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!transactionId) {
      setLoading(false)
      return
    }

    fetch('/api/payments/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ transactionId, txRef }),
    })
      .then(r => r.json())
      .then(data => {
        setVerified(data.verified === true)
        setLoading(false)
      })
      .catch(() => {
        setVerified(status === 'completed' || status === 'successful')
        setLoading(false)
      })
  }, [transactionId, txRef, status])

  const isSuccess = status === 'completed' || status === 'successful' || verified === true

  return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">

        {loading ? (
          <>
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white/60 text-lg">Confirming your payment...</p>
          </>
        ) : isSuccess ? (
          <>
            <div className="w-24 h-24 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-white font-bold text-3xl mb-3">Payment Successful!</h1>
            <p className="text-white/60 text-lg mb-8">
              Thank you for your payment. Your transaction has been confirmed and our team will be in touch with you shortly.
            </p>

            {txRef && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-left">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Payment Reference</p>
                <p className="text-amber-400 font-mono text-sm break-all">{txRef}</p>
                {transactionId && (
                  <>
                    <p className="text-white/40 text-xs uppercase tracking-wider mb-1 mt-3">Transaction ID</p>
                    <p className="text-white/60 font-mono text-sm">{transactionId}</p>
                  </>
                )}
              </div>
            )}

            <p className="text-white/40 text-sm mb-8">A receipt has been sent to your email address.</p>

            {/* Walz Rewards CTA */}
            <div className="bg-white/5 border border-amber-500/30 rounded-2xl p-5 mb-8 text-left">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⭐</span>
                <div className="flex-1">
                  <p className="text-amber-400 font-bold text-sm mb-1">Earn Walz Miles on every booking</p>
                  <p className="text-white/50 text-xs leading-relaxed mb-3">
                    Join Walz Rewards — it's free. Earn 10 miles per £1 spent and unlock perks as you climb the tiers.
                  </p>
                  <Link href="/flights/loyalty" className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-xs transition">
                    Learn about Walz Rewards →
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/"
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-xl transition text-sm"
              >
                Back to Walz Travels
              </Link>
              <a
                href="https://wa.me/12317902336"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-white/20 hover:border-white/40 text-white px-8 py-3.5 rounded-xl transition text-sm"
              >
                WhatsApp Us
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="w-24 h-24 bg-red-500/20 border-2 border-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
              </svg>
            </div>

            <h1 className="text-white font-bold text-3xl mb-3">Payment Issue</h1>
            <p className="text-white/60 text-lg mb-8">
              We couldn&apos;t confirm your payment. Please contact us and we&apos;ll resolve it quickly.
            </p>

            {txRef && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8">
                <p className="text-white/40 text-xs mb-1">Reference to share with us:</p>
                <p className="text-amber-400 font-mono text-sm break-all">{txRef}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://wa.me/12317902336"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-xl transition text-sm"
              >
                Contact Us on WhatsApp
              </a>
              <Link
                href="/"
                className="border border-white/20 hover:border-white/40 text-white px-8 py-3.5 rounded-xl transition text-sm"
              >
                Back to Home
              </Link>
            </div>
          </>
        )}

        <div className="mt-12 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/walz-logo.png"
            alt="Walz Travels"
            className="h-8 opacity-50"
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
          <p className="text-white/20 text-xs">Walz Travels · Secure Payment</p>
        </div>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  )
}
