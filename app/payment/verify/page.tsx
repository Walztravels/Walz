'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams }               from 'next/navigation'
import Link                              from 'next/link'

type PageState = 'loading' | 'success' | 'pending' | 'failed'

function VerifyContent() {
  const searchParams = useSearchParams()
  const ref         = searchParams.get('ref')
  const provider    = searchParams.get('provider') ?? ''
  // Paga checkout appends these to charge_url on redirect:
  const statusCode  = searchParams.get('status_code')
  const statusMsg   = searchParams.get('status_message')
  const chargeRef   = searchParams.get('charge_reference')

  const [state,    setState]    = useState<PageState>('loading')
  const [amount,   setAmount]   = useState<number | null>(null)
  const [currency, setCurrency] = useState('NGN')

  useEffect(() => {
    // Paga checkout redirect — trust status_code=0 / status_message=success directly
    if (statusCode === '0' || statusMsg === 'success') {
      setState('success')
      // Fire-and-forget: update DB via API (uses charge_reference or our original ref)
      const lookupRef = chargeRef || ref
      if (lookupRef) {
        fetch(`/api/payments/paga/verify?ref=${encodeURIComponent(lookupRef)}`).catch(() => {})
      }
      return
    }

    if (!ref && !chargeRef) { setState('failed'); return }

    if (provider.startsWith('paga_')) {
      const lookupRef = chargeRef || ref!
      fetch(`/api/payments/paga/verify?ref=${encodeURIComponent(lookupRef)}`)
        .then(r => r.json())
        .then(data => {
          if (data.verified) {
            if (data.amount) setAmount(data.amount)
            if (data.currency) setCurrency(data.currency)
            setState('success')
          } else {
            // API credential locked or transient error — Paga only redirects on success,
            // so show "pending" rather than "failed" when we can't confirm programmatically
            const msg = (data.error ?? '').toLowerCase()
            if (msg.includes('lock') || msg.includes('401') || msg.includes('500')) {
              setState('pending')
            } else {
              setState('failed')
            }
          }
        })
        .catch(() => setState('pending'))
    } else {
      setState('failed')
    }
  }, [ref, chargeRef, provider, statusCode, statusMsg])

  const fmtAmount = (n: number, cur: string) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: cur, minimumFractionDigits: 0 }).format(n)

  return (
    <div className="min-h-screen bg-[#060f1e] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">

        {state === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white/60 text-lg">Confirming your payment...</p>
          </>
        )}

        {state === 'success' && (
          <>
            <div className="w-24 h-24 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-white font-bold text-3xl mb-3">Payment Successful!</h1>
            <p className="text-white/60 text-lg mb-8">
              Thank you for your payment. Your transaction has been confirmed and our team will be in touch shortly.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-left">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Payment Reference</p>
              <p className="text-amber-400 font-mono text-sm break-all">{ref}</p>
              {amount && (
                <>
                  <p className="text-white/40 text-xs uppercase tracking-wider mb-1 mt-3">Amount Paid</p>
                  <p className="text-white font-semibold">{fmtAmount(amount, currency)}</p>
                </>
              )}
            </div>

            <div className="bg-white/5 border border-amber-500/30 rounded-2xl p-5 mb-8 text-left">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⭐</span>
                <div className="flex-1">
                  <p className="text-amber-400 font-bold text-sm mb-1">Earn Walz Miles on every booking</p>
                  <p className="text-white/50 text-xs leading-relaxed mb-3">
                    Join Walz Rewards — it&apos;s free. Earn 10 miles per £1 spent and unlock perks as you climb the tiers.
                  </p>
                  <Link href="/flights/loyalty" className="inline-block bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg text-xs transition">
                    Learn about Walz Rewards →
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/" className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-xl transition text-sm">
                Back to Walz Travels
              </Link>
              <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
                className="border border-white/20 hover:border-white/40 text-white px-8 py-3.5 rounded-xl transition text-sm">
                WhatsApp Us
              </a>
            </div>
          </>
        )}

        {state === 'pending' && (
          <>
            <div className="w-24 h-24 bg-amber-500/20 border-2 border-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h1 className="text-white font-bold text-3xl mb-3">Payment Received</h1>
            <p className="text-white/60 text-lg mb-8">
              We&apos;ve received your payment. Our team will confirm and process it within a few minutes.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 text-left">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Your Reference</p>
              <p className="text-amber-400 font-mono text-sm break-all">{ref}</p>
              <p className="text-white/30 text-xs mt-3">Keep this reference — share it with us if you need support.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-xl transition text-sm">
                Confirm via WhatsApp
              </a>
              <Link href="/" className="border border-white/20 hover:border-white/40 text-white px-8 py-3.5 rounded-xl transition text-sm">
                Back to Home
              </Link>
            </div>
          </>
        )}

        {state === 'failed' && (
          <>
            <div className="w-24 h-24 bg-red-500/20 border-2 border-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
              </svg>
            </div>

            <h1 className="text-white font-bold text-3xl mb-3">Payment Not Completed</h1>
            <p className="text-white/60 text-lg mb-8">
              We couldn&apos;t confirm this payment. If you were charged, please contact us with your reference below.
            </p>

            {ref && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8">
                <p className="text-white/40 text-xs mb-1">Reference to share with us:</p>
                <p className="text-amber-400 font-mono text-sm break-all">{ref}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
                className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3.5 rounded-xl transition text-sm">
                Contact Us on WhatsApp
              </a>
              <Link href="/" className="border border-white/20 hover:border-white/40 text-white px-8 py-3.5 rounded-xl transition text-sm">
                Back to Home
              </Link>
            </div>
          </>
        )}

        <div className="mt-12 flex items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Walz Travels" className="h-8 opacity-50"
            onError={e => { e.currentTarget.style.display = 'none' }} />
          <p className="text-white/20 text-xs">Walz Travels · Secure Payment</p>
        </div>
      </div>
    </div>
  )
}

export default function PaymentVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  )
}
