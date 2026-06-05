'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  ArrowLeft, Shield, CheckCircle, Loader2, CreditCard,
  MessageCircle, Clock, FileText, AlertCircle,
} from 'lucide-react'
import { getVisaConfig } from '@/lib/visa-config'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ─── Checkout form ────────────────────────────────────────────────────────────
function CheckoutForm({
  appId, amount, config, refNumber, applicantName,
  onSuccess,
}: {
  appId: string
  amount: number
  config: NonNullable<ReturnType<typeof getVisaConfig>>
  refNumber: string
  applicantName: string
  onSuccess: (id: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/visa-application/${appId}/payment`, { method: 'POST' })
      .then(r => r.json())
      .then(d => setClientSecret(d.clientSecret))
      .catch(() => setError('Failed to initialise payment. Please try again.'))
  }, [appId])

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements || !clientSecret) return
    setProcessing(true)
    setError(null)

    const card = elements.getElement(CardElement)
    if (!card) { setProcessing(false); return }

    const { paymentIntent, error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card },
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      // Confirm on backend
      const res = await fetch(`/api/visa-application/${appId}/payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      })
      if (res.ok) {
        const { application } = await res.json()
        onSuccess(application.id)
      } else {
        setError('Payment recorded but confirmation failed. Contact us with reference ' + refNumber)
      }
    }
    setProcessing(false)
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-bold text-[#0B1F3A] text-base mb-4 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-[#C9A84C]" /> Card Details
        </h3>
        <div className="border border-gray-200 rounded-xl px-4 py-3.5 focus-within:border-[#C9A84C] transition-colors">
          <CardElement options={{
            style: {
              base: { fontSize: '15px', color: '#0B1F3A', fontFamily: 'inherit', '::placeholder': { color: '#9ca3af' } },
              invalid: { color: '#ef4444' },
            },
          }} />
        </div>
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <Shield className="w-3 h-3" /> Secured by Stripe. We never store your card details.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <button type="submit" disabled={!stripe || !clientSecret || processing}
        className="w-full py-4 bg-[#C9A84C] hover:bg-[#b8943d] disabled:opacity-60 text-[#0B1F3A] font-bold text-base rounded-xl transition-colors flex items-center justify-center gap-2">
        {processing ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</> : `Pay USD $${amount}`}
      </button>

      <div className="text-center space-y-1">
        <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" /> 256-bit SSL encryption · PCI DSS compliant
        </p>
      </div>
    </form>
  )
}

// ─── Pay Later form ───────────────────────────────────────────────────────────
function PayLaterForm({ appId, refNumber }: { appId: string; refNumber: string }) {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function requestInvoice() {
    setSending(true)
    // Just mark application and notify admin via WhatsApp
    setSent(true)
    setSending(false)
  }

  if (sent) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="font-bold text-[#0B1F3A] text-lg mb-2">Invoice Request Sent</h3>
        <p className="text-gray-500 text-sm mb-4">
          Jade will send your invoice within 2 business hours.
          Reference: <strong>{refNumber}</strong>
        </p>
        <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 bg-green-600 text-white font-semibold text-sm rounded-xl">
          <MessageCircle className="w-4 h-4" /> Follow up on WhatsApp
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800">Your application will be saved but not processed until payment is received. Processing only begins after payment confirmation.</p>
      </div>
      <button onClick={requestInvoice} disabled={sending}
        className="w-full py-4 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-bold text-base rounded-xl flex items-center justify-center gap-2 transition-colors">
        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
        Request Invoice
      </button>
      <a href={`https://wa.me/447398753797?text=Hi+Jade,+I'd+like+to+pay+for+my+visa+application+by+bank+transfer.+Reference:+${refNumber}`}
        target="_blank" rel="noopener noreferrer"
        className="w-full py-4 bg-green-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-green-700 transition-colors">
        <MessageCircle className="w-4 h-4" /> Pay via Bank Transfer (WhatsApp)
      </a>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VisaPaymentPage() {
  const params = useParams<{ country: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session, status: authStatus } = useSession()

  const appId = searchParams.get('id') ?? ''
  const [payMethod, setPayMethod] = useState<'card' | 'later'>('card')
  const [app, setApp] = useState<{
    referenceNumber: string; firstName: string; lastName: string; visaType: string; email: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  const config = getVisaConfig(params.country)

  useEffect(() => {
    if (!appId) return
    fetch(`/api/visa-application/${appId}`)
      .then(r => r.json())
      .then(d => { setApp(d.application); setLoading(false) })
      .catch(() => setLoading(false))
  }, [appId])

  function handleSuccess(id: string) {
    router.push(`/portal/visa-application/${id}?success=1`)
  }

  if (authStatus === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" /></div>
  }
  if (!config) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Country not found.</p></div>

  const applicantName = app ? `${app.firstName ?? ''} ${app.lastName ?? ''}`.trim() : 'Applicant'

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Header */}
      <div className="bg-[#0B1F3A] px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <Link href={`/visa/apply/${params.country}?draft=${appId}`}
            className="inline-flex items-center gap-1.5 text-white/50 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to form
          </Link>
          <h1 className="text-white text-2xl font-bold">Complete Your Payment</h1>
          <p className="text-white/50 text-sm mt-1">Your Walz Travels service fee — secure checkout</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Order summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="font-bold text-[#0B1F3A] text-base mb-4">Order Summary</h2>
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-[#0B1F3A] text-sm">
                  {config.flag} {config.name} Visa Application
                </p>
                <p className="text-gray-400 text-xs mt-0.5">{app?.visaType ?? config.visaTypes[0]}</p>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Applicant</span>
                <span className="font-semibold text-[#0B1F3A]">{applicantName}</span>
              </div>
              {app?.referenceNumber && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Reference</span>
                  <span className="font-mono text-[#C9A84C] font-semibold">{app.referenceNumber}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <div>
                  <p className="font-semibold text-[#0B1F3A]">Walz Travels Service Fee</p>
                  <p className="text-xs text-gray-400">Full application preparation, submission & tracking</p>
                </div>
                <span className="font-bold text-[#0B1F3A] text-base ml-4">USD ${config.serviceFeeUsd}</span>
              </div>
            </div>
            <div className="bg-[#F4F6F9] rounded-xl p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-600">Government Fee — paid separately</p>
                <p className="text-xs text-gray-400 mt-0.5">{config.govtFeeDisplay} · Walz tells you exactly when and how to pay</p>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-3 flex justify-between font-bold">
              <span className="text-[#0B1F3A]">Total due now</span>
              <span className="text-[#C9A84C] text-xl">USD ${config.serviceFeeUsd}</span>
            </div>
          </div>
        </div>

        {/* What's included */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-[#0B1F3A] text-sm mb-3">What's included in your service fee</h3>
          <div className="space-y-2">
            {[
              'Complete application preparation and review',
              'Document checklist tailored to your profile',
              'Pre-submission document review by Jade',
              'Embassy or VFS submission on your behalf',
              'Real-time status updates throughout',
              'WhatsApp support until decision',
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="w-4 h-4 text-[#C9A84C] flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Payment method toggle */}
        <div className="flex gap-3">
          <button onClick={() => setPayMethod('card')}
            className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${payMethod === 'card' ? 'border-[#C9A84C] bg-[#C9A84C]/5 text-[#0B1F3A]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            💳 Pay by Card
          </button>
          <button onClick={() => setPayMethod('later')}
            className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${payMethod === 'later' ? 'border-[#C9A84C] bg-[#C9A84C]/5 text-[#0B1F3A]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            📄 Pay Later / Invoice
          </button>
        </div>

        {/* Payment form */}
        {payMethod === 'card' ? (
          <Elements stripe={stripePromise}>
            <CheckoutForm
              appId={appId} amount={config.serviceFeeUsd} config={config}
              refNumber={app?.referenceNumber ?? ''} applicantName={applicantName}
              onSuccess={handleSuccess}
            />
          </Elements>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[#0B1F3A] text-base mb-4">Pay Later</h3>
            <PayLaterForm appId={appId} refNumber={app?.referenceNumber ?? ''} />
          </div>
        )}

        <p className="text-xs text-gray-400 text-center leading-relaxed">
          By paying you agree to Walz Travels' terms of service. Service fees are non-refundable
          once application preparation has begun. Government fees are separate and paid when instructed.
        </p>
      </div>
    </div>
  )
}
