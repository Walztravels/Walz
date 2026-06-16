'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { SearchTabs } from '@/components/search/SearchTabs'
import { ArrowRight, MessageCircle, Search } from 'lucide-react'
import { JadeChatButton } from '@/components/ui/JadeChatButton'

export function HeroSection({ bgUrl }: { bgUrl?: string | null }) {
  const heroBg     = bgUrl || 'https://us.chat-img.sintra.ai/aeb90658-6cce-491a-8a0f-bfc14a8cdc69/c760de26-34bd-4aac-af9b-cbd82eb4b938/image.png'
  const sectionRef = useRef<HTMLElement>(null)
  const bgRef      = useRef<HTMLDivElement>(null)
  const eyebrowRef = useRef<HTMLParagraphElement>(null)
  const line1Ref   = useRef<HTMLSpanElement>(null)
  const line2Ref   = useRef<HTMLSpanElement>(null)
  const line3Ref   = useRef<HTMLSpanElement>(null)
  const subRef     = useRef<HTMLParagraphElement>(null)
  const ctaRef     = useRef<HTMLDivElement>(null)
  const searchRef  = useRef<HTMLDivElement>(null)
  const [searchExpanded, setSearchExpanded] = useState(false)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      // Skip animation but make everything visible immediately
      if (eyebrowRef.current)  eyebrowRef.current.style.opacity  = '1'
      if (line1Ref.current)    { line1Ref.current.style.opacity = '1'; line1Ref.current.style.transform = 'none' }
      if (line2Ref.current)    { line2Ref.current.style.opacity = '1'; line2Ref.current.style.transform = 'none' }
      if (line3Ref.current)    { line3Ref.current.style.opacity = '1'; line3Ref.current.style.transform = 'none' }
      if (subRef.current)      subRef.current.style.opacity      = '1'
      if (ctaRef.current)      ctaRef.current.style.opacity      = '1'
      if (searchRef.current)   searchRef.current.style.opacity   = '1'
      return
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

    tl.from(eyebrowRef.current, { opacity: 0, y: 20, duration: 0.8 }, 0.4)
    tl.from(
      [line1Ref.current, line2Ref.current, line3Ref.current],
      { yPercent: 110, opacity: 0, duration: 1.2, stagger: 0.15 },
      0.9,
    )
    tl.from(subRef.current,  { opacity: 0, y: 30, duration: 0.8 }, 1.7)
    tl.from(ctaRef.current,  { opacity: 0, y: 24, duration: 0.7 }, 2.1)
    tl.from(searchRef.current, { opacity: 0, y: 30, duration: 0.8 }, 2.3)

    // Parallax background — desktop only
    if (window.innerWidth >= 768 && bgRef.current) {
      gsap.to(bgRef.current, {
        yPercent: 30,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end:   'bottom top',
          scrub: true,
        },
      })
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      // No overflow-hidden on the section itself — lets search widget bleed below
      className="relative min-h-[70vh] md:min-h-[80vh] lg:h-screen lg:min-h-[640px] flex flex-col items-center justify-center bg-[#0B1F3A]"
    >
      {/* Background — overflow-hidden on inner wrapper clips parallax image */}
      <div className="absolute inset-0 overflow-hidden">
        <div ref={bgRef} className="absolute inset-0 will-change-transform scale-110">
          <Image
            src={heroBg}
            alt="Luxury travel aerial view"
            fill
            priority
            fetchPriority="high"
            className="object-cover object-center"
            sizes="100vw"
            quality={75}
            data-cursor="EXPLORE"
          />
        </div>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/75 via-[#0B1F3A]/45 to-[#0B1F3A]/92" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/50 via-transparent to-[#0B1F3A]/20" />

      {/* Headline + CTAs — centered, padded bottom to clear the pinned search widget */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 flex flex-col items-center text-center pt-16 lg:pt-20 pb-32 lg:pb-52">

        {/* Eyebrow */}
        <p
          ref={eyebrowRef}
          className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-7"
          style={{ opacity: 0 }}
        >
          Your Trusted Global Travel Partner
        </p>

        {/* Headline — clip-path reveal per line */}
        <h1 className="font-display font-bold text-white leading-[0.92] mb-7 select-none">
          {(
            [
              { ref: line1Ref, text: 'The World' },
              { ref: line2Ref, text: 'Is Waiting' },
              { ref: line3Ref, text: 'For You.' },
            ] as { ref: React.RefObject<HTMLSpanElement>; text: string }[]
          ).map(({ ref, text }, i, arr) => (
            <span key={text} className="block overflow-hidden">
              <span
                ref={ref}
                className="block text-[clamp(2.8rem,8.5vw,6.8rem)]"
                style={{ transform: 'translateY(110%)', opacity: 0 }}
              >
                {text}{i < arr.length - 1 ? ' ' : ''}
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
          className="flex flex-col sm:flex-row items-center gap-3"
          style={{ opacity: 0 }}
        >
          <Link href="/plan/new">
            <button className="group flex items-center gap-2.5 px-8 py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg shadow-[#C9A84C]/25 whitespace-nowrap">
              Start Your Journey
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
          <JadeChatButton
            service="General"
            page="/"
            className="flex items-center gap-2.5 px-8 py-3.5 border border-white/25 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-semibold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 whitespace-nowrap backdrop-blur-sm"
          />
        </div>
      </div>

      {/* Search widget — pinned to bottom, translate-y-1/2 overlaps into next section */}
      <div
        ref={searchRef}
        className="absolute bottom-0 left-0 right-0 z-20 translate-y-1/2 px-4 sm:px-6 lg:px-8"
        style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
      >
        <div className="max-w-5xl mx-auto drop-shadow-2xl">
          {/* Mobile: single collapsed tap-to-search bar */}
          {!searchExpanded && (
            <div
              className="lg:hidden flex items-center gap-3 bg-[#0B1F3A] border border-white/15 rounded-2xl px-4 py-3.5 cursor-pointer shadow-luxury"
              onClick={() => setSearchExpanded(true)}
            >
              <Search className="w-5 h-5 text-[#C9A84C] flex-shrink-0" />
              <span className="text-white/70 text-sm">Where do you want to go?</span>
              <span className="ml-auto text-[#C9A84C] text-sm font-semibold whitespace-nowrap">Search →</span>
            </div>
          )}

          {/* Full form — always on desktop, shown on mobile after tap */}
          <div className={searchExpanded ? 'block' : 'hidden lg:block'}>
            <SearchTabs />
            <button
              className="lg:hidden mt-2 text-white/50 text-sm w-full text-center py-2 hover:text-white/80 transition-colors"
              onClick={() => setSearchExpanded(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
