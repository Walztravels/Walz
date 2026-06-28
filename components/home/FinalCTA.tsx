'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { MessageCircle, FileText } from 'lucide-react'

export function FinalCTA() {
  const sectionRef  = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const subRef      = useRef<HTMLParagraphElement>(null)
  const btnsRef     = useRef<HTMLDivElement>(null)

  // Slow gradient shift
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const elSafe = el
    let hue = 0
    let raf: number
    function tick() {
      hue = (hue + 0.04) % 360
      const s = Math.sin((hue * Math.PI) / 180)
      const light = 52 + s * 6
      elSafe.style.setProperty('--cta-gold', `hsl(41, 60%, ${light}%)`)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    ScrollTrigger.create({
      trigger: sectionRef.current,
      start: 'top 80%',
      once: true,
      onEnter() {
        const tl = gsap.timeline()
        tl.from(headlineRef.current, { opacity: 0, y: 40, duration: 1, ease: 'power3.out' })
          .from(subRef.current,      { opacity: 0, y: 30, duration: 0.8, ease: 'power3.out' }, '-=0.5')
          .from(btnsRef.current?.children ?? [], { opacity: 0, y: 20, duration: 0.7, stagger: 0.12, ease: 'power3.out' }, '-=0.4')
      },
    })
  }, [])

  return (
    <section
      ref={sectionRef}
      className="relative py-24 lg:py-36 px-5 sm:px-8 overflow-hidden"
      style={{
        background: 'var(--cta-gold, #C9A84C)',
      }}
    >
      {/* Subtle texture overlay */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #0B1F3A 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative max-w-4xl mx-auto text-center">
        <h2
          ref={headlineRef}
          className="font-display text-[#0B1F3A] font-bold text-[clamp(2.6rem,7vw,5.5rem)] leading-[0.95] mb-6"
        >
          Your Journey Starts Here.
        </h2>

        <p
          ref={subRef}
          className="text-[#0B1F3A]/65 text-lg lg:text-xl mb-6 font-medium"
        >
          Talk to Jade. Get started in minutes.
        </p>

        <div className="flex items-center justify-center gap-1 mb-8">
          {[1,2,3,4,5].map(i => (
            <span key={i} className="text-[#0B1F3A] text-xl">★</span>
          ))}
          <span className="text-[#0B1F3A]/60 text-sm ml-2">Rated 4.9/5 by 500+ clients</span>
        </div>

        <div ref={btnsRef} className="flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap">
          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-8 py-4 bg-[#0B1F3A] hover:bg-[#0d2345] text-white font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100 shadow-lg"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp +447398753797
          </a>
          <Link href="/visa">
            <button className="flex items-center gap-2.5 px-8 py-4 border-2 border-[#0B1F3A]/30 hover:border-[#0B1F3A] text-[#0B1F3A] font-bold text-sm rounded-full transition-all duration-300 hover:scale-105 active:scale-100">
              <FileText className="w-4 h-4" />
              Start Your Application
            </button>
          </Link>
          <a
            href="https://calendly.com/walztravels"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border-2 border-[#0B1F3A] text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-[#C9A84C] font-bold px-6 py-4 rounded-full transition-all text-sm"
          >
            📅 Book a Free Consultation
          </a>
        </div>
      </div>
    </section>
  )
}
