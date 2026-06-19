'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

const PROPOSITIONS = [
  {
    number: '01',
    title: 'Real Travel Expertise',
    body: "Our team has first-hand experience of the destinations we sell. Every recommendation comes from genuine knowledge — not just a catalogue.",
    image: 'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=900&q=80',
    alt: 'Travel expert planning a journey',
    imageLeft: true,
  },
  {
    number: '02',
    title: 'Sabre GDS — Best Available Fares',
    body: "Direct access to the world's leading Global Distribution System, giving you real-time inventory across 400+ airlines and the lowest available fares.",
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80',
    alt: 'Aerial view of aircraft',
    imageLeft: false,
  },
  {
    number: '03',
    title: 'Visa Specialists — 90%+ Approval',
    body: "Our visa team prepares every document, coaches clients on interviews and follows up with embassies. The result: a 90%+ approval rate across all markets.",
    image: 'https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?w=900&q=80',
    alt: 'Travel passport with visa stamps — Walz Travels visa specialists',
    imageLeft: true,
  },
  {
    number: '04',
    title: '24/7 WhatsApp Support',
    body: "Boarding in Bangkok at 3am? We're on WhatsApp. Our team is available around the clock — not a chatbot, a real person who knows your booking.",
    image: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900&q=80',
    alt: 'WhatsApp chat support — Walz Travels 24/7 assistance',
    imageLeft: false,
  },
]

function WhyItem({
  item,
}: {
  item: typeof PROPOSITIONS[0]
}) {
  const rowRef   = useRef<HTMLDivElement>(null)
  const imgRef   = useRef<HTMLDivElement>(null)
  const textRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!rowRef.current) return

    // Image clip reveal
    gsap.fromTo(
      imgRef.current,
      { clipPath: 'inset(0 100% 0 0)' },
      {
        clipPath: 'inset(0 0% 0 0)',
        duration: 1.4,
        ease: 'power3.out',
        scrollTrigger: { trigger: rowRef.current, start: 'top 78%', once: true },
      },
    )

    // Text slide in
    gsap.from(textRef.current, {
      opacity: 0,
      x: item.imageLeft ? 40 : -40,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: rowRef.current, start: 'top 78%', once: true },
    })
  }, [item.imageLeft])

  return (
    <div
      ref={rowRef}
      className={`flex flex-col ${item.imageLeft ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-6 lg:gap-16 items-center`}
      style={{ minHeight: '60vh', padding: '5vh 0' }}
    >
      {/* Image */}
      <div
        ref={imgRef}
        className="relative w-full lg:w-1/2 rounded-2xl overflow-hidden flex-shrink-0"
        style={{ clipPath: 'inset(0 100% 0 0)', height: 'clamp(300px,45vh,520px)' }}
      >
        <Image
          src={item.image}
          alt={item.alt}
          fill
          className="object-cover object-center"
          sizes="(max-width: 1024px) 100vw, 50vw"
        />
      </div>

      {/* Text */}
      <div ref={textRef} className="w-full lg:w-1/2 px-1">
        <span className="text-[#C9A84C] font-bold text-[clamp(3rem,6vw,5rem)] font-display leading-none opacity-20 block mb-4 select-none">
          {item.number}
        </span>
        <div className="w-10 h-0.5 bg-[#C9A84C] mb-5" />
        <h3 className="font-display text-[#0B1F3A] font-bold text-[clamp(1.6rem,3vw,2.5rem)] leading-tight mb-4">
          {item.title}
        </h3>
        <p className="text-[#0B1F3A]/55 text-base lg:text-lg leading-relaxed max-w-md">
          {item.body}
        </p>
      </div>
    </div>
  )
}

export function WhyWalzSection() {
  return (
    <section className="bg-[#F5F2EE] py-16 lg:py-24 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-16 lg:mb-20">
          <p className="text-[#C9A84C] text-[11px] font-medium tracking-[0.22em] uppercase mb-3">
            Why Choose Us
          </p>
          <h2 className="font-display text-[#0B1F3A] font-bold text-[clamp(2rem,4vw,3.2rem)] leading-tight max-w-lg">
            Walz Travels Difference
          </h2>
        </div>

        {/* Alternating rows */}
        <div className="space-y-0 divide-y divide-[#0B1F3A]/8">
          {PROPOSITIONS.map((item) => (
            <WhyItem key={item.number} item={item} />
          ))}
        </div>

      </div>
    </section>
  )
}
