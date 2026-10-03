'use client'

// app/partners/TrackedLink.tsx — Walz Business (Track C: /partners → Business
// handoff)
//
// Thin presentational wrapper so /partners/page.tsx can stay a plain server
// component (required for its `export const metadata`) while its CTAs still
// fire a GA4 event on click. Uses the EXISTING lib/analytics.ts helpers
// (trackEvent, trackWhatsApp, trackLeadForm) — no new analytics subsystem.
// Internal (same-origin, `/`-prefixed) hrefs render as next/link `Link` for
// normal client-side navigation + prefetch; anything else (mailto:, wa.me,
// etc.) renders as a plain anchor.

import Link from 'next/link'
import { trackEvent } from '@/lib/analytics'

type Props = {
  href: string
  children: React.ReactNode
  className?: string
  ariaLabel?: string
  /** GA4 event action, e.g. 'partner_cta_click' */
  eventAction: string
  /** GA4 event category, e.g. 'partners_page' */
  eventCategory: string
  /** GA4 event label, e.g. the partner type or CTA name */
  eventLabel: string
  /** External link (mailto:, wa.me, etc.) opens in a new tab with rel safety */
  external?: boolean
}

export function TrackedLink({
  href,
  children,
  className,
  ariaLabel,
  eventAction,
  eventCategory,
  eventLabel,
  external = false,
}: Props) {
  const handleClick = () => trackEvent(eventAction, eventCategory, eventLabel)

  if (external || !href.startsWith('/')) {
    return (
      <a
        href={href}
        target={href.startsWith('mailto:') ? undefined : '_blank'}
        rel={href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
        onClick={handleClick}
        className={className}
        aria-label={ariaLabel}
      >
        {children}
      </a>
    )
  }

  return (
    <Link href={href} onClick={handleClick} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}
