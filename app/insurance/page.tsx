'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import {
  Shield, Check, MessageCircle,
  Plane, Briefcase, Heart, Zap,
} from 'lucide-react'

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
  { category: 'Medical',       item: 'Emergency Medical Expenses',    limit: 'Up to £10,000,000' },
  { category: 'Medical',       item: 'Emergency Evacuation',          limit: 'Up to £500,000'    },
  { category: 'Cancellation',  item: 'Trip Cancellation',             limit: 'Up to £5,000'      },
  { category: 'Cancellation',  item: 'Trip Curtailment',              limit: 'Up to £5,000'      },
  { category: 'Baggage',       item: 'Baggage Loss or Theft',         limit: 'Up to £2,500'      },
  { category: 'Baggage',       item: 'Baggage Delay',                 limit: 'Up to £500'        },
  { category: 'Travel',        item: 'Flight Delay',                  limit: 'Up to £400'        },
  { category: 'Travel',        item: 'Missed Departure',              limit: 'Up to £1,000'      },
  { category: 'Liability',     item: 'Personal Liability',            limit: 'Up to £2,000,000'  },
  { category: 'Liability',     item: 'COVID-19 Cover',                limit: 'Included'          },
]

// ── How it works steps ────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Plane,
    title: 'Tell Us Your Trip',
    body: 'Share your destination, travel dates and number of travellers via WhatsApp or our booking form.',
  },
  {
    step: '02',
    icon: Shield,
    title: 'We Source Your Policy',
    body: 'We compare policies from leading insurers and match you with the best cover for your trip and budget.',
  },
  {
    step: '03',
    icon: Briefcase,
    title: 'Review Your Cover',
    body: 'We send you the policy documents to review. Ask us anything — we explain every detail in plain English.',
  },
  {
    step: '04',
    icon: Heart,
    title: 'Travel with Confidence',
    body: 'Receive your policy certificate and our 24/7 emergency assistance number. You\'re covered from departure.',
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const eyebrowRef  = useRef<HTMLParagraphElement>(null)
  const h1Ref       = useRef<HTMLSpanElement>(null)
  const subRef      = useRef<HTMLParagraphElement>(null)
  const ctaRef      = useRef<HTMLDivElement>(null)
  const benefitsRef = useRef<HTMLElement>(null)
  const tableRef    = useRef<HTMLElement>(null)
  const stepsRef    = useRef<HTMLElement>(null)
  const finalRef    = useRef<HTMLElement>(null)

  // ── Hero GSAP reveal ─────────────────────────────────────────────────────
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(eyebrowRef.current, { opacity: 0, y: 16, duration: 0.8 }, 0.3)
    tl.from(h1Ref.current,      { yPercent: 110, opacity: 0, duration: 1.1 }, 0.7)
    tl.from(subRef.current,     { opacity: 0, y: 24, duration: 0.8 }, 1.5)
    tl.from(ctaRef.current,     { opacity: 0, y: 20, duration: 0.7 }, 2.0)
  }, [])

  // ── Section fade-ups ─────────────────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sections = [benefitsRef.current, tableRef.current, stepsRef.current, finalRef.current]
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

  // ── Benefits tiles stagger ────────────────────────────────────────────────
  useEffect(() => {
    const container = benefitsRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('[data-benefit]').forEach((el) => {
        (el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        container.querySelectorAll('[data-benefit]').forEach((el, i) => {
          setTimeout(() => {
            (el as HTMLElement).style.transition = 'opacity 0.5s ease, transform 0.5s ease'
            ;(el as HTMLElement).style.opacity = '1'
            ;(el as HTMLElement).style.transform = 'translateY(0)'
          }, i * 60)
        })
        obs.disconnect()
      },
      { threshold: 0.1 },
    )
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-[#0B1F3A]">

      {/* ── Section 1: Hero ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-center px-5"
        style={{ minHeight: '100vh' }}
      >
        {/* Layered backgrounds */}
        <div className="absolute inset-0 bg-[#0B1F3A]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,_#1C3557_0%,_transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_100%,_rgba(201,168,76,0.08)_0%,_transparent_50%)]" />
        </div>

        {/* Floating shield shapes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
          <div className="absolute top-[15%] left-[8%] w-24 h-28 border border-white/[0.04] rounded-3xl rotate-12" />
          <div className="absolute top-[60%] left-[5%] w-16 h-20 border border-[#C9A84C]/[0.06] rounded-2xl -rotate-6" />
          <div className="absolute top-[20%] right-[7%] w-20 h-24 border border-white/[0.04] rounded-3xl -rotate-8" />
          <div className="absolute top-[65%] right-[6%] w-28 h-32 border border-[#C9A84C]/[0.05] rounded-3xl rotate-15" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-3xl">
          {/* Shield icon */}
          <div className="w-16 h-16 rounded-2xl bg-[#C9A84C] flex items-center justify-center mx-auto mb-8">
            <Shield className="w-8 h-8 text-[#0B1F3A]" />
          </div>

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
              Travel with<br />Total Confidence
            </span>
          </h1>

          <p
            ref={subRef}
            className="text-white/55 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-10"
            style={{ opacity: 0 }}
          >
            Comprehensive protection for every journey — medical emergencies, cancellations, lost baggage and more.
            Arranged personally by the Walz team.
          </p>

          <div ref={ctaRef} className="flex flex-col sm:flex-row items-center justify-center gap-3" style={{ opacity: 0 }}>
            <a
              href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20travel%20insurance%20for%20my%20upcoming%20trip."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#25D366] hover:bg-[#1fbe5a] text-white font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg shadow-green-500/20"
            >
              <MessageCircle className="w-4 h-4" />
              Get a Quote via WhatsApp
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 border border-white/20 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-semibold text-sm rounded-full transition-all duration-300"
            >
              How It Works
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none" aria-hidden>
          <span className="text-white/25 text-[9px] tracking-[0.25em] uppercase font-medium">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/25 to-transparent" />
        </div>
      </section>

      {/* ── Section 2: Benefits ───────────────────────────────────────────── */}
      <section
        ref={benefitsRef}
        className="bg-white py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              What You&apos;re Covered For
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Comprehensive Protection
            </h2>
            <p className="text-[#0B1F3A]/50 mt-3 text-sm lg:text-base max-w-xl mx-auto">
              Our policies are sourced from A-rated insurers and cover all the essentials — and more.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BENEFITS.map((item, i) => (
              <div
                key={item}
                data-benefit
                className="flex items-center gap-3 p-4 rounded-xl bg-[#F5F2EE] border border-[#E2D9CC] hover:border-[#C9A84C]/40 hover:bg-white transition-all duration-200"
                style={{ opacity: 0, transform: 'translateY(20px)' }}
              >
                <div className="w-6 h-6 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-[#C9A84C]" />
                </div>
                <span className="text-[#0B1F3A] text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: Coverage Table ─────────────────────────────────────── */}
      <section
        ref={tableRef}
        className="bg-[#F5F2EE] py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Cover Limits
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              What You Can Claim
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-[#E2D9CC] overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 px-6 py-3 bg-[#0B1F3A]">
              <span className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-wider">Category</span>
              <span className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-wider">Cover Type</span>
              <span className="text-[#C9A84C] text-[10px] font-bold uppercase tracking-wider text-right">Limit</span>
            </div>
            {COVERAGE_TABLE.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-3 px-6 py-4 border-t border-[#F5F2EE] hover:bg-[#F5F2EE]/60 transition-colors"
              >
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

      {/* ── Section 4: How It Works ───────────────────────────────────────── */}
      <section
        id="how-it-works"
        ref={stepsRef}
        className="bg-[#0B1F3A] py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-14">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              The Process
            </p>
            <h2 className="font-display text-white font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              How It Works
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, body }) => (
              <div key={step} className="relative">
                {/* Connector line — desktop only */}
                <div className="hidden lg:block absolute top-7 left-full w-5 h-px bg-white/10 z-10" />

                <div className="bg-white/5 rounded-2xl border border-white/8 p-6 hover:bg-white/8 hover:border-[#C9A84C]/20 transition-all duration-300 h-full">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-[#C9A84C]/20 font-display font-bold text-3xl leading-none select-none">
                      {step}
                    </span>
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

      {/* ── Section 5: CTA + Disclaimer ──────────────────────────────────── */}
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
            WhatsApp Jade with your trip details and we&apos;ll source and arrange your policy — usually within the same day.
          </p>

          <a
            href="https://wa.me/447398753797?text=Hi%20Walz%20Travels%2C%20I%20need%20travel%20insurance%20for%20my%20upcoming%20trip."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-10 py-4 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-xl shadow-[#0B1F3A]/20"
          >
            <MessageCircle className="w-4 h-4" />
            Get a Quote — WhatsApp Jade
          </a>

          <p className="text-[#0B1F3A]/50 text-xs mt-6 max-w-md mx-auto leading-relaxed">
            Travel insurance is arranged by Walz Travels on behalf of third-party insurers.
            Policy terms, conditions and exclusions apply. Walz Travels is not an authorised insurer.
          </p>
        </div>
      </section>

    </div>
  )
}
