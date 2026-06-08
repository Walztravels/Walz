'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { SearchTabs } from '@/components/search/SearchTabs'
import { ArrowRight, MessageCircle } from 'lucide-react'

export function HeroSection() {
  const sectionRef  = useRef<HTMLElement>(null)
  const bgRef       = useRef<HTMLDivElement>(null)
  const eyebrowRef  = useRef<HTMLParagraphElement>(null)
  const line1Ref    = useRef<HTMLSpanElement>(null)
  const line2Ref    = useRef<HTMLSpanElement>(null)
  const line3Ref    = useRef<HTMLSpanElement>(null)
  const subRef      = useRef<HTMLParagraphElement>(null)
  const ctaRef      = useRef<HTMLDivElement>(null)
  const scrollRef   = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

    // Eyebrow
    tl.from(eyebrowRef.current, { opacity: 0, y: 20, duration: 0.8 }, 0.4)

    // Headline lines — clip-path reveal from bottom
    tl.from(
      [line1Ref.current, line2Ref.current, line3Ref.current],
      { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.15 },
      0.9,
    )

    // Subheadline
    tl.from(subRef.current, { opacity: 0, y: 30, duration: 0.8 }, 1.7)

    // CTA buttons
    tl.from(ctaRef.current, { opacity: 0, y: 24, duration: 0.7 }, 2.1)

    // Search tabs
    tl.from(searchRef.current, { opacity: 0, y: 30, duration: 0.8 }, 2.3)

    // Parallax background — desktop only
    if (window.innerWidth >= 768 && bgRef.current) {
      gsap.to(bgRef.current, {
        yPercent: 30,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      })
    }

    // Scroll indicator pulse
    const scrollEl = scrollRef.current
    if (scrollEl) {
      gsap.to(scrollEl, {
        opacity: 0.3,
        yoyo: true,
        repeat: -1,
        duration: 1.4,
        ease: 'power1.inOut',
      })
    }

    const handleScroll = () => {
      if (window.scrollY > 80) setScrolled(true)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative h-screen min-h-[640px] flex flex-col items-center justify-center overflow-hidden bg-[#0B1F3A]"
    >
      {/* ── Background with parallax ─────────────────────────────────── */}
      <div ref={bgRef} className="absolute inset-0 will-change-transform scale-110">
        <Image
          src="https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=2000&q=85"
          alt="Luxury travel aerial view"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
          data-cursor="EXPLORE"
        />
      </div>

      {/* ── Gradient overlays ────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/75 via-[#0B1F3A]/45 to-[#0B1F3A]/92" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/50 via-transparent to-[#0B1F3A]/20" />

      {/* ── Hero content ─────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 flex flex-col items-center text-center pt-16 lg:pt-20">

        {/* Eyebrow */}
        <p
          ref={eyebrowRef}
          className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-7"
          style={{ opacity: 0 }}
        >
          Your Trusted Global Travel Partner
        </p>

        {/* Headline — each line in clip overflow wrapper */}
        <h1 className="font-display font-bold text-white leading-[0.92] mb-7 select-none">
          {(
            [
              { ref: line1Ref, text: 'The World' },
              { ref: line2Ref, text: 'Is Waiting' },
              { ref: line3Ref, text: 'For You.' },
            ] as { ref: React.RefObject<HTMLSpanElement>; text: string }[]
          ).map(({ ref, text }) => (
            <span key={text} className="block overflow-hidden">
              <span
                ref={ref}
                className="block text-[clamp(2.8rem,8.5vw,6.8rem)]"
                style={{ transform: 'translateY(110%)', opacity: 0 }}
              >
                {text}
              </span>
            </span>
          ))}
        </h1>

        {/* Subheadline */}
        <p
          ref={subRef}
          className="text-white/60 text-base sm:text-lg lg:text-xl max-w-lg leading-relaxed mb-9"
          style={{ opacity: 0 }}
        >
          Flights. Visas. Hotels. Tours.
          <br className="hidden sm:block" />
          All handled by experts who get it right.
        </p>

        {/* CTA buttons */}
        <div
          ref={ctaRef}
          className="flex flex-col sm:flex-row items-center gap-3 mb-10"
          style={{ opacity: 0 }}
        >
          <Link href="/book">
            <button className="group flex items-center gap-2.5 px-8 py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg shadow-[#C9A84C]/25 whitespace-nowrap">
              Start Your Journey
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-8 py-3.5 border border-white/25 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-semibold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 whitespace-nowrap backdrop-blur-sm"
          >
            <MessageCircle className="w-4 h-4" />
            Chat with Jade
          </a>
        </div>

        {/* Search widget */}
        <div ref={searchRef} className="w-full" style={{ opacity: 0 }}>
          <SearchTabs />
        </div>
      </div>

      {/* ── Scroll indicator ─────────────────────────────────────────── */}
      {!scrolled && (
        <div
          ref={scrollRef}
          className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
        >
          <span className="text-white/40 text-[9px] tracking-[0.25em] uppercase font-medium">
            Scroll to explore
          </span>
          <div className="w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      )}
    </section>
  )
}
