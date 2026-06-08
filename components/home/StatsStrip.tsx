'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

const STATS = [
  { value: 90,   suffix: '%+', label: 'Visa Approval Rate'  },
  { value: 6,    suffix: '',   label: 'Markets Served'       },
  { value: 24,   suffix: '/7', label: 'Expert Support'       },
  { value: 5000, suffix: '+',  label: 'Trips Planned'        },
]

export function StatsStrip() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const numRefs    = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    numRefs.current.forEach((el, i) => {
      if (!el) return
      const stat = STATS[i]
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (prefersReduced) {
        el.textContent = stat.value.toLocaleString()
        return
      }

      const obj = { val: 0 }
      gsap.to(obj, {
        val: stat.value,
        duration: 2,
        ease: 'power2.out',
        onStart() { if (el) el.textContent = '0' },
        onUpdate() { if (el) el.textContent = Math.round(obj.val).toLocaleString() },
        onComplete() { if (el) el.textContent = stat.value.toLocaleString() },
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      })
    })
  }, [])

  return (
    <section ref={sectionRef} className="bg-[#081629] py-16 lg:py-20">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {STATS.map(({ value, suffix, label }, i) => (
            <div key={label} className="text-center">
              <div className="flex items-baseline justify-center gap-0.5 mb-2">
                <span
                  ref={el => { numRefs.current[i] = el }}
                  className="font-display font-bold text-[#C9A84C] text-[clamp(2.5rem,5vw,3.8rem)] leading-none tabular-nums"
                >
                  {value.toLocaleString()}
                </span>
                <span className="font-display font-bold text-[#C9A84C] text-[clamp(1.5rem,3vw,2.2rem)] leading-none">
                  {suffix}
                </span>
              </div>
              <p className="text-white/50 text-sm tracking-wide">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
