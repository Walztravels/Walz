'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession }      from 'next-auth/react'
import { useRouter }       from 'next/navigation'
import Link                from 'next/link'
import Image               from 'next/image'
import gsap                from 'gsap'
import ScrollTrigger       from 'gsap/ScrollTrigger'
import { loadStripe }      from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import {
  Signal, Search, ChevronDown, Check, X,
  Zap, ShieldCheck, Wifi, Smartphone,
  ChevronRight, ArrowRight, Globe, Lock, Download,
  MessageCircle, Mail, BarChart2, Clock, RefreshCw,
} from 'lucide-react'

// ── Stripe ────────────────────────────────────────────────────────────────────
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ── Countries ─────────────────────────────────────────────────────────────────
const COUNTRIES: { name: string; iso2: string; flag: string }[] = [
  { name: 'United Kingdom',       iso2: 'GB', flag: '🇬🇧' },
  { name: 'United States',        iso2: 'US', flag: '🇺🇸' },
  { name: 'Canada',               iso2: 'CA', flag: '🇨🇦' },
  { name: 'United Arab Emirates', iso2: 'AE', flag: '🇦🇪' },
  { name: 'France',               iso2: 'FR', flag: '🇫🇷' },
  { name: 'Germany',              iso2: 'DE', flag: '🇩🇪' },
  { name: 'Italy',                iso2: 'IT', flag: '🇮🇹' },
  { name: 'Spain',                iso2: 'ES', flag: '🇪🇸' },
  { name: 'Netherlands',          iso2: 'NL', flag: '🇳🇱' },
  { name: 'Turkey',               iso2: 'TR', flag: '🇹🇷' },
  { name: 'Thailand',             iso2: 'TH', flag: '🇹🇭' },
  { name: 'Japan',                iso2: 'JP', flag: '🇯🇵' },
  { name: 'South Korea',          iso2: 'KR', flag: '🇰🇷' },
  { name: 'Singapore',            iso2: 'SG', flag: '🇸🇬' },
  { name: 'Malaysia',             iso2: 'MY', flag: '🇲🇾' },
  { name: 'Indonesia',            iso2: 'ID', flag: '🇮🇩' },
  { name: 'Australia',            iso2: 'AU', flag: '🇦🇺' },
  { name: 'New Zealand',          iso2: 'NZ', flag: '🇳🇿' },
  { name: 'South Africa',         iso2: 'ZA', flag: '🇿🇦' },
  { name: 'Ghana',                iso2: 'GH', flag: '🇬🇭' },
  { name: 'Nigeria',              iso2: 'NG', flag: '🇳🇬' },
  { name: 'Kenya',                iso2: 'KE', flag: '🇰🇪' },
  { name: 'Egypt',                iso2: 'EG', flag: '🇪🇬' },
  { name: 'Morocco',              iso2: 'MA', flag: '🇲🇦' },
  { name: 'Brazil',               iso2: 'BR', flag: '🇧🇷' },
  { name: 'Mexico',               iso2: 'MX', flag: '🇲🇽' },
  { name: 'India',                iso2: 'IN', flag: '🇮🇳' },
  { name: 'China',                iso2: 'CN', flag: '🇨🇳' },
  { name: 'Hong Kong',            iso2: 'HK', flag: '🇭🇰' },
  { name: 'Taiwan',               iso2: 'TW', flag: '🇹🇼' },
  { name: 'Saudi Arabia',         iso2: 'SA', flag: '🇸🇦' },
  { name: 'Qatar',                iso2: 'QA', flag: '🇶🇦' },
  { name: 'Greece',               iso2: 'GR', flag: '🇬🇷' },
  { name: 'Portugal',             iso2: 'PT', flag: '🇵🇹' },
  { name: 'Switzerland',          iso2: 'CH', flag: '🇨🇭' },
  { name: 'Sweden',               iso2: 'SE', flag: '🇸🇪' },
  { name: 'Norway',               iso2: 'NO', flag: '🇳🇴' },
  { name: 'Poland',               iso2: 'PL', flag: '🇵🇱' },
  { name: 'Maldives',             iso2: 'MV', flag: '🇲🇻' },
  { name: 'Vietnam',              iso2: 'VN', flag: '🇻🇳' },
  { name: 'Philippines',          iso2: 'PH', flag: '🇵🇭' },
  { name: 'Sri Lanka',            iso2: 'LK', flag: '🇱🇰' },
  { name: 'Ethiopia',             iso2: 'ET', flag: '🇪🇹' },
  { name: 'Tanzania',             iso2: 'TZ', flag: '🇹🇿' },
  { name: 'Colombia',             iso2: 'CO', flag: '🇨🇴' },
].sort((a, b) => a.name.localeCompare(b.name))

const POPULAR = [
  { name: 'United Kingdom',       iso2: 'GB', flag: '🇬🇧', short: 'UK'      },
  { name: 'United Arab Emirates', iso2: 'AE', flag: '🇦🇪', short: 'Dubai'   },
  { name: 'Canada',               iso2: 'CA', flag: '🇨🇦', short: 'Canada'  },
  { name: 'France',               iso2: 'FR', flag: '🇫🇷', short: 'France'  },
  { name: 'United States',        iso2: 'US', flag: '🇺🇸', short: 'USA'     },
  { name: 'Japan',                iso2: 'JP', flag: '🇯🇵', short: 'Japan'   },
  { name: 'Nigeria',              iso2: 'NG', flag: '🇳🇬', short: 'Nigeria' },
  { name: 'Ghana',                iso2: 'GH', flag: '🇬🇭', short: 'Ghana'   },
]

// City dots on the world map (x%, y%) relative to the SVG 0 0 1000 500 viewBox
const CITY_DOTS = [
  { name: 'London',   x: 462, y: 148 },
  { name: 'Dubai',    x: 570, y: 202 },
  { name: 'Toronto',  x: 228, y: 160 },
  { name: 'Paris',    x: 470, y: 154 },
  { name: 'Tokyo',    x: 760, y: 172 },
  { name: 'Sydney',   x: 772, y: 350 },
  { name: 'New York', x: 245, y: 168 },
  { name: 'Lagos',    x: 476, y: 262 },
  { name: 'Accra',    x: 465, y: 268 },
]

// Package interface matching API response
interface EsimPackage {
  packageCode:  string
  name:         string
  locationCode: string
  locationName: string
  durationDays: number
  dataLabel:    string
  dataAmount:   number | null
  dataUnit:     string
  wholesaleUsd: number
  retailUsd:    number
  speed:        string
}

const FAQ_ITEMS = [
  {
    q: 'What is an eSIM?',
    a: 'An eSIM (embedded SIM) is a digital SIM card built into your phone. You add a data plan to it without needing a physical SIM card — ideal for international travel.',
  },
  {
    q: 'When should I activate it?',
    a: 'We recommend installing your eSIM before you travel (at home on WiFi), but wait to switch to it until you land. Your data countdown starts when you first use it.',
  },
  {
    q: 'Can I keep my regular number?',
    a: 'Yes. Your eSIM runs alongside your regular SIM. Your number stays the same — the eSIM just handles your data abroad so you avoid roaming charges.',
  },
  {
    q: 'What if I need more data?',
    a: 'You can top up directly from your portal at /portal/esims. We offer top-up packages for every destination.',
  },
  {
    q: 'What if it does not work?',
    a: 'Our team is available 24/7 on WhatsApp at +44 7398 753797. We will resolve any activation issue within minutes.',
  },
  {
    q: 'Which phones are compatible?',
    a: 'iPhone XS and later, Samsung Galaxy S20+, Google Pixel 3a+, and most Android phones from 2020. Check Settings → General → About → look for EID number.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT FORM (inner — uses Stripe hooks)
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutForm({
  pkg,
  country,
  onSuccess,
  onClose,
}: {
  pkg:       EsimPackage
  country:   { name: string; iso2: string; flag: string }
  onSuccess: (ref: string) => void
  onClose:   () => void
}) {
  const stripe   = useStripe()
  const elements = useElements()
  const [paying,  setPaying]  = useState(false)
  const [errMsg,  setErrMsg]  = useState('')

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    setErrMsg('')

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/esim/confirmation`,
      },
    })

    if (error) {
      setErrMsg(error.message ?? 'Payment failed. Please try again.')
      setPaying(false)
      return
    }

    // Success — webhook will fulfil the order asynchronously
    onSuccess(pkg.packageCode)
  }

  return (
    <form onSubmit={handlePay} className="p-6 pt-0">
      {/* Plan recap */}
      <div className="bg-[#F8F9FA] rounded-xl p-4 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-bold text-[#0B1F3A] text-base">{country.flag} {country.name}</p>
            <p className="text-[#0B1F3A]/60 text-sm mt-0.5">{pkg.name}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">{pkg.durationDays} days</span>
              <span className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">{pkg.dataLabel}</span>
              <span className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">{pkg.speed}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-[#0B1F3A]">${pkg.retailUsd}</p>
            <p className="text-xs text-[#0B1F3A]/40">USD</p>
          </div>
        </div>
      </div>

      {/* Stripe PaymentElement */}
      <div className="mb-5">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {/* Benefits */}
      <ul className="space-y-1.5 mb-5">
        {['QR code sent to your email instantly', 'Activate before you land', '24/7 WhatsApp support'].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-[#374151]">
            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>

      {errMsg && <p className="text-red-500 text-sm mb-4 text-center">{errMsg}</p>}

      <button
        type="submit"
        disabled={!stripe || paying}
        className="w-full py-4 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {paying ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5" />
            Pay USD ${pkg.retailUsd} — Secure Checkout
          </>
        )}
      </button>
      <p className="text-[#9CA3AF] text-[11px] text-center mt-3">
        Secured by Stripe · No card details stored by Walz Travels
      </p>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT MODAL (outer — creates PaymentIntent, wraps Elements)
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutModal({
  pkg,
  country,
  onClose,
  onDone,
}: {
  pkg:     EsimPackage
  country: { name: string; iso2: string; flag: string }
  onClose: () => void
  onDone:  (ref: string) => void
}) {
  const { data: session } = useSession()
  const router            = useRouter()
  const [clientSecret,    setClientSecret]    = useState<string | null>(null)
  const [loadingIntent,   setLoadingIntent]   = useState(true)
  const [intentError,     setIntentError]     = useState('')

  useEffect(() => {
    if (!session?.user?.email) {
      router.push(`/auth/login?redirect=/esim`)
      return
    }
    ;(async () => {
      try {
        const res = await fetch('/api/esim/checkout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageCode:     pkg.packageCode,
            packageName:     pkg.name,
            destination:     country.name,
            destinationIso2: country.iso2,
            durationDays:    pkg.durationDays,
            dataAmount:      pkg.dataAmount,
            dataUnit:        pkg.dataUnit,
            dataLabel:       pkg.dataLabel,
            wholesaleUsd:    pkg.wholesaleUsd,
            retailUsd:       pkg.retailUsd,
            speed:           pkg.speed,
          }),
        })
        const data = await res.json()
        if (data.clientSecret) {
          setClientSecret(data.clientSecret)
        } else {
          setIntentError(data.error ?? 'Failed to start checkout.')
        }
      } catch {
        setIntentError('Connection error. Please try again.')
      } finally {
        setLoadingIntent(false)
      }
    })()
  }, [pkg, country, session, router])

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
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
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: { colorPrimary: '#C9A84C', colorBackground: '#FFFFFF', borderRadius: '8px' },
              },
            }}
          >
            <CheckoutForm
              pkg={pkg}
              country={country}
              onSuccess={onDone}
              onClose={onClose}
            />
          </Elements>
        ) : null}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SUCCESS OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function SuccessOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    // Confetti burst
    const fire = async () => {
      try {
        const confetti = (await import('canvas-confetti')).default
        const opts = {
          spread: 90,
          ticks: 100,
          gravity: 1.2,
          decay: 0.94,
          startVelocity: 40,
          colors: ['#C9A84C', '#FFD700', '#0B1F3A', '#FFFFFF', '#C9A84C'],
        }
        confetti({ ...opts, origin: { x: 0.3, y: 0.5 }, particleCount: 60 })
        setTimeout(() => confetti({ ...opts, origin: { x: 0.7, y: 0.5 }, particleCount: 60 }), 150)
        setTimeout(() => confetti({ ...opts, origin: { x: 0.5, y: 0.3 }, particleCount: 80 }), 300)
      } catch { /* no-op */ }
    }
    fire()
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
          <br /><br />
          Activate it before you land — your data starts when you first use it.
        </p>
        <div className="space-y-3">
          <Link
            href="/portal/esims"
            className="block w-full py-3.5 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-full hover:bg-[#b8943d] transition-colors"
          >
            View My eSIMs
          </Link>
          <button
            onClick={onClose}
            className="block w-full py-3 text-[#0B1F3A]/50 text-sm hover:text-[#0B1F3A] transition-colors"
          >
            Buy another eSIM
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKAGE CARD
// ─────────────────────────────────────────────────────────────────────────────
function PackageCard({
  pkg,
  country,
  onBuy,
}: {
  pkg:     EsimPackage
  country: { name: string; iso2: string; flag: string }
  onBuy:   (p: EsimPackage) => void
}) {
  return (
    <div
      className="group relative rounded-[20px] overflow-hidden transition-all duration-300"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border:     '1px solid rgba(255,255,255,0.08)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.transform    = 'translateY(-8px) scale(1.01)'
        el.style.border       = '1px solid rgba(201,168,76,0.5)'
        el.style.boxShadow    = '0 20px 60px rgba(201,168,76,0.1)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform    = ''
        el.style.border       = '1px solid rgba(255,255,255,0.08)'
        el.style.boxShadow    = ''
      }}
    >
      {/* Gold top accent */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
        style={{ background: 'linear-gradient(90deg, #C9A84C, #FFD700)' }}
      />

      <div className="p-5 pt-6">
        {/* Country + price */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[#C9A84C] text-2xl mb-1">{country.flag}</p>
            <p className="text-white font-bold text-base leading-tight">{pkg.name}</p>
            <p className="text-white/40 text-xs mt-0.5">{country.name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[#C9A84C] font-bold text-3xl leading-none">${pkg.retailUsd}</p>
            <p className="text-white/30 text-[10px] mt-0.5">USD</p>
          </div>
        </div>

        {/* Data — big */}
        <div className="text-center py-4 mb-5 border-t border-b border-white/08" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-[#C9A84C] font-bold text-5xl leading-none tracking-tight">{pkg.dataLabel}</p>
          <p className="text-white/30 text-xs mt-1">data included</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { Icon: Clock,  val: `${pkg.durationDays}d`, lbl: 'Duration' },
            { Icon: Wifi,   val: pkg.speed,              lbl: 'Speed'    },
            { Icon: Globe,  val: country.iso2,           lbl: 'Coverage' },
          ].map(({ Icon, val, lbl }) => (
            <div key={lbl} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <Icon className="w-3.5 h-3.5 text-[#C9A84C] mx-auto mb-1" />
              <p className="text-white text-xs font-bold">{val}</p>
              <p className="text-white/30 text-[9px] mt-0.5">{lbl}</p>
            </div>
          ))}
        </div>

        {/* Buy button */}
        <button
          onClick={() => onBuy(pkg)}
          className="w-full py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 group/btn"
          style={{
            background: 'rgba(201,168,76,0.15)',
            border:     '1px solid rgba(201,168,76,0.4)',
            color:      '#C9A84C',
          }}
          onMouseEnter={e => {
            const b = e.currentTarget
            b.style.background = '#C9A84C'
            b.style.color      = '#0B1F3A'
            b.style.border     = '1px solid #C9A84C'
          }}
          onMouseLeave={e => {
            const b = e.currentTarget
            b.style.background = 'rgba(201,168,76,0.15)'
            b.style.color      = '#C9A84C'
            b.style.border     = '1px solid rgba(201,168,76,0.4)'
          }}
        >
          Get This Plan
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-1" />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNT-UP STAT
// ─────────────────────────────────────────────────────────────────────────────
function CountUpStat({ end, suffix, label }: { end: number; suffix: string; label: string }) {
  const ref   = useRef<HTMLSpanElement>(null)
  const fired = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !fired.current) {
        fired.current = true
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (prefersReduced) { el.textContent = String(end); return }
        const start    = performance.now()
        const duration = 1800
        const animate  = (now: number) => {
          const t   = Math.min((now - start) / duration, 1)
          const val = Math.floor(easeOut(t) * end)
          el.textContent = String(val)
          if (t < 1) requestAnimationFrame(animate)
          else        el.textContent = String(end)
        }
        requestAnimationFrame(animate)
        obs.disconnect()
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [end])

  return (
    <div className="text-center">
      <p className="text-[#C9A84C] font-bold text-5xl leading-none mb-2">
        <span ref={ref}>0</span>{suffix}
      </p>
      <p className="text-white/40 text-sm">{label}</p>
    </div>
  )
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function EsimPage() {
  const { data: session } = useSession()
  const router            = useRouter()

  // Search / packages
  const [query,           setQuery]           = useState('')
  const [dropdownOpen,    setDropdownOpen]     = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<typeof COUNTRIES[0] | null>(null)
  const [packages,        setPackages]         = useState<EsimPackage[]>([])
  const [pkgLoading,      setPkgLoading]       = useState(false)
  const [pkgError,        setPkgError]         = useState('')
  const [filter,          setFilter]           = useState<'all'|'short'|'medium'|'long'>('all')

  // Checkout
  const [checkoutPkg,  setCheckoutPkg]  = useState<EsimPackage | null>(null)
  const [showSuccess,  setShowSuccess]  = useState(false)

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Refs for GSAP
  const heroRef         = useRef<HTMLElement>(null)
  const headlineRef     = useRef<HTMLDivElement>(null)
  const searchRef       = useRef<HTMLElement>(null)
  const packagesRef     = useRef<HTMLElement>(null)
  const howRef          = useRef<HTMLElement>(null)
  const statsRef        = useRef<HTMLElement>(null)
  const ctaRef          = useRef<HTMLElement>(null)
  const dropRef         = useRef<HTMLDivElement>(null)

  // ── GSAP setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    // Hero headline — clip-path stagger
    const lines = headlineRef.current?.querySelectorAll('.headline-line')
    if (lines?.length) {
      gsap.fromTo(lines,
        { clipPath: 'inset(100% 0 0 0)', y: 30, opacity: 0 },
        { clipPath: 'inset(0% 0 0 0)',   y: 0,  opacity: 1, duration: 1, ease: 'power3.out', stagger: 0.12, delay: 0.3 }
      )
    }

    // Sub/CTA fade in
    gsap.fromTo('.hero-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.9, ease: 'power2.out' })
    gsap.fromTo('.hero-cta', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, delay: 1.1, ease: 'power2.out' })

    // How It Works — steps stagger
    ScrollTrigger.create({
      trigger: howRef.current,
      start:   'top 70%',
      onEnter: () => {
        gsap.fromTo('.how-step',
          { opacity: 0, y: 60 },
          { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.2 }
        )
      },
    })

    // Stats section
    ScrollTrigger.create({
      trigger: statsRef.current,
      start:   'top 80%',
      onEnter: () => {
        gsap.fromTo('.stat-card',
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.1 }
        )
      },
    })

    // Final CTA
    ScrollTrigger.create({
      trigger: ctaRef.current,
      start:   'top 75%',
      onEnter: () => {
        gsap.fromTo('.cta-content',
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }
        )
      },
    })

    return () => { ScrollTrigger.getAll().forEach(t => t.kill()) }
  }, [])

  // Animate package cards when they load
  useEffect(() => {
    if (packages.length > 0) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced) return
      setTimeout(() => {
        gsap.fromTo('.pkg-card',
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08 }
        )
      }, 50)
    }
  }, [packages])

  // ── Data fetch ───────────────────────────────────────────────────────────────
  const fetchPackages = useCallback(async (iso2: string) => {
    setPkgLoading(true)
    setPkgError('')
    setPackages([])
    try {
      const res  = await fetch(`/api/esim/packages?country=${iso2}`)
      const data = await res.json()
      if (data.packages?.length) {
        setPackages(data.packages)
      } else {
        setPkgError(data.error ?? 'No plans available for this destination right now.')
      }
    } catch {
      setPkgError('Failed to load packages. Please try again.')
    } finally {
      setPkgLoading(false)
    }
  }, [])

  function selectCountry(c: typeof COUNTRIES[0]) {
    setSelectedCountry(c)
    setQuery(c.name)
    setDropdownOpen(false)
    setFilter('all')
    fetchPackages(c.iso2)
    // Scroll to packages section
    setTimeout(() => {
      packagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 200)
  }

  // Close dropdown outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  const visiblePackages = packages.filter(p => {
    if (filter === 'short')  return p.durationDays < 7
    if (filter === 'medium') return p.durationDays >= 7 && p.durationDays <= 15
    if (filter === 'long')   return p.durationDays > 15
    return true
  })

  function handleBuy(p: EsimPackage) {
    if (!session?.user?.email) {
      router.push('/auth/login?redirect=/esim')
      return
    }
    setCheckoutPkg(p)
  }

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — FULLSCREEN HERO
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        ref={heroRef}
        className="relative flex flex-col items-center justify-center overflow-hidden"
        style={{ minHeight: '100vh', background: '#0B1F3A' }}
      >
        {/* Layer 1: Dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(201,168,76,0.12) 1px, transparent 1px)',
            backgroundSize:  '44px 44px',
            opacity: 0.5,
          }}
        />

        {/* Layer 2: SVG world map + city dots */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.07] pointer-events-none">
          <svg viewBox="0 0 1000 500" className="w-full h-full max-w-6xl" preserveAspectRatio="xMidYMid meet">
            {/* Simplified world outline — key landmasses */}
            <path
              d="M100,140 L120,120 L140,110 L170,115 L185,130 L190,150 L175,165 L155,170 L130,165 L110,155 Z
                 M200,100 L230,90 L270,88 L310,92 L340,85 L380,80 L420,82 L450,78 L470,82 L475,90 L460,100 L440,108 L410,115 L380,120 L350,115 L320,118 L290,125 L260,120 L230,115 L210,110 Z
                 M480,75 L510,70 L545,68 L580,72 L610,78 L640,74 L665,70 L680,78 L675,90 L660,100 L640,108 L615,112 L590,108 L565,105 L540,108 L515,105 L492,98 L482,88 Z
                 M462,140 L474,132 L490,130 L500,138 L497,148 L484,154 L470,150 Z
                 M300,150 L330,145 L360,142 L390,145 L405,155 L410,170 L400,185 L385,195 L365,200 L345,195 L330,188 L315,180 L305,168 Z
                 M440,155 L465,150 L490,148 L510,155 L520,168 L515,182 L500,190 L480,192 L462,186 L448,175 L442,164 Z
                 M550,155 L575,148 L600,145 L630,150 L650,162 L648,178 L635,188 L615,192 L595,190 L575,182 L558,170 Z
                 M680,160 L700,155 L725,152 L750,158 L768,168 L765,182 L750,192 L730,195 L710,190 L695,180 L684,170 Z
                 M760,165 L785,158 L810,155 L838,160 L855,172 L852,188 L838,198 L815,202 L792,198 L775,188 L764,176 Z
                 M200,200 L230,195 L255,198 L270,210 L268,225 L255,235 L238,238 L220,232 L208,222 Z
                 M460,255 L490,248 L520,252 L540,265 L535,285 L520,298 L498,302 L476,295 L462,280 Z
                 M560,280 L590,275 L615,278 L630,292 L625,310 L610,320 L588,322 L568,315 L555,300 Z
                 M760,340 L790,332 L818,335 L835,350 L830,368 L815,380 L792,382 L772,375 L760,358 Z"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* City dots */}
            {CITY_DOTS.map((city, i) => (
              <g key={city.name}>
                <circle
                  cx={city.x} cy={city.y} r="6"
                  fill="rgba(201,168,76,0.3)"
                  style={{ animation: `cityPulse 2.5s ease-in-out ${i * 0.3}s infinite` }}
                />
                <circle
                  cx={city.x} cy={city.y} r="3"
                  fill="#C9A84C"
                  style={{ animation: `cityDot 2.5s ease-in-out ${i * 0.3}s infinite` }}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Layer 3: Signal waves from center */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          {[1,2,3].map(i => (
            <div
              key={i}
              className="absolute rounded-full border border-white"
              style={{
                width:     `${i * 25}vw`,
                height:    `${i * 25}vw`,
                opacity:   0.025,
                animation: `signalRing 4s ease-out ${i * 1.2}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Layer 4: Floating eSIM card shapes */}
        {[
          { w: 80, h: 50, left: '8%',  top:  '20%', delay: '0s',    dur: '7s'  },
          { w: 60, h: 38, left: '82%', top:  '35%', delay: '2.5s',  dur: '9s'  },
          { w: 70, h: 44, left: '15%', top:  '70%', delay: '1.2s',  dur: '8s'  },
        ].map((card, i) => (
          <div
            key={i}
            className="absolute rounded-xl border border-white/10"
            style={{
              width:            card.w,
              height:           card.h,
              left:             card.left,
              top:              card.top,
              background:       'rgba(255,255,255,0.03)',
              backdropFilter:   'blur(4px)',
              animation:        `floatCard ${card.dur} ease-in-out ${card.delay} infinite`,
              opacity:          0.08,
            }}
          />
        ))}

        {/* CONTENT */}
        <div className="relative z-10 text-center px-5 sm:px-8 max-w-5xl mx-auto pt-24 pb-10">

          {/* Jade avatar */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <div
                className="w-[60px] h-[60px] rounded-full overflow-hidden relative"
                style={{
                  background: 'radial-gradient(circle at 50% 30%, #dceaf5 0%, #a8cce8 100%)',
                  border:     '2px solid rgba(201,168,76,0.6)',
                  boxShadow:  '0 0 0 6px rgba(201,168,76,0.1), 0 0 0 12px rgba(201,168,76,0.05)',
                  animation:  'avatarPulse 3s ease-in-out infinite',
                }}
              >
                <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" style={{ objectPosition: '50% 8%' }} sizes="60px" />
              </div>
              {/* Pulsing rings */}
              <div className="absolute inset-0 rounded-full border border-[#C9A84C]/30" style={{ animation: 'ringPulse 2.5s ease-out 0s infinite' }} />
              <div className="absolute inset-0 rounded-full border border-[#C9A84C]/20" style={{ animation: 'ringPulse 2.5s ease-out 0.8s infinite' }} />
            </div>
            <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.3em] uppercase mt-3">Jade Connect</p>
          </div>

          {/* Headline — 3 lines with clip-path reveal */}
          <div ref={headlineRef} className="mb-6">
            <p className="headline-line font-display font-bold text-white leading-none mb-1"
              style={{ fontSize: 'clamp(2.5rem, 7vw, 4.5rem)' }}>
              Stay Connected.
            </p>
            <p className="headline-line font-display font-bold text-white leading-none mb-1"
              style={{ fontSize: 'clamp(2rem, 6vw, 3.75rem)' }}>
              Anywhere on Earth.
            </p>
            <p className="headline-line font-display font-bold leading-none"
              style={{ fontSize: 'clamp(3rem, 8vw, 5rem)', color: '#C9A84C' }}>
              Instantly.
            </p>
          </div>

          {/* Subheadline */}
          <p
            className="hero-sub text-white/50 leading-relaxed mb-10 mx-auto"
            style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', maxWidth: '36rem', opacity: 0 }}
          >
            Instant eSIM for 150+ countries.&nbsp; No roaming. No physical SIM.
            <br />
            Activate before you land.
          </p>

          {/* CTAs */}
          <div className="hero-cta flex flex-wrap items-center justify-center gap-4 mb-14" style={{ opacity: 0 }}>
            <button
              onClick={() => searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="px-8 py-4 font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(201,168,76,0.4)]"
              style={{ background: '#C9A84C', color: '#0B1F3A' }}
            >
              Get Connected
            </button>
            <button
              onClick={() => howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="px-8 py-4 font-bold text-sm rounded-full border border-white/30 text-white hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all duration-300"
            >
              How it works
            </button>
          </div>

          {/* Trust pills */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {[
              { icon: Zap,        label: 'Instant delivery'      },
              { icon: ShieldCheck,label: 'Stripe secured'        },
              { icon: Wifi,       label: '4G / 5G speeds'        },
              { icon: Smartphone, label: 'Most phones supported' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-white/40 text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Icon className="w-3 h-3 text-[#C9A84C]" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
          <Signal className="w-5 h-5 text-[#C9A84C]" style={{ animation: 'bounce 2s ease-in-out infinite' }} />
          <p className="text-white text-[10px] tracking-widest uppercase">Scroll to explore</p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — SIGNAL STRIP MARQUEE
      ══════════════════════════════════════════════════════════════════════════ */}
      <div className="overflow-hidden py-3.5" style={{ background: '#0d2040', borderTop: '1px solid rgba(201,168,76,0.15)', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
        <div className="flex whitespace-nowrap" style={{ animation: 'marqueeScroll 40s linear infinite' }}>
          {[...Array(4)].flatMap(() => [
            '📶 150+ COUNTRIES',
            '⚡ INSTANT ACTIVATION',
            '🔒 SECURE CONNECTION',
            '💳 NO CONTRACTS',
            '📱 ALL ESIM PHONES',
            '🌍 GLOBAL COVERAGE',
            '💰 FROM USD $9.99',
            '🎯 POWERED BY JADE',
          ]).map((item, i) => (
            <span key={i} className="text-[#C9A84C] text-xs font-bold tracking-widest mx-6">{item}</span>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — DESTINATION SEARCH
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        ref={searchRef}
        className="relative py-20 px-5 sm:px-8"
        style={{ minHeight: '90vh', background: 'linear-gradient(160deg, #0B1F3A 0%, #081528 100%)' }}
      >
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* LEFT — search */}
          <div>
            <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-4">Find Your Plan</p>
            <h2 className="font-display font-bold text-white mb-4 leading-tight"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
              Where are you going?
            </h2>
            <p className="text-white/40 text-base mb-10 leading-relaxed">
              Select your destination and Jade will find<br className="hidden sm:block" />
              the perfect data plan for your trip.
            </p>

            {/* Search input — frosted glass */}
            <div ref={dropRef} className="relative mb-6">
              <div
                className="flex items-center gap-3 cursor-text rounded-2xl px-5 py-4 transition-all duration-300"
                style={{
                  background:     'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(20px)',
                  border:         dropdownOpen ? '1px solid rgba(201,168,76,0.6)' : '1px solid rgba(201,168,76,0.3)',
                  boxShadow:      dropdownOpen ? '0 0 20px rgba(201,168,76,0.1)' : 'none',
                }}
                onClick={() => setDropdownOpen(true)}
              >
                <Search className="w-5 h-5 text-[#C9A84C] flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search destination…"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setDropdownOpen(true) }}
                  onFocus={() => setDropdownOpen(true)}
                  className="flex-1 outline-none bg-transparent text-white text-base placeholder:text-white/30"
                />
                {query && (
                  <button onClick={() => { setQuery(''); setDropdownOpen(false); setSelectedCountry(null); setPackages([]) }}
                    className="text-white/30 hover:text-white/60 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <ChevronDown className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {dropdownOpen && filteredCountries.length > 0 && (
                <ul
                  className="absolute top-full left-0 right-0 mt-2 rounded-2xl z-30 max-h-64 overflow-y-auto"
                  style={{ background: '#0d2040', border: '1px solid rgba(201,168,76,0.2)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
                >
                  {filteredCountries.map(c => (
                    <li key={c.iso2}>
                      <button
                        onClick={() => selectCountry(c)}
                        className="w-full text-left px-5 py-3 flex items-center gap-3 text-sm text-white/70 hover:text-white transition-colors"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="text-xl">{c.flag}</span>
                        <span>{c.name}</span>
                        <span className="ml-auto text-white/20 text-xs font-mono">{c.iso2}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Popular quick selects */}
            <div>
              <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-3">Popular destinations</p>
              <div className="flex flex-wrap gap-2">
                {POPULAR.map(p => (
                  <button
                    key={p.iso2}
                    onClick={() => selectCountry(p)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                      selectedCountry?.iso2 === p.iso2
                        ? 'bg-[#C9A84C] text-[#0B1F3A]'
                        : 'text-[#C9A84C] hover:bg-[#C9A84C] hover:text-[#0B1F3A]'
                    }`}
                    style={{
                      border: '1px solid rgba(201,168,76,0.4)',
                      background: selectedCountry?.iso2 === p.iso2 ? '#C9A84C' : 'transparent',
                    }}
                  >
                    <span>{p.flag}</span>
                    <span>{p.short}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — Phone mockup */}
          <div className="hidden lg:flex items-center justify-center">
            <div
              className="relative"
              style={{ animation: 'phoneFloat 4s ease-in-out infinite' }}
            >
              {/* Phone frame */}
              <div
                className="relative rounded-[36px] overflow-hidden"
                style={{
                  width:      260,
                  height:     520,
                  background: '#111827',
                  border:     '2px solid rgba(255,255,255,0.12)',
                  boxShadow:  '0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                {/* Screen */}
                <div className="absolute inset-[3px] rounded-[34px] overflow-hidden bg-[#1a2535] flex flex-col">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-5 pt-3 pb-2">
                    <p className="text-white text-[10px] font-semibold">9:41</p>
                    <div className="flex items-center gap-1">
                      <Signal className="w-3 h-3 text-white" />
                      <Wifi   className="w-3 h-3 text-white" />
                    </div>
                  </div>

                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#111827] rounded-b-2xl" />

                  {/* Settings UI */}
                  <div className="flex-1 px-4 py-2 overflow-hidden">
                    <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest mb-3 mt-2">Settings</p>
                    <p className="text-white font-bold text-base mb-4">Mobile Data</p>

                    {[
                      { label: 'SIM Card',         val: 'EE UK',       active: true  },
                      { label: 'Jade Connect eSIM', val: 'Connected',   active: true,  gold: true },
                      { label: 'Data Roaming',      val: 'Off',        active: false },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2.5"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <p className={`text-[11px] font-semibold ${row.gold ? 'text-[#C9A84C]' : 'text-white/80'}`}>{row.label}</p>
                          <p className="text-white/30 text-[10px]">{val(row.val, row.gold)}</p>
                        </div>
                        {row.active && (
                          <div className="w-8 h-4 rounded-full bg-[#C9A84C] flex items-center justify-end pr-0.5 flex-shrink-0">
                            <div className="w-3 h-3 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Signal animation */}
                    <div className="mt-6 p-3 rounded-xl" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
                      <p className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-widest mb-2">Jade Connect</p>
                      <div className="flex items-end gap-0.5 mb-2">
                        {[3,5,7,9,7].map((h, i) => (
                          <div key={i} className="w-2 rounded-sm" style={{
                            height: h,
                            background: '#C9A84C',
                            animation: `barFill 1.5s ease-in-out ${i * 0.15}s infinite alternate`,
                          }} />
                        ))}
                      </div>
                      <p className="text-white/40 text-[9px]">Active · 5 GB remaining</p>
                    </div>

                    {/* Animated checkmark */}
                    <div className="flex items-center gap-2 mt-4">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-green-400" />
                      </div>
                      <p className="text-green-400/70 text-[10px] font-semibold">eSIM successfully activated</p>
                    </div>
                  </div>
                </div>

                {/* Side button */}
                <div className="absolute right-[-2px] top-24 w-[3px] h-14 bg-[#333] rounded-l-sm" />
              </div>

              {/* Glow */}
              <div className="absolute inset-0 rounded-[36px] blur-3xl -z-10" style={{ background: 'radial-gradient(ellipse, rgba(201,168,76,0.15) 0%, transparent 70%)' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — PACKAGE RESULTS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section
        ref={packagesRef}
        className="relative py-16 px-5 sm:px-8"
        style={{ background: '#0B1F3A', minHeight: pkgLoading || packages.length > 0 || pkgError ? '40vh' : '0px', display: pkgLoading || packages.length > 0 || pkgError || selectedCountry ? 'block' : 'none' }}
      >
        {selectedCountry && (
          <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-white text-2xl">
                {selectedCountry.flag} {selectedCountry.name}
                <span className="text-white/30 text-lg ml-2">plans</span>
              </h2>
              <button
                onClick={() => { setSelectedCountry(null); setQuery(''); setPackages([]) }}
                className="text-white/30 hover:text-white/60 transition-colors flex items-center gap-1 text-sm"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            </div>

            {/* Filter tabs */}
            {packages.length > 0 && (
              <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
                {([
                  { id: 'all',    label: 'All Plans'       },
                  { id: 'short',  label: '< 7 days'        },
                  { id: 'medium', label: '7 – 15 days'     },
                  { id: 'long',   label: '15+ days'        },
                ] as const).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setFilter(t.id)}
                    className="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200"
                    style={{
                      background: filter === t.id ? '#C9A84C' : 'rgba(255,255,255,0.04)',
                      color:      filter === t.id ? '#0B1F3A' : 'rgba(255,255,255,0.5)',
                      border:     filter === t.id ? '1px solid #C9A84C' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {pkgLoading ? (
              <div className="flex flex-col items-center py-16 gap-4">
                <div className="w-14 h-14 rounded-full overflow-hidden relative flex-shrink-0"
                  style={{ border: '2px solid rgba(201,168,76,0.4)', background: 'radial-gradient(circle at 50% 30%, #dceaf5, #a8cce8)' }}>
                  <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" style={{ objectPosition: '50% 8%' }} sizes="56px" />
                </div>
                <p className="text-white font-semibold">Finding the best plans for you</p>
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-[#C9A84C]"
                      style={{ animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            ) : pkgError ? (
              <div className="text-center py-16">
                <p className="text-white/40 mb-6 text-sm">{pkgError}</p>
                <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-colors"
                  style={{ background: '#C9A84C', color: '#0B1F3A' }}>
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp us for help
                </a>
              </div>
            ) : visiblePackages.length === 0 ? (
              <p className="text-center text-white/30 py-12 text-sm">No plans match this filter.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {visiblePackages.map(p => (
                  <div key={p.packageCode} className="pkg-card">
                    <PackageCard
                      pkg={p}
                      country={selectedCountry!}
                      onBuy={handleBuy}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — HOW IT WORKS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section ref={howRef} className="relative py-24 px-5 sm:px-8 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #081528 0%, #0B1F3A 100%)' }}>

        {/* Animated bg gradient */}
        <div className="absolute inset-0 pointer-events-none" style={{ animation: 'bgShift 8s ease-in-out infinite alternate', opacity: 0.4,
          background: 'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.06) 0%, transparent 60%)' }} />

        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-4">The Process</p>
            <h2 className="font-display font-bold text-white leading-tight" style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}>
              Three steps to connectivity.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              {
                num:   '01',
                Icon:  Globe,
                title: 'Choose Your Plan',
                body:  'Search your destination. Jade shows every available data plan, filtered for your trip length and budget.',
              },
              {
                num:   '02',
                Icon:  Lock,
                title: 'Pay Securely',
                body:  'Stripe-secured checkout in seconds. Your QR code is generated and delivered to your email instantly.',
              },
              {
                num:   '03',
                Icon:  Signal,
                title: 'Activate and Go',
                body:  'Scan the QR code on your phone before you land. Connected before the plane door opens. No queues. No roaming bills.',
              },
            ].map((step, i) => (
              <div key={i} className="how-step relative flex flex-col items-center text-center" style={{ opacity: 0 }}>
                {/* Number */}
                <p className="text-[#C9A84C] font-bold mb-3" style={{ fontSize: 48, lineHeight: 1, WebkitTextStroke: '1px #C9A84C', color: 'transparent' }}>
                  {step.num}
                </p>
                {/* Icon circle */}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
                  <step.Icon className="w-7 h-7 text-[#C9A84C]" />
                </div>
                <h3 className="font-bold text-white text-lg mb-3">{step.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{step.body}</p>

                {/* Connector line */}
                {i < 2 && (
                  <div className="hidden md:block absolute right-[-16px] top-[56px] w-8 h-[1px]"
                    style={{ background: 'linear-gradient(90deg, rgba(201,168,76,0.4), rgba(201,168,76,0.1))', borderTop: '1px dashed rgba(201,168,76,0.3)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 6 — COMPATIBILITY
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-5 sm:px-8" style={{ background: '#0d2040' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display font-bold text-white mb-3" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.75rem)' }}>
              Is my phone compatible?
            </h2>
            <p className="text-white/40 text-sm">Works with most modern smartphones.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Compatible phones list */}
            <div>
              <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest mb-5">Compatible devices</p>
              <ul className="space-y-3">
                {[
                  'iPhone XS and later',
                  'Samsung Galaxy S20 and later',
                  'Google Pixel 3a and later',
                  'Most Android phones (2020+)',
                ].map((item, i) => (
                  <li key={item} className="flex items-center gap-3"
                    style={{ animation: `fadeSlideIn 0.5s ease-out ${0.1 + i * 0.1}s both` }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <span className="text-white/70 text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* How to check */}
            <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-widest mb-5">How to check your phone</p>
              <div className="space-y-4">
                {[
                  {
                    device: '📱 iPhone',
                    steps:  'Settings → General → About\nScroll down → look for EID number\nIf EID appears — your phone supports eSIM',
                  },
                  {
                    device: '🤖 Android',
                    steps:  'Settings → About Phone\nLook for EID or eSIM option\nIf EID appears — your phone supports eSIM',
                  },
                ].map(({ device, steps }) => (
                  <div key={device}>
                    <p className="text-white font-semibold text-sm mb-2">{device}</p>
                    <div className="font-mono text-xs rounded-xl px-4 py-3 whitespace-pre-line text-white/50"
                      style={{ background: 'rgba(255,255,255,0.04)', lineHeight: 1.7 }}>
                      {steps}
                    </div>
                  </div>
                ))}
              </div>
              <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
                className="mt-5 flex items-center gap-2 text-[#C9A84C] text-sm font-semibold hover:opacity-80 transition-opacity">
                <MessageCircle className="w-4 h-4" />
                Not sure? WhatsApp Jade
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 7 — TRUST STATS
      ══════════════════════════════════════════════════════════════════════════ */}
      <section ref={statsRef} className="py-20 px-5 sm:px-8" style={{ background: '#0B1F3A' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { end: 150, suffix: '+',  label: 'Countries covered'          },
              { end: 70,  suffix: '%',  label: 'Average savings vs roaming' },
              { end: 2,   suffix: 'min',label: 'Average activation time'    },
              { end: 24,  suffix: '/7', label: 'Jade support included'      },
            ].map((stat, i) => (
              <div key={i} className="stat-card" style={{ opacity: 0 }}>
                <CountUpStat end={stat.end} suffix={stat.suffix} label={stat.label} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 8 — FAQ
      ══════════════════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-5 sm:px-8" style={{ background: '#081528' }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-4">Support</p>
            <h2 className="font-display font-bold text-white" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.75rem)' }}>
              Frequently asked
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border:     openFaq === i ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                >
                  <span className="font-semibold text-white text-sm">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${openFaq === i ? 'rotate-180 text-[#C9A84C]' : 'text-white/30'}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-white/50 text-sm leading-relaxed"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <p className="text-white/30 text-sm mb-4">Still have questions?</p>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full font-bold text-sm transition-all duration-300 hover:scale-105"
              style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.4)', color: '#C9A84C' }}>
              <MessageCircle className="w-4 h-4" />
              WhatsApp Jade — 24/7
            </a>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 9 — FINAL CTA
      ══════════════════════════════════════════════════════════════════════════ */}
      <section ref={ctaRef} className="relative flex items-center justify-center overflow-hidden py-28 px-5 sm:px-8"
        style={{ minHeight: '100vh', background: '#0B1F3A' }}>

        {/* Particle dots */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-[#C9A84C]"
              style={{
                width:    Math.random() * 3 + 1,
                height:   Math.random() * 3 + 1,
                left:     `${Math.random() * 100}%`,
                top:      `${Math.random() * 100}%`,
                opacity:  Math.random() * 0.15 + 0.03,
                animation: `particleFloat ${4 + Math.random() * 6}s ease-in-out ${Math.random() * 4}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(201,168,76,0.06) 0%, transparent 70%)' }} />

        <div className="cta-content relative z-10 text-center max-w-2xl mx-auto" style={{ opacity: 0 }}>
          {/* Jade avatar large */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-[120px] h-[120px] rounded-full overflow-hidden relative"
                style={{
                  background: 'radial-gradient(circle at 50% 30%, #dceaf5, #a8cce8)',
                  border:     '3px solid rgba(201,168,76,0.6)',
                  boxShadow:  '0 0 0 8px rgba(201,168,76,0.08), 0 0 0 16px rgba(201,168,76,0.04)',
                  animation:  'avatarPulse 3s ease-in-out infinite',
                }}>
                <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" style={{ objectPosition: '50% 8%' }} sizes="120px" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-[#C9A84C]/25" style={{ animation: 'ringPulse 2.5s ease-out 0s infinite' }} />
              <div className="absolute inset-0 rounded-full border border-[#C9A84C]/15"   style={{ animation: 'ringPulse 2.5s ease-out 1s infinite' }} />
            </div>
          </div>

          <h2 className="font-display font-bold text-white leading-tight mb-4"
            style={{ fontSize: 'clamp(2.2rem, 6vw, 4rem)' }}>
            Ready to stay connected?
          </h2>
          <p className="text-white/40 text-base leading-relaxed mb-10 max-w-lg mx-auto">
            Join thousands of Walz Travels clients who never worry about roaming charges again. Your eSIM is ready in minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="px-10 py-4 font-bold text-sm rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(201,168,76,0.35)] w-full sm:w-auto justify-center"
              style={{ background: '#C9A84C', color: '#0B1F3A' }}
            >
              Get Your eSIM Now
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-white/50 text-sm hover:text-white transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Or WhatsApp Jade — +44 7398 753797
            </a>
          </div>
        </div>
      </section>

      {/* ─── Modals ─────────────────────────────────────────────────────────── */}
      {checkoutPkg && selectedCountry && !showSuccess && (
        <CheckoutModal
          pkg={checkoutPkg}
          country={selectedCountry}
          onClose={() => setCheckoutPkg(null)}
          onDone={() => { setCheckoutPkg(null); setShowSuccess(true) }}
        />
      )}

      {showSuccess && (
        <SuccessOverlay onClose={() => setShowSuccess(false)} />
      )}

      {/* ─── Global keyframe styles ─────────────────────────────────────────── */}
      <style>{`
        @keyframes cityPulse {
          0%, 100% { r: 6; opacity: 0.3; }
          50%       { r: 10; opacity: 0.7; }
        }
        @keyframes cityDot {
          0%, 100% { r: 3; }
          50%       { r: 4; }
        }
        @keyframes signalRing {
          0%   { transform: scale(0.4); opacity: 0.06; }
          80%  { transform: scale(1.2); opacity: 0;    }
          100% { transform: scale(1.2); opacity: 0;    }
        }
        @keyframes floatCard {
          0%, 100% { transform: translateY(0px) rotate(0deg);   }
          50%       { transform: translateY(-18px) rotate(2deg); }
        }
        @keyframes avatarPulse {
          0%, 100% { box-shadow: 0 0 0 6px rgba(201,168,76,0.1), 0 0 0 12px rgba(201,168,76,0.05); }
          50%       { box-shadow: 0 0 0 10px rgba(201,168,76,0.15),0 0 0 20px rgba(201,168,76,0.07); }
        }
        @keyframes ringPulse {
          0%   { transform: scale(1);   opacity: 0.5; }
          100% { transform: scale(2);   opacity: 0;   }
        }
        @keyframes marqueeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes phoneFloat {
          0%, 100% { transform: translateY(0px)   rotate(-1.5deg); }
          50%       { transform: translateY(-16px) rotate(0deg);    }
        }
        @keyframes barFill {
          0%   { opacity: 0.4; transform: scaleY(0.7); }
          100% { opacity: 1;   transform: scaleY(1);   }
        }
        @keyframes dotBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50%       { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0px)   translateX(0px);  }
          33%       { transform: translateY(-20px) translateX(10px); }
          66%       { transform: translateY(10px)  translateX(-8px); }
        }
        @keyframes bgShift {
          0%   { opacity: 0.3; transform: translateX(-5%); }
          100% { opacity: 0.6; transform: translateX(5%);  }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  )
}

// Helper to avoid inline expression issues
function val(v: string, gold?: boolean) { return gold ? '● ' + v : v }
