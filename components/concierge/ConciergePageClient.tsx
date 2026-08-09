'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { BUSINESS, waLink } from '@/lib/config/business'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import type { CategoryImagery } from '@/lib/concierge/imagery'
import { CategoryTile } from './CategoryTile'

interface CategoryData {
  slug:        string
  name:        string
  description: string
}

interface ConciergePageClientProps {
  categories:      CategoryData[]
  heroImagery:     CategoryImagery
  allImagery:      Record<string, CategoryImagery>
}

const HOW_IT_WORKS = [
  {
    title: 'Tell Jade',
    body:  'Chat with Jade — our AI travel specialist. Describe what you need in plain language.',
  },
  {
    title: 'We arrange it',
    body:  'Your personal concierge specialist takes over. You get a tailored proposal within hours.',
  },
  {
    title: 'Enjoy',
    body:  'Everything is handled — from confirmation to on-the-day support. You just show up.',
  },
]

export function ConciergePageClient({
  categories,
  heroImagery,
  allImagery,
}: ConciergePageClientProps) {
  // Convert plain object back to Map for lookup
  const imageryMap = new Map<string, CategoryImagery>(Object.entries(allImagery))
  const heroRef    = useRef<HTMLElement>(null)
  const bgRef      = useRef<HTMLDivElement>(null)
  const eyebrowRef = useRef<HTMLParagraphElement>(null)
  const h1Ref      = useRef<HTMLHeadingElement>(null)
  const paraRef    = useRef<HTMLParagraphElement>(null)
  const ctaRef     = useRef<HTMLDivElement>(null)
  const tilesRef   = useRef<HTMLDivElement>(null)
  const stepsRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const heroEls = [eyebrowRef.current, h1Ref.current, paraRef.current, ctaRef.current]
    const tiles   = tilesRef.current   ? Array.from(tilesRef.current.children)   : []
    const steps   = stepsRef.current   ? Array.from(stepsRef.current.children)   : []

    function showAll() {
      heroEls.forEach(el => {
        if (el) { el.style.opacity = '1'; el.style.transform = 'none' }
      })
      tiles.forEach(el => {
        (el as HTMLElement).style.opacity = '1';
        (el as HTMLElement).style.transform = 'none'
      })
      steps.forEach(el => {
        (el as HTMLElement).style.opacity = '1';
        (el as HTMLElement).style.transform = 'none'
      })
    }

    const fallbackTimer = setTimeout(showAll, 800)

    try {
      gsap.registerPlugin(ScrollTrigger)

      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (prefersReduced) {
        clearTimeout(fallbackTimer)
        showAll()
        return
      }

      // ── Hero animations ─────────────────────────────────────────────────────
      gsap.set(heroEls, { opacity: 0, y: 20 })
      clearTimeout(fallbackTimer)

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.to(eyebrowRef.current, { opacity: 1, y: 0, duration: 0.8 }, 0.1)
      tl.to(h1Ref.current,      { opacity: 1, y: 0, duration: 0.9 }, 0.25)
      tl.to(paraRef.current,    { opacity: 1, y: 0, duration: 0.8 }, 0.45)
      tl.to(ctaRef.current,     { opacity: 1, y: 0, duration: 0.7 }, 0.65)

      // Parallax on the hero background
      if (window.innerWidth >= 768 && bgRef.current) {
        gsap.to(bgRef.current, {
          yPercent: 25,
          ease: 'none',
          scrollTrigger: {
            trigger: heroRef.current,
            start:   'top top',
            end:     'bottom top',
            scrub:   true,
          },
        })
      }

      // ── Tile animations ─────────────────────────────────────────────────────
      if (tiles.length > 0) {
        gsap.set(tiles, { opacity: 0, y: 32 })
        gsap.to(tiles, {
          opacity: 1,
          y:       0,
          duration: 0.7,
          stagger:  0.08,
          ease:     'power3.out',
          scrollTrigger: {
            trigger: tilesRef.current,
            start:   'top 82%',
            once:    true,
          },
        })
      }

      // ── How it works animations ─────────────────────────────────────────────
      if (steps.length > 0) {
        gsap.set(steps, { opacity: 0, y: 32 })
        gsap.to(steps, {
          opacity: 1,
          y:       0,
          duration: 0.7,
          stagger:  0.12,
          ease:     'power3.out',
          scrollTrigger: {
            trigger: stepsRef.current,
            start:   'top 82%',
            once:    true,
          },
        })
      }
    } catch (err) {
      console.error('[ConciergePageClient] GSAP error:', err)
      clearTimeout(fallbackTimer)
      showAll()
    }

    return () => clearTimeout(fallbackTimer)
  }, [])

  // Open Jade handler — keeps the button a real button, no inline script
  function handleJadeOpen() {
    window.dispatchEvent(
      new CustomEvent('jade:open', {
        detail: { prefill: 'I am interested in Walz Concierge services' },
      }),
    )
  }

  return (
    <main className="min-h-screen bg-[#0B1F3A]">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Background image */}
        <div className="absolute inset-0 overflow-hidden">
          <div ref={bgRef} className="absolute inset-0 will-change-transform scale-110">
            <Image
              src={heroImagery.hero}
              alt={heroImagery.alt}
              fill
              priority
              fetchPriority="high"
              sizes="100vw"
              className="object-cover"
              style={{ objectPosition: heroImagery.position }}
            />
          </div>
        </div>

        {/* Gradient overlays */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/80 via-[#0B1F3A]/50 to-[#0B1F3A]/90"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(201,168,76,0.12) 0%, transparent 65%)',
          }}
        />

        {/* Hero content */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 text-center pt-24 pb-24">
          <p
            ref={eyebrowRef}
            className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-5"
          >
            Walz Concierge
          </p>

          <h1
            ref={h1Ref}
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white
              leading-tight max-w-3xl mx-auto mb-6"
            style={{ textWrap: 'balance' } as React.CSSProperties}
          >
            Travel the way it
            <br />
            <span className="text-[#C9A84C]">was meant to be.</span>
          </h1>

          <p
            ref={paraRef}
            className="text-white/60 text-lg max-w-xl mx-auto mb-10 leading-relaxed"
          >
            Every Walz Concierge request receives personal attention.
            Tell Jade what you need, and our concierge specialists will handle the details from start to finish.
          </p>

          <div ref={ctaRef}>
            <button
              onClick={handleJadeOpen}
              className="inline-block bg-[#C9A84C] text-[#0B1F3A] font-bold px-8 py-3.5
                rounded-full hover:bg-[#d4b86e] transition-colors text-sm tracking-wide cursor-pointer"
            >
              Talk to Jade →
            </button>
          </div>
        </div>
      </section>

      {/* ── Services grid ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <p className="text-white/40 text-xs uppercase tracking-[0.2em] font-semibold text-center mb-10">
          Our Services
        </p>

        <div
          ref={tilesRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {categories.map((cat, i) => (
            <div key={cat.slug}>
              <CategoryTile
                slug={cat.slug}
                name={cat.name}
                description={
                  cat.description ||
                  'Bespoke service, arranged by your personal concierge specialist.'
                }
                imagery={imageryMap.get(cat.slug) ?? null}
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────────── */}
      <section
        className="border-t border-white/5 px-6 py-16"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.25em] mb-12">
            How it works
          </p>
          <div ref={stepsRef} className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.title} className="text-center">
                <p
                  className="font-display font-bold text-[#C9A84C]/30 mb-3"
                  style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', lineHeight: 1 }}
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="text-white font-bold text-base mb-2">{item.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 text-center">
        <p className="text-white/60 text-sm mb-6 max-w-sm mx-auto">
          Have something in mind that&apos;s not listed? We handle anything. Just ask.
        </p>
        <a
          href={waLink(BUSINESS.contacts.globalWhatsapp.e164, "Hi, I'm interested in Walz Concierge")}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block border border-[#C9A84C]/50 text-[#C9A84C] font-semibold px-6 py-3
            rounded-full hover:bg-[#C9A84C]/10 transition-colors text-sm"
        >
          WhatsApp our concierge team
        </a>
      </section>
    </main>
  )
}
