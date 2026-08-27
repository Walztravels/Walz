'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  useEffect(() => {
    // Admin pages use a fixed-height flex layout where only <main> scrolls
    // (overflow-y-auto). Lenis intercepts wheel events at the document level
    // before they reach <main>, so wheel/trackpad scroll silently does nothing
    // while dragging the scrollbar still works. Skip Lenis on all admin routes.
    if (pathname?.startsWith('/admin')) return

    gsap.registerPlugin(ScrollTrigger)

    // Only import & start Lenis on client
    import('@studio-freight/lenis').then(({ default: Lenis }) => {
      const lenis = new Lenis({
        duration: 1.8,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 0,
      })

      // Sync ScrollTrigger with Lenis
      lenis.on('scroll', ScrollTrigger.update)

      gsap.ticker.add((time) => {
        lenis.raf(time * 1000)
      })
      gsap.ticker.lagSmoothing(0)

      return () => {
        lenis.destroy()
        gsap.ticker.remove((time) => lenis.raf(time * 1000))
      }
    })
  }, [pathname])

  return <>{children}</>
}
