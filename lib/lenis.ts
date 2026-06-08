import Lenis from '@studio-freight/lenis'

let instance: Lenis | null = null

export function initLenis(): Lenis {
  if (instance) return instance

  instance = new Lenis({
    duration: 1.8,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 0,
  })

  function raf(time: number) {
    instance!.raf(time)
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)

  return instance
}

export function getLenis(): Lenis | null {
  return instance
}
