'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Signal, Search, ChevronDown, Check, X,
  Zap, ShieldCheck, Clock, Wifi, Smartphone,
  ChevronRight, Star, ArrowRight,
} from 'lucide-react'

// ── Country list ──────────────────────────────────────────────────────────────
const COUNTRIES: { name: string; iso2: string; flag: string }[] = [
  { name: 'United Kingdom',    iso2: 'GB', flag: '🇬🇧' },
  { name: 'United States',     iso2: 'US', flag: '🇺🇸' },
  { name: 'Canada',            iso2: 'CA', flag: '🇨🇦' },
  { name: 'United Arab Emirates', iso2: 'AE', flag: '🇦🇪' },
  { name: 'France',            iso2: 'FR', flag: '🇫🇷' },
  { name: 'Germany',           iso2: 'DE', flag: '🇩🇪' },
  { name: 'Italy',             iso2: 'IT', flag: '🇮🇹' },
  { name: 'Spain',             iso2: 'ES', flag: '🇪🇸' },
  { name: 'Netherlands',       iso2: 'NL', flag: '🇳🇱' },
  { name: 'Turkey',            iso2: 'TR', flag: '🇹🇷' },
  { name: 'Thailand',          iso2: 'TH', flag: '🇹🇭' },
  { name: 'Japan',             iso2: 'JP', flag: '🇯🇵' },
  { name: 'South Korea',       iso2: 'KR', flag: '🇰🇷' },
  { name: 'Singapore',         iso2: 'SG', flag: '🇸🇬' },
  { name: 'Malaysia',          iso2: 'MY', flag: '🇲🇾' },
  { name: 'Indonesia',         iso2: 'ID', flag: '🇮🇩' },
  { name: 'Australia',         iso2: 'AU', flag: '🇦🇺' },
  { name: 'New Zealand',       iso2: 'NZ', flag: '🇳🇿' },
  { name: 'South Africa',      iso2: 'ZA', flag: '🇿🇦' },
  { name: 'Ghana',             iso2: 'GH', flag: '🇬🇭' },
  { name: 'Nigeria',           iso2: 'NG', flag: '🇳🇬' },
  { name: 'Kenya',             iso2: 'KE', flag: '🇰🇪' },
  { name: 'Egypt',             iso2: 'EG', flag: '🇪🇬' },
  { name: 'Morocco',           iso2: 'MA', flag: '🇲🇦' },
  { name: 'Brazil',            iso2: 'BR', flag: '🇧🇷' },
  { name: 'Mexico',            iso2: 'MX', flag: '🇲🇽' },
  { name: 'Argentina',         iso2: 'AR', flag: '🇦🇷' },
  { name: 'India',             iso2: 'IN', flag: '🇮🇳' },
  { name: 'Pakistan',          iso2: 'PK', flag: '🇵🇰' },
  { name: 'Bangladesh',        iso2: 'BD', flag: '🇧🇩' },
  { name: 'China',             iso2: 'CN', flag: '🇨🇳' },
  { name: 'Hong Kong',         iso2: 'HK', flag: '🇭🇰' },
  { name: 'Taiwan',            iso2: 'TW', flag: '🇹🇼' },
  { name: 'Saudi Arabia',      iso2: 'SA', flag: '🇸🇦' },
  { name: 'Qatar',             iso2: 'QA', flag: '🇶🇦' },
  { name: 'Kuwait',            iso2: 'KW', flag: '🇰🇼' },
  { name: 'Bahrain',           iso2: 'BH', flag: '🇧🇭' },
  { name: 'Oman',              iso2: 'OM', flag: '🇴🇲' },
  { name: 'Jordan',            iso2: 'JO', flag: '🇯🇴' },
  { name: 'Lebanon',           iso2: 'LB', flag: '🇱🇧' },
  { name: 'Israel',            iso2: 'IL', flag: '🇮🇱' },
  { name: 'Greece',            iso2: 'GR', flag: '🇬🇷' },
  { name: 'Portugal',          iso2: 'PT', flag: '🇵🇹' },
  { name: 'Switzerland',       iso2: 'CH', flag: '🇨🇭' },
  { name: 'Austria',           iso2: 'AT', flag: '🇦🇹' },
  { name: 'Belgium',           iso2: 'BE', flag: '🇧🇪' },
  { name: 'Sweden',            iso2: 'SE', flag: '🇸🇪' },
  { name: 'Norway',            iso2: 'NO', flag: '🇳🇴' },
  { name: 'Denmark',           iso2: 'DK', flag: '🇩🇰' },
  { name: 'Finland',           iso2: 'FI', flag: '🇫🇮' },
  { name: 'Poland',            iso2: 'PL', flag: '🇵🇱' },
  { name: 'Czech Republic',    iso2: 'CZ', flag: '🇨🇿' },
  { name: 'Hungary',           iso2: 'HU', flag: '🇭🇺' },
  { name: 'Romania',           iso2: 'RO', flag: '🇷🇴' },
  { name: 'Ukraine',           iso2: 'UA', flag: '🇺🇦' },
  { name: 'Russia',            iso2: 'RU', flag: '🇷🇺' },
  { name: 'Vietnam',           iso2: 'VN', flag: '🇻🇳' },
  { name: 'Philippines',       iso2: 'PH', flag: '🇵🇭' },
  { name: 'Cambodia',          iso2: 'KH', flag: '🇰🇭' },
  { name: 'Myanmar',           iso2: 'MM', flag: '🇲🇲' },
  { name: 'Sri Lanka',         iso2: 'LK', flag: '🇱🇰' },
  { name: 'Maldives',          iso2: 'MV', flag: '🇲🇻' },
  { name: 'Nepal',             iso2: 'NP', flag: '🇳🇵' },
  { name: 'Ethiopia',          iso2: 'ET', flag: '🇪🇹' },
  { name: 'Tanzania',          iso2: 'TZ', flag: '🇹🇿' },
  { name: 'Uganda',            iso2: 'UG', flag: '🇺🇬' },
  { name: 'Senegal',           iso2: 'SN', flag: '🇸🇳' },
  { name: 'Ivory Coast',       iso2: 'CI', flag: '🇨🇮' },
  { name: 'Colombia',          iso2: 'CO', flag: '🇨🇴' },
  { name: 'Peru',              iso2: 'PE', flag: '🇵🇪' },
  { name: 'Chile',             iso2: 'CL', flag: '🇨🇱' },
].sort((a, b) => a.name.localeCompare(b.name))

interface EsimPackage {
  packageCode:  string
  packageName:  string
  location:     string
  locationCode: string
  durationDays: number
  dataGb:       number | null
  dataLabel:    string
  retailUsd:    number
  wholesaleUsd: number
  speed:        string
}

type FilterTab = 'all' | 'short' | 'medium' | 'long'

const FAQ = [
  {
    q: 'What is an eSIM?',
    a: 'An eSIM (embedded SIM) is a digital SIM card built into your phone. You can add a data plan to it without needing a physical SIM card — ideal for international travel.',
  },
  {
    q: 'How do I activate it?',
    a: 'After purchase you receive a QR code by email. On iPhone: Settings → Mobile Data → Add eSIM → Use QR Code. On Android: Settings → Network → SIM → Add eSIM → Scan QR code.',
  },
  {
    q: 'When should I activate it?',
    a: 'We recommend activating your eSIM before you travel (at home), but wait to switch to it until you land. Your data countdown starts when you first use it.',
  },
  {
    q: 'What if I need help?',
    a: 'Our team is available 24/7 on WhatsApp. Send us a message at +44 7398 753797 and we\'ll help you get connected.',
  },
  {
    q: 'Does it work with my phone?',
    a: 'eSIMs work with iPhone XS and later, and most Android phones from 2019 onwards. To check: on iPhone go to Settings → General → About and look for an EID number. On Android: Settings → About Phone → look for EID.',
  },
]

// ── Checkout modal ────────────────────────────────────────────────────────────
function CheckoutModal({
  pkg,
  country,
  onClose,
}: {
  pkg:     EsimPackage
  country: { name: string; iso2: string; flag: string }
  onClose: () => void
}) {
  const { data: session } = useSession()
  const router            = useRouter()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handlePay() {
    if (!session) {
      router.push(`/auth/login?redirect=/esim`)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/esim/stripe-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageCode:     pkg.packageCode,
          packageName:     pkg.packageName,
          destination:     country.name,
          destinationIso2: country.iso2,
          durationDays:    pkg.durationDays,
          dataGb:          pkg.dataGb,
          dataLabelStr:    pkg.dataLabel,
          wholesaleUsd:    pkg.wholesaleUsd,
          retailUsd:       pkg.retailUsd,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0B1F3A] px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase">
              📶 Jade Connect
            </p>
            <h3 className="text-white font-bold text-lg mt-0.5">Confirm Purchase</h3>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Plan summary */}
          <div className="bg-[#F8F9FA] rounded-xl p-4 mb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-bold text-[#0B1F3A] text-base">
                  {country.flag} {country.name}
                </p>
                <p className="text-[#0B1F3A]/60 text-sm mt-0.5">{pkg.packageName}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                    {pkg.durationDays} days
                  </span>
                  <span className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                    {pkg.dataLabel}
                  </span>
                  <span className="text-xs text-[#0B1F3A]/50 bg-white border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                    {pkg.speed}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#0B1F3A]">${pkg.retailUsd}</p>
                <p className="text-xs text-[#0B1F3A]/40">USD</p>
              </div>
            </div>
          </div>

          {/* What you get */}
          <ul className="space-y-2 mb-5">
            {[
              'QR code delivered to your email instantly',
              'Activate before you land — data starts when used',
              '24/7 WhatsApp support from Walz Travels',
            ].map(item => (
              <li key={item} className="flex items-start gap-2 text-sm text-[#374151]">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>

          {error && (
            <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
          )}

          <button
            onClick={handlePay}
            disabled={loading}
            className="w-full py-4 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Redirecting to checkout…'
              : session
              ? `Pay USD $${pkg.retailUsd} — Secure Checkout`
              : 'Sign in to purchase'}
          </button>

          <p className="text-[#9CA3AF] text-xs text-center mt-3">
            Secured by Stripe · No card details stored by Walz Travels
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Package card ──────────────────────────────────────────────────────────────
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
    <div className="bg-white border border-[#E5E7EB] hover:border-[#C9A84C]/60 rounded-2xl p-5 transition-all duration-200 hover:shadow-lg group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-bold text-[#0B1F3A] text-base leading-tight">{pkg.packageName}</p>
          <p className="text-[#0B1F3A]/50 text-xs mt-0.5">{country.flag} {country.name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-[#0B1F3A]">${pkg.retailUsd}</p>
          <p className="text-[10px] text-[#0B1F3A]/40 font-medium">USD</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#F8F9FA] rounded-lg p-2 text-center">
          <Clock className="w-3.5 h-3.5 text-[#C9A84C] mx-auto mb-1" />
          <p className="text-xs font-semibold text-[#0B1F3A]">{pkg.durationDays}d</p>
          <p className="text-[10px] text-[#0B1F3A]/50">Duration</p>
        </div>
        <div className="bg-[#F8F9FA] rounded-lg p-2 text-center">
          <Wifi className="w-3.5 h-3.5 text-[#C9A84C] mx-auto mb-1" />
          <p className="text-xs font-semibold text-[#0B1F3A]">{pkg.dataLabel}</p>
          <p className="text-[10px] text-[#0B1F3A]/50">Data</p>
        </div>
        <div className="bg-[#F8F9FA] rounded-lg p-2 text-center">
          <Signal className="w-3.5 h-3.5 text-[#C9A84C] mx-auto mb-1" />
          <p className="text-xs font-semibold text-[#0B1F3A]">{pkg.speed}</p>
          <p className="text-[10px] text-[#0B1F3A]/50">Speed</p>
        </div>
      </div>

      <button
        onClick={() => onBuy(pkg)}
        className="w-full py-2.5 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-bold text-sm rounded-full transition-colors"
      >
        Buy Now
      </button>
      <p className="text-center text-[10px] text-[#0B1F3A]/30 mt-2">Powered by Jade Connect</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EsimPage() {
  const [query,           setQuery]           = useState('')
  const [dropdownOpen,    setDropdownOpen]     = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<typeof COUNTRIES[0] | null>(null)
  const [packages,        setPackages]         = useState<EsimPackage[]>([])
  const [loading,         setLoading]          = useState(false)
  const [error,           setError]            = useState('')
  const [filter,          setFilter]           = useState<FilterTab>('all')
  const [checkoutPkg,     setCheckoutPkg]      = useState<EsimPackage | null>(null)
  const [openFaq,         setOpenFaq]          = useState<number | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  )

  const fetchPackages = useCallback(async (iso2: string) => {
    setLoading(true)
    setError('')
    setPackages([])
    try {
      const res = await fetch(`/api/esim/packages?country=${iso2}`)
      const data = await res.json()
      if (data.packages?.length) {
        setPackages(data.packages)
      } else {
        setError('No plans available for this destination right now. Please contact us.')
      }
    } catch {
      setError('Failed to load packages. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  function selectCountry(c: typeof COUNTRIES[0]) {
    setSelectedCountry(c)
    setQuery(c.name)
    setDropdownOpen(false)
    fetchPackages(c.iso2)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const visiblePackages = packages.filter(p => {
    if (filter === 'short')  return p.durationDays < 7
    if (filter === 'medium') return p.durationDays >= 7 && p.durationDays <= 15
    if (filter === 'long')   return p.durationDays > 15
    return true
  })

  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-[#0B1F3A] pt-24 pb-16 px-5 sm:px-8 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle, #C9A84C 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/30 mb-6">
            <Signal className="w-3.5 h-3.5 text-[#C9A84C]" />
            <span className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase">
              Jade Connect
            </span>
          </div>

          <h1 className="font-display text-white font-bold text-[clamp(2.4rem,6vw,4.5rem)] leading-[1.05] mb-5">
            Stay Connected
            <br />
            <span style={{ color: '#C9A84C' }}>Anywhere.</span>
          </h1>

          <p className="text-white/55 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Instant eSIM for 150+ countries. No roaming charges.
            <br />
            Activate before you land. No physical SIM needed.
          </p>

          {/* Trust pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            {[
              { icon: Zap,         label: 'Instant delivery' },
              { icon: ShieldCheck, label: 'Stripe secured' },
              { icon: Wifi,        label: '4G / 5G speeds' },
              { icon: Smartphone,  label: 'Most phones supported' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-white/50 text-xs bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                <Icon className="w-3 h-3 text-[#C9A84C]" />
                {label}
              </div>
            ))}
          </div>

          {/* Search */}
          <div ref={dropRef} className="relative max-w-lg mx-auto">
            <div
              className="flex items-center gap-3 bg-white rounded-2xl px-5 py-4 cursor-text shadow-xl"
              onClick={() => setDropdownOpen(true)}
            >
              <Search className="w-5 h-5 text-[#0B1F3A]/40 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search destination…"
                value={query}
                onChange={e => { setQuery(e.target.value); setDropdownOpen(true) }}
                onFocus={() => setDropdownOpen(true)}
                className="flex-1 outline-none text-[#0B1F3A] text-base placeholder:text-[#0B1F3A]/40 bg-transparent"
              />
              <ChevronDown className={`w-4 h-4 text-[#0B1F3A]/40 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {dropdownOpen && filteredCountries.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] z-30 max-h-64 overflow-y-auto">
                {filteredCountries.map(c => (
                  <li key={c.iso2}>
                    <button
                      onClick={() => selectCountry(c)}
                      className="w-full text-left px-5 py-3 hover:bg-[#F8F9FA] flex items-center gap-3 text-sm text-[#0B1F3A] transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                    >
                      <span className="text-xl">{c.flag}</span>
                      <span>{c.name}</span>
                      <span className="ml-auto text-[#0B1F3A]/30 text-xs">{c.iso2}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* ── PACKAGES ── */}
      {(loading || packages.length > 0 || error) && (
        <section className="bg-[#F5F2EE] py-12 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto">

            {selectedCountry && (
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-display text-[#0B1F3A] font-bold text-2xl">
                  {selectedCountry.flag} {selectedCountry.name} Plans
                </h2>
                <button onClick={() => { setSelectedCountry(null); setQuery(''); setPackages([]) }}
                  className="text-sm text-[#0B1F3A]/50 hover:text-[#0B1F3A] transition-colors flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
            )}

            {/* Filter tabs */}
            {packages.length > 0 && (
              <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                {([
                  { id: 'all',    label: 'All Plans' },
                  { id: 'short',  label: 'Short Trips (<7d)' },
                  { id: 'medium', label: 'Medium (7–15d)' },
                  { id: 'long',   label: 'Long Stays (15d+)' },
                ] as const).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setFilter(t.id)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                      filter === t.id
                        ? 'bg-[#0B1F3A] text-white'
                        : 'bg-white text-[#0B1F3A] border border-[#E5E7EB] hover:border-[#0B1F3A]/30'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-[#E5E7EB] animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-gray-100 rounded w-1/2 mb-4" />
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {[1,2,3].map(j => <div key={j} className="h-14 bg-gray-100 rounded-lg" />)}
                    </div>
                    <div className="h-10 bg-gray-200 rounded-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-[#0B1F3A]/50 mb-4">{error}</p>
                <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B1F3A] text-white rounded-full text-sm font-semibold">
                  WhatsApp us for help
                </a>
              </div>
            ) : visiblePackages.length === 0 ? (
              <p className="text-center text-[#0B1F3A]/50 py-8">No plans found for this filter.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visiblePackages.map(p => (
                  <PackageCard
                    key={p.packageCode}
                    pkg={p}
                    country={selectedCountry!}
                    onBuy={setCheckoutPkg}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS ── */}
      <section className="bg-white py-20 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-3">Simple process</p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,4vw,3rem)]">
              How It Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {[
              {
                num: '1',
                title: 'Choose your plan',
                desc: 'Search your destination, pick the data plan that fits your trip length and needs.',
              },
              {
                num: '2',
                title: 'Pay — get QR by email',
                desc: 'Checkout securely via Stripe. Your QR code arrives instantly in your inbox.',
              },
              {
                num: '3',
                title: 'Scan & activate',
                desc: 'Before you land, scan the QR code in your phone settings. Data starts when you first use it.',
              },
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center relative">
                <div className="w-14 h-14 rounded-2xl bg-[#C9A84C] flex items-center justify-center mb-5 shadow-lg">
                  <span className="text-[#0B1F3A] font-bold text-xl">{step.num}</span>
                </div>
                <h3 className="font-bold text-[#0B1F3A] text-lg mb-2">{step.title}</h3>
                <p className="text-[#0B1F3A]/55 text-sm leading-relaxed">{step.desc}</p>
                {i < 2 && (
                  <ChevronRight className="hidden md:block absolute -right-4 top-5 text-[#C9A84C]/40 w-8 h-8" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPATIBILITY ── */}
      <section className="bg-[#0B1F3A] py-14 px-5 sm:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <Smartphone className="w-10 h-10 text-[#C9A84C] mx-auto mb-4" />
          <h2 className="font-display text-white font-bold text-2xl mb-3">Device Compatibility</h2>
          <p className="text-white/50 text-sm mb-6 leading-relaxed">
            eSIMs work with <strong className="text-white">iPhone XS and later</strong>, and most Android phones from 2019 onwards.
          </p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left max-w-md mx-auto">
            <p className="text-[#C9A84C] text-xs font-semibold uppercase tracking-widest mb-3">How to check</p>
            <div className="space-y-3 text-sm text-white/60">
              <div>
                <p className="text-white font-semibold mb-1">iPhone</p>
                <p className="font-mono text-xs bg-white/5 px-3 py-2 rounded-lg">
                  Settings → General → About<br />
                  Look for <strong className="text-[#C9A84C]">EID number</strong>
                </p>
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Android</p>
                <p className="font-mono text-xs bg-white/5 px-3 py-2 rounded-lg">
                  Settings → About Phone<br />
                  Look for <strong className="text-[#C9A84C]">EID number</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[#F5F2EE] py-20 px-5 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.2em] uppercase mb-3">Support</p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,4vw,3rem)]">
              Frequently Asked
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                >
                  <span className="font-semibold text-[#0B1F3A] text-sm">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-[#0B1F3A]/40 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-[#0B1F3A]/60 text-sm leading-relaxed border-t border-[#E5E7EB] pt-4">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <p className="text-[#0B1F3A]/50 text-sm mb-4">Still have questions?</p>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#0B1F3A] text-white font-semibold text-sm rounded-full hover:bg-[#0d2345] transition-colors"
            >
              WhatsApp us — 24/7
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA STRIP ── */}
      <section className="bg-[#C9A84C] py-10 px-5 sm:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
          <div>
            <p className="font-display font-bold text-[#0B1F3A] text-xl">
              📶 Jade Connect — From USD $9.99
            </p>
            <p className="text-[#0B1F3A]/70 text-sm">Stay connected in 150+ countries. No roaming. No contracts.</p>
          </div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex-shrink-0 px-7 py-3.5 bg-[#0B1F3A] text-white font-bold text-sm rounded-full hover:bg-[#0d2345] transition-colors whitespace-nowrap"
          >
            Find Your eSIM ↑
          </button>
        </div>
      </section>

      {/* Checkout modal */}
      {checkoutPkg && selectedCountry && (
        <CheckoutModal
          pkg={checkoutPkg}
          country={selectedCountry}
          onClose={() => setCheckoutPkg(null)}
        />
      )}
    </>
  )
}
