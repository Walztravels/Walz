'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import gsap from 'gsap'

const FORM_PREFIXES = ['/admin', '/trip-request/', '/itinerary/', '/visa/apply/', '/visa/form/', '/payment/']

export default function Cursor() {
  const pathname  = usePathname() ?? ''
  const dotRef    = useRef<HTMLDivElement>(null)
  const circleRef = useRef<HTMLDivElement>(null)
  const isForm    = FORM_PREFIXES.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (isForm) return
    // Skip on touch/coarse pointer devices
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

    // Expand on interactive elements
    const onEnterInteractive = () => {
      gsap.to(circle, { scale: 2, duration: 0.3, ease: 'power2.out' })
    }
    const onLeaveInteractive = () => {
      gsap.to(circle, { scale: 1, duration: 0.3, ease: 'power2.out' })
    }

    // Use event delegation — handles dynamically added elements too
    const onDocEnter = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('a, button, [data-cursor], input, select, textarea, [role="button"]')) {
        onEnterInteractive()
      }
    }
    const onDocLeave = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('a, button, [data-cursor], input, select, textarea, [role="button"]')) {
        onLeaveInteractive()
      }
    }

    document.addEventListener('mouseover',  onDocEnter)
    document.addEventListener('mouseout',   onDocLeave)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseover',  onDocEnter)
      document.removeEventListener('mouseout',   onDocLeave)
      cancelAnimationFrame(rafId)
    }
  }, [isForm])

  if (isForm) return null

  return (
    <>
      <div
        ref={dotRef}
        className="cursor-dot"
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          width:         '8px',
          height:        '8px',
          backgroundColor: '#C9A84C',
          borderRadius:  '50%',
          pointerEvents: 'none',
          zIndex:        99999,
          transform:     'translate(-50%, -50%)',
          willChange:    'transform',
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
