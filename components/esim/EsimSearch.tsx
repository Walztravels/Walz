'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSession }  from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe }  from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  Search, X, Lock, Check, ArrowRight, RefreshCw, MessageCircle, Wifi,
} from 'lucide-react'
import type { EsimPackage, CountryGroup, Toast } from '@/lib/esim/types'
import { groupByCountry, REGIONS } from '@/lib/esim/utils'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const REGION_ORDER  = ['All', 'Europe', 'Asia', 'Americas', 'Middle East', 'Africa', 'Oceania', 'Global']
const POPULAR_CODES = ['GB', 'AE', 'CA', 'FR', 'US', 'JP', 'NG', 'GH', 'TH', 'DE']

// ── Toast system ──────────────────────────────────────────────────────────────
function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className="flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl pointer-events-auto"
          style={{
            background: t.type === 'success' ? 'rgba(20,83,45,0.95)' : t.type === 'error' ? 'rgba(127,29,29,0.95)' : 'rgba(11,31,58,0.97)',
            border:     t.type === 'success' ? '1px solid rgba(34,197,94,0.4)' : t.type === 'error' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(201,168,76,0.4)',
            backdropFilter: 'blur(16px)',
            animation: 'toastIn .3s ease',
          }}>
          <span className="text-sm font-semibold text-white">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-white/40 hover:text-white ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

// ── Data display helper ───────────────────────────────────────────────────────
function parseData(label: string): { amount: string; unit: string } {
  if (!label || label === 'Unlimited') return { amount: '∞', unit: 'Unlimited' }
  const m = label.match(/^([\d.]+)\s*(GB|MB|TB)$/i)
  if (m) return { amount: m[1], unit: m[2].toUpperCase() }
  return { amount: label, unit: '' }
}

// ── Plan card (Airalo-style) ──────────────────────────────────────────────────
function PlanCard({ pkg, onBuy }: { pkg: EsimPackage; onBuy: () => void }) {
  const data = parseData(pkg.dataLabel)
  return (
    <div
      className="bg-white rounded-2xl flex flex-col transition-all duration-200 overflow-hidden"
      style={{ border: '1px solid #E9E6E0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#C9A84C'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(201,168,76,0.14)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#E9E6E0'
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      {/* Speed badge */}
      <div className="px-5 pt-4 pb-0 flex items-center justify-between">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-[#F5F4F0] text-[#6B7280]">
          {pkg.speed || '4G'}
        </span>
        <span className="text-[10px] text-[#C9A84C] font-semibold">
          {pkg.durationDays}d
        </span>
      </div>

      {/* Data amount — Airalo big number */}
      <div className="px-5 pt-3 pb-0">
        <div className="flex items-baseline gap-1.5">
          <span className="font-bold text-[#0D1B2A] leading-none"
            style={{ fontSize: data.amount === '∞' ? '3.5rem' : 'clamp(2.2rem, 5vw, 3rem)' }}>
            {data.amount}
          </span>
          {data.unit && data.unit !== 'Unlimited' && (
            <span className="text-lg font-semibold text-[#6B7280] mb-0.5">{data.unit}</span>
          )}
        </div>
        <p className="text-[11px] text-[#9CA3AF] mt-0.5">data</p>
      </div>

      {/* Divider */}
      <div className="mx-5 mt-4 border-t border-[#F0EDE8]" />

      {/* Duration row */}
      <div className="px-5 pt-3 pb-0 flex items-center gap-2 text-[#6B7280]">
        <Wifi className="w-3.5 h-3.5 text-[#C9A84C]" />
        <span className="text-[13px] font-medium">{pkg.durationDays} days validity</span>
      </div>

      {/* Price + CTA */}
      <div className="px-5 pt-4 pb-5 mt-auto flex items-center justify-between gap-3">
        <div>
          <p className="text-[1.35rem] font-bold text-[#0D1B2A] leading-none">${pkg.retailUsd.toFixed(2)}</p>
          <p className="text-[10px] text-[#9CA3AF] mt-0.5">USD one-time</p>
        </div>
        <button
          onClick={onBuy}
          className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:brightness-110 active:scale-95 flex-shrink-0"
          style={{ background: '#C9A84C', color: '#0B1F3A' }}
        >
          Get Plan
        </button>
      </div>
    </div>
  )
}

// ── Country plans panel (slide-up overlay) ────────────────────────────────────
function CountryPlansPanel({
  group, onClose, onBuy,
}: {
  group:  CountryGroup
  onClose: () => void
  onBuy:  (pkg: EsimPackage, g: CountryGroup) => void
}) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(7,21,35,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-[#F5F4F0] w-full sm:max-w-3xl sm:mx-5 rounded-t-3xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '88vh', animation: 'panelUp 0.32s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-[#D1CBC0]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#E9E6E0] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none">{group.flag}</span>
            <div>
              <h2 className="font-bold text-[#0D1B2A] text-lg leading-tight">{group.name}</h2>
              <p className="text-[#9CA3AF] text-xs">
                {group.packages.length} plan{group.packages.length !== 1 ? 's' : ''} available
                &nbsp;·&nbsp;from&nbsp;${group.minPrice.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F5F4F0] flex items-center justify-center text-[#6B7280] hover:bg-[#E9E6E0] transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Plans grid */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.packages.map(pkg => (
              <PlanCard
                key={pkg.packageCode}
                pkg={pkg}
                onBuy={() => onBuy(pkg, group)}
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes panelUp {
          from { transform: translateY(28px); opacity: 0 }
          to   { transform: translateY(0);    opacity: 1 }
        }
      `}</style>
    </div>
  )
}

// ── Country card (Airalo-style) ───────────────────────────────────────────────
function CountryCard({ group, onSelect }: { group: CountryGroup; onSelect: (g: CountryGroup) => void }) {
  return (
    <button
      onClick={() => onSelect(group)}
      className="text-center p-5 rounded-2xl bg-white transition-all duration-200 group"
      style={{ border: '1px solid #E9E6E0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#C9A84C'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(201,168,76,0.14)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#E9E6E0'
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <span className="block text-4xl mb-3 leading-none">{group.flag}</span>
      <p className="font-semibold text-[#0D1B2A] text-[13px] mb-1 leading-tight">{group.name}</p>
      <p className="text-[#9CA3AF] text-[11px] mb-2">
        {group.packages.length} plan{group.packages.length !== 1 ? 's' : ''}
      </p>
      <p className="font-bold text-[#C9A84C] text-[13px]">from ${group.minPrice.toFixed(2)}</p>
    </button>
  )
}

// ── Checkout form (inner — uses Stripe hooks) ─────────────────────────────────
function CheckoutForm({
  pkg, country, onSuccess, onClose,
}: {
  pkg:       EsimPackage
  country:   CountryGroup
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
      confirmParams: { return_url: `${window.location.origin}/esim?paid=1` },
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
            <p className="font-bold text-[#0B1F3A] text-base">{country.flag} {country.name}</p>
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
        className="w-full py-4 font-bold text-sm rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: '#C9A84C', color: '#0B1F3A' }}>
        {paying
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing…</>
          : <><Lock className="w-3.5 h-3.5" /> Pay USD ${pkg.retailUsd.toFixed(2)} — Secure Checkout</>
        }
      </button>
      <p className="text-[#9CA3AF] text-[11px] text-center mt-3">Secured by Stripe · No card details stored by Walz Travels</p>
    </form>
  )
}

// ── Checkout modal (gateway picker → PaymentIntent or Flutterwave redirect) ───
function CheckoutModal({
  pkg, country, onClose, onDone,
}: {
  pkg:     EsimPackage
  country: CountryGroup
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

  function checkoutPayload(gateway: string) {
    return {
      gateway,
      packageCode: pkg.packageCode, packageName: pkg.name,
      destination: country.name, destinationIso2: country.code,
      durationDays: pkg.durationDays, dataAmount: pkg.dataAmount,
      dataUnit: pkg.dataUnit, dataLabel: pkg.dataLabel,
      wholesaleUsd: pkg.wholesaleUsd, retailUsd: pkg.retailUsd, speed: pkg.speed,
    }
  }

  async function pickStripe() {
    if (!session?.user?.email) { router.push(`/auth/login?redirect=/esim`); return }
    setStep('stripe')
    setLoadingStripe(true)
    setCheckoutErr('')
    try {
      const res  = await fetch('/api/esim/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload('stripe')),
      })
      const data = await res.json() as { clientSecret?: string; error?: string }
      if (data.clientSecret) setClientSecret(data.clientSecret)
      else setCheckoutErr(data.error ?? 'Failed to start checkout.')
    } catch {
      setCheckoutErr('Connection error. Please try again.')
    } finally {
      setLoadingStripe(false)
    }
  }

  async function pickFlutterwave() {
    if (!session?.user?.email) { router.push(`/auth/login?redirect=/esim`); return }
    setLoadingFlw(true)
    setCheckoutErr('')
    try {
      const res  = await fetch('/api/esim/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload('flutterwave')),
      })
      const data = await res.json() as { checkoutUrl?: string; error?: string }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        setCheckoutErr(data.error ?? 'Flutterwave checkout failed.')
        setLoadingFlw(false)
      }
    } catch {
      setCheckoutErr('Connection error. Please try again.')
      setLoadingFlw(false)
    }
  }

  const planRecap = (
    <div className="bg-[#F8F9FA] rounded-xl p-4 mb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-[#0B1F3A] text-base">{country.flag} {country.name}</p>
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

        {/* Step 1: gateway picker */}
        {step === 'pick' && (
          <div className="p-6">
            {planRecap}
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

        {/* Step 2: Stripe Elements */}
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
              <CheckoutForm pkg={pkg} country={country} onSuccess={onDone} onClose={onClose} />
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
          Your eSIM QR code is being prepared and will arrive in your email within minutes.
          <br /><br />Activate before you land — your data starts when you first use it.
        </p>
        <div className="space-y-3">
          <a href="/portal/esims" className="block w-full py-3.5 text-center font-bold text-sm rounded-full hover:opacity-90 transition-opacity"
            style={{ background: '#C9A84C', color: '#0B1F3A' }}>
            View My eSIMs
          </a>
          <button onClick={onClose} className="block w-full py-3 text-[#0B1F3A]/50 text-sm hover:text-[#0B1F3A] transition-colors">
            Buy another eSIM
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ESIM SEARCH ──────────────────────────────────────────────────────────
export function EsimSearch({ packages }: { packages: EsimPackage[] }) {
  const searchParams = useSearchParams()

  const [query,           setQuery]           = useState('')
  const [region,          setRegion]          = useState('All')
  const [selectedCountry, setSelectedCountry] = useState<CountryGroup | null>(null)
  const [checkoutPkg,     setCheckoutPkg]     = useState<EsimPackage | null>(null)
  const [checkoutCountry, setCheckoutCountry] = useState<CountryGroup | null>(null)
  const [showSuccess,     setShowSuccess]     = useState(false)
  const [toasts,          setToasts]          = useState<Toast[]>([])
  const [livePackages,    setLivePackages]    = useState<EsimPackage[]>(packages)
  const fetchedRef = useRef(false)

  // Read pre-filled query from hero search
  useEffect(() => {
    const q = sessionStorage.getItem('esim-hero-q')
    if (q) { setQuery(q); sessionStorage.removeItem('esim-hero-q') }
  }, [])

  // Show success overlay when returning from Flutterwave or 3DS redirect
  useEffect(() => {
    if (searchParams.get('paid') === '1') setShowSuccess(true)
  }, [searchParams])

  // Client-side fallback fetch (if ISR returned 0 packages)
  useEffect(() => {
    if (packages.length > 0 || fetchedRef.current) return
    fetchedRef.current = true
    Promise.allSettled(
      POPULAR_CODES.map(iso2 =>
        fetch(`/api/esim/packages?country=${iso2}`)
          .then(r => r.json())
          .then((d: { packages?: EsimPackage[] }) => d.packages ?? [])
          .catch(() => [])
      )
    ).then(results => {
      const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      if (all.length) setLivePackages(all)
    })
  }, [packages])

  const allGroups = useMemo(() => groupByCountry(livePackages), [livePackages])

  const filtered = useMemo(() => {
    let groups = allGroups
    if (region !== 'All') {
      const codes = REGIONS[region] ?? []
      groups = region === 'Global'
        ? groups.filter(g => !Object.values(REGIONS).flat().includes(g.code))
        : groups.filter(g => codes.includes(g.code))
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      groups = groups.filter(g => g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q))
    }
    return groups
  }, [allGroups, region, query])

  const popularGroups = useMemo(
    () => POPULAR_CODES.map(code => allGroups.find(g => g.code === code)).filter(Boolean) as CountryGroup[],
    [allGroups]
  )

  const showingAll    = query !== '' || region !== 'All'
  const displayGroups = showingAll ? filtered : popularGroups

  function addToast(message: string, type: Toast['type'] = 'info') {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-2), { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function handleBuy(pkg: EsimPackage, country: CountryGroup) {
    setCheckoutPkg(pkg)
    setCheckoutCountry(country)
  }

  function handleSuccess() {
    setCheckoutPkg(null)
    setCheckoutCountry(null)
    setSelectedCountry(null)
    setShowSuccess(true)
    addToast('eSIM purchased! Check your email for the QR code.', 'success')
  }

  return (
    <section id="esim-search" style={{ background: '#F5F4F0' }}>

      {/* ── Sticky search + region tabs ── */}
      <div className="sticky top-0 z-20 bg-white"
        style={{ borderBottom: '1px solid #E9E6E0', boxShadow: '0 1px 0 rgba(0,0,0,0.03)' }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-4 pb-0">

          {/* Search input */}
          <div className="relative max-w-lg mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search destination or country code…"
              className="w-full h-11 pl-10 pr-10 rounded-xl text-sm text-[#0D1B2A] placeholder:text-[#9CA3AF] outline-none transition-colors"
              style={{ border: '1.5px solid #E9E6E0', background: '#F5F4F0' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#C9A84C'; e.currentTarget.style.background = '#fff' }}
              onBlur={e  => { e.currentTarget.style.borderColor = '#E9E6E0'; e.currentTarget.style.background = '#F5F4F0' }}
            />
            {query && (
              <button onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Region tabs — scrollable row */}
          <div className="flex gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', paddingBottom: 1 }}>
            {REGION_ORDER.map(r => (
              <button key={r} onClick={() => setRegion(r)}
                className="flex-shrink-0 px-3.5 py-2.5 rounded-t-lg text-xs font-semibold transition-all"
                style={{
                  background:  region === r ? '#F5F4F0' : 'transparent',
                  color:       region === r ? '#0B1F3A' : '#6B7280',
                  borderBottom: region === r ? '2px solid #C9A84C' : '2px solid transparent',
                }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Country grid ── */}
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
        {livePackages.length === 0 ? (
          <div className="flex items-center justify-center py-28">
            <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
          </div>
        ) : displayGroups.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[#6B7280] text-base mb-2">No destinations match &ldquo;{query}&rdquo;</p>
            <p className="text-[#9CA3AF] text-sm mb-6">Try a different spelling or browse by region above</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={() => setQuery('')}
                className="px-5 py-2.5 rounded-full text-[#0D1B2A] text-sm font-semibold transition-colors hover:bg-white"
                style={{ border: '1.5px solid #E9E6E0' }}>
                Clear search
              </button>
              <a href="https://wa.me/12317902336" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
                style={{ background: '#C9A84C', color: '#0B1F3A' }}>
                <MessageCircle className="w-4 h-4" /> Ask Jade
              </a>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[#9CA3AF] font-semibold uppercase tracking-wider mb-5">
              {showingAll
                ? `${displayGroups.length} destination${displayGroups.length !== 1 ? 's' : ''}`
                : 'Popular destinations'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {displayGroups.map(group => (
                <CountryCard key={group.code} group={group} onSelect={setSelectedCountry} />
              ))}
            </div>

            {!showingAll && allGroups.length > popularGroups.length && (
              <div className="text-center mt-10">
                <button onClick={() => setRegion('All')}
                  className="text-[#C9A84C] text-sm font-semibold hover:opacity-80 transition-opacity inline-flex items-center gap-1">
                  View all {allGroups.length} countries <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Trust strip ── */}
      <div className="bg-white border-t border-[#E9E6E0] py-7">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {[
            ['30M+', 'travellers connected'],
            ['215+', 'countries covered'],
            ['4G/5G', 'high-speed data'],
            ['Instant', 'eSIM delivery'],
            ['24/7', 'Jade support'],
          ].map(([val, label]) => (
            <div key={val} className="text-center">
              <p className="font-bold text-[#0D1B2A] text-lg leading-none mb-0.5">{val}</p>
              <p className="text-[#9CA3AF] text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Plans panel ── */}
      {selectedCountry && !checkoutPkg && (
        <CountryPlansPanel
          group={selectedCountry}
          onClose={() => setSelectedCountry(null)}
          onBuy={handleBuy}
        />
      )}

      {/* ── Checkout modal ── */}
      {checkoutPkg && checkoutCountry && !showSuccess && (
        <CheckoutModal
          pkg={checkoutPkg}
          country={checkoutCountry}
          onClose={() => { setCheckoutPkg(null); setCheckoutCountry(null) }}
          onDone={handleSuccess}
        />
      )}

      {showSuccess && <SuccessOverlay onClose={() => setShowSuccess(false)} />}

      <ToastContainer toasts={toasts} dismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </section>
  )
}
