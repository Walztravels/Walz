'use client'

import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ── Inner form (rendered inside <Elements>) ───────────────────────────────────

function AuthForm({
  amount,
  currency,
  description,
}: {
  amount: number
  currency: string
  description: string
}) {
  const stripe   = useStripe()
  const elements = useElements()

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [done,       setDone]       = useState(false)

  const formatted = new Intl.NumberFormat('en-GB', {
    style:    'currency',
    currency: currency.toUpperCase(),
  }).format(amount)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/authorize/complete`,
      },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed — please try again.')
      setSubmitting(false)
      return
    }

    setDone(true)
    setSubmitting(false)
  }

  if (done) {
    return (
      <div className="text-center space-y-4 py-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Card Authorised</h2>
        <p className="text-gray-600 text-sm max-w-xs mx-auto">
          Your card has been pre-authorised for <strong>{formatted}</strong>. Walz Travels will notify you
          before any funds are collected.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>Pre-authorisation only</strong> — no money will leave your account until Walz Travels
        confirms the charge. The hold expires automatically in 7 days if unused.
      </div>

      <PaymentElement />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full bg-[#0A1628] hover:bg-[#162240] disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-sm"
      >
        {submitting ? 'Processing…' : `Authorise ${formatted}`}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Secured by Stripe. Your card details are never stored by Walz Travels.
      </p>
    </form>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface AuthData {
  amount:       number
  currency:     string
  description:  string
  clientName:   string
  status:       string
  clientSecret: string | null
  expiresAt:    string | null
}

export default function AuthorizePage({ params }: { params: { token: string } }) {
  const [data,    setData]    = useState<AuthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/authorize/${params.token}`)
      .then(r => r.json())
      .then((json: AuthData & { error?: string; status?: string }) => {
        if (json.error) {
          setError(json.error)
        } else {
          setData(json as AuthData)
        }
      })
      .catch(() => setError('Could not load this authorization. Please try again.'))
      .finally(() => setLoading(false))
  }, [params.token])

  const formatted = data
    ? new Intl.NumberFormat('en-GB', {
        style:    'currency',
        currency: data.currency.toUpperCase(),
      }).format(data.amount)
    : ''

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#0A1628] py-4 px-6">
        <div className="max-w-md mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://walztravels.com/walz-logo.png"
            alt="Walz Travels"
            className="h-10 w-auto"
          />
        </div>
      </header>

      {/* Card */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
          {loading && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-gray-500 text-sm mt-4">Loading…</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Link unavailable</h2>
              <p className="text-gray-500 text-sm">{error}</p>
              <p className="text-gray-400 text-xs mt-4">
                If you believe this is a mistake, please contact{' '}
                <a href="mailto:contact@walztravels.com" className="text-[#C9A84C] hover:underline">
                  contact@walztravels.com
                </a>
              </p>
            </div>
          )}

          {!loading && data && !error && (
            <>
              {/* Summary */}
              <div className="mb-6">
                <h1 className="text-xl font-bold text-gray-900 mb-1">Card Authorisation</h1>
                <p className="text-gray-500 text-sm">Hello {data.clientName},</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">For</span>
                  <span className="text-gray-900 font-medium text-right max-w-[60%]">{data.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Amount</span>
                  <span className="text-gray-900 font-bold text-lg">{formatted}</span>
                </div>
                {data.expiresAt && (
                  <div className="flex justify-between text-xs text-gray-400 pt-1 border-t border-gray-200 mt-2">
                    <span>Hold expires</span>
                    <span>{new Date(data.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {data.clientSecret ? (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret: data.clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary:      '#0A1628',
                        colorBackground:   '#ffffff',
                        colorText:         '#1a1a2e',
                        borderRadius:      '8px',
                        fontFamily:        'system-ui, sans-serif',
                      },
                    },
                  }}
                >
                  <AuthForm
                    amount={data.amount}
                    currency={data.currency}
                    description={data.description}
                  />
                </Elements>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                  This authorization link is not yet ready. Please contact Walz Travels.
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Walz Travels Ltd. All rights reserved.
      </footer>
    </div>
  )
}
