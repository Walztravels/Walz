'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

type ConsentState = {
  analytics: boolean
  marketing: boolean
  decided: boolean
}

const CONSENT_KEY = 'walz_cookie_consent'

export function getCookieConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    return stored ? JSON.parse(stored) : null
  } catch { return null }
}

export function setCookieConsent(consent: ConsentState) {
  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent))
  if (typeof window === 'undefined') return
  const w = window as any
  if (w.gtag) {
    w.gtag('consent', 'update', {
      analytics_storage:   consent.analytics  ? 'granted' : 'denied',
      ad_storage:          consent.marketing  ? 'granted' : 'denied',
      ad_user_data:        consent.marketing  ? 'granted' : 'denied',
      ad_personalization:  consent.marketing  ? 'granted' : 'denied',
    })
  }
  if (consent.marketing && w._walzInitFbPixel) {
    w._walzInitFbPixel()
  }
}

export default function CookieConsent() {
  const pathname = usePathname()
  const [visible,     setVisible]     = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [analytics,   setAnalytics]   = useState(true)
  const [marketing,   setMarketing]   = useState(true)

  // Never show on admin routes
  const isAdmin = pathname?.startsWith('/admin')

  useEffect(() => {
    if (isAdmin) return
    const consent = getCookieConsent()
    if (!consent?.decided) {
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [isAdmin])

  if (isAdmin || !visible) return null

  const acceptAll = () => {
    setCookieConsent({ analytics: true, marketing: true, decided: true })
    setVisible(false)
  }

  const rejectAll = () => {
    setCookieConsent({ analytics: false, marketing: false, decided: true })
    setVisible(false)
    document.cookie = '_ga=;    Max-Age=0; path=/; domain=.walztravels.com'
    document.cookie = '_ga_KJH17JHQST=; Max-Age=0; path=/; domain=.walztravels.com'
    document.cookie = '_fbp=;   Max-Age=0; path=/; domain=.walztravels.com'
  }

  const savePreferences = () => {
    setCookieConsent({ analytics, marketing, decided: true })
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-2xl md:bottom-4 md:left-4 md:right-auto md:max-w-md md:rounded-2xl md:border md:border-gray-200"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg" aria-hidden="true">🍪</span>
          <h2 className="font-semibold text-gray-900 text-sm">We use cookies</h2>
        </div>

        {/* Body */}
        <p className="text-xs text-gray-500 leading-relaxed mb-4">
          We use cookies to improve your experience, analyse site traffic, and show relevant content.
          You can choose which cookies to accept.{' '}
          <Link href="/privacy" className="text-amber-600 hover:underline">
            Privacy Policy
          </Link>
        </p>

        {/* Granular controls */}
        {showDetails && (
          <div className="mb-4 space-y-3 border border-gray-100 rounded-xl p-3 bg-gray-50">
            {/* Essential — always on */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-800">Essential</p>
                <p className="text-xs text-gray-400 mt-0.5">Login, security, payments</p>
              </div>
              <div
                aria-label="Essential cookies always enabled"
                className="w-8 h-4 bg-amber-400 rounded-full flex items-center justify-end pr-0.5 opacity-60 cursor-not-allowed"
              >
                <div className="w-3 h-3 bg-white rounded-full" />
              </div>
            </div>

            {/* Analytics */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-800">Analytics</p>
                <p className="text-xs text-gray-400 mt-0.5">Google Analytics — how you use the site</p>
              </div>
              <button
                onClick={() => setAnalytics(v => !v)}
                role="switch"
                aria-checked={analytics}
                aria-label="Toggle analytics cookies"
                className={`w-8 h-4 rounded-full flex items-center transition-colors duration-200 ${
                  analytics ? 'bg-amber-500 justify-end pr-0.5' : 'bg-gray-200 justify-start pl-0.5'
                }`}
              >
                <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
              </button>
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-800">Marketing</p>
                <p className="text-xs text-gray-400 mt-0.5">Facebook Pixel — personalised ads</p>
              </div>
              <button
                onClick={() => setMarketing(v => !v)}
                role="switch"
                aria-checked={marketing}
                aria-label="Toggle marketing cookies"
                className={`w-8 h-4 rounded-full flex items-center transition-colors duration-200 ${
                  marketing ? 'bg-amber-500 justify-end pr-0.5' : 'bg-gray-200 justify-start pl-0.5'
                }`}
              >
                <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={rejectAll}
              className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reject all
            </button>
            <button
              onClick={acceptAll}
              className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-colors"
            >
              Accept all
            </button>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowDetails(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
            >
              {showDetails ? 'Hide options' : 'Manage preferences'}
            </button>
            {showDetails && (
              <button
                onClick={savePreferences}
                className="text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
              >
                Save preferences →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
