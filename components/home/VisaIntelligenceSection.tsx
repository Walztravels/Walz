'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { Search, ArrowRight, MessageCircle, CheckCircle, AlertCircle, Monitor, Globe, ChevronDown, X } from 'lucide-react'

// ── Country list ──────────────────────────────────────────────────────────────
const COUNTRIES = [
  { iso2: 'NG', name: 'Nigeria',            flag: '🇳🇬' },
  { iso2: 'GH', name: 'Ghana',              flag: '🇬🇭' },
  { iso2: 'KE', name: 'Kenya',              flag: '🇰🇪' },
  { iso2: 'ZA', name: 'South Africa',       flag: '🇿🇦' },
  { iso2: 'US', name: 'United States',      flag: '🇺🇸' },
  { iso2: 'GB', name: 'United Kingdom',     flag: '🇬🇧' },
  { iso2: 'CA', name: 'Canada',             flag: '🇨🇦' },
  { iso2: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { iso2: 'FR', name: 'France',             flag: '🇫🇷' },
  { iso2: 'DE', name: 'Germany',            flag: '🇩🇪' },
  { iso2: 'IN', name: 'India',              flag: '🇮🇳' },
  { iso2: 'CN', name: 'China',              flag: '🇨🇳' },
  { iso2: 'BR', name: 'Brazil',             flag: '🇧🇷' },
  { iso2: 'AU', name: 'Australia',          flag: '🇦🇺' },
  { iso2: 'IT', name: 'Italy',              flag: '🇮🇹' },
  { iso2: 'ES', name: 'Spain',              flag: '🇪🇸' },
  { iso2: 'NL', name: 'Netherlands',        flag: '🇳🇱' },
  { iso2: 'TR', name: 'Turkey',             flag: '🇹🇷' },
  { iso2: 'JP', name: 'Japan',              flag: '🇯🇵' },
  { iso2: 'SG', name: 'Singapore',          flag: '🇸🇬' },
  { iso2: 'MY', name: 'Malaysia',           flag: '🇲🇾' },
  { iso2: 'TH', name: 'Thailand',           flag: '🇹🇭' },
  { iso2: 'PH', name: 'Philippines',        flag: '🇵🇭' },
  { iso2: 'SA', name: 'Saudi Arabia',       flag: '🇸🇦' },
  { iso2: 'EG', name: 'Egypt',              flag: '🇪🇬' },
  { iso2: 'MA', name: 'Morocco',            flag: '🇲🇦' },
  { iso2: 'TZ', name: 'Tanzania',           flag: '🇹🇿' },
  { iso2: 'ET', name: 'Ethiopia',           flag: '🇪🇹' },
  { iso2: 'RW', name: 'Rwanda',             flag: '🇷🇼' },
  { iso2: 'CI', name: "Cote d'Ivoire",      flag: '🇨🇮' },
  { iso2: 'CM', name: 'Cameroon',           flag: '🇨🇲' },
  { iso2: 'SN', name: 'Senegal',            flag: '🇸🇳' },
  { iso2: 'UG', name: 'Uganda',             flag: '🇺🇬' },
  { iso2: 'IE', name: 'Ireland',            flag: '🇮🇪' },
  { iso2: 'PT', name: 'Portugal',           flag: '🇵🇹' },
  { iso2: 'SE', name: 'Sweden',             flag: '🇸🇪' },
  { iso2: 'NO', name: 'Norway',             flag: '🇳🇴' },
  { iso2: 'CH', name: 'Switzerland',        flag: '🇨🇭' },
  { iso2: 'BE', name: 'Belgium',            flag: '🇧🇪' },
  { iso2: 'PL', name: 'Poland',             flag: '🇵🇱' },
  { iso2: 'MX', name: 'Mexico',             flag: '🇲🇽' },
  { iso2: 'CO', name: 'Colombia',           flag: '🇨🇴' },
  { iso2: 'PK', name: 'Pakistan',           flag: '🇵🇰' },
  { iso2: 'BD', name: 'Bangladesh',         flag: '🇧🇩' },
  { iso2: 'NZ', name: 'New Zealand',        flag: '🇳🇿' },
  { iso2: 'ZW', name: 'Zimbabwe',           flag: '🇿🇼' },
  { iso2: 'ZM', name: 'Zambia',             flag: '🇿🇲' },
].sort((a, b) => a.name.localeCompare(b.name))

// ── Hardcoded fallback data ────────────────────────────────────────────────────
const FALLBACK: Record<string, {
  ruleType: string; walzFeeUsd: number; govtFeeAmount: number; govtFeeCurrency: string
  processingDaysMin: number; processingDaysMax: number; maxStayDays: number; jadeTip?: string
}> = {
  'NG-GB': { ruleType: 'visa_required', walzFeeUsd: 188, govtFeeAmount: 115, govtFeeCurrency: 'GBP', processingDaysMin: 15, processingDaysMax: 21, maxStayDays: 180, jadeTip: 'Apply at least 8 weeks before travel for best results.' },
  'NG-CA': { ruleType: 'visa_required', walzFeeUsd: 281, govtFeeAmount: 185, govtFeeCurrency: 'CAD', processingDaysMin: 10, processingDaysMax: 20, maxStayDays: 180, jadeTip: 'Biometrics are required — book your appointment early.' },
  'NG-AE': { ruleType: 'visa_required', walzFeeUsd: 470, govtFeeAmount: 0,   govtFeeCurrency: 'included', processingDaysMin: 3, processingDaysMax: 5, maxStayDays: 30, jadeTip: 'UAE visa is among the fastest — often ready in 3 days.' },
  'NG-FR': { ruleType: 'visa_required', walzFeeUsd: 231, govtFeeAmount: 80,  govtFeeCurrency: 'EUR', processingDaysMin: 10, processingDaysMax: 21, maxStayDays: 90, jadeTip: 'For Schengen, apply through the country of longest stay.' },
  'NG-DE': { ruleType: 'visa_required', walzFeeUsd: 231, govtFeeAmount: 80,  govtFeeCurrency: 'EUR', processingDaysMin: 10, processingDaysMax: 21, maxStayDays: 90, jadeTip: 'Germany is a strong Schengen choice — good approval rate.' },
  'NG-US': { ruleType: 'visa_required', walzFeeUsd: 344, govtFeeAmount: 185, govtFeeCurrency: 'USD', processingDaysMin: 15, processingDaysMax: 30, maxStayDays: 90, jadeTip: 'Strong ties to Nigeria and a clear itinerary greatly improve approval chances.' },
  'GH-GB': { ruleType: 'visa_required', walzFeeUsd: 188, govtFeeAmount: 115, govtFeeCurrency: 'GBP', processingDaysMin: 15, processingDaysMax: 21, maxStayDays: 180, jadeTip: 'Apply early — peak season slots fill up fast.' },
  'GH-CA': { ruleType: 'visa_required', walzFeeUsd: 281, govtFeeAmount: 185, govtFeeCurrency: 'CAD', processingDaysMin: 10, processingDaysMax: 20, maxStayDays: 180, jadeTip: 'Canada requires biometrics — book well in advance.' },
  'GH-AE': { ruleType: 'visa_required', walzFeeUsd: 470, govtFeeAmount: 0,   govtFeeCurrency: 'included', processingDaysMin: 3, processingDaysMax: 5, maxStayDays: 30, jadeTip: 'UAE visa processing is fast — usually 3-5 days.' },
  'KE-AE': { ruleType: 'visa_free',     walzFeeUsd: 0,   govtFeeAmount: 0,   govtFeeCurrency: '',    processingDaysMin: 0, processingDaysMax: 0, maxStayDays: 30, jadeTip: 'Kenyan passport holders enjoy visa-free access to UAE — just book your flights!' },
  'RW-AE': { ruleType: 'visa_free',     walzFeeUsd: 0,   govtFeeAmount: 0,   govtFeeCurrency: '',    processingDaysMin: 0, processingDaysMax: 0, maxStayDays: 30, jadeTip: 'Rwandan passport holders enjoy visa-free access to UAE.' },
}

const QUICK_ROUTES = [
  { from: 'NG', to: 'GB', label: 'Nigeria → UK' },
  { from: 'NG', to: 'CA', label: 'Nigeria → Canada' },
  { from: 'NG', to: 'AE', label: 'Nigeria → UAE' },
  { from: 'NG', to: 'FR', label: 'Nigeria → Schengen' },
  { from: 'GH', to: 'GB', label: 'Ghana → UK' },
  { from: 'GH', to: 'CA', label: 'Ghana → Canada' },
]

// ── Searchable dropdown ───────────────────────────────────────────────────────
function CountryDropdown({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (iso2: string) => void
  placeholder: string
}) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const inputRef              = useRef<HTMLInputElement>(null)
  const containerRef          = useRef<HTMLDivElement>(null)
  const selected              = COUNTRIES.find(c => c.iso2 === value)
  const filtered              = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.iso2.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <label className="block text-[10px] font-semibold text-[#C9A84C] uppercase tracking-[0.18em] mb-2">
        {label}
      </label>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-white/5 border border-white/15 hover:border-[#C9A84C]/60 rounded-xl text-sm transition-colors text-left focus:outline-none focus:border-[#C9A84C]"
      >
        {selected
          ? <><span className="text-xl flex-shrink-0">{selected.flag}</span><span className="text-white font-medium truncate">{selected.name}</span></>
          : <span className="text-white/35 truncate">{placeholder}</span>
        }
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
              className="p-0.5 hover:text-[#C9A84C] text-white/30 transition-colors"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 right-0 bg-[#0d2647] border border-white/10 rounded-xl shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-white/10">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
              <Search className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search country…"
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/30 min-w-0"
              />
            </div>
          </div>
          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-4 py-3 text-sm text-white/30">No results</p>
              : filtered.map(c => (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => { onChange(c.iso2); setOpen(false); setQuery('') }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors ${c.iso2 === value ? 'bg-[#C9A84C]/10 text-[#C9A84C]' : 'text-white/80'}`}
                  >
                    <span className="text-lg flex-shrink-0">{c.flag}</span>
                    {c.name}
                  </button>
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ── Result card ───────────────────────────────────────────────────────────────
interface VisaResult {
  ruleType: string
  passportName: string
  passportFlag: string
  destName: string
  destIso2: string
  walzFeeUsd: number
  govtFeeAmount: number
  govtFeeCurrency: string
  processingDaysMin: number
  processingDaysMax: number
  maxStayDays: number
  jadeTip?: string
}

function ResultCard({ result, cardRef }: { result: VisaResult; cardRef: React.RefObject<HTMLDivElement> }) {
  const toVisaSlug: Record<string, string> = {
    GB: 'uk', CA: 'canada', AE: 'uae', FR: 'schengen', DE: 'schengen',
    IT: 'schengen', ES: 'schengen', NL: 'schengen', BE: 'schengen',
    US: 'usa', AU: 'australia',
  }
  const visaSlug = toVisaSlug[result.destIso2] ?? result.destIso2.toLowerCase()

  const STATE = {
    visa_required:    { icon: '🛂', badge: 'VISA REQUIRED',       color: 'border-red-400/40    bg-red-400/5',    label: 'text-red-400'    },
    visa_free:        { icon: '✅', badge: 'NO VISA NEEDED',       color: 'border-green-400/40  bg-green-400/5',  label: 'text-green-400'  },
    evisa:            { icon: '💻', badge: 'eVISA AVAILABLE',      color: 'border-blue-400/40   bg-blue-400/5',   label: 'text-blue-400'   },
    visa_on_arrival:  { icon: '🟧', badge: 'VISA ON ARRIVAL',      color: 'border-orange-400/40 bg-orange-400/5', label: 'text-orange-400' },
    eta:              { icon: '✈️', badge: 'eTA REQUIRED',         color: 'border-purple-400/40 bg-purple-400/5', label: 'text-purple-400' },
  }
  const s = STATE[result.ruleType as keyof typeof STATE] ?? STATE.visa_required

  return (
    <div
      ref={cardRef}
      className={`rounded-2xl border ${s.color} p-6 space-y-5`}
      style={{ opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold tracking-[0.18em] uppercase mb-1 ${s.label}`}>
            {s.icon} {s.badge}
          </p>
          <p className="text-white/75 text-sm leading-relaxed">
            {result.passportFlag} <strong className="text-white">{result.passportName}</strong> passport holders{' '}
            {result.ruleType === 'visa_free'
              ? <>can enter <strong className="text-white">{result.destName}</strong> without a visa. Stay up to {result.maxStayDays} days.</>
              : result.ruleType === 'visa_on_arrival'
              ? <>can get a visa on arrival in <strong className="text-white">{result.destName}</strong>.</>
              : result.ruleType === 'evisa'
              ? <>can apply for an eVisa to enter <strong className="text-white">{result.destName}</strong> online before travel.</>
              : <>need a visa to enter <strong className="text-white">{result.destName}</strong>.</>
            }
          </p>
        </div>
      </div>

      {/* Stats row */}
      {result.ruleType !== 'visa_free' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {result.walzFeeUsd > 0 && (
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Walz Fee</p>
              <p className="text-[#C9A84C] font-bold text-sm">USD ${result.walzFeeUsd}</p>
            </div>
          )}
          {result.govtFeeAmount > 0 && (
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Govt Fee</p>
              <p className="text-white font-semibold text-sm">
                {result.govtFeeCurrency === 'included' ? 'Included' : `${result.govtFeeCurrency} ${result.govtFeeAmount}`}
              </p>
            </div>
          )}
          {result.processingDaysMin > 0 && (
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Processing</p>
              <p className="text-white font-semibold text-sm">
                {result.processingDaysMin}–{result.processingDaysMax} days
              </p>
            </div>
          )}
          {result.maxStayDays > 0 && (
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Stay</p>
              <p className="text-white font-semibold text-sm">Up to {result.maxStayDays} days</p>
            </div>
          )}
        </div>
      )}

      {/* Jade tip */}
      {result.jadeTip && (
        <div className="flex items-start gap-3 bg-[#C9A84C]/8 border border-[#C9A84C]/20 rounded-xl p-3.5">
          <span className="text-lg flex-shrink-0 mt-0.5">🤖</span>
          <div>
            <p className="text-[10px] text-[#C9A84C] font-semibold uppercase tracking-wider mb-0.5">Jade&apos;s Tip</p>
            <p className="text-white/70 text-sm leading-relaxed">{result.jadeTip}</p>
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-3">
        {result.ruleType === 'visa_free' ? (
          <Link href="/flights" className="flex-1">
            <button className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors">
              <ArrowRight className="w-4 h-4" /> Book Your Trip
            </button>
          </Link>
        ) : (
          <Link href={`/visa/apply/${visaSlug}`} className="flex-1">
            <button className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-xl transition-colors">
              <ArrowRight className="w-4 h-4" /> Apply with Walz Travels
            </button>
          </Link>
        )}
        <a
          href="https://wa.me/447398753797"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 border border-white/20 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-semibold text-sm rounded-xl transition-colors"
        >
          <MessageCircle className="w-4 h-4" /> WhatsApp Jade
        </a>
      </div>
    </div>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────
export function VisaIntelligenceSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const formRef    = useRef<HTMLDivElement>(null)
  const resultRef  = useRef<HTMLDivElement>(null)

  const [passport, setPassport] = useState('')
  const [destination, setDestination] = useState('')
  const [result, setResult]     = useState<VisaResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // Scroll entrance animation
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.from(formRef.current, {
      opacity: 0, y: 40, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: sectionRef.current, start: 'top 78%', once: true },
    })
  }, [])

  const check = useCallback(async (pIso2: string, dIso2: string) => {
    if (!pIso2 || !dIso2) return
    if (pIso2 === dIso2) { setError("Passport and destination can't be the same country."); return }
    setLoading(true)
    setError('')
    setResult(null)

    const passportCountry     = COUNTRIES.find(c => c.iso2 === pIso2)!
    const destinationCountry  = COUNTRIES.find(c => c.iso2 === dIso2)!

    try {
      const res = await fetch('/api/visa-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passport_iso2: pIso2, destination_iso2: dIso2 }),
      })
      const data = await res.json()

      if (data.found && data.rule) {
        setResult({
          ruleType:          data.rule.ruleType,
          passportName:      passportCountry.name,
          passportFlag:      passportCountry.flag,
          destName:          destinationCountry.name,
          destIso2:          dIso2,
          walzFeeUsd:        data.portal?.walzFeeUsd ?? 0,
          govtFeeAmount:     data.portal?.govtFeeAmount ?? 0,
          govtFeeCurrency:   data.portal?.govtFeeCurrency ?? 'USD',
          processingDaysMin: data.portal?.processingDaysMin ?? 1,
          processingDaysMax: data.portal?.processingDaysMax ?? 30,
          maxStayDays:       data.portal?.maxStayDays ?? data.rule.maxDays ?? 30,
          jadeTip:           data.portal?.jadeTips ?? undefined,
        })
      } else {
        // Fall back to hardcoded data
        const key = `${pIso2}-${dIso2}`
        const fb  = FALLBACK[key]
        if (fb) {
          setResult({
            ruleType:          fb.ruleType,
            passportName:      passportCountry.name,
            passportFlag:      passportCountry.flag,
            destName:          destinationCountry.name,
            destIso2:          dIso2,
            walzFeeUsd:        fb.walzFeeUsd,
            govtFeeAmount:     fb.govtFeeAmount,
            govtFeeCurrency:   fb.govtFeeCurrency,
            processingDaysMin: fb.processingDaysMin,
            processingDaysMax: fb.processingDaysMax,
            maxStayDays:       fb.maxStayDays,
            jadeTip:           fb.jadeTip,
          })
        } else {
          setError("We don't have data for this route yet. WhatsApp Jade for a personalised answer.")
        }
      }
    } catch {
      // Network error — try fallback
      const key = `${pIso2}-${dIso2}`
      const fb  = FALLBACK[key]
      if (fb) {
        setResult({
          ruleType:          fb.ruleType,
          passportName:      passportCountry.name,
          passportFlag:      passportCountry.flag,
          destName:          destinationCountry.name,
          destIso2:          dIso2,
          walzFeeUsd:        fb.walzFeeUsd,
          govtFeeAmount:     fb.govtFeeAmount,
          govtFeeCurrency:   fb.govtFeeCurrency,
          processingDaysMin: fb.processingDaysMin,
          processingDaysMax: fb.processingDaysMax,
          maxStayDays:       fb.maxStayDays,
          jadeTip:           fb.jadeTip,
        })
      } else {
        setError('Connection error. Try WhatsApping Jade directly.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Animate result card in
  useEffect(() => {
    if (!result || !resultRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(resultRef.current, { opacity: 1 })
      return
    }
    gsap.fromTo(
      resultRef.current,
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' },
    )
    // Scroll to result on mobile
    if (window.innerWidth < 768) {
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }
  }, [result])

  function handleCheck() {
    check(passport, destination)
  }

  function handleQuick(from: string, to: string) {
    setPassport(from)
    setDestination(to)
    check(from, to)
  }

  return (
    <section ref={sectionRef} className="bg-[#0B1F3A] py-20 lg:py-28 px-5 sm:px-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <p className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-3">
            Visa Intelligence
          </p>
          <h2 className="font-display text-white font-bold text-[clamp(2rem,4vw,3.2rem)] leading-tight mb-3">
            Know Before You Go
          </h2>
          <p className="text-white/45 text-base max-w-lg">
            Instant visa requirements for every destination. Check in seconds.
          </p>
        </div>

        {/* Checker form */}
        <div ref={formRef}>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <CountryDropdown
              label="I am a citizen of"
              value={passport}
              onChange={setPassport}
              placeholder="Select your passport"
            />
            <CountryDropdown
              label="I want to travel to"
              value={destination}
              onChange={setDestination}
              placeholder="Select destination"
            />
          </div>

          <button
            onClick={handleCheck}
            disabled={!passport || !destination || loading}
            className="w-full flex items-center justify-center gap-2.5 py-4 bg-[#C9A84C] hover:bg-[#d4b05a] disabled:opacity-40 disabled:cursor-not-allowed text-[#0B1F3A] font-bold text-sm rounded-xl transition-all hover:scale-[1.01] active:scale-100"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
              </svg>
            ) : (
              <Globe className="w-4 h-4" />
            )}
            {loading ? 'Checking…' : 'Check Requirements'}
          </button>

          {/* Quick routes */}
          <div className="mt-5">
            <p className="text-white/25 text-[10px] uppercase tracking-widest mb-3 font-semibold">
              Popular searches
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_ROUTES.map(r => (
                <button
                  key={r.label}
                  onClick={() => handleQuick(r.from, r.to)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-[#C9A84C]/10 border border-white/10 hover:border-[#C9A84C]/40 text-white/60 hover:text-[#C9A84C] text-xs font-medium rounded-full transition-all"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 flex items-start gap-3 bg-red-500/10 border border-red-400/25 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-6">
            <ResultCard result={result} cardRef={resultRef as React.RefObject<HTMLDivElement>} />
          </div>
        )}

        {/* Footer link */}
        <div className="mt-10 text-center">
          <Link href="/visa" className="inline-flex items-center gap-2 text-white/35 hover:text-[#C9A84C] text-sm transition-colors">
            Browse all 199 destinations <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>
    </section>
  )
}
