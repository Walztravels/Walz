'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import { useSession }  from 'next-auth/react'
import { useRouter }   from 'next/navigation'
import { loadStripe }  from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Search, X, Clock, Wifi, Globe, Lock, Check, ArrowRight, RefreshCw, MessageCircle, ChevronDown } from 'lucide-react'
import type { EsimPackage, CountryGroup, Toast } from '@/lib/esim/types'
import { groupByCountry, REGIONS, formatData } from '@/lib/esim/utils'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const REGION_ORDER = ['All', 'Europe', 'Asia', 'Americas', 'Middle East', 'Africa', 'Oceania', 'Global']

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
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

// ── Country card ──────────────────────────────────────────────────────────────
function CountryCard({
  group, currency, expanded, onToggle, onBuy,
}: {
  group:    CountryGroup
  currency: Currency
  expanded: boolean
  onToggle: () => void
  onBuy:    (pkg: EsimPackage, country: CountryGroup) => void
}) {
  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{ background: 'rgba(255,255,255,0.04)', border: expanded ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.07)' }}>

      {/* Card header — always visible */}
      <button onClick={onToggle}
        className="w-full text-left p-5 flex items-center gap-4 group"
        style={{ background: expanded ? 'rgba(201,168,76,0.06)' : 'transparent' }}>
        <span className="text-3xl flex-shrink-0 leading-none">{group.flag}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm truncate">{group.name}</p>
          <p className="text-white/40 text-xs mt-0.5">{group.packages.length} plan{group.packages.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[#C9A84C] font-bold text-base">from {displayPrice(group.minPrice, currency)}</p>
          <ChevronDown className={`w-4 h-4 text-white/30 ml-auto mt-1 transition-transform duration-300 ${expanded ? 'rotate-180 !text-[#C9A84C]' : ''}`} />
        </div>
      </button>

      {/* Expanded packages */}
      {expanded && (
        <div className="border-t border-white/06 p-4 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {group.packages.map(pkg => (
            <PkgTile key={pkg.packageCode} pkg={pkg} country={group} currency={currency} onBuy={onBuy} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Package tile (inside expanded country) ────────────────────────────────────
function PkgTile({
  pkg, country, currency, onBuy,
}: {
  pkg:      EsimPackage
  country:  CountryGroup
  currency: Currency
  onBuy:    (pkg: EsimPackage, country: CountryGroup) => void
}) {
  return (
    <div className="rounded-xl p-4 transition-all duration-200 group/tile"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.border = '1px solid rgba(201,168,76,0.4)'
        el.style.background = 'rgba(201,168,76,0.06)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.border = '1px solid rgba(255,255,255,0.06)'
        el.style.background = 'rgba(255,255,255,0.04)'
      }}>

      {/* Data — prominent */}
      <p className="text-[#C9A84C] font-bold text-3xl leading-none mb-1">{pkg.dataLabel || formatData(pkg.dataAmount, pkg.dataUnit)}</p>
      <p className="text-white/30 text-[10px] mb-3">data included</p>

      {/* Stats row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {[
          { Icon: Clock, val: `${pkg.durationDays} days` },
          { Icon: Wifi,  val: pkg.speed                  },
          { Icon: Globe, val: country.code               },
        ].map(({ Icon, val }) => (
          <span key={val} className="flex items-center gap-1 text-white/40 text-[11px]">
            <Icon className="w-3 h-3 text-[#C9A84C]" /> {val}
          </span>
        ))}
      </div>

      {/* Buy row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-white font-bold text-lg">
          {displayPrice(pkg.retailUsd, currency)}
        </p>
        <button onClick={() => onBuy(pkg, country)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all duration-200"
          style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.4)', color: '#C9A84C' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#C9A84C'; e.currentTarget.style.color = '#0B1F3A' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.15)'; e.currentTarget.style.color = '#C9A84C' }}>
          Get Plan <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
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
      confirmParams: { return_url: `${window.location.origin}/esim/confirmation` },
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

// ── Checkout modal (outer — creates PaymentIntent) ────────────────────────────
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
  const [clientSecret,  setClientSecret]  = useState<string | null>(null)
  const [loadingIntent, setLoadingIntent] = useState(true)
  const [intentError,   setIntentError]   = useState('')

  useEffect(() => {
    if (!session?.user?.email) {
      router.push(`/auth/login?redirect=/esim`)
      return
    }
    ;(async () => {
      try {
        const res  = await fetch('/api/esim/checkout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageCode: pkg.packageCode, packageName: pkg.name,
            destination: country.name, destinationIso2: country.code,
            durationDays: pkg.durationDays, dataAmount: pkg.dataAmount,
            dataUnit: pkg.dataUnit, dataLabel: pkg.dataLabel,
            wholesaleUsd: pkg.wholesaleUsd, retailUsd: pkg.retailUsd, speed: pkg.speed,
          }),
        })
        const data = await res.json() as { clientSecret?: string; error?: string }
        if (data.clientSecret) setClientSecret(data.clientSecret)
        else setIntentError(data.error ?? 'Failed to start checkout.')
      } catch {
        setIntentError('Connection error. Please try again.')
      } finally {
        setLoadingIntent(false)
      }
    })()
  }, [pkg, country, session, router])

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-[#0B1F3A] px-6 py-5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase">📶 Jade Connect</p>
            <h3 className="text-white font-bold text-lg mt-0.5">Confirm Purchase</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadingIntent ? (
          <div className="p-10 text-center">
            <div className="w-10 h-10 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-4" />
            <p className="text-[#0B1F3A]/60 text-sm">Preparing secure checkout…</p>
          </div>
        ) : intentError ? (
          <div className="p-8 text-center">
            <p className="text-red-500 text-sm mb-4">{intentError}</p>
            <button onClick={onClose} className="px-5 py-2.5 bg-[#0B1F3A] text-white rounded-full text-sm font-semibold">Close</button>
          </div>
        ) : clientSecret ? (
          <Elements stripe={stripePromise} options={{
            clientSecret,
            appearance: { theme: 'stripe', variables: { colorPrimary: '#C9A84C', colorBackground: '#FFFFFF', borderRadius: '8px' } },
          }}>
            <CheckoutForm pkg={pkg} country={country} onSuccess={onDone} onClose={onClose} />
          </Elements>
        ) : null}
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

// ── Currency helpers ──────────────────────────────────────────────────────────
type Currency = 'USD' | 'GBP' | 'EUR' | 'CAD'

const RATES:   Record<Currency, number> = { USD: 1, GBP: 0.79, EUR: 0.92, CAD: 1.37 }
const SYMBOLS: Record<Currency, string> = { USD: '$', GBP: '£', EUR: '€', CAD: 'C$' }

function displayPrice(usd: number, currency: Currency): string {
  const amount = usd * RATES[currency]
  const sym    = SYMBOLS[currency]
  return sym + (amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2))
}

// ── MAIN ESIM SEARCH ──────────────────────────────────────────────────────────
export function EsimSearch({ packages }: { packages: EsimPackage[] }) {
  const [query,    setQuery]    = useState('')
  const [region,   setRegion]   = useState('All')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [checkoutPkg,     setCheckoutPkg]     = useState<EsimPackage | null>(null)
  const [checkoutCountry, setCheckoutCountry] = useState<CountryGroup | null>(null)
  const [showSuccess,     setShowSuccess]     = useState(false)
  const [toasts,          setToasts]          = useState<Toast[]>([])

  // Client-side fallback fetch (if ISR returned 0 packages)
  const [livePackages, setLivePackages] = useState<EsimPackage[]>(packages)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (packages.length > 0 || fetchedRef.current) return
    fetchedRef.current = true
    // Fallback: fetch a popular set of countries client-side
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

  // Popular groups (shown before search)
  const popularGroups = useMemo(
    () => POPULAR_CODES.map(code => allGroups.find(g => g.code === code)).filter(Boolean) as CountryGroup[],
    [allGroups]
  )

  function addToast(message: string, type: Toast['type'] = 'info') {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-2), { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function handleBuy(pkg: EsimPackage, country: CountryGroup) {
    setCheckoutPkg(pkg)
    setCheckoutCountry(country)
  }

  function handleSuccess() {
    setCheckoutPkg(null)
    setCheckoutCountry(null)
    setShowSuccess(true)
    addToast('eSIM purchased! Check your email for the QR code.', 'success')
  }

  const displayGroups = query || region !== 'All' ? filtered : popularGroups
  const showingAll    = query !== '' || region !== 'All'

  return (
    <section id="esim-search" className="relative py-20 px-5 sm:px-8"
      style={{ background: 'linear-gradient(160deg,#0B1F3A 0%,#081528 100%)' }}>
      <div className="max-w-6xl mx-auto">

        {/* Section heading */}
        <div className="text-center mb-12">
          <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-4">Find Your Plan</p>
          <h2 className="font-display font-bold text-white mb-4 leading-tight"
            style={{ fontSize: 'clamp(2rem,5vw,3.5rem)' }}>
            Where are you going?
          </h2>
          <p className="text-white/40 text-base leading-relaxed max-w-xl mx-auto">
            Select your destination and Jade will find the perfect data plan for your trip.
          </p>
        </div>

        {/* Search + region filters */}
        <div className="max-w-2xl mx-auto mb-10">
          {/* Search input */}
          <div className="relative mb-5">
            <div className="flex items-center gap-3 rounded-2xl px-5 py-4 transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(201,168,76,0.3)' }}>
              <Search className="w-5 h-5 text-[#C9A84C] flex-shrink-0" />
              <input
                type="text"
                placeholder="Search destination…"
                value={query}
                onChange={e => { setQuery(e.target.value); setExpanded(null) }}
                className="flex-1 outline-none bg-transparent text-white text-base placeholder:text-white/30"
              />
              {query && (
                <button onClick={() => { setQuery(''); setExpanded(null) }} className="text-white/30 hover:text-white/60 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Region pills */}
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {REGION_ORDER.map(r => (
              <button key={r} onClick={() => { setRegion(r); setExpanded(null) }}
                className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200"
                style={{
                  background: region === r ? '#C9A84C' : 'rgba(255,255,255,0.05)',
                  color:      region === r ? '#0B1F3A' : 'rgba(255,255,255,0.5)',
                  border:     region === r ? '1px solid #C9A84C' : '1px solid rgba(255,255,255,0.08)',
                }}>
                {r}
              </button>
            ))}
          </div>

          {/* Currency toggle */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-white/30 text-xs mr-1">Currency:</span>
            {(['USD', 'GBP', 'EUR', 'CAD'] as Currency[]).map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className="px-3 py-1 rounded-full text-xs font-bold transition-all duration-200"
                style={{
                  background: currency === c ? 'rgba(201,168,76,0.2)'  : 'transparent',
                  color:      currency === c ? '#C9A84C'                : 'rgba(255,255,255,0.35)',
                  border:     currency === c ? '1px solid rgba(201,168,76,0.5)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                {SYMBOLS[c]}{c}
              </button>
            ))}
          </div>
        </div>

        {/* Results grid */}
        {livePackages.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full border-4 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin mx-auto mb-6" />
            <p className="text-white/50 text-sm">Loading packages…</p>
          </div>
        ) : (
          <>
            {!showingAll && (
              <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-5 text-center">
                Popular destinations
              </p>
            )}
            {showingAll && filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-white/40 mb-6 text-sm">No destinations match &ldquo;{query}&rdquo; in {region}.</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  {query && <button onClick={() => setQuery('')}
                    className="px-5 py-2.5 text-sm font-semibold rounded-full border border-white/20 text-white/60 hover:text-white transition-colors">
                    Clear search
                  </button>}
                  <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
                    style={{ background: '#C9A84C', color: '#0B1F3A' }}>
                    <MessageCircle className="w-4 h-4" /> WhatsApp us
                  </a>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayGroups.map(group => (
                  <CountryCard
                    key={group.code}
                    group={group}
                    currency={currency}
                    expanded={expanded === group.code}
                    onToggle={() => setExpanded(expanded === group.code ? null : group.code)}
                    onBuy={handleBuy}
                  />
                ))}
              </div>
            )}

            {!showingAll && allGroups.length > popularGroups.length && (
              <div className="text-center mt-8">
                <button onClick={() => setRegion('All')}
                  className="text-[#C9A84C] text-sm font-semibold hover:opacity-80 transition-opacity">
                  View all {allGroups.length} countries →
                </button>
              </div>
            )}
          </>
        )}

        {/* Jade phone mockup (decorative, desktop only) */}
        <div className="hidden xl:flex items-center justify-center mt-16 pointer-events-none" aria-hidden>
          <div className="relative" style={{ animation: 'sPhoneFloat 4s ease-in-out infinite' }}>
            <div className="relative rounded-[36px] overflow-hidden"
              style={{ width: 220, height: 440, background: '#111827', border: '2px solid rgba(255,255,255,0.12)',
                boxShadow: '0 40px 80px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.08)' }}>
              <div className="absolute inset-[3px] rounded-[34px] overflow-hidden bg-[#1a2535] flex flex-col">
                <div className="flex items-center justify-between px-5 pt-3 pb-2">
                  <p className="text-white text-[10px] font-semibold">9:41</p>
                  <div className="flex items-center gap-1"><Wifi className="w-3 h-3 text-white" /></div>
                </div>
                <div className="flex-1 px-4 py-2">
                  <p className="text-white font-bold text-base mb-3">Mobile Data</p>
                  <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
                    <p className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-widest mb-2">Jade Connect</p>
                    <div className="flex items-end gap-0.5 mb-2">
                      {[3,5,7,9,7].map((h, i) => (
                        <div key={i} className="w-2 rounded-sm" style={{ height: h, background: '#C9A84C', animation: `sBarFill 1.5s ease-in-out ${i * 0.15}s infinite alternate` }} />
                      ))}
                    </div>
                    <p className="text-white/40 text-[9px]">Active · 5 GB remaining</p>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <p className="text-green-400/70 text-[10px] font-semibold">eSIM activated</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 rounded-[36px] blur-3xl -z-10"
              style={{ background: 'radial-gradient(ellipse,rgba(201,168,76,0.12) 0%,transparent 70%)' }} />
          </div>
        </div>
      </div>

      {/* Modals */}
      {checkoutPkg && checkoutCountry && !showSuccess && (
        <CheckoutModal
          pkg={checkoutPkg}
          country={checkoutCountry}
          onClose={() => { setCheckoutPkg(null); setCheckoutCountry(null) }}
          onDone={handleSuccess}
        />
      )}
      {showSuccess && <SuccessOverlay onClose={() => setShowSuccess(false)} />}

      <ToastContainer toasts={toasts} dismiss={dismissToast} />

      <style>{`
        @keyframes sPhoneFloat{ 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-14px) rotate(0deg)} }
        @keyframes sBarFill   { 0%{opacity:.4;transform:scaleY(.7)}             100%{opacity:1;transform:scaleY(1)} }
      `}</style>
    </section>
  )
}
