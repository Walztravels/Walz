import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

const prefersReduced = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── fadeInUp ────────────────────────────────────────────────────────────────
export function fadeInUp(
  element: gsap.TweenTarget,
  delay = 0,
  duration = 1,
  y = 60,
) {
  if (prefersReduced) return
  return gsap.from(element, {
    opacity: 0,
    y,
    duration,
    delay,
    ease: 'power3.out',
  })
}

// ── revealFromLeft ───────────────────────────────────────────────────────────
export function revealFromLeft(element: gsap.TweenTarget) {
  if (prefersReduced) return
  return gsap.fromTo(
    element,
    { clipPath: 'inset(0 100% 0 0)' },
    { clipPath: 'inset(0 0% 0 0)', duration: 1.4, ease: 'power3.out' },
  )
}

// ── countUp ──────────────────────────────────────────────────────────────────
export function countUp(element: HTMLElement, target: number, duration = 2) {
  if (prefersReduced) {
    element.textContent = target.toLocaleString()
    return
  }
  const obj = { val: 0 }
  gsap.to(obj, {
    val: target,
    duration,
    ease: 'power2.out',
    onUpdate() {
      element.textContent = Math.round(obj.val).toLocaleString()
    },
    scrollTrigger: {
      trigger: element,
      start: 'top 85%',
      once: true,
    },
  })
}

// ── staggerReveal ────────────────────────────────────────────────────────────
export function staggerReveal(elements: gsap.TweenTarget, stagger = 0.15) {
  if (prefersReduced) return
  return gsap.from(elements, {
    opacity: 0,
    y: 80,
    duration: 1,
    stagger,
    ease: 'power3.out',
  })
}

// ── staggerRevealOnScroll ─────────────────────────────────────────────────────
export function staggerRevealOnScroll(
  trigger: string | Element,
  elements: string | Element[],
  stagger = 0.15,
) {
  if (prefersReduced) return
  return gsap.from(elements, {
    opacity: 0,
    y: 80,
    duration: 1,
    stagger,
    ease: 'power3.out',
    scrollTrigger: {
      trigger,
      start: 'top 80%',
      once: true,
    },
  })
}

// ── parallax ─────────────────────────────────────────────────────────────────
export function parallax(element: gsap.TweenTarget, speed: number) {
  if (prefersReduced) return
  // Skip on mobile
  if (typeof window !== 'undefined' && window.innerWidth < 768) return

  return ScrollTrigger.create({
    animation: gsap.to(element, { y: speed, ease: 'none' }),
    scrub: true,
    trigger: element as Element,
  })
}

// ── clipRevealOnScroll ────────────────────────────────────────────────────────
export function clipRevealOnScroll(element: gsap.TweenTarget, trigger: string | Element) {
  if (prefersReduced) return
  return gsap.fromTo(
    element,
    { clipPath: 'inset(0 100% 0 0)' },
    {
      clipPath: 'inset(0 0% 0 0)',
      duration: 1.4,
      ease: 'power3.out',
      scrollTrigger: { trigger, start: 'top 80%', once: true },
    },
  )
}

// ── lineReveal (clip from bottom) ─────────────────────────────────────────────
export function lineRevealOnScroll(elements: gsap.TweenTarget, trigger: string | Element) {
  if (prefersReduced) return
  return gsap.fromTo(
    elements,
    { y: '100%', opacity: 0 },
    {
      y: '0%',
      opacity: 1,
      duration: 1.1,
      stagger: 0.15,
      ease: 'power3.out',
      scrollTrigger: { trigger, start: 'top 85%', once: true },
    },
  )
}
