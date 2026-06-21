'use client'

import { useState } from 'react'
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3'

interface Props {
  bookingRef: string
  depositAmount: number
  currency: 'NGN' | 'GHS'
  packageTitle: string
  clientEmail: string
  clientName: string
  clientPhone?: string
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

export default function FlutterwavePaymentStep({
  bookingRef,
  depositAmount,
  currency,
  packageTitle,
  clientEmail,
  clientName,
  clientPhone,
  onSuccess,
  onBack,
}: Props) {
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  const config = {
    public_key: process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '',
    tx_ref: bookingRef,
    amount: depositAmount,
    currency,
    payment_options: 'card,mobilemoney,ussd,banktransfer',
    customer: {
      email: clientEmail,
      phone_number: clientPhone ?? '',
      name: clientName,
    },
    customizations: {
      title: 'Walz Travels',
      description: `Deposit — ${packageTitle}`,
      logo: 'https://www.walztravels.com/walz-logo.png',
    },
    meta: {
      booking_ref: bookingRef,
    },
  }

  const handleFlutterPayment = useFlutterwave(config)

  const handlePay = () => {
    setError('')
    handleFlutterPayment({
      callback: async (response) => {
        closePaymentModal()
        if (response.status === 'successful') {
          setVerifying(true)
          try {
            const res = await fetch('/api/payments/flutterwave/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transaction_id: response.transaction_id,
                booking_ref: bookingRef,
                expected_amount: depositAmount,
                expected_currency: currency,
              }),
            })
            const data = await res.json()
            if (data.verified) {
              onSuccess()
            } else {
              setError(
                'Payment received but verification failed. Please contact us with ref ' +
                  bookingRef
              )
            }
          } catch {
            setError('Verification error. Please contact us with ref ' + bookingRef)
          } finally {
            setVerifying(false)
          }
        } else {
          setError('Payment was not completed. Please try again.')
        }
      },
      onClose: () => {},
    })
  }

  if (verifying) {
    return (
      <div className="py-8 flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: '#C9A84C', borderTopColor: 'transparent' }}
        />
        <p className="text-sm text-gray-500">Verifying payment…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div
        className="rounded-xl px-4 py-3 space-y-1"
        style={{ background: '#F7F4EF', borderLeft: '4px solid #C9A84C' }}
      >
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Deposit to pay
        </p>
        <p className="font-display text-2xl font-bold" style={{ color: '#C9A84C' }}>
          {fmtAmount(depositAmount, currency)}
        </p>
        <p className="text-xs text-gray-500">
          You can pay by card, bank transfer, USSD, or mobile money
        </p>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: '#FEF2F2', color: '#C0392B', border: '1px solid #FECACA' }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        className="w-full py-4 rounded-xl font-bold text-base transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#FF6000', color: '#ffffff' }}
      >
        Pay Deposit — {fmtAmount(depositAmount, currency)}
      </button>

      <p className="text-center text-xs text-gray-400">
        Secured by Flutterwave — your bank details are never stored by us
      </p>

      <button
        type="button"
        onClick={onBack}
        className="w-full py-3 rounded-xl font-medium text-sm border transition-colors duration-150"
        style={{ borderColor: '#E2D9CC', color: '#1C3557', background: '#fff' }}
      >
        ← Change payment method
      </button>
    </div>
  )
}
