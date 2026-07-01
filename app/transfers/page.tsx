'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import {
  Car, MessageCircle,
  Users, Briefcase, MapPin, Clock, Shield, Star,
  ArrowRight, AlertCircle,
} from 'lucide-react'
import { TransferSearchForm, type TransferSearchParams } from '@/components/transfers/TransferSearchForm'
import { TransferResultCard, type TransferResult } from '@/components/transfers/TransferResultCard'
import { TransferBookingModal } from '@/components/transfers/TransferBookingModal'

export const dynamic = 'force-dynamic'

// ── Vehicle cards ─────────────────────────────────────────────────────────────

const VEHICLES = [
  {
    name: 'Standard Saloon',
    desc: 'Comfortable and practical for solo or couple travellers. Perfect for airport runs and city transfers.',
    passengers: '1–3',
    bags: '2–3',
    badge: 'Most popular',
    example: 'Toyota Camry or similar',
    imgGradient: 'from-[#1C3557] to-[#0B1F3A]',
  },
  {
    name: 'Executive Saloon',
    desc: 'Elevated comfort and style for business travellers and special occasions. Premium interiors throughout.',
    passengers: '1–3',
    bags: '3',
    badge: 'Business favourite',
    example: 'Mercedes E-Class or similar',
    imgGradient: 'from-[#2C1654] to-[#0B1F3A]',
  },
  {
    name: 'MPV / People Carrier',
    desc: 'Spacious and versatile for families and small groups. Generous luggage capacity.',
    passengers: '1–6',
    bags: '4–5',
    badge: 'Family choice',
    example: 'Mercedes V-Class or similar',
    imgGradient: 'from-[#0F4030] to-[#0B1F3A]',
  },
  {
    name: 'Minibus',
    desc: 'The ideal solution for large groups, corporate events and coach transfers.',
    passengers: '8–16',
    bags: 'Large group',
    badge: 'Groups',
    example: 'Ford Transit or similar',
    imgGradient: 'from-[#3D2D0E] to-[#0B1F3A]',
  },
]

// ── Inclusions ────────────────────────────────────────────────────────────────

const INCLUSIONS = [
  { icon: Clock,    label: 'Flight Tracking',       desc: 'We monitor your flight. If it\'s delayed, your driver adjusts automatically — no extra charge.' },
  { icon: Star,     label: 'Meet & Greet',           desc: 'Your driver meets you at arrivals with a name board. No searching through the crowds.' },
  { icon: Shield,   label: '60 Min Free Waiting',   desc: 'Free waiting time after your flight lands. We account for passport control and baggage.' },
  { icon: MapPin,   label: 'All Tolls Included',    desc: 'All road tolls, congestion charges and parking fees are included in your quoted price.' },
  { icon: Users,    label: 'Licensed Drivers',      desc: 'All drivers are fully licensed, DBS-checked and professional. Smart uniform and ID.' },
  { icon: Car,      label: 'Door-to-Door',          desc: 'From terminal to your front door. No detours, no shared shuttles, just a direct private ride.' },
]

// ── 4-step process ────────────────────────────────────────────────────────────

const PROCESS = [
  {
    step: '01',
    title: 'Search & Book Online',
    body: 'Enter your pickup and drop-off airports, date, time, and passenger count. Instant results with live pricing.',
  },
  {
    step: '02',
    title: 'Driver Confirmed',
    body: '24 hours before pickup, you receive your driver\'s name, vehicle registration and a contact number.',
  },
  {
    step: '03',
    title: 'Track on the Day',
    body: 'On departure day, receive your driver\'s live location so you know exactly when they\'ll arrive.',
  },
  {
    step: '04',
    title: 'Relax & Arrive',
    body: 'Your driver handles everything from the terminal to your destination — bags, directions, the lot.',
  },
]

// ── Service areas ─────────────────────────────────────────────────────────────

const SERVICE_AREAS = [
  'London Heathrow (LHR)',
  'London Gatwick (LGW)',
  'London Stansted (STN)',
  'London Luton (LTN)',
  'London City (LCY)',
  'Manchester Airport (MAN)',
  'Birmingham Airport (BHX)',
  'Edinburgh Airport (EDI)',
  'Glasgow Airport (GLA)',
  'Bristol Airport (BRS)',
  'Dubai International (DXB)',
  '100+ Cities Worldwide',
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransfersPage() {
  const eyebrowRef  = useRef<HTMLParagraphElement>(null)
  const h1Ref       = useRef<HTMLSpanElement>(null)
  const subRef      = useRef<HTMLParagraphElement>(null)
  const carsRef     = useRef<HTMLDivElement>(null)
  const inclRef     = useRef<HTMLElement>(null)
  const processRef  = useRef<HTMLElement>(null)
  const areasRef    = useRef<HTMLElement>(null)
  const finalRef    = useRef<HTMLElement>(null)
  const [heroBg, setHeroBg] = useState<string | null>(null)

  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [results,   setResults]   = useState<TransferResult[] | null>(null)
  const [lastSearch, setLastSearch] = useState<TransferSearchParams | null>(null)
  const [selected,  setSelected]  = useState<TransferResult | null>(null)

  async function handleSearch(params: TransferSearchParams) {
    setLoading(true); setError(null); setResults(null); setLastSearch(params)
    try {
      const qs = new URLSearchParams({
        fromCode: params.fromCode,
        toCode:   params.toCode,
        fromDate: params.fromDate,
        fromTime: params.fromTime,
        adults:   String(params.adults),
        children: String(params.children),
      })
      const res  = await fetch(`/api/hotelbeds/transfers?${qs.toString()}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? 'Search failed')
      setResults(data.transfers ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/media/transfers_hero_bg')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setHeroBg(d.url) })
      .catch(() => {})
  }, [])

  // ── Hero GSAP reveal ─────────────────────────────────────────────────────
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(eyebrowRef.current, { opacity: 0, y: 16, duration: 0.8 }, 0.3)
    tl.from(h1Ref.current,      { yPercent: 110, opacity: 0, duration: 1.1 }, 0.7)
    tl.from(subRef.current,     { opacity: 0, y: 24, duration: 0.8 }, 1.5)
  }, [])

  // ── Vehicle cards stagger ─────────────────────────────────────────────────
  useEffect(() => {
    const container = carsRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('[data-car]').forEach((el) => {
        (el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        container.querySelectorAll('[data-car]').forEach((el, i) => {
          setTimeout(() => {
            (el as HTMLElement).style.transition = 'opacity 0.6s ease, transform 0.6s ease'
            ;(el as HTMLElement).style.opacity = '1'
            ;(el as HTMLElement).style.transform = 'translateY(0)'
          }, i * 90)
        })
        obs.disconnect()
      },
      { threshold: 0.1 },
    )
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  // ── Section fade-ups ─────────────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sections = [inclRef.current, processRef.current, areasRef.current, finalRef.current]
    sections.forEach((el) => {
      if (!el) return
      el.style.opacity = '0'
      el.style.transform = 'translateY(40px)'
      const obs = new IntersectionObserver(
        (entries) => {
          if (!entries[0].isIntersecting) return
          el.style.transition = 'opacity 0.75s ease, transform 0.75s ease'
          el.style.opacity    = '1'
          el.style.transform  = 'translateY(0)'
          obs.disconnect()
        },
        { threshold: 0.05 },
      )
      obs.observe(el)
    })
  }, [])

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* ── Section 0: Online booking search ─────────────────────────────── */}
      <section className="bg-[#0B1F3A] pt-10 pb-0 px-5 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-2">
              Book Online — Instant Results
            </p>
            <h2 className="font-display text-white font-bold text-[clamp(1.5rem,3vw,2.2rem)] leading-tight">
              Search Airport Transfers
            </h2>
            <p className="text-white/50 text-sm mt-2">Live pricing · Instant confirmation</p>
          </div>

          <TransferSearchForm onSearch={handleSearch} loading={loading} />

          {/* Loading */}
          {loading && (
            <div className="mt-6 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white/5 rounded-2xl h-32 animate-pulse border border-white/10" />
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="mt-6 flex items-center gap-3 bg-red-900/30 border border-red-500/30 text-red-300 rounded-2xl px-5 py-4 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Search failed</p>
                <p className="mt-0.5 text-red-400 text-xs">{error}</p>
                <p className="mt-1 text-xs text-red-400/70">
                  Or <a href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20an%20airport%20transfer." target="_blank" rel="noopener noreferrer" className="underline hover:text-red-300">WhatsApp us</a> for a manual quote.
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {results && !loading && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/60 text-sm">
                  <span className="text-white font-bold">{results.length}</span> transfer{results.length !== 1 ? 's' : ''} available
                </p>
                <button onClick={() => { setResults(null); setError(null) }} className="text-xs text-[#C9A84C] hover:underline">
                  ← New search
                </button>
              </div>

              {results.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                  <Car className="w-10 h-10 text-white/20 mx-auto mb-3" strokeWidth={1} />
                  <p className="text-white font-semibold">No transfers found</p>
                  <p className="text-white/40 text-sm mt-1 mb-4">Try different airports or dates, or book via WhatsApp.</p>
                  <a
                    href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20an%20airport%20transfer."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#25D366] text-white font-bold text-sm rounded-full hover:bg-[#1fbe5a] transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Book via WhatsApp
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  {results.map((t, i) => (
                    <TransferResultCard
                      key={t.transferKey || i}
                      transfer={t}
                      onSelect={setSelected}
                      fromName={lastSearch?.fromName ?? ''}
                      toName={lastSearch?.toName ?? ''}
                      passengers={(lastSearch?.adults ?? 2) + (lastSearch?.children ?? 0)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 max-w-3xl mx-auto px-5 py-8">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-white/30 text-xs uppercase tracking-widest flex-shrink-0">or book via WhatsApp</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* ── Section 1: Hero ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-center px-5 py-24"
      >
        {/* Background layers */}
        <div className="absolute inset-0 bg-[#0B1F3A]">
          {heroBg && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url('${heroBg}')` }}
            />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-5%,_#1C3557_0%,_transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_90%,_rgba(201,168,76,0.07)_0%,_transparent_55%)]" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-3xl">
          <p
            ref={eyebrowRef}
            className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-6"
            style={{ opacity: 0 }}
          >
            Airport Transfers
          </p>

          <h1 className="font-display font-bold text-white mb-6 overflow-hidden leading-[0.92]">
            <span
              ref={h1Ref}
              className="block text-[clamp(2.8rem,7vw,5.8rem)]"
              style={{ transform: 'translateY(110%)', opacity: 0 }}
            >
              Private, Punctual,<br />Perfectly Smooth.
            </span>
          </h1>

          <p
            ref={subRef}
            className="text-white/55 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-10"
            style={{ opacity: 0 }}
          >
            Door-to-door airport transfers in 100+ cities worldwide. Flight monitoring, meet &amp; greet,
            and a professional driver — all included.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20an%20airport%20transfer."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#25D366] hover:bg-[#1fbe5a] text-white font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg shadow-green-500/20"
            >
              <MessageCircle className="w-4 h-4" />
              Book via WhatsApp
            </a>
            <a
              href="#vehicles"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 border border-white/20 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-semibold text-sm rounded-full transition-all duration-300"
            >
              View Vehicles
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Stats strip */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/[0.07] bg-white/[0.03] backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-5 py-5 grid grid-cols-3 gap-4">
            {[
              { val: '100+',  label: 'Cities covered'    },
              { val: '24/7',  label: 'Available'         },
              { val: 'Fixed', label: 'Price guaranteed'  },
            ].map(({ val, label }) => (
              <div key={label} className="text-center">
                <p className="text-[#C9A84C] font-display font-bold text-lg">{val}</p>
                <p className="text-white/35 text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 2: Vehicle Cards ──────────────────────────────────────── */}
      <section id="vehicles" className="bg-white py-16 lg:py-24 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Fleet
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Choose Your Vehicle
            </h2>
          </div>

          <div ref={carsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {VEHICLES.map(({ name, desc, passengers, bags, badge, example, imgGradient }) => (
              <div
                key={name}
                data-car
                className="group rounded-2xl overflow-hidden border border-[#E2D9CC] hover:border-[#C9A84C]/40 hover:shadow-xl transition-all duration-300"
                style={{ opacity: 0, transform: 'translateY(28px)' }}
              >
                <div className={`relative h-36 bg-gradient-to-br ${imgGradient} flex items-center justify-center overflow-hidden`}>
                  <Car className="w-16 h-16 text-white/15 group-hover:text-white/22 transition-colors duration-300" strokeWidth={1} />
                  <span className="absolute top-3 left-3 px-2.5 py-1 bg-[#C9A84C] text-[#0B1F3A] text-[10px] font-bold rounded-full">
                    {badge}
                  </span>
                </div>

                <div className="p-5 bg-white">
                  <h3 className="text-[#0B1F3A] font-bold text-base mb-1">{name}</h3>
                  <p className="text-[#0B1F3A]/50 text-xs mb-4 leading-relaxed">{desc}</p>

                  <div className="flex items-center gap-4 pt-3 border-t border-[#F5F2EE]">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#C9A84C]" />
                      <span className="text-[#0B1F3A] text-xs font-semibold">{passengers} passengers</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-[#C9A84C]" />
                      <span className="text-[#0B1F3A] text-xs font-semibold">{bags} bags</span>
                    </div>
                  </div>
                  <p className="text-[#0B1F3A]/30 text-[10px] mt-2">{example}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: What's Included ────────────────────────────────────── */}
      <section
        ref={inclRef}
        className="bg-[#0B1F3A] py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-14">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Included
            </p>
            <h2 className="font-display text-white font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Every Transfer Includes
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INCLUSIONS.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="bg-white/5 rounded-2xl border border-white/8 p-6 hover:bg-white/8 hover:border-[#C9A84C]/20 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-[#C9A84C]" />
                </div>
                <h3 className="text-white font-bold text-sm mb-2">{label}</h3>
                <p className="text-white/45 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: How It Works ───────────────────────────────────────── */}
      <section
        ref={processRef}
        className="bg-[#F5F2EE] py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-14">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              How It Works
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              From Search to Destination
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            {PROCESS.map(({ step, title, body }, i) => (
              <div key={step} className="flex lg:flex-col gap-5 lg:gap-0">
                <div className="flex-shrink-0 flex lg:flex-col items-center lg:items-start gap-3 lg:gap-0 lg:mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
                    <span className="text-[#C9A84C] text-xs font-bold">{step}</span>
                  </div>
                  {i < PROCESS.length - 1 && (
                    <div className="hidden lg:block w-full h-px bg-[#0B1F3A]/10 mt-5 -mb-5 ml-5" style={{ marginLeft: '2.5rem' }} />
                  )}
                  {i < PROCESS.length - 1 && (
                    <div className="lg:hidden w-px h-full bg-[#0B1F3A]/10 ml-5" />
                  )}
                </div>
                <div className="pt-1 lg:pt-0">
                  <h3 className="text-[#0B1F3A] font-bold text-sm mb-2">{title}</h3>
                  <p className="text-[#0B1F3A]/50 text-xs leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 5: Service Areas ──────────────────────────────────────── */}
      <section
        ref={areasRef}
        className="bg-white py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Airports &amp; Cities
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Where We Operate
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {SERVICE_AREAS.map((area) => (
              <div
                key={area}
                className="flex items-center gap-2 p-3.5 rounded-xl bg-[#F5F2EE] border border-[#E2D9CC] hover:border-[#C9A84C]/40 hover:bg-white transition-all duration-200"
              >
                <MapPin className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0" />
                <span className="text-[#0B1F3A] text-xs font-medium leading-snug">{area}</span>
              </div>
            ))}
          </div>

          <p className="text-center text-[#0B1F3A]/40 text-xs mt-6">
            Don&apos;t see your airport? WhatsApp us — we cover most major airports worldwide.
          </p>
        </div>
      </section>

      {/* ── Section 6: Final CTA ──────────────────────────────────────────── */}
      <section
        ref={finalRef}
        className="bg-[#0B1F3A] py-16 lg:py-20 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="bg-white/5 rounded-3xl border border-white/10 p-10 lg:p-14 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#C9A84C] flex items-center justify-center mx-auto mb-6">
              <Car className="w-7 h-7 text-[#0B1F3A]" />
            </div>
            <h2 className="font-display text-white font-bold text-[clamp(1.8rem,4vw,3rem)] leading-tight mb-4">
              Need Help Booking?
            </h2>
            <p className="text-white/50 text-base mb-8 max-w-md mx-auto leading-relaxed">
              If you can&apos;t find what you need online, WhatsApp us and Jade will confirm your transfer — usually within 15 minutes.
            </p>
            <a
              href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20an%20airport%20transfer."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-10 py-4 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-xl shadow-[#C9A84C]/20"
            >
              <MessageCircle className="w-4 h-4" />
              Book via WhatsApp — Jade is Ready
            </a>
          </div>
        </div>
      </section>

      {/* ── Booking modal ─────────────────────────────────────────────────── */}
      {selected && lastSearch && (
        <TransferBookingModal
          transfer={selected}
          search={lastSearch}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
