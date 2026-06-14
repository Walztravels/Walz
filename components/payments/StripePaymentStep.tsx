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

interface Props {
  bookingRef: string
  depositAmount: number
  currency: string
  packageTitle: string
  clientEmail: string
  onSuccess: () => void
  onBack: () => void
}

function fmtAmount(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

function PaymentForm({
  onSuccess,
  onBack,
  depositAmount,
  currency,
}: {
  onSuccess: () => void
  onBack: () => void
  depositAmount: number
  currency: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError('')

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message ?? 'Payment failed')
      setLoading(false)
      return
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Please try again.')
      setLoading(false)
      return
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onSuccess()
    } else {
      setError('Payment incomplete. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: '#FEF2F2', color: '#C0392B', border: '1px solid #FECACA' }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !stripe || !elements}
        className="w-full py-4 rounded-xl font-bold text-base transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="inline-block w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: '#0B1F3A', borderTopColor: 'transparent' }}
            />
            Processing…
          </span>
        ) : (
          `Pay Deposit — ${fmtAmount(depositAmount, currency)}`
        )}
      </button>

      <button
        type="button"
        onClick={onBack}
        disabled={loading}
        className="w-full py-3 rounded-xl font-medium text-sm border transition-colors duration-150"
        style={{ borderColor: '#E2D9CC', color: '#1C3557', background: '#fff' }}
      >
        ← Change payment method
      </button>
    </form>
  )
}

export default function StripePaymentStep({
  bookingRef,
  depositAmount,
  currency,
  packageTitle,
  clientEmail,
  onSuccess,
  onBack,
}: Props) {
  const [clientSecret, setClientSecret] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    fetch('/api/payments/stripe/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_ref: bookingRef,
        amount: depositAmount,
        currency,
        package_title: packageTitle,
        client_email: clientEmail,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.client_secret) {
          setClientSecret(data.client_secret)
        } else {
          setLoadError(data.error ?? 'Failed to initialise payment')
        }
      })
      .catch(() => setLoadError('Network error. Please try again.'))
  }, [bookingRef, depositAmount, currency, packageTitle, clientEmail])

  if (loadError) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: '#FEF2F2', color: '#C0392B', border: '1px solid #FECACA' }}
        >
          {loadError}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 rounded-xl font-medium text-sm border"
          style={{ borderColor: '#E2D9CC', color: '#1C3557' }}
        >
          ← Go back
        </button>
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <div className="py-8 flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-gray-500">Setting up secure payment…</p>
      </div>
    )
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary: '#C9A84C',
            colorBackground: '#ffffff',
            colorText: '#0B1F3A',
            colorDanger: '#C0392B',
            borderRadius: '12px',
            fontFamily: 'inherit',
          },
        },
      }}
    >
      <PaymentForm
        onSuccess={onSuccess}
        onBack={onBack}
        depositAmount={depositAmount}
        currency={currency}
      />
    </Elements>
  )
}
