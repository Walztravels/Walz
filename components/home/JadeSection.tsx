'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { Zap, Search, Map } from 'lucide-react'
import { JadeChat } from '@/components/ui/JadeChat'

const CAPABILITIES = [
  {
    icon: Zap,
    title: 'Visa Requirements',
    desc: 'Instant answers on documents, eligibility and timelines for any destination.',
  },
  {
    icon: Search,
    title: 'Flight Search',
    desc: 'Live prices from 400+ airlines. Jade finds the best fares in seconds.',
  },
  {
    icon: Map,
    title: 'Tour Planning',
    desc: 'Personalised itineraries built around your dates, budget and interests.',
  },
]

export function JadeSection() {
  const sectionRef  = useRef<HTMLDivElement>(null)
  const avatarRef   = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const cardsRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    ScrollTrigger.create({
      trigger: sectionRef.current,
      start: 'top 75%',
      once: true,
      onEnter() {
        const tl = gsap.timeline()
        tl.from(avatarRef.current,  { scale: 0.6, opacity: 0, duration: 0.9, ease: 'back.out(1.5)' })
          .from(headlineRef.current, { opacity: 0, y: 30, duration: 0.8, ease: 'power3.out' }, '-=0.4')
          .from(cardsRef.current?.children ?? [], {
            opacity: 0, y: 50, duration: 0.7, stagger: 0.12, ease: 'power3.out',
          }, '-=0.3')
      },
    })
  }, [])

  return (
    <section ref={sectionRef} className="bg-[#0B1F3A] py-20 lg:py-28 px-5 sm:px-8">
      <div className="max-w-4xl mx-auto text-center">

        {/* Avatar */}
        <div ref={avatarRef} className="relative inline-flex items-center justify-center mb-8">
          {/* Glow ring */}
          <div className="absolute inset-0 rounded-full bg-[#C9A84C]/20 animate-ping" style={{ animationDuration: '2.5s' }} />
          <div className="absolute inset-[-8px] rounded-full border border-[#C9A84C]/20" />
          <div
            className="w-24 h-24 rounded-full overflow-hidden relative z-10"
            style={{
              background: 'radial-gradient(circle at 50% 30%, #dceaf5 0%, #c8dff0 60%, #a8cce8 100%)',
              border: '2px solid rgba(201,168,76,0.55)',
              boxShadow: '0 0 40px rgba(201,168,76,0.25)',
            }}
          >
            <Image
              src="/jade-avatar.jpg"
              alt="Jade — Your AI Travel Advisor"
              fill
              className="object-cover"
              style={{ objectPosition: '50% 8%' }}
              sizes="96px"
            />
          </div>
        </div>

        {/* Headline */}
        <div ref={headlineRef}>
          <p className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-3">
            AI Travel Advisor
          </p>
          <h2 className="font-display text-white font-bold text-[clamp(2.2rem,5vw,3.8rem)] leading-tight mb-4">
            Meet Jade
          </h2>
          <p className="text-white/50 text-lg max-w-md mx-auto mb-12 leading-relaxed">
            Your personal AI travel advisor.
            <br />
            Available 24 hours. 7 days. Every destination.
          </p>
        </div>

        {/* Capabilities */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12"
        >
          {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-white/5 border border-white/10 hover:border-[#C9A84C]/30 rounded-2xl p-5 text-left transition-colors duration-300"
            >
              <div className="w-9 h-9 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center mb-3">
                <Icon className="w-4.5 h-4.5 text-[#C9A84C]" />
              </div>
              <p className="text-white font-semibold text-sm mb-1.5">{title}</p>
              <p className="text-white/40 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="relative inline-flex">
          <span className="absolute inset-0 rounded-full bg-[#C9A84C] animate-ping opacity-30 pointer-events-none" style={{ animationDuration: '2s' }} />
          <JadeChat
            context={{
              source:      'homepage_jade_section',
              pageTitle:   'Jade — AI Travel Assistant',
              enquiryType: 'general_enquiry',
            }}
            label="Chat with Jade Now"
            className="relative shadow-lg shadow-[#C9A84C]/30 hover:scale-105 active:scale-100 px-8 py-4 text-sm"
            variant="primary"
          />
        </div>
      </div>
    </section>
  )
}
