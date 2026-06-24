'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'
import { JadeChatButton } from '@/components/ui/JadeChatButton'

const FALLBACK_BG = 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=1920&q=80'

export function HeroSection({ bgUrl }: { bgUrl?: string | null }) {
  const heroBg = bgUrl || FALLBACK_BG

  const [content, setContent] = useState({
    eyebrow: 'UK · Canada · Schengen · UAE · USA Visas',
    line1:   'Your Visa.',
    line2:   'Your Journey.',
    line3:   'Handled.',
    sub:     'Expert visa processing from £120.\nUK, Canada, Schengen, UAE & more.',
  })

  useEffect(() => {
    fetch('/api/public/content')
      .then(r => r.json())
      .then(data => {
        if (data.home_hero_eyebrow) {
          setContent(c => ({
            eyebrow: data.home_hero_eyebrow ?? c.eyebrow,
            line1:   data.home_hero_line1   ?? c.line1,
            line2:   data.home_hero_line2   ?? c.line2,
            line3:   data.home_hero_line3   ?? c.line3,
            sub:     data.home_hero_sub     ?? c.sub,
          }))
        }
      })
      .catch(() => {})
  }, [])

  const sectionRef = useRef<HTMLElement>(null)
  const bgRef      = useRef<HTMLDivElement>(null)
  const eyebrowRef = useRef<HTMLParagraphElement>(null)
  const line1Ref   = useRef<HTMLSpanElement>(null)
  const line2Ref   = useRef<HTMLSpanElement>(null)
  const line3Ref   = useRef<HTMLSpanElement>(null)
  const subRef     = useRef<HTMLParagraphElement>(null)
  const ctaRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const textRefs = [eyebrowRef, line1Ref, line2Ref, line3Ref, subRef, ctaRef]

    function showAll() {
      textRefs.forEach(ref => {
        if (ref.current) {
          ref.current.style.opacity   = '1'
          ref.current.style.transform = 'none'
        }
      })
    }

    // Safety net: if GSAP hasn't shown content within 800 ms, reveal everything
    const fallbackTimer = setTimeout(showAll, 800)

    try {
      gsap.registerPlugin(ScrollTrigger)

      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced) {
        clearTimeout(fallbackTimer)
        showAll()
        return
      }

      // Hide elements immediately so GSAP controls the reveal
      gsap.set(eyebrowRef.current,  { opacity: 0, y: 20 })
      gsap.set(
        [line1Ref.current, line2Ref.current, line3Ref.current],
        { yPercent: 110, opacity: 0 },
      )
      gsap.set(subRef.current,    { opacity: 0, y: 30 })
      gsap.set(ctaRef.current,    { opacity: 0, y: 24 })

      // GSAP is running — cancel the fallback
      clearTimeout(fallbackTimer)

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

      tl.to(eyebrowRef.current,  { opacity: 1, y: 0, duration: 0.8 }, 0.1)
      tl.to(
        [line1Ref.current, line2Ref.current, line3Ref.current],
        { yPercent: 0, opacity: 1, duration: 1.2, stagger: 0.15 },
        0.3,
      )
      tl.to(subRef.current,      { opacity: 1, y: 0, duration: 0.8 }, 0.8)
      tl.to(ctaRef.current,      { opacity: 1, y: 0, duration: 0.7 }, 1.0)

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
    } catch (err) {
      console.error('[Hero] GSAP error:', err)
      clearTimeout(fallbackTimer)
      showAll()
    }

    return () => clearTimeout(fallbackTimer)
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[70vh] md:min-h-[80vh] lg:h-screen lg:min-h-[640px] flex flex-col items-center justify-center bg-[#0B1F3A]"
    >
      {/* Background */}
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
          />
        </div>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/75 via-[#0B1F3A]/45 to-[#0B1F3A]/92" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/50 via-transparent to-[#0B1F3A]/20" />

      {/* Headline + CTAs */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 flex flex-col items-center text-center pt-16 lg:pt-20 pb-32 lg:pb-52">

        {/* Eyebrow — no inline opacity:0; GSAP sets initial state */}
        <p
          ref={eyebrowRef}
          className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-7"
        >
          {content.eyebrow}
        </p>

        {/* Headline */}
        <h1 className="font-display font-bold text-white leading-[0.92] mb-7 select-none">
          {(
            [
              { ref: line1Ref, text: content.line1 },
              { ref: line2Ref, text: content.line2 },
              { ref: line3Ref, text: content.line3 },
            ] as { ref: React.RefObject<HTMLSpanElement>; text: string }[]
          ).map(({ ref, text }, i, arr) => (
            <span key={text} className="block overflow-hidden">
              <span
                ref={ref}
                className="block text-[clamp(2.8rem,8.5vw,6.8rem)]"
              >
                {text}{i < arr.length - 1 ? ' ' : ''}
              </span>
            </span>
          ))}
        </h1>

        {/* Subheadline */}
        <p
          ref={subRef}
          className="text-white/80 text-base sm:text-lg lg:text-xl max-w-lg leading-relaxed mb-9"
        >
          {content.sub.split('\n').map((line, i) => (
            <span key={i}>{line}{i < content.sub.split('\n').length - 1 && <br className="hidden sm:block" />}</span>
          ))}
        </p>

        {/* CTA buttons */}
        <div
          ref={ctaRef}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          <Link href="/visa">
            <button className="group flex items-center gap-2.5 px-8 py-3.5 bg-[#C9A84C] hover:bg-[#d4b05a] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg shadow-[#C9A84C]/25 whitespace-nowrap">
              Apply for Visa
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
          <JadeChatButton
            service="General"
            page="/"
            className="flex items-center gap-2.5 px-8 py-3.5 border border-white/25 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-semibold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 whitespace-nowrap backdrop-blur-sm"
          />
        </div>
        <p className="text-white/65 text-xs mt-4">
          90%+ approval rate · No hidden fees · Results in 3–8 weeks
        </p>
      </div>

    </section>
  )
}
