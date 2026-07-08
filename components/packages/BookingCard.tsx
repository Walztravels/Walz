'use client'

import { useState, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import {
  X, ChevronRight, User, Mail, Phone, Users, CreditCard, Check,
} from 'lucide-react'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ── Inner Stripe form — must live inside <Elements> ──────────────────────────

function StripePaymentForm({
  bookingReference,
  amount,
  currency,
  onBack,
}: {
  bookingReference: string
  amount: number
  currency: string
  onBack: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    const { error: submitErr } = await elements.submit()
    if (submitErr) {
      setError(submitErr.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    const returnUrl = `${window.location.origin}/packages/success?ref=${bookingReference}&redirect_status=succeeded`

    const { error: confirmErr } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })

    if (confirmErr) {
      setError(confirmErr.message ?? 'Payment failed. Please try again.')
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between text-sm mb-1">
        <span className="text-gray-500">Amount due today</span>
        <span className="font-bold text-[#0B1F3A]">{currency} {amount.toLocaleString()}</span>
      </div>

      <PaymentElement />

      {error && (
        <p className="text-red-500 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={processing}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:border-gray-300 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={processing || !stripe}
          className="flex-1 py-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
        >
          {processing ? 'Processing…' : 'Pay Now'}
        </button>
      </div>
    </form>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

interface BookingCardProps {
  packageId?: string
  packageName: string
  packageSlug: string
  price: number
  currency: string
  location: string
  duration: string
}

export function BookingCard({
  packageName,
  packageSlug,
  price,
  currency,
}: BookingCardProps) {
  // Shim: build the pkg-shaped object the body of this component expects
  const pkg = { slug: packageSlug, name: packageName, price, currency }
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1 fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [travelers, setTravelers] = useState(1)

  // Step 2 selection
  const [paymentType, setPaymentType] = useState<'deposit' | 'full'>('deposit')

  // Step 3 Stripe state
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [bookingReference, setBookingReference] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullAmount    = pkg.price * travelers
  const depositAmount = Math.ceil(fullAmount * 0.3)
  const chosenAmount  = paymentType === 'deposit' ? depositAmount : fullAmount

  function reset() {
    setOpen(false)
    setStep(1)
    setName('')
    setEmail('')
    setPhone('')
    setTravelers(1)
    setPaymentType('deposit')
    setClientSecret(null)
    setBookingReference('')
    setLoading(false)
    setError(null)
  }

  function goStep2() {
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      return
    }
    setError(null)
    setStep(2)
  }

  async function proceedToPayment() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/packages/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: pkg.slug,
          paymentType,
          name,
          email,
          phone: phone || undefined,
          travelers,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create booking')
      setClientSecret(data.clientSecret)
      setBookingReference(data.bookingReference)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const waText = encodeURIComponent(
    `Hi! I'm interested in the ${pkg.name} package (${pkg.currency} ${pkg.price.toLocaleString()}). Please send me more details.`
  )

  return (
    <>
      {/* ── Sticky booking card ── */}
      <div className="sticky top-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="mb-5">
          <p className="text-xs text-gray-400 mb-1">Starting from</p>
          <p className="text-3xl font-bold text-[#0B1F3A]">
            {pkg.currency} {pkg.price.toLocaleString()}
          </p>
          <p className="text-gray-500 text-sm mt-0.5">per person</p>
        </div>

        <button
          onClick={() => setOpen(true)}
          className="block w-full text-center py-3.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 mb-3"
          style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
        >
          Book this Package
        </button>
        <a
          href={`https://wa.me/12317902336?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-3 rounded-xl font-semibold text-sm border border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white transition-colors mb-3"
        >
          Enquire via WhatsApp
        </a>
        <p className="text-xs text-gray-400 text-center">Secure payment via Stripe</p>
      </div>

      {/* ── Booking modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(11,31,58,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) reset() }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-[#0B1F3A] text-lg">Book Package</h2>
                <p className="text-gray-400 text-xs mt-0.5 truncate max-w-[260px]">{pkg.name}</p>
              </div>
              <button
                onClick={reset}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center px-6 pt-5 pb-1 gap-1">
              {([1, 2, 3] as const).map((s, idx) => (
                <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                      s < step  ? 'bg-[#C9A84C] text-[#0B1F3A]' :
                      s === step ? 'bg-[#0B1F3A] text-white' :
                                  'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {s < step ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {idx < 2 && (
                    <div className={`flex-1 h-px mx-1 ${s < step ? 'bg-[#C9A84C]' : 'bg-gray-100'}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="px-6 py-5">

              {/* ── Step 1: Contact details ── */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-[#0B1F3A]">Your details</h3>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Full name *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Jane Doe"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Email address *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="jane@example.com"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Phone number (optional)</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+44 7xxx xxx xxx"
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5">Number of travelers *</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <select
                        value={travelers}
                        onChange={e => setTravelers(Number(e.target.value))}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C] bg-white appearance-none transition-colors"
                      >
                        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {error && (
                    <p className="text-red-500 text-xs bg-red-50 rounded-xl px-3 py-2">{error}</p>
                  )}

                  <button
                    onClick={goStep2}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#C9A84C', color: '#0B1F3A' }}
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* ── Step 2: Payment type ── */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-[#0B1F3A]">Choose payment option</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {travelers} traveler{travelers !== 1 ? 's' : ''} × {pkg.currency} {pkg.price.toLocaleString()} per person
                    </p>
                  </div>

                  <button
                    onClick={() => setPaymentType('deposit')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                      paymentType === 'deposit'
                        ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#0B1F3A] text-sm">Pay Deposit — 30%</p>
                        <p className="text-xs text-gray-500 mt-1">Secure your place now, pay the rest later</p>
                        <p className="text-xs text-gray-400 mt-0.5">Balance due 60 days before departure</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-[#0B1F3A]">{pkg.currency} {depositAmount.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">today</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setPaymentType('full')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                      paymentType === 'full'
                        ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#0B1F3A] text-sm">Pay in Full</p>
                        <p className="text-xs text-gray-500 mt-1">Complete payment now — nothing more to pay</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-[#0B1F3A]">{pkg.currency} {fullAmount.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">today</p>
                      </div>
                    </div>
                  </button>

                  <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-600">Due today</span>
                    <span className="font-bold text-[#0B1F3A]">{pkg.currency} {chosenAmount.toLocaleString()}</span>
                  </div>

                  {error && (
                    <p className="text-red-500 text-xs bg-red-50 rounded-xl px-3 py-2">{error}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setStep(1); setError(null) }}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:border-gray-300 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={proceedToPayment}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ backgroundColor: '#0B1F3A', color: 'white' }}
                    >
                      {loading
                        ? 'Setting up…'
                        : <><CreditCard className="w-4 h-4" /> Pay by Card</>
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Stripe form ── */}
              {step === 3 && clientSecret && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-[#0B1F3A]">Enter card details</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      {paymentType === 'deposit' ? '30% deposit' : 'Full payment'} —&nbsp;
                      {pkg.currency} {chosenAmount.toLocaleString()}
                    </p>
                  </div>
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret,
                      appearance: {
                        theme: 'stripe',
                        variables: {
                          colorPrimary: '#C9A84C',
                          colorBackground: '#ffffff',
                          colorText: '#0B1F3A',
                          borderRadius: '12px',
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                        },
                      },
                    }}
                  >
                    <StripePaymentForm
                      bookingReference={bookingReference}
                      amount={chosenAmount}
                      currency={pkg.currency}
                      onBack={() => { setStep(2); setClientSecret(null) }}
                    />
                  </Elements>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BookingCard
