'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { ArrowRight } from 'lucide-react'

const OFFERS = [
  {
    title: 'United Kingdom',
    category: 'VISA + FLIGHTS + HOTEL',
    price: 'From USD $750',
    href: '/packages/london',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1200&q=80',
    alt: 'London skyline with Tower Bridge',
  },
  {
    title: 'Canada',
    category: 'VISA + FLIGHTS + HOTEL',
    price: 'From USD $550',
    href: '/packages/toronto',
    image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1200&q=80',
    alt: 'Niagara Falls dramatic aerial view',
  },
  {
    title: 'United Arab Emirates',
    category: 'VISA + FLIGHTS + HOTEL',
    price: 'From USD $900',
    href: '/packages/dubai',
    image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200&q=80',
    alt: 'Dubai skyline at dusk',
  },
]

export function OffersSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const cardRefs   = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    cardRefs.current.forEach((card, i) => {
      if (!card) return
      gsap.from(card, {
        opacity: 0,
        y: 80,
        duration: 1.1,
        delay: i * 0.15,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 88%',
          once: true,
        },
      })
    })
  }, [])

  return (
    <section ref={sectionRef} className="bg-[#0B1F3A] py-20 lg:py-28 px-5 sm:px-8">
      {/* Section header */}
      <div className="max-w-6xl mx-auto mb-14">
        <p className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-3">
          Featured Packages
        </p>
        <h2 className="font-display text-white font-bold text-[clamp(2rem,4vw,3.2rem)] leading-tight">
          Handpicked Destinations
        </h2>
      </div>

      {/* Cards grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        {OFFERS.map((offer, i) => (
          <div
            key={offer.title}
            ref={el => { cardRefs.current[i] = el }}
            className="group relative rounded-2xl overflow-hidden"
            style={{ height: 'clamp(420px, 60vh, 640px)' }}
          >
            {/* Background image */}
            <Image
              src={offer.image}
              alt={offer.alt}
              fill
              className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 33vw"
              data-cursor="EXPLORE"
            />

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/30 to-transparent group-hover:from-[#0B1F3A]/70 transition-all duration-500" />

            {/* Text content — bottom left */}
            <div className="absolute bottom-0 left-0 right-0 p-7">
              <p className="text-[#C9A84C] text-[10px] font-semibold tracking-[0.2em] uppercase mb-2">
                {offer.category}
              </p>
              <h3 className="font-display text-white font-bold text-2xl lg:text-3xl mb-1.5 leading-tight">
                {offer.title}
              </h3>
              <p className="text-white/60 text-sm mb-5">{offer.price}</p>

              <Link href={offer.href}>
                <button className="group/btn flex items-center gap-2 text-sm font-semibold text-white border border-white/30 hover:border-[#C9A84C] hover:text-[#C9A84C] px-5 py-2.5 rounded-full transition-all duration-300">
                  Explore Package
                  <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
