'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { useFlightStore } from '@/store/flightStore'
import { formatDuration, formatTime } from '@/lib/flights/utils'

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

// ── Inner payment form ──────────────────────────────────────────────────────
function PaymentForm({ grand, intentId }: { grand: number; intentId: string }) {
  const stripe   = useStripe()
  const elements = useElements()
  const router   = useRouter()
  const store    = useFlightStore()
  const { setConfirmed, selected, passengers, seats, extras } = store

  const [processing, setProcessing] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    const { error: stripeErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    })

    if (stripeErr) {
      setError(stripeErr.message ?? 'Payment failed')
      setProcessing(false)
      return
    }

    if (paymentIntent?.status === 'succeeded' || intentId === 'pi_dev_mock') {
      try {
        const leadPax = passengers[0]
        const res = await fetch('/api/flights/book', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offerId:               selected?.id ?? 'mock_offer',
            passengers:            passengers.map((p, i) => ({
              id:          `pax_${i + 1}`,
              given_name:  p.firstName,
              family_name: p.lastName,
              born_on:     p.dob,
              gender:      'm',
              title:       p.title.toLowerCase(),
              email:       p.email ?? '',
              phone_number: p.phone ?? '',
            })),
            services:              seats.map(s => s.seatNumber),
            stripePaymentIntentId: paymentIntent?.id ?? intentId,
            passengerEmail:        leadPax?.email ?? '',
            passengerName:         `${leadPax?.firstName ?? ''} ${leadPax?.lastName ?? ''}`.trim(),
          }),
        })

        const data = await res.json()
        if (data.bookingRef) {
          setConfirmed(data.bookingRef, data.orderId ?? '')
          router.push(`/flights/confirmation?ref=${data.bookingRef}`)
        } else {
          setError(data.error ?? 'Booking failed')
        }
      } catch {
        setError('Booking failed — please contact support')
      }
    }

    setProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl border border-black/5 p-5">
        <h2 className="font-display font-bold text-[#0B1F3A] mb-4">Secure Payment</h2>
        <PaymentElement options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' } }} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      <button type="submit" disabled={!stripe || processing}
        className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        {processing ? (
          <>
            <div className="w-5 h-5 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
            Pay £{grand.toFixed(0)} Securely
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-6 text-[11px] text-[#0B1F3A]/30">
        {['🔒 SSL Secured', '✈️ IATA Certified', '💰 Price Match', '✅ ATOL Protected'].map(b => (
          <span key={b}>{b}</span>
        ))}
      </div>
    </form>
  )
}

// ── Mock checkout (no Stripe key) ────────────────────────────────────────────
function MockCheckout({ grand }: { grand: number }) {
  const router  = useRouter()
  const { setConfirmed, passengers } = useFlightStore()
  const [processing, setProcessing] = useState(false)

  async function handlePay() {
    setProcessing(true)
    await new Promise(r => setTimeout(r, 1500))
    const ref    = 'WLZ' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const order  = 'ord_' + Math.random().toString(36).slice(2, 12)
    setConfirmed(ref, order)
    router.push(`/flights/confirmation?ref=${ref}`)
  }

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm text-amber-800 font-medium">Demo mode — no Stripe key configured</p>
        <p className="text-xs text-amber-600 mt-1">Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in .env.local for real payments</p>
      </div>
      <div className="bg-white rounded-2xl border border-black/5 p-5 space-y-4">
        <h2 className="font-display font-bold text-[#0B1F3A]">Payment Details</h2>
        <div>
          <label className="label-walz">Card Number</label>
          <input type="text" className="input-walz w-full" defaultValue="4242 4242 4242 4242" readOnly />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-walz">Expiry</label>
            <input type="text" className="input-walz w-full" defaultValue="12/26" readOnly />
          </div>
          <div>
            <label className="label-walz">CVV</label>
            <input type="text" className="input-walz w-full" defaultValue="123" readOnly />
          </div>
        </div>
      </div>
      <button type="button" onClick={handlePay} disabled={processing}
        className="w-full py-4 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        {processing ? (
          <><div className="w-5 h-5 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" />Processing...</>
        ) : `Pay £${grand.toFixed(0)} (Demo)`}
      </button>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
const STEPS = ['Search', 'Seats', 'Travellers', 'Extras', 'Review', 'Pay']

export default function CheckoutPage() {
  const router  = useRouter()
  const store   = useFlightStore()
  const { selected, totalPrice, extrasTotal, seatsTotal, discountGBP } = store

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [intentId,     setIntentId]     = useState<string>('')
  const [loadingIntent, setLoadingIntent] = useState(true)

  const grand = totalPrice()

  useEffect(() => {
    fetch('/api/flights/checkout/intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(grand * 100),
        currency: 'gbp',
        metadata: {
          itinerary_id: selected?.id ?? '',
          airline:      selected?.segments[0]?.airlineName ?? '',
        },
      }),
    })
      .then(r => r.json())
      .then(d => {
        setClientSecret(d.clientSecret)
        setIntentId(d.intentId ?? '')
      })
      .catch(() => {})
      .finally(() => setLoadingIntent(false))
  }, []) // eslint-disable-line

  const airfare   = selected?.price.total ?? 0
  const seatCost  = seatsTotal()
  const extraCost = extrasTotal()
  const seg       = selected?.segments[0]
  const segLast   = selected?.segments[selected.segments.length - 1]

  const stripeOptions = {
    clientSecret: clientSecret ?? undefined,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary:  '#C9A84C',
        borderRadius:  '12px',
        fontFamily:    'DM Sans, system-ui, sans-serif',
        colorBackground: '#ffffff',
      },
    },
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Step header */}
      <div className="bg-[#0B1F3A]">
        <div className="container-walz py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <p className="text-white/60 text-sm">Step 6 of 6 · Payment</p>
            </div>
            <div className="flex items-center gap-1.5 text-[#C9A84C] text-xs font-semibold">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
              SSL Secured
            </div>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all ${i <= 5 ? 'bg-[#C9A84C]' : 'bg-white/10'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="container-walz py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: payment form */}
          <div className="lg:col-span-2">
            {loadingIntent ? (
              <div className="bg-white rounded-2xl border border-black/5 p-8 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-3" />
                  <p className="text-sm text-[#0B1F3A]/40">Setting up secure payment...</p>
                </div>
              </div>
            ) : clientSecret && clientSecret !== 'pi_dev_mock_secret_test' && stripePromise ? (
              <Elements stripe={stripePromise} options={stripeOptions}>
                <PaymentForm grand={grand} intentId={intentId} />
              </Elements>
            ) : (
              <MockCheckout grand={grand} />
            )}
          </div>

          {/* Right: order summary */}
          <aside>
            <div className="bg-white rounded-2xl border border-black/5 p-5 sticky top-8 space-y-4">
              <h3 className="font-display font-bold text-[#0B1F3A]">Order Summary</h3>

              {selected && seg && segLast && (
                <div className="bg-[#F5F2EE] rounded-xl p-3">
                  <p className="text-xs text-[#0B1F3A]/40 mb-1">{seg.departureIata} → {segLast.arrivalIata}</p>
                  <p className="text-sm font-semibold text-[#0B1F3A]">{seg.airlineName}</p>
                  <p className="text-xs text-[#0B1F3A]/40">
                    {selected.stops === 0 ? 'Direct' : `${selected.stops} stop${selected.stops > 1 ? 's' : ''}`}
                    {' · '}{formatDuration(selected.totalDuration)}
                  </p>
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#0B1F3A]/60">Airfare</span>
                  <span className="font-medium text-[#0B1F3A]">£{airfare.toFixed(0)}</span>
                </div>
                {seatCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#0B1F3A]/60">Seats</span>
                    <span className="font-medium text-[#0B1F3A]">£{seatCost.toFixed(0)}</span>
                  </div>
                )}
                {extraCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#0B1F3A]/60">Extras</span>
                    <span className="font-medium text-[#0B1F3A]">£{extraCost.toFixed(0)}</span>
                  </div>
                )}
                {discountGBP > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Miles discount</span>
                    <span>-£{discountGBP.toFixed(0)}</span>
                  </div>
                )}
                <div className="border-t border-black/5 pt-2 flex justify-between items-center">
                  <span className="font-bold text-[#0B1F3A]">Total</span>
                  <span className="text-xl font-bold text-[#0B1F3A]">£{grand.toFixed(0)}</span>
                </div>
              </div>

              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-800">✅ ATOL Protected</p>
                <p className="text-xs text-green-600 mt-0.5">Your money is 100% protected</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
