'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import {
  Plane, Building2, Leaf, Globe, CheckCircle, MessageCircle,
  ArrowRight, ChevronDown, MapPin, ShieldCheck, Briefcase,
  Users, Shield, Landmark, Clock,
} from 'lucide-react'
import TrustBox from '@/components/trustpilot/TrustBox'

gsap.registerPlugin(ScrollTrigger)

// ── Static data ───────────────────────────────────────────────────────────────

const HERO_IMAGES = [
  { src: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1920&q=80', label: 'Dubai' },
  { src: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=1920&q=80', label: 'London' },
  { src: 'https://images.unsplash.com/photo-1502786129293-79981df4e689?w=1920&q=80', label: 'Niagara Falls' },
  { src: 'https://images.unsplash.com/photo-1617369120004-4042a6d41e0b?w=1920&q=80', label: 'Lagos' },
  { src: 'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=1920&q=80', label: 'Toronto' },
]

const SUBNAV_ITEMS = [
  { label: 'Our Story',    id: 'story'    },
  { label: 'Our Journey',  id: 'journey'  },
  { label: 'Services',     id: 'services' },
  { label: 'Markets',      id: 'markets'  },
  { label: 'Contact',      id: 'cta-final' },
]

const QUOTE_WORDS = 'We exist to make international travel accessible, seamless and premium for every client — wherever they are in the world.'.split(' ')

interface TimelineItem { id: string; icon: string; title: string; description: string; order: number }

const TIMELINE_FALLBACK: TimelineItem[] = [
  { id: '1', icon: 'plane',    title: 'Where It Began',     order: 0, description: 'Walz Travels launched as a boutique travel consultancy in Dubai — serving the African diaspora in the UAE and building a reputation for expert visa processing and travel support.' },
  { id: '2', icon: 'landmark', title: 'Expanding to Europe', order: 1, description: 'Formally registered in the United Kingdom. Expanded visa processing and travel services for Nigerian and Ghanaian diaspora across the UK and Europe.' },
  { id: '3', icon: 'leaf',     title: 'North America',        order: 2, description: 'Opened Canadian operations in Ontario. Launched Niagara Falls private tours and Canada visa processing for diaspora clients across North America.' },
  { id: '4', icon: 'globe',    title: 'Global Platform',     order: 3, description: 'THE WALZ TRAVELS INC incorporated in Ontario, Canada. Full global travel platform launched at walztravels.com — serving clients across six markets worldwide.' },
]

const STATS = [
  { to: 6,   suffix: '',   label: 'Markets Served'     },
  { to: 90,  suffix: '%+', label: 'Visa Approval Rate' },
  { to: 199, suffix: '',   label: 'Countries Covered'  },
  { to: 24,  suffix: '/7', label: 'Expert Support'     },
]

const SERVICES = [
  { Icon: Shield,    title: 'Visa Processing',    body: 'Expert preparation for UK, Canada, UAE, Schengen, USA and more. 90%+ approval rate.',                              href: '/visa'                     },
  { Icon: Plane,     title: 'Flight Bookings',    body: 'Live prices across hundreds of airlines. IATA certified booking with expert support.',                               href: '/flights'                  },
  { Icon: Building2, title: 'Hotel Reservations', body: 'Best available rates worldwide. Expert recommendations for every destination and budget.',                            href: '/hotels'                   },
  { Icon: MapPin,    title: 'Private Tours',       body: 'Exclusive guided experiences in Niagara Falls, London, Dublin and beyond.',                                          href: '/tours'                    },
  { Icon: Briefcase, title: 'Corporate Travel',   body: 'Reliable travel coordination for businesses, conferences and executive trips worldwide.',                              href: 'https://wa.me/447398753797' },
  { Icon: Users,     title: 'Group Packages',      body: 'Churches, student organisations, family groups and corporate teams — we coordinate every detail.',                   href: 'https://wa.me/447398753797' },
]

const MARKETS = [
  { flag: '🇳🇬', country: 'Nigeria',              tagline: 'Visa applications, flights, hotels, tours'     },
  { flag: '🇬🇧', country: 'United Kingdom',        tagline: 'Flights, hotels, corporate travel, tours'     },
  { flag: '🇨🇦', country: 'Canada',               tagline: 'Visa support, Niagara Falls tours, transfers'  },
  { flag: '🇦🇪', country: 'United Arab Emirates', tagline: 'Luxury hotels, tours, visa on arrival'         },
  { flag: '🇬🇭', country: 'Ghana',                tagline: 'Visa applications, flights, private tours'     },
]

const CREDENTIALS = [
  'IATA Certified Travel Agency',
  'Stripe Secured Payments',
  'Data Protection Compliant',
  'Incorporated in Ontario, Canada',
  'Registered in the United Kingdom',
]

const JADE_CAPS = [
  { Icon: CheckCircle, text: 'Instant visa requirements'  },
  { Icon: Plane,       text: 'Live flight search'          },
  { Icon: Clock,       text: '24/7 WhatsApp support'       },
]

const ICON_MAP: Record<string, React.ElementType> = {
  plane: Plane, landmark: Landmark, leaf: Leaf, globe: Globe,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AboutPage() {
  // Hero state
  const [bgIndex, setBgIndex]         = useState(0)
  const [heroImages, setHeroImages]   = useState(HERO_IMAGES)
  const [subnavVisible, setSubnavVisible] = useState(false)
  const [timeline, setTimeline]       = useState<TimelineItem[]>(TIMELINE_FALLBACK)

  // Fetch dynamic hero background from media manager
  useEffect(() => {
    fetch('/api/media/about_hero_bg')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.url) {
          setHeroImages(prev => [{ src: d.url, label: 'About Hero' }, ...prev.slice(1)])
        }
      })
      .catch(() => {})
  }, [])

  // Refs — sections
  const heroRef     = useRef<HTMLDivElement>(null)
  const brandRef    = useRef<HTMLDivElement>(null)
  const storyRef    = useRef<HTMLDivElement>(null)
  const statsRef    = useRef<HTMLDivElement>(null)
  const journeyRef  = useRef<HTMLDivElement>(null)
  const servicesRef = useRef<HTMLDivElement>(null)
  const marketsRef  = useRef<HTMLDivElement>(null)
  const jadeRef     = useRef<HTMLDivElement>(null)
  const trustRef    = useRef<HTMLDivElement>(null)
  const partnerRef  = useRef<HTMLDivElement>(null)
  const ctaRef      = useRef<HTMLDivElement>(null)

  // Refs — hero text
  const eyebrowRef  = useRef<HTMLParagraphElement>(null)
  const line1Wrap   = useRef<HTMLDivElement>(null)
  const line2Wrap   = useRef<HTMLDivElement>(null)
  const line3Wrap   = useRef<HTMLDivElement>(null)
  const line1Ref    = useRef<HTMLDivElement>(null)
  const line2Ref    = useRef<HTMLDivElement>(null)
  const line3Ref    = useRef<HTMLDivElement>(null)
  const sublineRef  = useRef<HTMLParagraphElement>(null)
  const heroCTARef  = useRef<HTMLDivElement>(null)
  const scrollIndRef = useRef<HTMLDivElement>(null)

  // Refs — stats
  const statsRef2       = useRef<HTMLDivElement>(null)
  const statNumRefs     = useRef<(HTMLSpanElement | null)[]>([])

  // Refs — story images
  const img1Ref  = useRef<HTMLDivElement>(null)
  const text1Ref = useRef<HTMLDivElement>(null)
  const img2Ref  = useRef<HTMLDivElement>(null)
  const text2Ref = useRef<HTMLDivElement>(null)

  // Refs — journey timeline
  const timelineLineRef = useRef<HTMLDivElement>(null)
  const milestoneRefs   = useRef<(HTMLDivElement | null)[]>([])

  // ── Load timeline from DB ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/content/timeline')
      .then((r) => r.json())
      .then((d: TimelineItem[]) => { if (Array.isArray(d) && d.length) setTimeline(d) })
      .catch(() => {})
  }, [])

  // ── Hero image cycling ─────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setBgIndex((i) => (i + 1) % heroImages.length), 5000)
    return () => clearInterval(timer)
  }, [])

  // ── Subnav visibility (after hero scrolls past) ────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => setSubnavVisible(!e.isIntersecting), { threshold: 0 })
    if (heroRef.current) obs.observe(heroRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Scroll indicator fade ──────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollIndRef.current
    if (!el) return
    const handler = () => { el.style.opacity = window.scrollY > 60 ? '0' : '1' }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // ── GSAP animations (sections 1–5) ────────────────────────────────────────
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    const ctx = gsap.context(() => {

      // ─ S1: Hero text clip reveal ─────────────────────────────────────
      gsap.set(eyebrowRef.current,   { opacity: 0, y: 16 })
      gsap.set(line1Ref.current,     { yPercent: 110 })
      gsap.set(line2Ref.current,     { yPercent: 110 })
      gsap.set(line3Ref.current,     { yPercent: 110 })
      gsap.set(sublineRef.current,   { opacity: 0, y: 20 })
      gsap.set(heroCTARef.current,   { opacity: 0, y: 20 })
      gsap.set(scrollIndRef.current, { opacity: 0 })

      const tl = gsap.timeline({ delay: 0.25 })
      tl.to(eyebrowRef.current,   { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' })
        .to(line1Ref.current,     { yPercent: 0, duration: 1.2, ease: 'expo.out' },       '-=0.2')
        .to(line2Ref.current,     { yPercent: 0, duration: 1.2, ease: 'expo.out' },       '-=1.0')
        .to(line3Ref.current,     { yPercent: 0, duration: 1.2, ease: 'expo.out' },       '-=1.0')
        .to(sublineRef.current,   { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out' }, '-=0.7')
        .to(heroCTARef.current,   { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, '-=0.6')
        .to(scrollIndRef.current, { opacity: 1, duration: 0.6 },                          '-=0.4')

      // ─ S2: Quote word reveal ─────────────────────────────────────────
      const words = brandRef.current?.querySelectorAll('.word')
      if (words?.length) {
        gsap.from(words, {
          opacity: 0, y: 22, duration: 0.45, stagger: 0.028, ease: 'power2.out',
          scrollTrigger: { trigger: brandRef.current, start: 'top 72%', once: true },
        })
      }

      // ─ S3: Story clip-path image reveals ────────────────────────────
      if (img1Ref.current) {
        gsap.from(img1Ref.current, {
          clipPath: 'inset(0 100% 0 0)', duration: 1.4, ease: 'power3.inOut',
          scrollTrigger: { trigger: img1Ref.current, start: 'top 82%', once: true },
        })
      }
      if (img2Ref.current) {
        gsap.from(img2Ref.current, {
          clipPath: 'inset(0 0 0 100%)', duration: 1.4, ease: 'power3.inOut',
          scrollTrigger: { trigger: img2Ref.current, start: 'top 82%', once: true },
        })
      }

      // ─ S4: Stats countUp ────────────────────────────────────────────
      STATS.forEach((stat, i) => {
        const el = statNumRefs.current[i]
        if (!el) return
        const obj = { val: 0 }
        gsap.to(obj, {
          val: stat.to,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.val) + stat.suffix },
          scrollTrigger: { trigger: statsRef.current, start: 'top 80%', once: true },
        })
      })

      // ─ S5: Timeline line draw ────────────────────────────────────────
      if (timelineLineRef.current) {
        gsap.from(timelineLineRef.current, {
          scaleX: 0, transformOrigin: 'left center', duration: 1.6, ease: 'power2.inOut',
          scrollTrigger: { trigger: journeyRef.current, start: 'top 72%', once: true },
        })
      }
      milestoneRefs.current.forEach((el, i) => {
        if (!el) return
        gsap.from(el, {
          opacity: 0, y: 44, duration: 0.85, ease: 'power2.out',
          delay: i * 0.18,
          scrollTrigger: { trigger: journeyRef.current, start: 'top 72%', once: true },
        })
      })

    }) // end gsap.context

    return () => ctx.revert()
  }, [timeline]) // re-run when timeline loads

  // ── CSS IntersectionObserver for sections 6–11 ────────────────────────────
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal-ready')
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        el.classList.remove('reveal-hidden', 'reveal-from-right-hidden', 'reveal-from-left-hidden')
        el.classList.add('reveal-shown', 'reveal-from-right-shown', 'reveal-from-left-shown')
        obs.unobserve(el)
      })
    }, { threshold: 0.1 })
    elements.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // ── Helper ────────────────────────────────────────────────────────────────
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[#0B1F3A] text-white overflow-x-hidden">

      {/* ═══════════════════════════════════════════════════════════════════
          STICKY SUBNAV
      ══════════════════════════════════════════════════════════════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          subnavVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
        }`}
        style={{ background: 'rgba(11,31,58,0.96)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(201,168,76,0.15)' }}
      >
        <div className="container-walz flex items-center justify-between py-3">
          <span className="text-[#C9A84C] font-bold text-sm tracking-wider">WALZ TRAVELS</span>
          <div className="hidden md:flex items-center gap-6">
            {SUBNAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="text-white/70 hover:text-[#C9A84C] text-sm font-medium transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
          <Link href="/visa" className="hidden md:flex items-center gap-1.5 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold text-xs px-4 py-2 rounded-lg transition-colors">
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — FULLSCREEN HERO
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative w-full overflow-hidden" style={{ height: '100vh', minHeight: '640px' }}>

        {/* Cycling background images */}
        {heroImages.map((img, i) => (
          <div
            key={img.src}
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url('${img.src}')`,
              opacity: i === bgIndex ? 1 : 0,
              transition: 'opacity 1.8s ease-in-out',
            }}
            aria-hidden="true"
          />
        ))}

        {/* Overlay — dark navy gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F3A]/70 via-[#0B1F3A]/50 to-[#0B1F3A]/85" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-5">
          {/* Eyebrow */}
          <p
            ref={eyebrowRef}
            className="text-[#C9A84C] text-xs sm:text-sm font-bold tracking-[0.35em] uppercase mb-8"
          >
            A Global Travel Brand
          </p>

          {/* Headline — 3 lines with clip containers */}
          <h1 className="font-display font-bold leading-[1.0] mb-8" style={{ fontSize: 'clamp(3.5rem, 9vw, 8rem)' }}>
            <div ref={line1Wrap} className="overflow-hidden">
              <div ref={line1Ref}>Connecting </div>
            </div>
            <div ref={line2Wrap} className="overflow-hidden">
              <div ref={line2Ref} className="text-[#C9A84C]">The World </div>
            </div>
            <div ref={line3Wrap} className="overflow-hidden">
              <div ref={line3Ref}>One Journey at a Time.</div>
            </div>
          </h1>

          {/* Subheadline */}
          <p
            ref={sublineRef}
            className="text-white/75 text-lg sm:text-xl mb-10 max-w-lg"
          >
            Six markets. One trusted team.<br />Every destination on earth.
          </p>

          {/* CTAs */}
          <div ref={heroCTARef} className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/visa"
              className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-7 py-3.5 rounded-xl text-sm transition-colors shadow-lg"
            >
              Explore Our Services <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border-2 border-white/30 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-bold px-7 py-3.5 rounded-xl text-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp Jade
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          ref={scrollIndRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer transition-opacity duration-300"
          onClick={() => scrollTo('story')}
        >
          <span className="text-white/50 text-xs tracking-widest uppercase">Scroll</span>
          <ChevronDown className="w-5 h-5 text-[#C9A84C] animate-bounce" />
        </div>
      </section>

      {/* ─── Credentials strip (below hero) ─────────────────────────────── */}
      <section className="bg-[#060f1e] py-12 px-5 border-b border-white/5">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '✈', title: 'IATA Accredited', desc: 'International Air Transport Association member agency' },
            { icon: '🛡', title: 'ATOL Protected', desc: 'Your money is protected under UK Civil Aviation Authority' },
            { icon: '⭐', title: '5+ Years', desc: 'Serving clients across six global markets since 2019' },
            { icon: '💬', title: '24/7 Support', desc: 'Expert help via WhatsApp and email around the clock' },
          ].map((item) => (
            <div key={item.title} className="bg-[#0B1F3A] rounded-2xl p-6 text-center border border-white/8">
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="text-white font-bold text-sm mb-2">{item.title}</h3>
              <p className="text-white/50 text-xs leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trustpilot widget — below credentials */}
      <section className="bg-[#060f1e] py-10 px-5 border-b border-white/5">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">What our clients say</p>
          <TrustBox variant="collector" theme="light" className="w-full" />
          <a
            href="https://trstp.lt/OVwDw7a68P"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-[#C9A84C] hover:text-[#d4b05a] transition-colors"
          >
            <span>⭐</span> Leave a review on Trustpilot →
          </a>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — BRAND STATEMENT
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={brandRef} className="py-24 lg:py-36 bg-[#0B1F3A]">
        <div className="max-w-[900px] mx-auto px-6 text-center">
          <span className="block text-[#C9A84C] font-display text-[clamp(4rem,8vw,6.5rem)] leading-none mb-6 select-none">&ldquo;</span>
          <p className="font-display font-bold text-[clamp(1.6rem,3.5vw,2.6rem)] leading-snug text-white tracking-tight">
            {QUOTE_WORDS.map((word, i) => (
              <span key={i} className="word inline-block mr-[0.28em]">
                {word}{i < QUOTE_WORDS.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — THE WALZ TRAVELS STORY
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={storyRef} id="story" className="bg-[#091828]">

        {/* Block 1 — Image left · Text right */}
        <div className="container-walz grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-16 py-20 lg:py-28 items-center">
          {/* Image */}
          <div
            ref={img1Ref}
            className="rounded-2xl overflow-hidden h-80 lg:h-[500px] bg-gray-800 mb-10 lg:mb-0"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1200&q=80')", backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
          {/* Text */}
          <div
            ref={text1Ref}
            className="reveal-ready reveal-from-right-hidden"
            style={{ transitionDelay: '0.1s' }}
          >
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Our Story</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight">
              A Global Travel Brand
            </h2>
            <div className="space-y-4 text-white/70 text-[15px] leading-relaxed">
              <p>Walz Travels is a global travel and visa consultancy built for the modern international traveller. What began as a boutique consultancy in Dubai has grown into a full service travel platform serving clients across six markets — Canada, United Kingdom, UAE, Nigeria, Ghana and beyond.</p>
              <p>Formally registered in London, United Kingdom — Walz Travels expanded its reach across the African diaspora community in the UK, Europe and West Africa.</p>
              <p>THE WALZ TRAVELS INC was incorporated in Ontario, Canada, marking a new chapter as a truly global travel platform with operations across three continents.</p>
              <p>Today Walz Travels handles everything from visa applications and flight bookings to private tours, hotel reservations and corporate travel management — all under one trusted global brand.</p>
            </div>
          </div>
        </div>

        {/* Block 2 — Text left · Image right */}
        <div className="container-walz grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-16 pb-20 lg:pb-28 items-center">
          {/* Text */}
          <div
            ref={text2Ref}
            className="reveal-ready reveal-from-left-hidden order-2 lg:order-1"
            style={{ transitionDelay: '0.1s' }}
          >
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Our Purpose</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-6 leading-tight">
              Built for the Diaspora
            </h2>
            <div className="space-y-4 text-white/70 text-[15px] leading-relaxed">
              <p>We understand the unique challenges international travellers face — from complex visa applications to finding trusted flight prices and planning journeys across multiple countries.</p>
              <p>Our team combines deep knowledge of African diaspora travel needs with global expertise across every major destination. Whether you are travelling from Lagos to London, Accra to Toronto or Dubai to anywhere — Walz Travels handles every detail.</p>
            </div>
          </div>
          {/* Image */}
          <div
            ref={img2Ref}
            className="rounded-2xl overflow-hidden h-80 lg:h-[460px] bg-gray-800 mb-10 lg:mb-0 order-1 lg:order-2"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=1200&q=80')", backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — STATS STRIP
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={statsRef} className="bg-[#0B1F3A] border-y border-[#C9A84C]/15 py-16 lg:py-20">
        <div ref={statsRef2} className="container-walz grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 divide-x-0 lg:divide-x lg:divide-[#C9A84C]/15">
          {STATS.map((stat, i) => (
            <div key={stat.label} className="flex flex-col items-center text-center px-4">
              <div className="font-display font-black text-[#C9A84C] leading-none mb-2" style={{ fontSize: 'clamp(2.8rem, 6vw, 4.5rem)' }}>
                <span ref={(el) => { statNumRefs.current[i] = el }}>0{stat.suffix}</span>
              </div>
              <div className="text-white/60 text-sm font-medium tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 5 — OUR JOURNEY (TIMELINE)
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={journeyRef} id="journey" className="py-20 lg:py-32 bg-[#091828]">
        <div className="container-walz">
          <div className="text-center mb-16">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Our Journey</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white">A Story of Growth</h2>
          </div>

          {/* Single responsive timeline — vertical on mobile, horizontal grid on desktop */}
          {/* Desktop: animated connector line (absolute, hidden on mobile) */}
          <div className="relative hidden lg:block mb-10 h-0.5">
            <div className="absolute inset-0 bg-[#C9A84C]/20" />
            <div ref={timelineLineRef} className="absolute inset-0 bg-[#C9A84C] origin-left" />
          </div>

          <div className="space-y-10 lg:grid lg:grid-cols-4 lg:gap-8 lg:space-y-0">
            {timeline.map((item, i) => {
              const IconComp = ICON_MAP[item.icon] ?? Plane
              return (
                <div
                  key={item.id}
                  ref={(el) => { milestoneRefs.current[i] = el }}
                  className="flex gap-5 lg:flex-col lg:items-center lg:text-center"
                >
                  {/* Icon + mobile connector line */}
                  <div className="flex flex-col items-center lg:block lg:mb-4">
                    <div className="w-11 h-11 lg:w-12 lg:h-12 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/40 flex items-center justify-center flex-shrink-0">
                      <IconComp className="w-5 h-5 text-[#C9A84C]" />
                    </div>
                    {/* Mobile-only vertical connector */}
                    {i < timeline.length - 1 && (
                      <div className="flex-1 w-0.5 bg-[#C9A84C]/20 mt-3 lg:hidden" />
                    )}
                  </div>

                  {/* Text */}
                  <div className="pb-8 lg:pb-0">
                    <h3 className="font-display font-bold text-white mb-2 lg:mb-3 text-lg">{item.title}</h3>
                    <p className="text-white/55 text-sm leading-relaxed">{item.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 6 — WHAT WE DO
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={servicesRef} id="services" className="py-20 lg:py-32 bg-[#0B1F3A]">
        <div className="container-walz">
          <div className="text-center mb-14">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">What We Do</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Our Services</h2>
            <p className="text-white/55 max-w-md mx-auto">Everything you need for every journey.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map(({ Icon, title, body, href }, i) => (
              <Link
                key={title}
                href={href}
                className="group reveal-ready reveal-hidden block p-7 rounded-2xl border border-white/8 hover:border-[#C9A84C] bg-white/4 hover:bg-white/8 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="w-11 h-11 rounded-xl bg-[#C9A84C]/15 flex items-center justify-center mb-5">
                  <Icon className="w-5 h-5 text-[#C9A84C]" />
                </div>
                <h3 className="font-display font-bold text-white text-lg mb-2">{title}</h3>
                <p className="text-white/55 text-sm leading-relaxed mb-4">{body}</p>
                <span className="flex items-center gap-1 text-[#C9A84C] text-xs font-semibold group-hover:gap-2 transition-all">
                  Learn more <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 7 — WHERE WE SERVE
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={marketsRef} id="markets" className="py-20 lg:py-32 bg-[#091828]">
        <div className="container-walz">
          <div className="text-center mb-14">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Our Markets</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-3">Where We Serve</h2>
            <p className="text-white/55 max-w-md mx-auto">Six markets. One team.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {MARKETS.map(({ flag, country, tagline }, i) => (
              <div
                key={country}
                className="reveal-ready reveal-hidden flex flex-col items-center text-center p-6 rounded-2xl border border-white/8 hover:border-[#C9A84C] bg-white/4 hover:bg-white/8 transition-all duration-300 hover:-translate-y-1"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <span className="text-5xl mb-4 select-none">{flag}</span>
                <h3 className="font-display font-bold text-white text-base mb-2">{country}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{tagline}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 8 — MEET JADE
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={jadeRef} className="py-20 lg:py-32 bg-[#0B1F3A] text-center">
        <div className="container-walz max-w-3xl">
          {/* Jade avatar */}
          <div className="relative w-28 h-28 mx-auto mb-10">
            <div className="absolute inset-0 rounded-full border-2 border-[#C9A84C]/40 animate-ping" style={{ animationDuration: '2.5s' }} />
            <div className="absolute inset-1 rounded-full border border-[#C9A84C]/20 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.8s' }} />
            <div className="relative z-10 w-full h-full rounded-full bg-[#C9A84C]/10 border-2 border-[#C9A84C] flex items-center justify-center">
              <MessageCircle className="w-12 h-12 text-[#C9A84C]" />
            </div>
          </div>

          <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Your Personal Advisor</p>
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-white mb-3">Meet Jade</h2>
          <p className="text-white/60 text-lg mb-8">Available every hour. Every destination. Every question.</p>

          <blockquote className="font-display text-xl lg:text-2xl text-white/85 leading-relaxed italic mb-10 reveal-ready reveal-hidden">
            &ldquo;I am here to make your travel experience seamless — from checking visa requirements to booking your flights and answering every question along the way. Day or night.&rdquo;
          </blockquote>

          {/* Capability cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            {JADE_CAPS.map(({ Icon, text }, i) => (
              <div
                key={text}
                className="reveal-ready reveal-hidden p-5 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <Icon className="w-5 h-5 text-[#C9A84C] mx-auto mb-2" />
                <p className="text-white/80 text-sm">{text}</p>
              </div>
            ))}
          </div>

          <a
            href="https://wa.me/447398753797"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-8 py-4 rounded-xl text-sm transition-colors shadow-lg animate-pulse"
            style={{ animationDuration: '3s' }}
          >
            <MessageCircle className="w-4 h-4" /> WhatsApp Jade
          </a>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 9 — TRUST & CREDENTIALS
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={trustRef} className="py-20 lg:py-28 bg-[#091828]">
        <div className="container-walz grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-start">
          {/* Credentials */}
          <div className="reveal-ready reveal-from-left-hidden">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-5">Credentials</p>
            <ul className="space-y-4">
              {CREDENTIALS.map((c) => (
                <li key={c} className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-[#C9A84C] flex-shrink-0" />
                  <span className="text-white/80 text-[15px]">{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Promise */}
          <div className="reveal-ready reveal-from-right-hidden">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-5">Our Promise</p>
            <h3 className="font-display text-2xl font-bold text-white mb-5">Our Promise to You</h3>
            <div className="space-y-4 text-white/65 text-[15px] leading-relaxed">
              <p>Every application prepared to the highest standard. Every booking confirmed before we consider the job done. Every client supported from first enquiry to safe return.</p>
              <p>We do not consider our work complete until you are travelling with confidence.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 10 — PARTNER WITH WALZ
      ══════════════════════════════════════════════════════════════════════ */}
      <section ref={partnerRef} className="py-20 lg:py-28 bg-[#0B1F3A] border-t border-white/5">
        <div className="container-walz grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20">
          {/* Partnerships */}
          <div className="reveal-ready reveal-from-left-hidden p-8 rounded-2xl border border-white/8 bg-white/4">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Partnerships</p>
            <h3 className="font-display text-2xl font-bold text-white mb-4">Work With Us</h3>
            <p className="text-white/60 text-[15px] leading-relaxed mb-6">
              We work with airlines, hotels, tour operators and travel insurance providers worldwide. If you are interested in partnering with Walz Travels, contact our team.
            </p>
            <a
              href="mailto:contact@walztravels.com"
              className="inline-flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              Get in Touch <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Careers */}
          <div className="reveal-ready reveal-from-right-hidden p-8 rounded-2xl border border-white/8 bg-white/4">
            <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-4">Careers</p>
            <h3 className="font-display text-2xl font-bold text-white mb-4">Join the Team</h3>
            <p className="text-white/60 text-[15px] leading-relaxed mb-6">
              We are always looking for passionate travel professionals to join our global team.
            </p>
            <Link
              href="/careers"
              className="inline-flex items-center gap-2 border-2 border-white/20 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              View Opportunities <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 11 — FINAL CTA (100vh)
      ══════════════════════════════════════════════════════════════════════ */}
      <section
        ref={ctaRef}
        id="cta-final"
        className="animate-gradient-bg flex flex-col items-center justify-center text-center px-5"
        style={{ minHeight: '100vh' }}
      >
        <div className="max-w-2xl">
          <p className="text-[#C9A84C] text-xs font-bold tracking-[0.3em] uppercase mb-6">Start Here</p>
          <h2
            className="font-display font-bold text-white mb-6 leading-tight"
            style={{ fontSize: 'clamp(2.8rem, 7vw, 5.5rem)' }}
          >
            Your journey starts here.
          </h2>
          <p className="text-white/65 text-xl mb-10">
            Talk to Jade. Get started in minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://wa.me/447398753797"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-8 py-4 rounded-xl text-base transition-colors shadow-xl"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp Jade
            </a>
            <Link
              href="/visa"
              className="flex items-center gap-2.5 border-2 border-white/25 hover:border-[#C9A84C] text-white hover:text-[#C9A84C] font-bold px-8 py-4 rounded-xl text-base transition-colors"
            >
              Explore Services <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
