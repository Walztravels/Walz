'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export type AbandonmentType = 'flight_search' | 'visa_application' | 'booking_checkout'

interface Config {
  type: AbandonmentType
  step: string
  data: Record<string, string | number | undefined | null>
  // Skip triggering abandonment capture — set true if user is already logged in / email known
  skip?: boolean
}

export function useAbandonmentCapture(config: Config) {
  const [showCapture, setShowCapture] = useState(false)
  const [captured,    setCaptured]    = useState(false)
  const hasEmail    = useRef(false)
  const idleTimeout = useRef<ReturnType<typeof setTimeout>>()

  // Keep config data in a ref so effect callbacks don't need it as a dep
  const configRef = useRef(config)
  configRef.current = config

  const shouldSkip = config.skip ?? false

  const resetIdle = useCallback(() => {
    clearTimeout(idleTimeout.current)
    idleTimeout.current = setTimeout(() => {
      if (!hasEmail.current && !configRef.current.skip) setShowCapture(true)
    }, 90_000)
  }, [])

  // Trigger 1: idle for 90 seconds
  useEffect(() => {
    if (shouldSkip || captured) return
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'] as const
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()
    return () => {
      clearTimeout(idleTimeout.current)
      events.forEach(e => window.removeEventListener(e, resetIdle))
    }
  }, [shouldSkip, captured, resetIdle])

  // Trigger 2: mouse leaves viewport toward top (exit intent)
  useEffect(() => {
    if (shouldSkip || captured) return
    function onMouseLeave(e: MouseEvent) {
      if (e.clientY <= 30 && !hasEmail.current) setShowCapture(true)
    }
    document.addEventListener('mouseleave', onMouseLeave)
    return () => document.removeEventListener('mouseleave', onMouseLeave)
  }, [shouldSkip, captured])

  // Trigger 3: back button
  useEffect(() => {
    if (shouldSkip || captured || typeof window === 'undefined') return
    window.history.pushState(null, '', window.location.href)
    function onPopState() {
      if (!hasEmail.current) {
        setShowCapture(true)
        window.history.pushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [shouldSkip, captured])

  async function captureEmail(email: string, name?: string) {
    if (!email) return
    hasEmail.current = true
    setShowCapture(false)
    setCaptured(true)
    try {
      await fetch('/api/abandonment/capture', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          type: configRef.current.type,
          step: configRef.current.step,
          data: configRef.current.data,
        }),
      })
    } catch (err) {
      console.error('[abandonment]', err)
    }
  }

  return { showCapture, setShowCapture, captureEmail, captured }
}
