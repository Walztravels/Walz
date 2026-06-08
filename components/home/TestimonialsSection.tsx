'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { Star } from 'lucide-react'

const TESTIMONIALS = [
  {
    name: 'Amara Osei',
    location: 'London, UK',
    trip: 'Dubai Honeymoon',
    rating: 5,
    text: "Walz Travels made our Dubai honeymoon absolutely perfect. From the business class flights to the Burj Al Arab stay, every detail was flawless. The WhatsApp support was incredible — they were available even at 2am when I had a question.",
    initials: 'AO',
  },
  {
    name: 'Patrick Brennan',
    location: 'Dublin, Ireland',
    trip: 'Dublin Private Tour',
    rating: 5,
    text: "Booked the private Dublin tour for my parents' anniversary and they were blown away. The guide was so knowledgeable and the whole day was seamlessly organised. Already planning to use Walz Travels for our New York trip.",
    initials: 'PB',
  },
  {
    name: 'Priya Sharma',
    location: 'Manchester, UK',
    trip: 'US Visa Assistance',
    rating: 5,
    text: "Getting a US visa seemed impossible until Walz Travels stepped in. They guided us through every single document, followed up with the embassy, and we had our visas within 3 weeks. Worth every penny.",
    initials: 'PS',
  },
  {
    name: 'Kwame A.',
    location: 'Accra',
    trip: 'Canada Visitor Visa',
    rating: 5,
    text: "Canada visa approved first attempt. The document checklist was perfect — not a single thing missing. I had tried twice before with other agents and failed. Walz Travels made the whole process simple and straightforward.",
    initials: 'KA',
  },
  {
    name: 'Blessing O.',
    location: 'London',
    trip: 'UAE Business Travel',
    rating: 5,
    text: "Dubai business trip sorted in 48 hours. Visa, flights and hotel all handled without me having to chase anyone. Everything was confirmed and ready to go before I even had time to worry. Exceptional service.",
    initials: 'BO',
  },
]

export function TestimonialsSection() {
  const [active, setActive] = useState(0)
  const sectionRef = useRef<HTMLDivElement>(null)
  const quoteRef   = useRef<HTMLDivElement>(null)
  const textRef    = useRef<HTMLParagraphElement>(null)
  const authorRef  = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  // Auto-advance
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setActive(a => (a + 1) % TESTIMONIALS.length)
    }, 5500)
    return () => clearInterval(intervalRef.current)
  }, [])

  // Animate on scroll enter
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    ScrollTrigger.create({
      trigger: sectionRef.current,
      start: 'top 75%',
      once: true,
      onEnter() {
        const tl = gsap.timeline()
        tl.from(quoteRef.current,  { scale: 0.7, opacity: 0, duration: 0.8, ease: 'back.out(1.4)' })
          .from(textRef.current,   { opacity: 0, x: 40, duration: 0.8, ease: 'power3.out' }, '-=0.4')
          .from(authorRef.current, { opacity: 0, y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.3')
      },
    })
  }, [])

  // Fade on tab change
  useEffect(() => {
    if (!textRef.current || !authorRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.fromTo(
      [textRef.current, authorRef.current],
      { opacity: 0, x: 20 },
      { opacity: 1, x: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out' },
    )
  }, [active])

  const t = TESTIMONIALS[active]

  return (
    <section ref={sectionRef} className="bg-[#0B1F3A] py-20 lg:py-28 px-5 sm:px-8">
      <div className="max-w-4xl mx-auto text-center">

        {/* Large decorative quote */}
        <div
          ref={quoteRef}
          className="font-display text-[#C9A84C]/20 text-[10rem] leading-none select-none mb-[-2rem]"
          aria-hidden
        >
          "
        </div>

        {/* Testimonial text */}
        <p
          ref={textRef}
          className="text-white/80 text-xl sm:text-2xl lg:text-[1.7rem] leading-relaxed font-light max-w-3xl mx-auto mb-8"
        >
          {t.text}
        </p>

        {/* Author */}
        <div ref={authorRef} className="flex flex-col items-center gap-3">
          {/* Stars */}
          <div className="flex gap-1">
            {Array.from({ length: t.rating }).map((_, i) => (
              <Star key={i} className="w-4 h-4 text-[#C9A84C] fill-[#C9A84C]" />
            ))}
          </div>

          {/* Name + avatar */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/30 flex items-center justify-center">
              <span className="text-[#C9A84C] text-xs font-bold">{t.initials}</span>
            </div>
            <div className="text-left">
              <p className="text-white font-semibold text-sm">{t.name}</p>
              <p className="text-white/40 text-xs">{t.location} · {t.trip}</p>
            </div>
          </div>
        </div>

        {/* Dot navigation */}
        <div className="flex items-center justify-center gap-2.5 mt-10">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setActive(i)
                clearInterval(intervalRef.current)
              }}
              className={`rounded-full transition-all duration-300 ${
                i === active
                  ? 'w-6 h-2 bg-[#C9A84C]'
                  : 'w-2 h-2 bg-white/20 hover:bg-white/40'
              }`}
              aria-label={`Testimonial ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
