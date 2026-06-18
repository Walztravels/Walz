'use client'
import { useState } from 'react'
import { CreditCard, Loader2, CheckCircle, Smartphone } from 'lucide-react'

interface Props {
  applicationId: string | null
  feeGbp:        number
  destName:      string
  onSkip?:       () => void
}

type Gateway = 'stripe' | 'flutterwave'

export function PaymentStep({ applicationId, feeGbp, destName, onSkip }: Props) {
  const [selected, setSelected] = useState<Gateway | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handlePay(gateway: Gateway) {
    if (!applicationId) return
    setSelected(gateway)
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/visa/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ applicationId, gateway }),
      })
      const data = await res.json()
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? 'Payment setup failed. Please try again.')
        setLoading(false)
        setSelected(null)
        return
      }
      window.location.href = data.checkoutUrl
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
      setSelected(null)
    }
  }

  if (feeGbp === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <p className="text-[#0B1F3A] font-bold text-lg mb-2">No Payment Required</p>
        <p className="text-gray-400 text-sm mb-6">
          This service has no upfront fee. Our team will be in touch shortly.
        </p>
        {onSkip && (
          <button
            onClick={onSkip}
            className="bg-[#C9A84C] text-[#0B1F3A] font-bold px-8 py-3 rounded-2xl hover:bg-[#b8973f] transition-colors">
            Submit Application →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Fee summary */}
      <div className="bg-[#0B1F3A] rounded-2xl p-6 text-center">
        <p className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-widest mb-2">
          Visa Service Fee — {destName}
        </p>
        <p className="text-white text-5xl font-bold mb-1">£{feeGbp}</p>
        <p className="text-white/40 text-xs">
          Includes document prep, submission support &amp; tracking
        </p>
      </div>

      {/* What's included */}
      <div className="space-y-2">
        {[
          'Full application preparation by our visa experts',
          'Document checklist & review before submission',
          'Application tracking until decision',
          'Full refund if we cannot proceed',
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm text-gray-600">
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>

      {/* Payment options */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          Choose payment method
        </p>
        <div className="space-y-2">

          {/* Stripe */}
          <button
            onClick={() => handlePay('stripe')}
            disabled={loading}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
              selected === 'stripe'
                ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                : 'border-gray-200 hover:border-[#C9A84C]/50 hover:bg-gray-50'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <div className="w-10 h-10 bg-[#635BFF] rounded-xl flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-[#0B1F3A] text-sm">Card / Apple Pay / Google Pay</p>
              <p className="text-xs text-gray-400">Powered by Stripe · Secure · GBP, EUR, USD</p>
            </div>
            {loading && selected === 'stripe' && (
              <Loader2 className="w-4 h-4 animate-spin text-[#C9A84C]" />
            )}
          </button>

          {/* Flutterwave */}
          <button
            onClick={() => handlePay('flutterwave')}
            disabled={loading}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
              selected === 'flutterwave'
                ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                : 'border-gray-200 hover:border-[#C9A84C]/50 hover:bg-gray-50'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            <div className="w-10 h-10 bg-[#F5A623] rounded-xl flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-[#0B1F3A] text-sm">Bank Transfer / USSD / Mobile Money</p>
              <p className="text-xs text-gray-400">Powered by Flutterwave · NGN, GHS, USD · Nigeria &amp; Ghana</p>
            </div>
            {loading && selected === 'flutterwave' && (
              <Loader2 className="w-4 h-4 animate-spin text-[#C9A84C]" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
          {error}
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-center leading-relaxed">
        You will be redirected to a secure payment page.<br />
        Government / embassy fees are separate and paid directly to the embassy.
      </p>
    </div>
  )
}
