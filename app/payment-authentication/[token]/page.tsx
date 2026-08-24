'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { formatCurrencyMinor } from '@/lib/currency'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface TxData {
  id:          string
  amountMinor: number
  currency:    string
  description: string
  status:      string
  requestedAt: string
  authorization: {
    reference:    string
    cardholderName: string
    cardholderEmail: string
    serviceType:  string
    currency:     string
    cardLast4?:   string
    cardBrand?:   string
  }
}

type PageState = 'loading' | 'ready' | 'authenticating' | 'success' | 'already_paid' | 'error'

export default function PaymentAuthenticationPage() {
  const { token } = useParams<{ token: string }>()

  const [txData,       setTxData]       = useState<TxData | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [state,        setState]        = useState<PageState>('loading')
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/payment-authentication/${token}`)
        const d = await r.json()

        if (d.status === 'paid') {
          setState('already_paid')
          setTxData(d.transaction)
          return
        }

        if (!r.ok) {
          setState('error')
          setErrorMsg(d.error ?? 'This link is invalid or has expired.')
          return
        }

        setTxData(d.transaction)
        setClientSecret(d.clientSecret)
        setState('ready')
      } catch {
        setState('error')
        setErrorMsg('Could not load payment details. Please try again.')
      }
    }
    void load()
  }, [token])

  async function handleAuthenticate() {
    if (!clientSecret) return

    setState('authenticating')
    setErrorMsg(null)

    try {
      const stripe = await stripePromise
      if (!stripe) throw new Error('Stripe not loaded')

      const { error } = await stripe.handleNextAction({ clientSecret })

      if (error) {
        setState('ready')
        setErrorMsg(error.message ?? 'Authentication failed. Please try again.')
        return
      }

      // Success — the webhook will update the transaction status
      setState('success')
    } catch (err) {
      setState('ready')
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.')
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link Not Available</h2>
          <p className="text-gray-600 text-sm">{errorMsg}</p>
          <p className="mt-5 text-xs text-gray-400">Contact <a href="mailto:contact@walztravels.com" className="text-[#C9A84C]">contact@walztravels.com</a> for help.</p>
        </div>
      </div>
    )
  }

  // ── Already paid ─────────────────────────────────────────────────────────────
  if (state === 'already_paid') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Already Processed</h2>
          <p className="text-gray-600 text-sm">This payment has already been authenticated and processed successfully.</p>
        </div>
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Complete</h2>
          <p className="text-gray-600 text-sm">
            Your payment of <strong>{txData && formatCurrencyMinor(txData.amountMinor, txData.currency)}</strong> has been authenticated
            and is being processed.
          </p>
          <p className="text-xs text-gray-400 mt-5">You will receive a receipt once the payment is confirmed.</p>
        </div>
      </div>
    )
  }

  // ── Ready / Authenticating ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <div className="bg-[#0A1628] py-4 px-6">
        <img src="/walz-logo.png" alt="Walz Travels" className="h-8" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <p className="text-xs text-[#C9A84C] font-semibold uppercase tracking-widest mb-2">Payment Authentication</p>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Authenticate Your Payment</h1>
          <p className="text-gray-600 text-sm">
            Your bank requires you to authenticate this payment. This is a standard security step — it takes less than a minute.
          </p>
        </div>

        {txData && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            {/* Payment details */}
            <div className="mb-6 pb-6 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Payment Amount</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums">
                {formatCurrencyMinor(txData.amountMinor, txData.currency)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-y-3 text-sm mb-6">
              <div className="text-gray-500">Reference</div>
              <div className="font-mono font-bold text-gray-900 text-right">{txData.authorization.reference}</div>

              <div className="text-gray-500">Service</div>
              <div className="font-semibold text-gray-900 text-right">{txData.authorization.serviceType}</div>

              <div className="text-gray-500">Purpose</div>
              <div className="font-semibold text-gray-900 text-right">{txData.description}</div>

              {txData.authorization.cardLast4 && (
                <>
                  <div className="text-gray-500">Card</div>
                  <div className="font-mono text-gray-900 text-right">
                    {txData.authorization.cardBrand} ···{txData.authorization.cardLast4}
                  </div>
                </>
              )}
            </div>

            {/* Info box */}
            <div className="bg-blue-50 rounded-xl px-4 py-3 mb-6 text-xs text-blue-800">
              <p><strong>What happens next?</strong></p>
              <p className="mt-1">Clicking the button below will open a secure authentication dialog from your bank (3D Secure / Two-Factor). Complete the verification to authorise the payment.</p>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
                {errorMsg}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleAuthenticate}
              disabled={state === 'authenticating' || !clientSecret}
              className="w-full bg-[#C9A84C] text-[#0A1628] font-bold text-base py-4 rounded-xl hover:bg-[#b8973d] disabled:opacity-50 transition-colors"
            >
              {state === 'authenticating' ? 'Opening authentication…' : 'Authenticate Payment'}
            </button>

            <p className="text-xs text-center text-gray-400 mt-4">
              This link is unique to you and will expire after use.
            </p>
          </div>
        )}

        <div className="flex items-center justify-center gap-6 text-xs text-gray-400">
          <span>🔒 256-bit SSL</span>
          <span>💳 Secured by Stripe</span>
        </div>
      </div>
    </div>
  )
}
