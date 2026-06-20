'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Globe, Lock, Signal, Check, MessageCircle, ChevronDown, ArrowRight } from 'lucide-react'

// ── Ticker ────────────────────────────────────────────────────────────────────
export function EsimTicker() {
  const items = [
    '📶 150+ COUNTRIES', '⚡ INSTANT ACTIVATION', '🔒 SECURE CONNECTION',
    '💳 NO CONTRACTS',   '📱 ALL ESIM PHONES',    '🌍 GLOBAL COVERAGE',
    '💰 FROM USD $9.99', '🎯 POWERED BY JADE',
  ]
  return (
    <div className="overflow-hidden py-3.5"
      style={{ background: '#0d2040', borderTop: '1px solid rgba(201,168,76,0.15)', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
      <div className="flex whitespace-nowrap" style={{ animation: 'sTicker 40s linear infinite' }}>
        {[...Array(4)].flatMap((_, bi) =>
          items.map((item, i) => (
            <span key={`${bi}-${i}`} className="text-[#C9A84C] text-xs font-bold tracking-widest mx-6">{item}</span>
          ))
        )}
      </div>
      <style>{`@keyframes sTicker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  )
}

// ── How It Works ─────────────────────────────────────────────────────────────
export function EsimHowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          import('gsap').then(({ gsap }) => {
            gsap.fromTo('.how-step',
              { opacity: 0, y: 60 },
              { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.18 }
            )
          })
          obs.disconnect()
        }
      },
      { threshold: 0.2 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section id="esim-how" ref={sectionRef} className="relative py-24 px-5 sm:px-8 overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#081528 0%,#0B1F3A 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 30% 50%,rgba(201,168,76,0.06) 0%,transparent 60%)', opacity: 0.4 }} />

      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-4">The Process</p>
          <h2 className="font-display font-bold text-white leading-tight" style={{ fontSize: 'clamp(2rem,5vw,3.25rem)' }}>
            Three steps to connectivity.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {[
            { num: '01', Icon: Globe,  title: 'Choose Your Plan',
              body: 'Search your destination. Jade shows every available data plan, filtered for your trip length and budget.' },
            { num: '02', Icon: Lock,   title: 'Pay Securely',
              body: 'Stripe-secured checkout in seconds. Your QR code is generated and delivered to your email instantly.' },
            { num: '03', Icon: Signal, title: 'Activate and Go',
              body: 'Scan the QR code on your phone before you land. Connected before the plane door opens. No queues. No roaming bills.' },
          ].map((step, i) => (
            <div key={i} className="how-step relative flex flex-col items-center text-center" style={{ opacity: 0 }}>
              <p className="font-bold mb-3"
                style={{ fontSize: 48, lineHeight: 1, WebkitTextStroke: '1px #C9A84C', color: 'transparent' }}>
                {step.num}
              </p>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)' }}>
                <step.Icon className="w-7 h-7 text-[#C9A84C]" />
              </div>
              <h3 className="font-bold text-white text-lg mb-3">{step.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{step.body}</p>
              {i < 2 && (
                <div className="hidden md:block absolute right-[-16px] top-[56px] w-8 h-[1px]"
                  style={{ borderTop: '1px dashed rgba(201,168,76,0.3)' }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Compatibility ─────────────────────────────────────────────────────────────
export function EsimCompatibility() {
  return (
    <section className="py-20 px-5 sm:px-8" style={{ background: '#0d2040' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-display font-bold text-white mb-3" style={{ fontSize: 'clamp(1.8rem,4vw,2.75rem)' }}>
            Is my phone compatible?
          </h2>
          <p className="text-white/40 text-sm">Works with most modern smartphones.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Compatible list */}
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
                  style={{ animation: `sFadeSlide 0.5s ease-out ${0.1 + i * 0.1}s both` }}>
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
                { device: '📱 iPhone',  steps: 'Settings → General → About\nScroll down → look for EID number\nIf EID appears — your phone supports eSIM' },
                { device: '🤖 Android', steps: 'Settings → About Phone\nLook for EID or eSIM option\nIf EID appears — your phone supports eSIM' },
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
      <style>{`@keyframes sFadeSlide{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'What is an eSIM?',
    a: 'An eSIM (embedded SIM) is a digital SIM card built into your phone. You add a data plan to it without needing a physical SIM card — ideal for international travel.' },
  { q: 'When should I activate it?',
    a: 'We recommend installing your eSIM before you travel (at home on WiFi), but wait to switch to it until you land. Your data countdown starts when you first use it.' },
  { q: 'Can I keep my regular number?',
    a: 'Yes. Your eSIM runs alongside your regular SIM. Your number stays the same — the eSIM just handles your data abroad so you avoid roaming charges.' },
  { q: 'What if I need more data?',
    a: 'You can top up directly from your portal at /portal/esims. We offer top-up packages for every destination.' },
  { q: 'What if it does not work?',
    a: 'Our team is available 24/7 on WhatsApp at +44 7398 753797. We will resolve any activation issue within minutes.' },
  { q: 'Which phones are compatible?',
    a: 'iPhone XS and later, Samsung Galaxy S20+, Google Pixel 3a+, and most Android phones from 2020. Check Settings → General → About → look for EID number.' },
]

export function EsimFAQ() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="py-20 px-5 sm:px-8" style={{ background: '#081528' }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[#C9A84C] text-[11px] font-bold tracking-[0.25em] uppercase mb-4">Support</p>
          <h2 className="font-display font-bold text-white" style={{ fontSize: 'clamp(1.8rem,4vw,2.75rem)' }}>
            Frequently asked
          </h2>
        </div>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-2xl overflow-hidden transition-all duration-300"
              style={{ background: 'rgba(255,255,255,0.03)', border: open === i ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(255,255,255,0.06)' }}>
              <button onClick={() => setOpen(open === i ? null : i)}
                className="w-full text-left px-6 py-5 flex items-center justify-between gap-4">
                <span className="font-semibold text-white text-sm">{item.q}</span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${open === i ? 'rotate-180 text-[#C9A84C]' : 'text-white/30'}`} />
              </button>
              {open === i && (
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
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────
function CountUpStat({ end, suffix, label }: { end: number; suffix: string; label: string }) {
  const ref   = useRef<HTMLSpanElement>(null)
  const fired = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !fired.current) {
        fired.current = true
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced) { el.textContent = String(end); return }
        const start = performance.now(); const dur = 1800
        const animate = (now: number) => {
          const t = Math.min((now - start) / dur, 1)
          el.textContent = String(Math.floor((1 - Math.pow(1 - t, 3)) * end))
          if (t < 1) requestAnimationFrame(animate); else el.textContent = String(end)
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

export function EsimCTA() {
  function scrollToSearch() {
    document.getElementById('esim-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      {/* Stats strip */}
      <section className="py-20 px-5 sm:px-8" style={{ background: '#0B1F3A' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { end: 150, suffix: '+',   label: 'Countries covered'          },
              { end: 70,  suffix: '%',   label: 'Average savings vs roaming' },
              { end: 2,   suffix: ' min',label: 'Average activation time'    },
              { end: 24,  suffix: '/7',  label: 'Jade support included'      },
            ].map((s, i) => (
              <CountUpStat key={i} end={s.end} suffix={s.suffix} label={s.label} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative flex items-center justify-center overflow-hidden py-28 px-5 sm:px-8"
        style={{ minHeight: '80vh', background: '#081528' }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%,rgba(201,168,76,0.07) 0%,transparent 70%)' }} />

        <div className="relative z-10 text-center max-w-2xl mx-auto">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-[110px] h-[110px] rounded-full overflow-hidden relative"
                style={{
                  background: 'radial-gradient(circle at 50% 30%,#dceaf5,#a8cce8)',
                  border:     '3px solid rgba(201,168,76,0.6)',
                  boxShadow:  '0 0 0 8px rgba(201,168,76,0.08),0 0 0 16px rgba(201,168,76,0.04)',
                  animation:  'eAvatarPulse 3s ease-in-out infinite',
                }}>
                <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" style={{ objectPosition: '50% 8%' }} sizes="110px" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-[#C9A84C]/25" style={{ animation: 'eRingPulse 2.5s ease-out 0s infinite' }} />
              <div className="absolute inset-0 rounded-full border border-[#C9A84C]/15"   style={{ animation: 'eRingPulse 2.5s ease-out 1s infinite' }} />
            </div>
          </div>

          <h2 className="font-display font-bold text-white leading-tight mb-4"
            style={{ fontSize: 'clamp(2.2rem,6vw,3.75rem)' }}>
            Ready to stay connected?
          </h2>
          <p className="text-white/40 text-base leading-relaxed mb-10 max-w-lg mx-auto">
            Join thousands of Walz Travels clients who never worry about roaming charges again. Your eSIM is ready in minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={scrollToSearch}
              className="px-10 py-4 font-bold text-sm rounded-full flex items-center gap-2 transition-all duration-300 hover:scale-105 w-full sm:w-auto justify-center"
              style={{ background: '#C9A84C', color: '#0B1F3A' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 40px rgba(201,168,76,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}>
              Get Your eSIM Now
              <ArrowRight className="w-4 h-4" />
            </button>
            <a href="https://wa.me/447398753797" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-white/50 text-sm hover:text-white transition-colors">
              <MessageCircle className="w-4 h-4" />
              Or WhatsApp Jade — +44 7398 753797
            </a>
          </div>
        </div>

        <style>{`
          @keyframes eAvatarPulse{
            0%,100%{box-shadow:0 0 0 8px rgba(201,168,76,.08),0 0 0 16px rgba(201,168,76,.04)}
            50%    {box-shadow:0 0 0 12px rgba(201,168,76,.12),0 0 0 24px rgba(201,168,76,.06)}
          }
          @keyframes eRingPulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.2);opacity:0}}
        `}</style>
      </section>
    </>
  )
}
