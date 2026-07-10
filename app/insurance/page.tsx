'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import {
  Shield, Check, MessageCircle,
  Plane, Briefcase, Heart, Zap,
  ChevronDown, ChevronUp, Loader2,
  X, Plus, Minus, AlertCircle, User,
} from 'lucide-react'
import { loadStripe }      from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { CountrySelectLight } from '@/components/visa/CountrySelect'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ── Coverage benefits ─────────────────────────────────────────────────────────

const BENEFITS = [
  'Emergency medical expenses and hospitalisation',
  'Emergency evacuation and repatriation',
  'Trip cancellation and curtailment',
  'Lost, stolen or delayed baggage',
  'Flight delays and missed connections',
  'Personal liability cover',
  'COVID-19 related disruptions',
  '24/7 emergency assistance line',
  'Adventure sports cover (optional)',
  'Pre-existing medical conditions (on request)',
]

// ── Coverage table ────────────────────────────────────────────────────────────

const COVERAGE_TABLE = [
  { category: 'Medical',      item: 'Emergency Medical Expenses',  limit: 'Up to $1,000,000' },
  { category: 'Medical',      item: 'Emergency Evacuation',        limit: 'Up to $500,000'   },
  { category: 'Cancellation', item: 'Trip Cancellation',           limit: 'Up to $5,000'     },
  { category: 'Cancellation', item: 'Trip Curtailment',            limit: 'Up to $5,000'     },
  { category: 'Baggage',      item: 'Baggage Loss or Theft',       limit: 'Up to $2,500'     },
  { category: 'Baggage',      item: 'Baggage Delay',               limit: 'Up to $500'       },
  { category: 'Travel',       item: 'Flight Delay',                limit: 'Up to $400'       },
  { category: 'Travel',       item: 'Missed Departure',            limit: 'Up to $1,000'     },
  { category: 'Liability',    item: 'Personal Liability',          limit: 'Up to $2,000,000' },
  { category: 'Liability',    item: 'COVID-19 Cover',              limit: 'Included'         },
]

const HOW_IT_WORKS = [
  { step: '01', icon: Plane,    title: 'Enter Your Trip',      body: 'Tell us your destination, travel dates and the ages of everyone travelling.'        },
  { step: '02', icon: Shield,   title: 'Instant Quote',        body: 'Our system queries Battleface in real time and returns your exact premium in seconds.' },
  { step: '03', icon: Briefcase,title: 'Review & Purchase',    body: 'Check your coverage, fill in traveller details and pay securely via card.'            },
  { step: '04', icon: Heart,    title: 'Policy by Email',      body: 'Your policy document arrives instantly. Download it and travel with confidence.'       },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Traveller { date_of_birth: string; is_primary: boolean }

interface QuoteResult {
  quote_id:            string
  battleface_quote_id: string
  product_id:          string
  plan_name:           string
  premium:             number
  currency:            string
  coverage_details:    Record<string, unknown>
  policy_wording_url:  string | null
  expires_at:          string
}

// ── Stripe pay form (inner — must be inside <Elements>) ───────────────────────

function InsurancePayForm({
  orderRef,
  premium,
  currency,
  bfOrderId,
  onSuccess,
  onError,
}: {
  orderRef:   string
  premium:    number
  currency:   string
  bfOrderId:  string
  onSuccess:  (data: Record<string, string>) => void
  onError:    (msg: string) => void
}) {
  const stripe   = useStripe()
  const elements = useElements()
  const [paying,  setPaying]  = useState(false)

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      })
      if (error) { onError(error.message ?? 'Payment failed'); return }
      if (paymentIntent?.status !== 'succeeded') { onError('Payment not confirmed'); return }

      // Confirm with battleface
      const res  = await fetch('/api/insurance/payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: bfOrderId, stripe_payment_intent_id: paymentIntent.id }),
      })
      const data = await res.json()
      if (!res.ok) { onError(data.error ?? 'Policy activation failed'); return }
      onSuccess(data)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setPaying(false)
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || !elements || paying}
        className="w-full py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
      >
        {paying
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
          : <>Pay {currency} {premium.toFixed(2)} — Confirm Policy</>
        }
      </button>
      <p className="text-xs text-gray-400 text-center">
        Secured by Stripe · Policy emailed immediately on payment
      </p>
    </form>
  )
}

// ── Checkout modal (outer) ────────────────────────────────────────────────────

function CheckoutModal({
  quote,
  destination,
  startDate,
  endDate,
  onClose,
}: {
  quote:       QuoteResult
  destination: string
  startDate:   string
  endDate:     string
  onClose:     () => void
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [step,          setStep]          = useState<'details' | 'payment'>('details')
  const [clientSecret,  setClientSecret]  = useState<string | null>(null)
  const [bfOrderId,     setBfOrderId]     = useState('')
  const [orderRef,      setOrderRef]      = useState('')
  const [creating,      setCreating]      = useState(false)
  const [payErr,        setPayErr]        = useState('')
  const [form, setForm] = useState({
    first_name:    '',
    last_name:     '',
    email:         session?.user?.email ?? '',
    phone:         '',
    date_of_birth: '',
    address:       '',
    city:          '',
    country:       'GB',
    postal_code:   '',
  })

  // Pre-fill email once session loads
  useEffect(() => {
    if (session?.user?.email && !form.email) {
      setForm(f => ({ ...f, email: session.user!.email! }))
    }
  }, [session, form.email])

  function field(k: keyof typeof form, label: string, type = 'text', ph = '') {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
        <input
          type={type}
          required
          value={form[k]}
          placeholder={ph}
          onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
          className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] bg-white"
        />
      </div>
    )
  }

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setPayErr('')
    try {
      const res = await fetch('/api/insurance/order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id:            quote.quote_id,
          battleface_quote_id: quote.battleface_quote_id,
          product_id:          quote.product_id,
          plan_name:           quote.plan_name,
          premium:             quote.premium,
          currency:            quote.currency,
          primary_traveller:   form,
          trip_start_date:     startDate,
          trip_end_date:       endDate,
          destination_country: destination,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setPayErr(data.error ?? 'Could not create order'); return }
      setClientSecret(data.client_secret)
      setBfOrderId(data.battleface_order_id)
      setOrderRef(data.order_reference ?? data.battleface_order_id)
      setStep('payment')
    } catch {
      setPayErr('Network error. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  function handleSuccess(data: Record<string, string>) {
    router.push(`/insurance/confirmation?order_ref=${encodeURIComponent(data.order_reference ?? orderRef)}&policy=${encodeURIComponent(data.policy_number ?? '')}`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">
              {step === 'details' ? 'Step 1 of 2 — Traveller Details' : 'Step 2 of 2 — Secure Payment'}
            </p>
            <h3 className="font-bold text-[#0B1F3A] text-sm">{quote.plan_name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="grid md:grid-cols-[1fr_280px] gap-0">

          {/* Left — form */}
          <div className="p-6">
            {step === 'details' ? (
              <form onSubmit={handleContinue} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {field('first_name', 'First Name', 'text', 'Jane')}
                  {field('last_name',  'Last Name',  'text', 'Smith')}
                </div>
                {field('email', 'Email Address', 'email', 'jane@example.com')}
                {field('phone', 'Phone Number',  'tel',   '+44 7700 000000')}
                {field('date_of_birth', 'Date of Birth', 'date')}
                {field('address', 'Home Address', 'text', '123 High Street')}
                <div className="grid grid-cols-2 gap-3">
                  {field('city',        'City',       'text', 'London')}
                  {field('postal_code', 'Post Code',  'text', 'SW1A 1AA')}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Country of Residence</label>
                  <CountrySelectLight
                    value={form.country}
                    onChange={v => setForm(f => ({ ...f, country: v }))}
                    placeholder="Select country"
                  />
                </div>
                {payErr && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {payErr}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-3.5 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm mt-2"
                >
                  {creating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up payment…</>
                    : 'Continue to Payment →'
                  }
                </button>
              </form>
            ) : clientSecret ? (
              <div>
                {payErr && (
                  <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {payErr}
                  </div>
                )}
                <Elements
                  stripe={stripePromise}
                  options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#C9A84C' } } }}
                >
                  <InsurancePayForm
                    orderRef={orderRef}
                    premium={quote.premium}
                    currency={quote.currency}
                    bfOrderId={bfOrderId}
                    onSuccess={handleSuccess}
                    onError={setPayErr}
                  />
                </Elements>
                <button
                  onClick={() => setStep('details')}
                  className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Back to details
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
              </div>
            )}
          </div>

          {/* Right — order summary */}
          <div className="bg-[#F7F4EF] p-6 border-l border-gray-100 rounded-r-2xl">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">Order Summary</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Plan</p>
                <p className="font-bold text-[#0B1F3A]">{quote.plan_name}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Destination</p>
                <p className="font-bold text-[#0B1F3A]">{destination}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Dates</p>
                <p className="font-bold text-[#0B1F3A] text-xs">{startDate} → {endDate}</p>
              </div>
              <div className="pt-3 border-t border-gray-200">
                <p className="text-gray-500 text-xs">Total Premium</p>
                <p className="text-2xl font-bold text-[#C9A84C]">
                  {quote.currency} {quote.premium.toFixed(2)}
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-1.5">
              {['Emergency Medical up to $1M', 'Trip Cancellation', 'Baggage Protection', '24/7 Assistance'].map(b => (
                <div key={b} className="flex items-center gap-2 text-xs text-gray-600">
                  <Check className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                  {b}
                </div>
              ))}
            </div>
            {quote.policy_wording_url && (
              <a
                href={quote.policy_wording_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block text-xs text-[#C9A84C] hover:underline"
              >
                Read full policy wording →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function InsurancePageInner() {
  const { data: session } = useSession()
  const params = useSearchParams()
  const [heroBg, setHeroBg] = useState<string | null>(null)

  // ── Quote form state — pre-fillable via URL params (?dest=FR&from=2026-07-01&to=2026-07-14) ──
  const [destination,  setDestination]  = useState(params.get('dest') ?? '')
  const [origin,       setOrigin]       = useState('GB')
  const [startDate,    setStartDate]    = useState(params.get('from') ?? '')
  const [endDate,      setEndDate]      = useState(params.get('to')   ?? '')
  const [numTravellers, setNumTravellers] = useState(1)
  const [travellers,   setTravellers]   = useState<Traveller[]>([{ date_of_birth: '', is_primary: true }])
  const [tripCost,     setTripCost]     = useState('')
  const [quoting,      setQuoting]      = useState(false)
  const [quoteResult,  setQuoteResult]  = useState<QuoteResult | null>(null)
  const [quoteError,   setQuoteError]   = useState('')
  const [showCheckout, setShowCheckout] = useState(false)

  useEffect(() => {
    fetch('/api/media/insurance_hero_bg')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setHeroBg(d.url) })
      .catch(() => {})
  }, [])

  // Sync travellers array length when stepper changes
  useEffect(() => {
    setTravellers(prev => {
      if (numTravellers > prev.length) {
        return [...prev, ...Array.from({ length: numTravellers - prev.length }, () => ({ date_of_birth: '', is_primary: false }))]
      }
      return prev.slice(0, numTravellers)
    })
  }, [numTravellers])

  const updateDob = useCallback((idx: number, dob: string) => {
    setTravellers(prev => prev.map((t, i) => i === idx ? { ...t, date_of_birth: dob } : t))
  }, [])

  async function handleGetQuote(e: React.FormEvent) {
    e.preventDefault()
    if (!destination) { setQuoteError('Please select a destination.'); return }
    if (!startDate || !endDate) { setQuoteError('Please select travel dates.'); return }
    const incomplete = travellers.some(t => !t.date_of_birth)
    if (incomplete) { setQuoteError('Please enter a date of birth for each traveller.'); return }

    setQuoting(true)
    setQuoteError('')
    setQuoteResult(null)

    try {
      const res = await fetch('/api/insurance/quote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_start_date:     startDate,
          trip_end_date:       endDate,
          destination_country: destination,
          origin_country:      origin,
          travellers,
          trip_cost: tripCost ? Number(tripCost) : undefined,
          currency:  'USD',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setQuoteError(data.error ?? 'Could not get a quote. Please try again.'); return }
      setQuoteResult(data)
      setTimeout(() => {
        document.getElementById('quote-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    } catch {
      setQuoteError('Network error. Please check your connection and try again.')
    } finally {
      setQuoting(false)
    }
  }

  // ── Refs for animations ────────────────────────────────────────────────────
  const eyebrowRef  = useRef<HTMLParagraphElement>(null)
  const h1Ref       = useRef<HTMLSpanElement>(null)
  const subRef      = useRef<HTMLParagraphElement>(null)
  const ctaRef      = useRef<HTMLDivElement>(null)
  const quoteRef    = useRef<HTMLElement>(null)
  const benefitsRef = useRef<HTMLElement>(null)
  const tableRef    = useRef<HTMLElement>(null)
  const stepsRef    = useRef<HTMLElement>(null)
  const finalRef    = useRef<HTMLElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(eyebrowRef.current, { opacity: 0, y: 16, duration: 0.8 }, 0.3)
    tl.from(h1Ref.current,      { yPercent: 110, opacity: 0, duration: 1.1 }, 0.7)
    tl.from(subRef.current,     { opacity: 0, y: 24, duration: 0.8 }, 1.5)
    tl.from(ctaRef.current,     { opacity: 0, y: 20, duration: 0.7 }, 2.0)
  }, [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const sections = [quoteRef.current, benefitsRef.current, tableRef.current, stepsRef.current, finalRef.current]
    sections.forEach(el => {
      if (!el) return
      el.style.opacity = '0'
      el.style.transform = 'translateY(40px)'
      const obs = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return
        el.style.transition = 'opacity 0.75s ease, transform 0.75s ease'
        el.style.opacity    = '1'
        el.style.transform  = 'translateY(0)'
        obs.disconnect()
      }, { threshold: 0.05 })
      obs.observe(el)
    })
  }, [])

  useEffect(() => {
    const container = benefitsRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('[data-benefit]').forEach(el => {
        (el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }
    const obs = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return
      container.querySelectorAll('[data-benefit]').forEach((el, i) => {
        setTimeout(() => {
          (el as HTMLElement).style.transition = 'opacity 0.5s ease, transform 0.5s ease'
          ;(el as HTMLElement).style.opacity = '1'
          ;(el as HTMLElement).style.transform = 'translateY(0)'
        }, i * 60)
      })
      obs.disconnect()
    }, { threshold: 0.1 })
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* ── Section 1: Hero ──────────────────────────────────────────────── */}
      <section
        id="hero"
        className="relative min-h-[70vh] flex items-center justify-center text-center px-5 py-24 overflow-hidden"
      >
        <div className="absolute inset-0">
          {heroBg && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url('${heroBg}')` }}
            />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,_#1C3557_0%,_transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_100%,_rgba(201,168,76,0.08)_0%,_transparent_50%)]" />
        </div>

        <div className="relative z-10 max-w-3xl">
          <p
            ref={eyebrowRef}
            className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-6"
            style={{ opacity: 0 }}
          >
            Travel Insurance
          </p>

          <h1 className="font-display font-bold text-white mb-6 overflow-hidden leading-[0.92]">
            <span
              ref={h1Ref}
              className="block text-[clamp(2.8rem,7vw,5.8rem)]"
              style={{ transform: 'translateY(110%)', opacity: 0 }}
            >
              Travel Protected.<br />Travel Confident.
            </span>
          </h1>

          <p
            ref={subRef}
            className="text-white/55 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-8"
            style={{ opacity: 0 }}
          >
            Instant quotes from Battleface — global coverage, clear policy, fair price.
            Get your quote below in under 30 seconds.
          </p>

          <div ref={ctaRef} style={{ opacity: 0 }}>
            <a
              href="#get-quote"
              onClick={e => { e.preventDefault(); document.getElementById('get-quote')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg"
            >
              <Shield className="w-4 h-4" />
              Get My Quote Now
            </a>
          </div>
        </div>
      </section>

      {/* ── Section 2: Quote Form ─────────────────────────────────────────── */}
      <section
        id="get-quote"
        ref={quoteRef}
        className="bg-white py-16 lg:py-20 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-10">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Instant Quote
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight mb-3">
              Get Your Quote in Seconds
            </h2>
            <p className="text-[#0B1F3A]/50 max-w-md mx-auto text-sm">
              Enter your trip details and we will show you the exact price — no personal data needed.
            </p>
          </div>

          <form
            onSubmit={handleGetQuote}
            className="bg-[#F7F4EF] rounded-2xl p-6 lg:p-8 border border-[#E2D9CC]"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Destination */}
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                  Where are you going? *
                </label>
                <CountrySelectLight
                  value={destination}
                  onChange={setDestination}
                  placeholder="Select destination country"
                />
              </div>

              {/* Origin */}
              <div className="md:col-span-1">
                <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                  Travelling from?
                </label>
                <CountrySelectLight
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Country of residence"
                />
              </div>

              {/* Departure */}
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                  Departure Date *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2D9CC] text-sm text-[#0B1F3A] bg-white outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                />
              </div>

              {/* Return */}
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                  Return Date *
                </label>
                <input
                  type="date"
                  required
                  value={endDate}
                  min={startDate || new Date().toISOString().split('T')[0]}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-[#E2D9CC] text-sm text-[#0B1F3A] bg-white outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                />
              </div>

              {/* Number of travellers */}
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                  Number of Travellers *
                </label>
                <div className="flex items-center gap-3 h-10">
                  <button
                    type="button"
                    onClick={() => setNumTravellers(n => Math.max(1, n - 1))}
                    className="w-9 h-9 rounded-lg border border-[#E2D9CC] bg-white flex items-center justify-center hover:border-[#C9A84C] transition-colors"
                  >
                    <Minus className="w-4 h-4 text-[#0B1F3A]" />
                  </button>
                  <span className="text-lg font-bold text-[#0B1F3A] w-6 text-center">{numTravellers}</span>
                  <button
                    type="button"
                    onClick={() => setNumTravellers(n => Math.min(9, n + 1))}
                    className="w-9 h-9 rounded-lg border border-[#E2D9CC] bg-white flex items-center justify-center hover:border-[#C9A84C] transition-colors"
                  >
                    <Plus className="w-4 h-4 text-[#0B1F3A]" />
                  </button>
                  <span className="text-xs text-[#0B1F3A]/40 ml-1">adult{numTravellers !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Trip cost */}
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                  Total Trip Cost (optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#0B1F3A]/40 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    value={tripCost}
                    onChange={e => setTripCost(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full h-10 pl-7 pr-3 rounded-xl border border-[#E2D9CC] text-sm text-[#0B1F3A] bg-white outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                  />
                </div>
                <p className="text-[10px] text-[#0B1F3A]/40 mt-1">Used to calculate cancellation cover</p>
              </div>
            </div>

            {/* DOB per traveller */}
            {numTravellers > 0 && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {travellers.map((t, i) => (
                  <div key={i}>
                    <label className="block text-xs font-bold text-[#0B1F3A] uppercase tracking-wider mb-2">
                      <User className="inline w-3 h-3 mr-1" />
                      {i === 0 ? 'Lead Traveller' : `Traveller ${i + 1}`} — Date of Birth *
                    </label>
                    <input
                      type="date"
                      required
                      value={t.date_of_birth}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => updateDob(i, e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-[#E2D9CC] text-sm text-[#0B1F3A] bg-white outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
                    />
                  </div>
                ))}
              </div>
            )}

            {quoteError && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {quoteError}
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <button
                type="submit"
                disabled={quoting}
                className="inline-flex items-center gap-2.5 px-10 py-4 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg disabled:opacity-60 disabled:scale-100"
              >
                {quoting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting your quote…</>
                  : <><Shield className="w-4 h-4" /> Get My Quote</>
                }
              </button>
            </div>
          </form>

          {/* ── Quote Result ───────────────────────────────────────────── */}
          {quoteResult && (
            <div
              id="quote-result"
              className="mt-8 bg-[#0B1F3A] rounded-2xl p-6 lg:p-8 border border-[#1C3557]"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">

                {/* Plan + price */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-[#C9A84C]" />
                    <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-wider">
                      {quoteResult.plan_name}
                    </p>
                  </div>
                  <p className="text-white/50 text-xs mb-1">
                    {destination} · {startDate} → {endDate} · {numTravellers} traveller{numTravellers !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-4xl font-bold text-[#C9A84C]">
                      {quoteResult.currency} {quoteResult.premium.toFixed(2)}
                    </span>
                    <span className="text-white/30 text-sm">total premium</span>
                  </div>
                  {quoteResult.policy_wording_url && (
                    <a href={quoteResult.policy_wording_url} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-[#C9A84C]/60 hover:text-[#C9A84C] mt-1 block transition-colors">
                      Read full policy wording →
                    </a>
                  )}
                </div>

                {/* Coverage bullets */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {[
                    'Emergency medical up to $1M',
                    'Trip cancellation',
                    'Baggage protection',
                    '24/7 assistance',
                    'Flight delays',
                    'Personal liability',
                  ].map(b => (
                    <div key={b} className="flex items-center gap-2 text-white/70 text-xs">
                      <Check className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                      {b}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-white/30 text-xs">
                  Quote valid until {new Date(quoteResult.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} today
                </p>
                {session ? (
                  <button
                    onClick={() => setShowCheckout(true)}
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg"
                  >
                    <Shield className="w-4 h-4" />
                    Buy Now — Secure Checkout
                  </button>
                ) : (
                  <a
                    href={`/login?callbackUrl=/insurance`}
                    className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105"
                  >
                    Sign in to Purchase
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Benefits ───────────────────────────────────────────── */}
      <section
        ref={benefitsRef}
        className="bg-[#F7F4EF] py-16 lg:py-20 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">What&apos;s Covered</p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Comprehensive Cover From Day One
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {BENEFITS.map((b, i) => (
              <div
                key={b}
                data-benefit
                className="flex items-start gap-3 bg-white rounded-xl border border-[#E2D9CC] p-4 hover:border-[#C9A84C]/40 transition-all duration-300"
                style={{ opacity: 0, transform: 'translateY(12px)' }}
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#C9A84C]/15 flex items-center justify-center mt-0.5">
                  <Check className="w-3.5 h-3.5 text-[#C9A84C]" />
                </div>
                <p className="text-[#0B1F3A] text-sm font-medium leading-snug">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Coverage Table ─────────────────────────────────────── */}
      <section
        ref={tableRef}
        className="bg-white py-16 lg:py-20 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">Coverage Limits</p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              What You&apos;re Covered For
            </h2>
          </div>
          <div className="rounded-2xl border border-[#E2D9CC] overflow-hidden">
            <div className="grid grid-cols-3 px-6 py-3 bg-[#0B1F3A]">
              <span className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-wider">Category</span>
              <span className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-wider">Cover Type</span>
              <span className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-wider text-right">Limit</span>
            </div>
            {COVERAGE_TABLE.map((row, i) => (
              <div key={i} className="grid grid-cols-3 px-6 py-4 border-t border-[#F5F2EE] hover:bg-[#F5F2EE]/60 transition-colors">
                <span className="text-[#0B1F3A]/40 text-xs font-semibold uppercase tracking-wide">{row.category}</span>
                <span className="text-[#0B1F3A] text-sm font-medium">{row.item}</span>
                <span className="text-[#C9A84C] text-sm font-bold text-right">{row.limit}</span>
              </div>
            ))}
          </div>
          <p className="text-[#0B1F3A]/40 text-xs text-center mt-5">
            Limits shown are indicative and subject to policy terms. Exact cover depends on destination and policy type.
          </p>
        </div>
      </section>

      {/* ── Section 5: How It Works ───────────────────────────────────────── */}
      <section
        id="how-it-works"
        ref={stepsRef}
        className="bg-[#0B1F3A] py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">The Process</p>
            <h2 className="font-display text-white font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              How It Works
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, body }) => (
              <div key={step} className="relative">
                <div className="hidden lg:block absolute top-7 left-full w-5 h-px bg-white/10 z-10" />
                <div className="bg-white/5 rounded-2xl border border-white/8 p-6 hover:bg-white/8 hover:border-[#C9A84C]/20 transition-all duration-300 h-full">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-[#C9A84C]/20 font-display font-bold text-3xl leading-none select-none">{step}</span>
                    <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4.5 h-4.5 text-[#C9A84C]" style={{ width: '1.1rem', height: '1.1rem' }} />
                    </div>
                  </div>
                  <h3 className="text-white font-bold text-sm mb-2">{title}</h3>
                  <p className="text-white/45 text-xs leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: CTA + Disclaimer ──────────────────────────────────── */}
      <section
        ref={finalRef}
        className="bg-[#C9A84C] py-16 lg:py-20 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-3xl mx-auto text-center">
          <Zap className="w-10 h-10 text-[#0B1F3A]/50 mx-auto mb-5" />
          <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,4vw,3rem)] leading-tight mb-4">
            Get Covered Before You Fly
          </h2>
          <p className="text-[#0B1F3A]/70 text-base mb-8 max-w-lg mx-auto leading-relaxed">
            Get an instant quote above, or WhatsApp Jade and we&apos;ll arrange your policy within the hour.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#get-quote"
              onClick={e => { e.preventDefault(); document.getElementById('get-quote')?.scrollIntoView({ behavior: 'smooth' }) }}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 shadow-xl shadow-[#0B1F3A]/20"
            >
              <Shield className="w-4 h-4" />
              Get Instant Quote
            </a>
            <a
              href="https://wa.me/12317902336?text=Hi%20Walz%20Travels%2C%20I%20need%20travel%20insurance%20for%20my%20upcoming%20trip."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-white/20 hover:bg-white/30 text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Jade
            </a>
          </div>
          <p className="text-[#0B1F3A]/50 text-xs mt-6 max-w-md mx-auto leading-relaxed">
            Travel insurance is arranged by Walz Travels in partnership with Battleface Insurance Services.
            Policy terms, conditions and exclusions apply.
          </p>
        </div>
      </section>

      {/* ── Checkout Modal ────────────────────────────────────────────────── */}
      {showCheckout && quoteResult && (
        <CheckoutModal
          quote={quoteResult}
          destination={destination}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  )
}

// Wrap in Suspense so useSearchParams doesn't break static rendering
export default function InsurancePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <InsurancePageInner />
    </Suspense>
  )
}
