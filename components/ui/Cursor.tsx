'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'

const EXCLUDED_PREFIXES = ['/admin', '/trip-request/', '/itinerary/', '/visa/apply/', '/visa/form/', '/payment/']

export default function Cursor() {
  const pathname = usePathname() ?? ''
  const dotRef    = useRef<HTMLDivElement>(null)
  const circleRef = useRef<HTMLDivElement>(null)
  const excluded  = EXCLUDED_PREFIXES.some(p => pathname.startsWith(p))

  // Manage cursor:none on <html> so admin/form pages always show the default OS cursor.
  // We apply cursor:none in JS (not globals.css) so it only hides the OS cursor when
  // the custom cursor is actually active.
  useEffect(() => {
    if (excluded) return
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(hover: none)').matches) return

    document.documentElement.style.setProperty('cursor', 'none', 'important')
    return () => {
      document.documentElement.style.removeProperty('cursor')
    }
  }, [excluded])

  useEffect(() => {
    if (excluded) return
    if (window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(hover: none)').matches) return

    const dot    = dotRef.current
    const circle = circleRef.current
    if (!dot || !circle) return

    let mouseX = 0
    let mouseY = 0
    let circleX = 0
    let circleY = 0
    let rafId: number

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
      gsap.to(dot, { x: mouseX, y: mouseY, duration: 0, overwrite: true })
    }

    const animate = () => {
      circleX += (mouseX - circleX) * 0.1
      circleY += (mouseY - circleY) * 0.1
      gsap.set(circle, { x: circleX, y: circleY })
      rafId = requestAnimationFrame(animate)
    }

    window.addEventListener('mousemove', onMouseMove)
    rafId = requestAnimationFrame(animate)

    const onDocEnter = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('a, button, [data-cursor], input, select, textarea, [role="button"]')) {
        gsap.to(circle, { scale: 2, duration: 0.3, ease: 'power2.out' })
      }
    }
    const onDocLeave = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('a, button, [data-cursor], input, select, textarea, [role="button"]')) {
        gsap.to(circle, { scale: 1, duration: 0.3, ease: 'power2.out' })
      }
    }

    document.addEventListener('mouseover', onDocEnter)
    document.addEventListener('mouseout',  onDocLeave)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseover', onDocEnter)
      document.removeEventListener('mouseout',  onDocLeave)
      cancelAnimationFrame(rafId)
    }
  }, [excluded])

  if (excluded) return null

  return (
    <>
      <div
        ref={dotRef}
        className="cursor-dot"
        style={{
          position:        'fixed',
          top:             0,
          left:            0,
          width:           '8px',
          height:          '8px',
          backgroundColor: '#C9A84C',
          borderRadius:    '50%',
          pointerEvents:   'none',
          zIndex:          99999,
          transform:       'translate(-50%, -50%)',
          willChange:      'transform',
        }}
      />
      <div
        ref={circleRef}
        className="cursor-circle"
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          width:         '40px',
          height:        '40px',
          border:        '1.5px solid #C9A84C',
          borderRadius:  '50%',
          pointerEvents: 'none',
          zIndex:        99998,
          transform:     'translate(-50%, -50%)',
          willChange:    'transform',
        }}
      />
    </>
  )
}
