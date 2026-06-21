'use client'

import { useEffect, useRef } from 'react'

export function FlightsHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let w = 0, h = 0

    const dots = Array.from({ length: 60 }, () => ({
      x:     Math.random(),
      y:     Math.random(),
      r:     Math.random() * 1.5 + 0.5,
      vx:    (Math.random() - 0.5) * 0.0003,
      vy:    (Math.random() - 0.5) * 0.0003,
      alpha: Math.random() * 0.4 + 0.1,
    }))

    const resize = () => {
      w = canvas.width  = canvas.offsetWidth
      h = canvas.height = canvas.offsetHeight
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx   = (dots[i].x - dots[j].x) * w
          const dy   = (dots[i].y - dots[j].y) * h
          const dist = Math.hypot(dx, dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(201,168,76,${0.06 * (1 - dist / 120)})`
            ctx.lineWidth   = 0.5
            ctx.moveTo(dots[i].x * w, dots[i].y * h)
            ctx.lineTo(dots[j].x * w, dots[j].y * h)
            ctx.stroke()
          }
        }
      }
      for (const d of dots) {
        d.x = (d.x + d.vx + 1) % 1
        d.y = (d.y + d.vy + 1) % 1
        ctx.beginPath()
        ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201,168,76,${d.alpha})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="absolute inset-0 z-0 bg-[#0B1F3A]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />

      {/* Glow overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />

      {/* SVG grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
        viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`v${i}`} x1={i * 130} y1="0" x2={i * 130} y2="900" stroke="#C9A84C" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 120} x2="1400" y2={i * 120} stroke="#C9A84C" strokeWidth="0.5" />
        ))}
        <path d="M 200 700 Q 700 200 1200 650" stroke="#C9A84C" strokeWidth="1" fill="none" strokeDasharray="4 8">
          <animate attributeName="stroke-dashoffset" from="0" to="-100" dur="4s" repeatCount="indefinite" />
        </path>
      </svg>

      {/* Hero copy */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pb-36">
        <div className="inline-flex items-center gap-2 text-[#C9A84C] text-xs font-semibold tracking-[0.25em] uppercase mb-6 border border-[#C9A84C]/30 rounded-full px-4 py-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          JADE CONNECT FLIGHTS · 900+ AIRLINES
        </div>
        <h1 className="font-display font-bold text-white leading-none tracking-tight mb-5">
          <span className="block text-5xl sm:text-6xl lg:text-7xl xl:text-8xl">Fly Better.</span>
          <span className="block text-5xl sm:text-6xl lg:text-7xl xl:text-8xl"
            style={{ background: 'linear-gradient(135deg,#C9A84C 0%,#E8C87A 50%,#C9A84C 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Travel Smarter.
          </span>
          <span className="block text-3xl sm:text-4xl lg:text-5xl text-white/60 font-light mt-2">
            Book Worldwide.
          </span>
        </h1>
        <p className="text-white/50 max-w-lg text-base lg:text-lg leading-relaxed mb-8">
          Book flights on 900+ airlines with exclusive fares, flexible payment options,
          and 24/7 travel concierge support from the Walz team.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <button type="button"
            onClick={() => document.getElementById('search-widget')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="px-7 py-3.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] active:scale-[0.97] transition-all shadow-lg shadow-[#C9A84C]/25">
            Search Flights
          </button>
          <button type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('jade:open', { detail: { service: 'Flight', page: '/flights' } }))}
            className="px-7 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/20 active:scale-[0.97] transition-all backdrop-blur-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Chat with Jade AI
          </button>
          <button type="button"
            onClick={() => document.getElementById('popular-routes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="px-7 py-3.5 rounded-xl border border-white/10 text-white/50 text-sm font-medium hover:border-white/30 hover:text-white/80 transition-all">
            Explore Deals
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5">
          {['IATA Certified', 'SSL Secured', '4G/5G eSIM', '24/7 Support'].map(t => (
            <span key={t} className="text-white/30 text-xs flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#C9A84C]" /> {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
