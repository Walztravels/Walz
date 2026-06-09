'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import {
  MessageCircle, Mail, FileText,
  CreditCard, Calendar, Building2, Banknote,
  XCircle, User, Headphones, Plus, Minus,
} from 'lucide-react'

// ── Quick help tiles ──────────────────────────────────────────────────────────

const HELP_TILES = [
  { icon: CreditCard,   label: 'Book a Flight',          href: '#faq' },
  { icon: FileText,     label: 'Visa Applications',       href: '#faq' },
  { icon: Building2,    label: 'Hotels & Tours',          href: '#faq' },
  { icon: Calendar,     label: 'Manage Booking',          href: '#faq' },
  { icon: Banknote,     label: 'Payments',                href: '#faq' },
  { icon: XCircle,      label: 'Refunds',                 href: '#faq' },
  { icon: User,         label: 'My Portal',               href: '#faq' },
  { icon: Headphones,   label: 'Speak to Jade',           href: 'https://wa.me/447398753797' },
]

// ── FAQ accordion items ───────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'How do I book a flight with Walz Travels?',
    a: 'Visit walztravels.com/flights and search your route. Select your preferred flight and complete the booking form. Our team will confirm and issue your ticket within 2 hours of payment.',
  },
  {
    q: 'How does the visa application process work?',
    a: 'You submit your application through our portal or WhatsApp. We prepare all documents, write your cover letter and submit to the embassy on your behalf. You track progress in your portal.',
  },
  {
    q: 'How long does a UK visa take?',
    a: 'Typically 3 to 4 weeks from submission. We recommend applying at least 8 weeks before your travel date.',
  },
  {
    q: 'Do you guarantee visa approval?',
    a: 'We guarantee professional preparation and a 90%+ approval rate. Final decisions rest solely with the embassy. We cannot guarantee approval.',
  },
  {
    q: 'What is the cancellation policy for tours?',
    a: '7 or more days before — full refund minus 10% admin fee. 3 to 6 days before — 50% refund. Less than 48 hours — no refund.',
  },
  {
    q: 'How do I access my client portal?',
    a: 'Go to walztravels.com/login and sign in with your email and password. Your portal shows all your applications, bookings and documents.',
  },
  {
    q: 'How do I contact Walz Travels?',
    a: 'WhatsApp us at +447398753797 or email contact@walztravels.com. Jade AI is available 24/7 on the website.',
  },
]

// ── Floating ? positions ──────────────────────────────────────────────────────

interface FloatQ {
  top: string
  left?: string
  right?: string
  size: string
  delay: string
  dur: string
  opacity: number
}

const FLOAT_QS: FloatQ[] = [
  { top: '12%', left: '7%',   size: '4.5rem', delay: '0s',    dur: '7s',   opacity: 0.04 },
  { top: '65%', left: '4%',   size: '2.8rem', delay: '1.6s',  dur: '8.5s', opacity: 0.06 },
  { top: '22%', right: '6%',  size: '3.2rem', delay: '0.9s',  dur: '6.5s', opacity: 0.05 },
  { top: '58%', right: '5%',  size: '5.5rem', delay: '2.1s',  dur: '9s',   opacity: 0.03 },
  { top: '78%', left: '24%',  size: '2.2rem', delay: '1.1s',  dur: '7s',   opacity: 0.05 },
  { top: '18%', left: '44%',  size: '1.9rem', delay: '0.5s',  dur: '8s',   opacity: 0.04 },
]

// ── FAQ item component ────────────────────────────────────────────────────────

function FAQItem({
  q, a, isOpen, onToggle,
}: {
  q: string
  a: string
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div className="border-b border-white/10 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-6 py-5 text-left group"
      >
        <span className="text-white font-medium text-sm lg:text-base leading-snug group-hover:text-[#C9A84C] transition-colors duration-200">
          {q}
        </span>
        <span className="flex-shrink-0 w-7 h-7 rounded-full border border-[#C9A84C]/40 flex items-center justify-center text-[#C9A84C] transition-all duration-200 group-hover:bg-[#C9A84C]/10">
          {isOpen
            ? <Minus className="w-3.5 h-3.5" />
            : <Plus  className="w-3.5 h-3.5" />
          }
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-400 ease-in-out"
        style={{ maxHeight: isOpen ? '300px' : '0px', opacity: isOpen ? 1 : 0 }}
      >
        <p className="text-white/55 text-sm leading-relaxed pb-5 pr-12">
          {a}
        </p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const eyebrowRef = useRef<HTMLParagraphElement>(null)
  const h1Ref      = useRef<HTMLSpanElement>(null)
  const subRef     = useRef<HTMLParagraphElement>(null)
  const ctaRef     = useRef<HTMLDivElement>(null)
  const tilesRef   = useRef<HTMLDivElement>(null)
  const faqSecRef  = useRef<HTMLElement>(null)
  const ctaSecRef  = useRef<HTMLElement>(null)

  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [heroBg,  setHeroBg]  = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/media/help_hero_bg')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setHeroBg(d.url) })
      .catch(() => {})
  }, [])

  // ── Hero GSAP reveal ───────────────────────────────────────────────────────
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
    tl.from(eyebrowRef.current, { opacity: 0, y: 16, duration: 0.8 }, 0.3)
    tl.from(h1Ref.current,      { yPercent: 110, opacity: 0, duration: 1.1 }, 0.7)
    tl.from(subRef.current,     { opacity: 0, y: 24, duration: 0.8 }, 1.4)
    tl.from(ctaRef.current,     { opacity: 0, y: 20, duration: 0.7 }, 1.9)
  }, [])

  // ── Tiles stagger reveal ───────────────────────────────────────────────────
  useEffect(() => {
    const container = tilesRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('[data-tile]').forEach((el) => {
        (el as HTMLElement).style.opacity = '1'
        ;(el as HTMLElement).style.transform = 'none'
      })
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return
        container.querySelectorAll('[data-tile]').forEach((el, i) => {
          setTimeout(() => {
            (el as HTMLElement).style.transition = 'opacity 0.55s ease, transform 0.55s ease'
            ;(el as HTMLElement).style.opacity = '1'
            ;(el as HTMLElement).style.transform = 'translateY(0)'
          }, i * 75)
        })
        obs.disconnect()
      },
      { threshold: 0.1 },
    )
    obs.observe(container)
    return () => obs.disconnect()
  }, [])

  // ── Fade-up for FAQ + CTA sections ────────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const sections = [faqSecRef.current, ctaSecRef.current]
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

      {/* Float keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes helpFloat {
          0%, 100% { transform: translateY(0px) rotate(-4deg); }
          50%       { transform: translateY(-16px) rotate(4deg); }
        }
      ` }} />

      {/* ── Section 1: Hero ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden flex flex-col items-center justify-center text-center px-5"
        style={{ height: '70vh', minHeight: '600px' }}
      >
        {/* Background gradient */}
        <div className="absolute inset-0 bg-[#0B1F3A]">
          {heroBg && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-20"
              style={{ backgroundImage: `url('${heroBg}')` }}
            />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-5%,_#1C3557_0%,_transparent_65%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_90%,_rgba(201,168,76,0.07)_0%,_transparent_55%)]" />
        </div>


        {/* Content */}
        <div className="relative z-10 max-w-3xl">
          <p
            ref={eyebrowRef}
            className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-6"
            style={{ opacity: 0 }}
          >
            Help Centre
          </p>

          <h1 className="font-display font-bold text-white mb-6 overflow-hidden leading-[0.95]">
            <span
              ref={h1Ref}
              className="block text-[clamp(2.4rem,7vw,5.5rem)]"
              style={{ transform: 'translateY(110%)', opacity: 0 }}
            >
              How Can We<br />Help You Today?
            </span>
          </h1>

          <p
            ref={subRef}
            className="text-white/55 text-base lg:text-lg max-w-lg mx-auto leading-relaxed mb-8"
            style={{ opacity: 0 }}
          >
            Browse answers below, or connect directly with the Walz team — we respond within the hour.
          </p>

          <div ref={ctaRef} style={{ opacity: 0 }}>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-[#25D366] hover:bg-[#1fbe5a] text-white font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg shadow-green-500/20"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp Jade Now
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none" aria-hidden>
          <span className="text-white/25 text-[9px] tracking-[0.25em] uppercase font-medium">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/25 to-transparent" />
        </div>
      </section>

      {/* ── Section 2: Quick Help Tiles ──────────────────────────────────── */}
      <section className="bg-white py-16 lg:py-24 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto">

          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Quick Help
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              What Do You Need Help With?
            </h2>
          </div>

          <div ref={tilesRef} className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-4">
            {HELP_TILES.map(({ icon: Icon, label, href }) => (
              <a
                key={label}
                href={href}
                data-tile
                className="group flex flex-col items-center gap-3 p-5 lg:p-6 rounded-2xl border border-[#E2D9CC] bg-[#F5F2EE] hover:bg-white hover:border-[#C9A84C]/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                style={{ opacity: 0, transform: 'translateY(28px)' }}
              >
                <div className="w-11 h-11 rounded-xl bg-[#0B1F3A] flex items-center justify-center group-hover:bg-[#C9A84C] transition-colors duration-300 flex-shrink-0">
                  <Icon className="w-5 h-5 text-[#C9A84C] group-hover:text-[#0B1F3A] transition-colors duration-300" />
                </div>
                <span className="text-[#0B1F3A] text-xs font-semibold text-center leading-snug group-hover:text-[#C9A84C] transition-colors duration-200">
                  {label}
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 3: FAQ Accordion ─────────────────────────────────────── */}
      <section
        id="faq"
        ref={faqSecRef}
        className="bg-[#0B1F3A] py-16 lg:py-24 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-3xl mx-auto">

          <div className="mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Common Questions
            </p>
            <h2 className="font-display text-white font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Frequently Asked Questions
            </h2>
          </div>

          <div>
            {FAQS.map((faq, i) => (
              <FAQItem
                key={i}
                q={faq.q}
                a={faq.a}
                isOpen={openFaq === i}
                onToggle={() => setOpenFaq(prev => prev === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: Contact Block ─────────────────────────────────────── */}
      <section
        ref={ctaSecRef}
        className="bg-[#F5F2EE] py-16 lg:py-20 px-5 sm:px-8"
        style={{ opacity: 0, transform: 'translateY(40px)' }}
      >
        <div className="max-w-4xl mx-auto">

          <div className="text-center mb-12">
            <p className="text-[#C9A84C] text-[11px] font-semibold tracking-[0.22em] uppercase mb-3">
              Get in Touch
            </p>
            <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.8rem,3.5vw,2.8rem)] leading-tight">
              Still Need Help?
            </h2>
            <p className="text-[#0B1F3A]/50 mt-3 text-sm lg:text-base">
              Our team is ready — pick the fastest option for you.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* WhatsApp */}
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border border-[#E2D9CC] hover:border-green-300 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#25D366] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
              <div className="text-center">
                <p className="text-[#0B1F3A] font-bold text-sm mb-1">WhatsApp Jade</p>
                <p className="text-[#0B1F3A]/50 text-xs mb-2">+44 7398 753797</p>
                <p className="text-green-600 text-xs font-semibold">Replies within 1 hour</p>
              </div>
            </a>

            {/* Email */}
            <a
              href="mailto:contact@walztravels.com"
              className="group flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border border-[#E2D9CC] hover:border-[#C9A84C]/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#C9A84C] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Mail className="w-7 h-7 text-[#0B1F3A]" />
              </div>
              <div className="text-center">
                <p className="text-[#0B1F3A] font-bold text-sm mb-1">Email Us</p>
                <p className="text-[#0B1F3A]/50 text-xs mb-2">contact@walztravels.com</p>
                <p className="text-[#C9A84C] text-xs font-semibold">Within 4 hours</p>
              </div>
            </a>

            {/* Visa team */}
            <a
              href="mailto:visa@walztravels.com"
              className="group flex flex-col items-center gap-4 p-8 bg-white rounded-2xl border border-[#E2D9CC] hover:border-[#C9A84C]/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#1C3557] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FileText className="w-7 h-7 text-[#C9A84C]" />
              </div>
              <div className="text-center">
                <p className="text-[#0B1F3A] font-bold text-sm mb-1">Visa Team</p>
                <p className="text-[#0B1F3A]/50 text-xs mb-2">visa@walztravels.com</p>
                <p className="text-[#C9A84C] text-xs font-semibold">Visa enquiries only</p>
              </div>
            </a>

          </div>
        </div>
      </section>

    </div>
  )
}
