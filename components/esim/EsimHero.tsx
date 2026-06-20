'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { Zap, ShieldCheck, Wifi, Smartphone, Signal } from 'lucide-react'

const CITY_DOTS = [
  { name: 'London',   x: 462, y: 148 },
  { name: 'Dubai',    x: 570, y: 202 },
  { name: 'Toronto',  x: 228, y: 160 },
  { name: 'Paris',    x: 470, y: 154 },
  { name: 'Tokyo',    x: 760, y: 172 },
  { name: 'Sydney',   x: 772, y: 350 },
  { name: 'New York', x: 245, y: 168 },
  { name: 'Lagos',    x: 476, y: 262 },
  { name: 'Accra',    x: 465, y: 268 },
]

interface Particle {
  x: number; y: number
  vx: number; vy: number
  r: number; opacity: number
}

export function EsimHero() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)

  // Canvas particle system
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const particles: Particle[] = []

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      particles.length = 0
      const count = Math.min(120, Math.floor((canvas.width * canvas.height) / 12000))
      for (let i = 0; i < count; i++) {
        particles.push({
          x:       Math.random() * canvas.width,
          y:       Math.random() * canvas.height,
          vx:      (Math.random() - 0.5) * 0.25,
          vy:      (Math.random() - 0.5) * 0.25,
          r:       Math.random() * 1.4 + 0.3,
          opacity: Math.random() * 0.35 + 0.04,
        })
      }
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201,168,76,${p.opacity})`
        ctx.fill()
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0)            p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0)            p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
      }
      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animId)
    }
  }, [])

  // Headline clip-path reveal
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    import('gsap').then(({ gsap }) => {
      const lines = headlineRef.current?.querySelectorAll('.hl')
      if (!lines?.length) return
      gsap.fromTo(lines,
        { clipPath: 'inset(100% 0 0 0)', y: 28, opacity: 0 },
        { clipPath: 'inset(0% 0 0 0)',   y: 0,  opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.11, delay: 0.25 }
      )
      gsap.fromTo('.esim-hero-sub', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, delay: 0.85, ease: 'power2.out' })
      gsap.fromTo('.esim-hero-cta', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, delay: 1.05, ease: 'power2.out' })
    })
  }, [])

  function scrollToSearch() {
    document.getElementById('esim-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  function scrollToHow() {
    document.getElementById('esim-how')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section
      className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{ minHeight: '100vh', background: '#0B1F3A' }}
    >
      {/* Canvas particles */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      />

      {/* Dot-grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(201,168,76,0.10) 1px, transparent 1px)',
          backgroundSize:  '44px 44px',
          opacity: 0.45,
        }}
        aria-hidden
      />

      {/* SVG world map */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.065] pointer-events-none" aria-hidden>
        <svg viewBox="0 0 1000 500" className="w-full h-full max-w-6xl" preserveAspectRatio="xMidYMid meet">
          <path
            d="M100,140 L120,120 L140,110 L170,115 L185,130 L190,150 L175,165 L155,170 L130,165 L110,155 Z
               M200,100 L230,90 L270,88 L310,92 L340,85 L380,80 L420,82 L450,78 L470,82 L475,90 L460,100 L440,108 L410,115 L380,120 L350,115 L320,118 L290,125 L260,120 L230,115 L210,110 Z
               M480,75 L510,70 L545,68 L580,72 L610,78 L640,74 L665,70 L680,78 L675,90 L660,100 L640,108 L615,112 L590,108 L565,105 L540,108 L515,105 L492,98 L482,88 Z
               M462,140 L474,132 L490,130 L500,138 L497,148 L484,154 L470,150 Z
               M300,150 L330,145 L360,142 L390,145 L405,155 L410,170 L400,185 L385,195 L365,200 L345,195 L330,188 L315,180 L305,168 Z
               M440,155 L465,150 L490,148 L510,155 L520,168 L515,182 L500,190 L480,192 L462,186 L448,175 L442,164 Z
               M550,155 L575,148 L600,145 L630,150 L650,162 L648,178 L635,188 L615,192 L595,190 L575,182 L558,170 Z
               M680,160 L700,155 L725,152 L750,158 L768,168 L765,182 L750,192 L730,195 L710,190 L695,180 L684,170 Z
               M760,165 L785,158 L810,155 L838,160 L855,172 L852,188 L838,198 L815,202 L792,198 L775,188 L764,176 Z
               M200,200 L230,195 L255,198 L270,210 L268,225 L255,235 L238,238 L220,232 L208,222 Z
               M460,255 L490,248 L520,252 L540,265 L535,285 L520,298 L498,302 L476,295 L462,280 Z
               M560,280 L590,275 L615,278 L630,292 L625,310 L610,320 L588,322 L568,315 L555,300 Z
               M760,340 L790,332 L818,335 L835,350 L830,368 L815,380 L792,382 L772,375 L760,358 Z"
            fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
          {CITY_DOTS.map((city, i) => (
            <g key={city.name}>
              <circle cx={city.x} cy={city.y} r="6" fill="rgba(201,168,76,0.3)"
                style={{ animation: `eCityPulse 2.5s ease-in-out ${i * 0.3}s infinite` }} />
              <circle cx={city.x} cy={city.y} r="3" fill="#C9A84C"
                style={{ animation: `eCityDot 2.5s ease-in-out ${i * 0.3}s infinite` }} />
            </g>
          ))}
        </svg>
      </div>

      {/* Signal rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" aria-hidden>
        {[1, 2, 3].map(i => (
          <div key={i} className="absolute rounded-full border border-white/10"
            style={{ width: `${i * 25}vw`, height: `${i * 25}vw`, animation: `eSignalRing 4s ease-out ${i * 1.2}s infinite` }} />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-5 sm:px-8 max-w-5xl mx-auto pt-24 pb-10">

        {/* Jade avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <div className="w-[60px] h-[60px] rounded-full overflow-hidden relative"
              style={{
                background: 'radial-gradient(circle at 50% 30%, #dceaf5 0%, #a8cce8 100%)',
                border:     '2px solid rgba(201,168,76,0.6)',
                boxShadow:  '0 0 0 6px rgba(201,168,76,0.1), 0 0 0 12px rgba(201,168,76,0.05)',
                animation:  'eAvatarPulse 3s ease-in-out infinite',
              }}>
              <Image src="/jade-avatar.jpg" alt="Jade" fill className="object-cover" style={{ objectPosition: '50% 8%' }} sizes="60px" />
            </div>
            <div className="absolute inset-0 rounded-full border border-[#C9A84C]/30" style={{ animation: 'eRingPulse 2.5s ease-out 0s infinite' }} />
            <div className="absolute inset-0 rounded-full border border-[#C9A84C]/20" style={{ animation: 'eRingPulse 2.5s ease-out 0.8s infinite' }} />
          </div>
          <p className="text-[#C9A84C] text-[10px] font-bold tracking-[0.3em] uppercase mt-3">Jade Connect</p>
        </div>

        {/* Headline — gold gradient on last word */}
        <div ref={headlineRef} className="mb-6">
          <p className="hl font-display font-bold text-white leading-none mb-1"
            style={{ fontSize: 'clamp(2.5rem,7vw,4.5rem)' }}>
            Stay Connected.
          </p>
          <p className="hl font-display font-bold text-white leading-none mb-1"
            style={{ fontSize: 'clamp(2rem,6vw,3.75rem)' }}>
            Anywhere on Earth.
          </p>
          <p className="hl font-display font-bold leading-none"
            style={{ fontSize: 'clamp(3rem,8vw,5rem)', background: 'linear-gradient(90deg,#C9A84C,#FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Instantly.
          </p>
        </div>

        {/* Sub */}
        <p className="esim-hero-sub text-white/50 leading-relaxed mb-10 mx-auto"
          style={{ fontSize: 'clamp(1rem,2.5vw,1.2rem)', maxWidth: '36rem', opacity: 0 }}>
          Instant eSIM for 150+ countries.&nbsp; No roaming. No physical SIM.
          <br />Activate before you land.
        </p>

        {/* CTAs */}
        <div className="esim-hero-cta flex flex-wrap items-center justify-center gap-4 mb-14" style={{ opacity: 0 }}>
          <button onClick={scrollToSearch}
            className="px-8 py-4 font-bold text-sm rounded-full transition-all duration-300 hover:scale-105"
            style={{ background: '#C9A84C', color: '#0B1F3A', boxShadow: '0 0 0 0 rgba(201,168,76,0)' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 30px rgba(201,168,76,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 0 0 rgba(201,168,76,0)' }}>
            Get Connected
          </button>
          <button onClick={scrollToHow}
            className="px-8 py-4 font-bold text-sm rounded-full border border-white/30 text-white hover:border-[#C9A84C] hover:text-[#C9A84C] transition-all duration-300">
            How it works
          </button>
        </div>

        {/* Trust pills */}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {[
            { Icon: Zap,         label: 'Instant delivery'      },
            { Icon: ShieldCheck, label: 'Stripe secured'        },
            { Icon: Wifi,        label: '4G / 5G speeds'        },
            { Icon: Smartphone,  label: 'Most phones supported' },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-white/40 text-xs px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Icon className="w-3 h-3 text-[#C9A84C]" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
        <Signal className="w-5 h-5 text-[#C9A84C]" style={{ animation: 'eBounce 2s ease-in-out infinite' }} />
        <p className="text-white text-[10px] tracking-widest uppercase">Scroll to explore</p>
      </div>

      <style>{`
        @keyframes eCityPulse { 0%,100%{r:6;opacity:.3} 50%{r:10;opacity:.7} }
        @keyframes eCityDot   { 0%,100%{r:3}           50%{r:4}             }
        @keyframes eSignalRing{ 0%{transform:scale(.4);opacity:.06} 80%,100%{transform:scale(1.2);opacity:0} }
        @keyframes eAvatarPulse{
          0%,100%{box-shadow:0 0 0 6px rgba(201,168,76,.1),0 0 0 12px rgba(201,168,76,.05)}
          50%    {box-shadow:0 0 0 10px rgba(201,168,76,.15),0 0 0 20px rgba(201,168,76,.07)}
        }
        @keyframes eRingPulse { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(2);opacity:0} }
        @keyframes eBounce    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important}}
      `}</style>
    </section>
  )
}
