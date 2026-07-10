'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession }  from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe }  from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  ArrowLeft, Wifi, Clock, Check, X, Lock, RefreshCw, ChevronDown,
} from 'lucide-react'
import type { EsimPackage } from '@/lib/esim/types'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ── Filter tabs ───────────────────────────────────────────────────────────────
// Field mappings confirmed from Airalo's GET /v2/packages response schema:
//   Data              → operator.plan_type === "data"
//   Data+Calls+Texts  → operator.plan_type === "data-voice-text"
//   Unlimited         → package.is_unlimited === true
//   Standard          → package.is_unlimited === false
type FilterKey = 'all' | 'data' | 'voice' | 'unlimited' | 'standard'
const FILTER_LABELS: Record<FilterKey, string> = {
  all:      'All',
  data:     'Data',
  voice:    'Data + Calls & Texts',
  unlimited:'Unlimited',
  standard: 'Standard',
}

function filterPackages(pkgs: EsimPackage[], by: FilterKey): EsimPackage[] {
  if (by === 'all')       return pkgs
  if (by === 'unlimited') return pkgs.filter(p => p.isUnlimited === true)
  if (by === 'standard')  return pkgs.filter(p => !p.isUnlimited)
  // Use planType (operator.plan_type) as the primary signal; fall back to voice/text
  // fields for packages that pre-date the planType field being stored.
  if (by === 'voice')     return pkgs.filter(p =>
    p.planType === 'data-voice-text' || (!p.planType && (p.voice != null || p.text != null)),
  )
  // data-only: planType === "data", or no voice/text and planType isn't voice
  return pkgs.filter(p =>
    p.planType === 'data' || (!p.planType && p.voice == null && p.text == null),
  )
}

// ── Sort options ──────────────────────────────────────────────────────────────
type SortKey = 'price' | 'data' | 'duration'
const SORT_LABELS: Record<SortKey, string> = { price: 'Price', data: 'Data', duration: 'Duration' }

function sortPackages(pkgs: EsimPackage[], by: SortKey): EsimPackage[] {
  return [...pkgs].sort((a, b) => {
    if (by === 'price')    return a.retailUsd - b.retailUsd
    if (by === 'data')     return (b.dataAmount ?? 0) - (a.dataAmount ?? 0)
    if (by === 'duration') return b.durationDays - a.durationDays
    return 0
  })
}

function parseData(label: string): { amount: string; unit: string } {
  if (!label || label === 'Unlimited') return { amount: '∞', unit: 'Unlimited' }
  const m = label.match(/^([\d.]+)\s*(GB|MB|TB)$/i)
  if (m) return { amount: m[1], unit: m[2].toUpperCase() }
  return { amount: label, unit: '' }
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({
  pkg, popular, onBuy,
}: {
  pkg:     EsimPackage
  popular: boolean
  onBuy:   (pkg: EsimPackage) => void
}) {
  const data = parseData(pkg.dataLabel)

  return (
    <div
      className="bg-white rounded-2xl flex flex-col relative overflow-hidden transition-all duration-200"
      style={{
        border: popular ? '2px solid #C9A84C' : '1px solid #E9E6E0',
        boxShadow: popular ? '0 4px 20px rgba(201,168,76,0.12)' : '0 1px 4px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => {
        if (!popular) {
          e.currentTarget.style.borderColor = '#C9A84C'
          e.currentTarget.style.boxShadow   = '0 4px 16px rgba(201,168,76,0.12)'
        }
      }}
      onMouseLeave={e => {
        if (!popular) {
          e.currentTarget.style.borderColor = '#E9E6E0'
          e.currentTarget.style.boxShadow   = '0 1px 4px rgba(0,0,0,0.05)'
        }
      }}
    >
      {/* Popular badge */}
      {popular && (
        <div className="absolute top-0 right-0 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-xl"
          style={{ background: '#C9A84C', color: '#0B1F3A' }}>
          Most Popular
        </div>
      )}

      <div className="p-6 flex flex-col flex-1">
        {/* Speed badge */}
        <div className="mb-4">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#F5F4F0] text-[#6B7280]">
            {pkg.speed || '4G'}
          </span>
        </div>

        {/* Data — big number (Airalo signature) */}
        <div className="mb-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-bold text-[#0D1B2A] leading-none"
              style={{ fontSize: data.amount === '∞' ? '4rem' : 'clamp(2.8rem, 6vw, 3.5rem)' }}
            >
              {data.amount}
            </span>
            {data.unit && data.unit !== 'Unlimited' && (
              <span className="text-xl font-semibold text-[#6B7280]">{data.unit}</span>
            )}
          </div>
          <p className="text-xs text-[#9CA3AF] mt-1">data</p>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[#F0EDE8]" />

        {/* Plan details */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center gap-2 text-[13px] text-[#4B5563]">
            <Clock className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
            <span>{pkg.durationDays} days validity</span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-[#4B5563]">
            <Wifi className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
            <span>{pkg.speed || '4G/LTE'} speeds</span>
          </div>
          {pkg.voice && (
            <div className="flex items-center gap-2 text-[13px] text-[#4B5563]">
              <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span>Calls: {pkg.voice}</span>
            </div>
          )}
          {pkg.text && (
            <div className="flex items-center gap-2 text-[13px] text-[#4B5563]">
              <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              <span>SMS: {pkg.text}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[13px] text-[#4B5563]">
            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            <span>Instant QR delivery</span>
          </div>
          {pkg.isFairUsagePolicy && (
            <div className="flex items-start gap-2 pt-1">
              <span className="flex-shrink-0 mt-0.5 w-3.5 h-3.5 text-amber-500 text-[11px] font-bold leading-none">⚠</span>
              <p className="text-[11px] text-amber-700 leading-snug">
                {pkg.fairUsagePolicy ?? 'Fair usage policy applies — speeds may reduce after high usage.'}
              </p>
            </div>
          )}
        </div>

        {/* Price + CTA */}
        <div className="mt-auto">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[1.6rem] font-bold text-[#0D1B2A] leading-none">${pkg.retailUsd.toFixed(2)}</p>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">USD · one-time payment</p>
            </div>
          </div>
          <button
            onClick={() => onBuy(pkg)}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:brightness-110 active:scale-[.98]"
            style={{ background: popular ? '#C9A84C' : '#0B1F3A', color: popular ? '#0B1F3A' : '#C9A84C' }}
          >
            Buy Now
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Checkout form (Stripe Elements) ──────────────────────────────────────────
function CheckoutForm({
  pkg, flag, name, onSuccess, onClose,
}: {
  pkg:       EsimPackage
  flag:      string
  name:      string
  onSuccess: () => void
  onClose:   () => void
}) {
  const stripe   = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true); setErrMsg('')
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}${window.location.pathname}?paid=1` },
    })
    if (error) {
      setErrMsg(error.message ?? 'Payment failed. Please try again.')
      setPaying(false)
      return
    }
    onSuccess()
  }

  return (
    <form onSubmit={handlePay} className="p-6 pt-0">
      {/* Plan recap */}
      <div className="bg-[#F8F9FA] rounded-xl p-4 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-[#0B1F3A] text-base">{flag} {name}</p>
            <p className="text-[#0B1F3A]/60 text-sm mt-0.5">{pkg.name}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {[`${pkg.durationDays} days`, pkg.dataLabel, pkg.speed].map(v => (
                <span key={v} className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">{v}</span>
              ))}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-[#0B1F3A]">${pkg.retailUsd.toFixed(2)}</p>
            <p className="text-xs text-[#0B1F3A]/40">USD</p>
          </div>
        </div>
      </div>

      <div className="mb-5"><PaymentElement options={{ layout: 'tabs' }} /></div>

      <ul className="space-y-1.5 mb-5">
        {['QR code sent to your email instantly', 'Activate before you land', '24/7 WhatsApp support'].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-[#374151]">
            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /> {item}
          </li>
        ))}
      </ul>

      {errMsg && <p className="text-red-500 text-sm mb-4 text-center">{errMsg}</p>}

      <button type="submit" disabled={!stripe || paying}
        className="w-full py-4 font-bold text-sm rounded-full disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
        style={{ background: '#C9A84C', color: '#0B1F3A' }}>
        {paying
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
          : <><Lock className="w-3.5 h-3.5" /> Pay USD ${pkg.retailUsd.toFixed(2)}</>
        }
      </button>
      <p className="text-[#9CA3AF] text-[11px] text-center mt-3">Secured by Stripe · No card details stored</p>
    </form>
  )
}

// ── Checkout modal (gateway picker) ──────────────────────────────────────────
function CheckoutModal({
  pkg, flag, name, code, onClose, onDone,
}: {
  pkg:     EsimPackage
  flag:    string
  name:    string
  code:    string
  onClose: () => void
  onDone:  () => void
}) {
  const { data: session } = useSession()
  const router            = useRouter()
  const [step,          setStep]          = useState<'pick' | 'stripe'>('pick')
  const [clientSecret,  setClientSecret]  = useState<string | null>(null)
  const [loadingStripe, setLoadingStripe] = useState(false)
  const [loadingFlw,    setLoadingFlw]    = useState(false)
  const [checkoutErr,   setCheckoutErr]   = useState('')

  function payload(gateway: string) {
    return {
      gateway,
      packageCode:     pkg.packageCode,
      packageName:     pkg.name,
      destination:     name,
      destinationIso2: code,
      durationDays:    pkg.durationDays,
      dataAmount:      pkg.dataAmount,
      dataUnit:        pkg.dataUnit,
      dataLabel:       pkg.dataLabel,
      wholesaleUsd:    pkg.wholesaleUsd,
      retailUsd:       pkg.retailUsd,
      speed:           pkg.speed,
    }
  }

  async function pickStripe() {
    if (!session?.user?.email) { router.push(`/login?callbackUrl=${encodeURIComponent(`/esim/${code.toLowerCase()}`)}`); return }
    setStep('stripe'); setLoadingStripe(true); setCheckoutErr('')
    try {
      const res  = await fetch('/api/esim/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload('stripe')),
      })
      const data = await res.json() as { clientSecret?: string; error?: string }
      if (data.clientSecret) setClientSecret(data.clientSecret)
      else setCheckoutErr(data.error ?? 'Failed to start checkout.')
    } catch { setCheckoutErr('Connection error. Please try again.') }
    finally  { setLoadingStripe(false) }
  }

  async function pickFlutterwave() {
    if (!session?.user?.email) { router.push(`/login?callbackUrl=${encodeURIComponent(`/esim/${code.toLowerCase()}`)}`); return }
    setLoadingFlw(true); setCheckoutErr('')
    try {
      const res  = await fetch('/api/esim/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload('flutterwave')),
      })
      const data = await res.json() as { checkoutUrl?: string; error?: string }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl
      else { setCheckoutErr(data.error ?? 'Flutterwave error.'); setLoadingFlw(false) }
    } catch { setCheckoutErr('Connection error. Please try again.'); setLoadingFlw(false) }
  }

  const planPill = (
    <div className="bg-[#F8F9FA] rounded-xl p-4 mb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-[#0B1F3A]">{flag} {name}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[`${pkg.durationDays} days`, pkg.dataLabel, pkg.speed].map(v => (
              <span key={v} className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">{v}</span>
            ))}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-[#0B1F3A]">${pkg.retailUsd.toFixed(2)}</p>
          <p className="text-[11px] text-[#0B1F3A]/40">USD</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-[#0B1F3A] px-6 py-5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase">📶 Jade Connect</p>
            <h3 className="text-white font-bold text-lg mt-0.5">
              {step === 'pick' ? 'Choose Payment Method' : 'Secure Checkout'}
            </h3>
          </div>
          <button
            onClick={step === 'stripe' && !clientSecret ? () => { setStep('pick'); setCheckoutErr('') } : onClose}
            className="text-white/40 hover:text-white transition-colors p-1">
            {step === 'stripe' && !clientSecret
              ? <span className="text-xs font-semibold">← Back</span>
              : <X className="w-5 h-5" />}
          </button>
        </div>

        {/* Gateway picker */}
        {step === 'pick' && (
          <div className="p-6">
            {planPill}
            <p className="text-[#0B1F3A]/50 text-sm mb-4 text-center">How would you like to pay?</p>
            <div className="space-y-3">
              <button onClick={pickStripe}
                className="w-full flex items-center gap-3 p-4 border-2 border-[#E5E7EB] rounded-xl hover:border-[#0B1F3A] transition-colors text-left">
                <div className="w-10 h-10 rounded-lg bg-[#635BFF] flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-[#0B1F3A] text-sm">Pay by Card</p>
                  <p className="text-[#0B1F3A]/45 text-xs">Visa, Mastercard · Secured by Stripe</p>
                </div>
              </button>
              <button onClick={pickFlutterwave} disabled={loadingFlw}
                className="w-full flex items-center gap-3 p-4 border-2 border-[#E5E7EB] rounded-xl hover:border-[#F5A623] transition-colors text-left disabled:opacity-60">
                <div className="w-10 h-10 rounded-lg bg-[#F5A623] flex items-center justify-center flex-shrink-0 text-lg font-bold text-white">
                  F
                </div>
                <div>
                  <p className="font-semibold text-[#0B1F3A] text-sm">
                    {loadingFlw ? 'Redirecting…' : 'Pay with Flutterwave'}
                  </p>
                  <p className="text-[#0B1F3A]/45 text-xs">Card · Bank transfer · Mobile money</p>
                </div>
              </button>
            </div>
            {checkoutErr && <p className="text-red-500 text-sm mt-4 text-center">{checkoutErr}</p>}
          </div>
        )}

        {/* Stripe Elements */}
        {step === 'stripe' && (
          loadingStripe ? (
            <div className="p-10 text-center">
              <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-4" />
              <p className="text-[#0B1F3A]/60 text-sm">Preparing secure checkout…</p>
            </div>
          ) : checkoutErr ? (
            <div className="p-8 text-center">
              <p className="text-red-500 text-sm mb-4">{checkoutErr}</p>
              <button onClick={() => { setStep('pick'); setCheckoutErr('') }}
                className="px-5 py-2.5 bg-[#0B1F3A] text-white rounded-full text-sm font-semibold">Back</button>
            </div>
          ) : clientSecret ? (
            <Elements stripe={stripePromise} options={{
              clientSecret,
              appearance: { theme: 'stripe', variables: { colorPrimary: '#C9A84C', colorBackground: '#FFFFFF', borderRadius: '8px' } },
            }}>
              <CheckoutForm pkg={pkg} flag={flag} name={name} onSuccess={onDone} onClose={onClose} />
            </Elements>
          ) : null
        )}
      </div>
    </div>
  )
}

// ── Success overlay ───────────────────────────────────────────────────────────
function SuccessOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    ;(async () => {
      try {
        const confetti = (await import('canvas-confetti')).default
        const opts = { spread: 90, ticks: 100, gravity: 1.2, decay: 0.94, startVelocity: 40,
          colors: ['#C9A84C','#FFD700','#0B1F3A','#FFFFFF'] }
        confetti({ ...opts, origin: { x: 0.3, y: 0.5 }, particleCount: 60 })
        setTimeout(() => confetti({ ...opts, origin: { x: 0.7, y: 0.5 }, particleCount: 60 }), 150)
        setTimeout(() => confetti({ ...opts, origin: { x: 0.5, y: 0.3 }, particleCount: 80 }), 300)
      } catch { /* no-op */ }
    })()
  }, [])

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5 border-4 border-green-400">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-2">📶 Jade Connect</p>
        <h2 className="font-display font-bold text-[#0B1F3A] text-2xl mb-2">You&apos;re connected!</h2>
        <p className="text-[#0B1F3A]/55 text-sm leading-relaxed mb-7">
          Your eSIM QR code is on its way to your email. Check your inbox in a few minutes.
          <br /><br />Activate before you land — your data starts when you first use it.
        </p>
        <div className="space-y-3">
          <a href="/portal/esims"
            className="block w-full py-3.5 text-center font-bold text-sm rounded-full hover:opacity-90 transition-opacity"
            style={{ background: '#C9A84C', color: '#0B1F3A' }}>
            View My eSIMs
          </a>
          <button onClick={onClose}
            className="block w-full py-3 text-[#0B1F3A]/50 text-sm hover:text-[#0B1F3A] transition-colors">
            Buy another eSIM
          </button>
        </div>
      </div>
    </div>
  )
}

// ── FAQ data ──────────────────────────────────────────────────────────────────
function CountryFAQ({ name }: { name: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const items = [
    {
      q: `Does the ${name} eSIM work on my phone?`,
      a: `Most modern smartphones support eSIM — iPhone XS and later, Google Pixel 3 and later, and most Samsung Galaxy S20+ devices. Check Settings → Mobile Data to see if your device shows "Add eSIM".`,
    },
    {
      q: 'How do I install the eSIM?',
      a: 'After purchase, you\'ll receive a QR code by email. On iPhone: Settings → Mobile Data → Add eSIM → Use QR Code. On Android: Settings → Network → SIM → Add eSIM → Scan QR. Install before you travel, but only activate it when you land.',
    },
    {
      q: 'When does my data allowance start?',
      a: 'Your data allowance starts when you first use mobile data on the eSIM. This gives you flexibility — install it at home, activate it when you arrive.',
    },
    {
      q: 'Can I keep my existing SIM?',
      a: 'Yes. eSIM runs alongside your existing physical SIM. You can switch between them at any time, or use them both simultaneously on dual-SIM devices.',
    },
    {
      q: 'What if I run out of data?',
      a: 'You can purchase another plan at any time — just repeat the process. WhatsApp Jade on +1 231 790 2336 if you need help mid-trip.',
    },
  ]

  return (
    <section className="bg-white border-t border-[#E9E6E0] py-14 px-5 sm:px-8">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-display font-bold text-[#0D1B2A] text-2xl mb-8 text-center">
          Frequently asked questions
        </h2>
        <div className="divide-y divide-[#E9E6E0]">
          {items.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between py-4 text-left"
              >
                <span className="font-semibold text-[#0D1B2A] text-[15px] pr-4">{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-[#C9A84C] flex-shrink-0 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              {open === i && (
                <p className="pb-4 text-[14px] text-[#6B7280] leading-relaxed">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Main country page ─────────────────────────────────────────────────────────
export function EsimCountryPage({
  code, name, flag, packages,
}: {
  code:     string
  name:     string
  flag:     string
  packages: EsimPackage[]
}) {
  const { data: session } = useSession()
  const router            = useRouter()
  const searchParams      = useSearchParams()

  const [sortBy,       setSortBy]       = useState<SortKey>('price')
  const [filterBy,     setFilterBy]     = useState<FilterKey>('all')
  const [checkoutPkg,  setCheckoutPkg]  = useState<EsimPackage | null>(null)
  const [showSuccess,  setShowSuccess]  = useState(false)

  const filtered = filterPackages(packages, filterBy)
  const sorted   = sortPackages(filtered, sortBy)
  const popular  = sorted[Math.floor(sorted.length / 2)] // middle-priced plan

  // Compute which filter tabs have results so we can hide empty ones
  const filterCounts: Record<FilterKey, number> = {
    all:       packages.length,
    data:      filterPackages(packages, 'data').length,
    voice:     filterPackages(packages, 'voice').length,
    unlimited: filterPackages(packages, 'unlimited').length,
    standard:  filterPackages(packages, 'standard').length,
  }

  // Auto-open checkout if returning from login with ?buy=packageCode
  useEffect(() => {
    const buyCode = searchParams.get('buy')
    if (buyCode && session?.user) {
      const pkg = packages.find(p => p.packageCode === buyCode)
      if (pkg) {
        setCheckoutPkg(pkg)
        router.replace(`/esim/${code.toLowerCase()}`, { scroll: false })
      }
    }
    if (searchParams.get('paid') === '1') {
      setShowSuccess(true)
    }
  }, [session, searchParams, packages, code, router])

  const handleBuy = useCallback((pkg: EsimPackage) => {
    if (!session?.user?.email) {
      const returnUrl = `/esim/${code.toLowerCase()}?buy=${encodeURIComponent(pkg.packageCode)}`
      router.push(`/login?callbackUrl=${encodeURIComponent(returnUrl)}`)
      return
    }
    setCheckoutPkg(pkg)
  }, [session, router, code])

  const minPrice = packages.reduce((m, p) => Math.min(m, p.retailUsd), Infinity)

  return (
    <>
      {/* ── Country hero ── */}
      <div style={{ background: '#0B1F3A' }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-6 pb-12">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-8 text-xs">
            <Link href="/esim" className="flex items-center gap-1.5 text-white/40 hover:text-[#C9A84C] transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> eSIM Plans
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-white/60">{name}</span>
          </div>

          {/* Hero content */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="text-6xl sm:text-7xl leading-none flex-shrink-0" aria-hidden>
              {flag}
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-3xl sm:text-4xl leading-tight mb-2">
                {name} eSIM Plans
              </h1>
              <p className="text-white/45 text-sm mb-4">
                {packages.length} plan{packages.length !== 1 ? 's' : ''} available &nbsp;·&nbsp; 4G/5G &nbsp;·&nbsp; Instant delivery &nbsp;·&nbsp; from&nbsp;
                <span className="text-[#C9A84C] font-semibold">${minPrice.toFixed(2)}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {['No roaming charges', 'QR code by email', 'Activate before you land'].map(t => (
                  <span key={t}
                    className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1 rounded-full"
                    style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#C9A84C' }}>
                    <Check className="w-3 h-3" /> {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Plans section ── */}
      <div style={{ background: '#F5F4F0' }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">

          {/* Filter tabs */}
          <div className="flex gap-2 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {(Object.keys(FILTER_LABELS) as FilterKey[])
              .filter(k => filterCounts[k] > 0 || k === 'all')
              .map(key => (
                <button
                  key={key}
                  onClick={() => { setFilterBy(key); setSortBy('price') }}
                  className="flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background:  filterBy === key ? '#0B1F3A' : 'white',
                    color:       filterBy === key ? '#C9A84C' : '#6B7280',
                    border:      filterBy === key ? '1.5px solid #0B1F3A' : '1.5px solid #E9E6E0',
                    boxShadow:   filterBy === key ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
                  }}>
                  {FILTER_LABELS[key]}
                  {key !== 'all' && (
                    <span className="ml-1.5 opacity-50 text-[10px]">({filterCounts[key]})</span>
                  )}
                </button>
              ))}
          </div>

          {/* Sort bar */}
          <div className="flex items-center justify-between mb-6 gap-4">
            <p className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-wider">
              {sorted.length} plan{sorted.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1 bg-white rounded-xl border border-[#E9E6E0] p-1">
              <span className="text-[11px] text-[#9CA3AF] px-2">Sort:</span>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
                <button key={key} onClick={() => setSortBy(key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: sortBy === key ? '#0B1F3A' : 'transparent',
                    color:      sortBy === key ? '#C9A84C' : '#6B7280',
                  }}>
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Plan grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.length === 0 ? (
              <div className="col-span-full text-center py-16">
                <p className="text-[#6B7280] text-base mb-1">No {FILTER_LABELS[filterBy].toLowerCase()} plans available</p>
                <button onClick={() => setFilterBy('all')} className="text-[#C9A84C] text-sm font-semibold hover:opacity-75 mt-2">
                  Show all plans
                </button>
              </div>
            ) : sorted.map(pkg => (
              <PlanCard
                key={pkg.packageCode}
                pkg={pkg}
                popular={pkg.packageCode === popular?.packageCode}
                onBuy={handleBuy}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Trust strip ── */}
      <div className="bg-white border-t border-[#E9E6E0] py-8">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
          {[
            ['📶', 'Instant eSIM delivery to your email'],
            ['🔒', 'Secure checkout — Stripe & Flutterwave'],
            ['💬', '24/7 WhatsApp support from Jade'],
            ['✈️', 'Used by 30M+ travellers worldwide'],
          ].map(([icon, label]) => (
            <div key={label} className="flex items-center gap-2.5 text-sm text-[#4B5563]">
              <span>{icon}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ── */}
      <CountryFAQ name={name} />

      {/* ── Bottom CTA ── */}
      <div className="bg-[#0B1F3A] py-12 px-5 sm:px-8 text-center">
        <p className="text-[#C9A84C] text-xs font-semibold tracking-widest uppercase mb-3">📶 Jade Connect</p>
        <h2 className="font-display font-bold text-white text-2xl mb-2">
          Ready to stay connected in {name}?
        </h2>
        <p className="text-white/40 text-sm mb-6">Instant eSIM · 4G/5G · No roaming · From ${minPrice.toFixed(2)}</p>
        <button
          onClick={() => {
            const first = sorted[0]
            if (first) handleBuy(first)
            else document.querySelector('#plan-grid')?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="px-8 py-3.5 rounded-full font-bold text-sm transition-all hover:brightness-110"
          style={{ background: '#C9A84C', color: '#0B1F3A' }}>
          Get {name} eSIM — from ${minPrice.toFixed(2)}
        </button>
        <p className="text-white/25 text-xs mt-4">
          Need help? <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer" className="text-[#C9A84C] hover:opacity-80">WhatsApp Jade</a>
        </p>
      </div>

      {/* ── Modals ── */}
      {checkoutPkg && !showSuccess && (
        <CheckoutModal
          pkg={checkoutPkg}
          flag={flag}
          name={name}
          code={code}
          onClose={() => setCheckoutPkg(null)}
          onDone={() => { setCheckoutPkg(null); setShowSuccess(true) }}
        />
      )}
      {showSuccess && <SuccessOverlay onClose={() => setShowSuccess(false)} />}
    </>
  )
}
