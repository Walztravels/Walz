'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    // Admin pages use a fixed-height flex layout where only <main> scrolls
    // (overflow-y-auto). Lenis intercepts wheel events at the document level
    // before they reach <main>, so wheel/trackpad scroll silently does nothing
    // while dragging the scrollbar still works. Skip Lenis on all admin routes.
    if (pathname?.startsWith('/admin')) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    // gsap + ScrollTrigger + Lenis are all loaded async so smooth-scroll
    // never sits in the first-load bundle — a static gsap import here put
    // ~37 KB (gz) into EVERY page's critical JS. Scrolling works natively
    // until these land; they only enhance it.
    Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
      import('@studio-freight/lenis'),
    ]).then(([gsapMod, stMod, lenisMod]) => {
      if (cancelled) return
      const gsap          = gsapMod.default
      const ScrollTrigger = stMod.default
      const Lenis         = lenisMod.default

      gsap.registerPlugin(ScrollTrigger)

      const lenis = new Lenis({
        duration: 1.8,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 0,
      })

      // Sync ScrollTrigger with Lenis
      lenis.on('scroll', ScrollTrigger.update)

      const raf = (time: number) => { lenis.raf(time * 1000) }
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)

      cleanup = () => {
        lenis.destroy()
        gsap.ticker.remove(raf)
      }
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [pathname])

  return <>{children}</>
}
