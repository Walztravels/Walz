/**
 * Walz Orbit — Reference Design Match Scorer.
 *
 * Computes a 0–100 structural match score between a DesignComposition
 * and a ReferenceDesignProfile.
 *
 * ONLY scores structural characteristics:
 *   layout · hierarchy · spacing · image placement · card arrangement
 *   CTA prominence · footer structure
 *
 * NEVER scores commercial text content.
 * Pure function — no AI, no network, no JSX.
 */

import type { DesignComposition } from '@/lib/orbit/composer/layer-model'
import type { RouteCardLayer, TextLayer, CTAButtonLayer } from '@/lib/orbit/composer/layer-model'
import type { ReferenceDesignProfile } from './types'

export interface ReferenceMatchScoreDetail {
  total:      number    // 0–100 overall
  dimensions: {
    headlinePosition:  number   // 0–100
    ctaPosition:       number   // 0–100
    routeCardCount:    number   // 0–100
    logoPosition:      number   // 0–100
    subheadlineMatch:  number   // 0–100
    contentDensity:    number   // 0–100
    footerPresence:    number   // 0–100
  }
}

/** Convert a positional difference (0–1) to a 0–100 score. */
function positionScore(actual: number, target: number): number {
  const diff = Math.abs(actual - target)
  // ±0.05 → 100, ±0.15 → 50, ±0.30 → 0
  return Math.max(0, Math.round(100 - diff * 333))
}

/**
 * Compute how structurally similar a DesignComposition is to a reference profile.
 *
 * @param composition  The current poster composition
 * @param profile      The reference poster's structural profile
 */
export function scoreReferenceMatch(
  composition: DesignComposition,
  profile:     ReferenceDesignProfile,
): ReferenceMatchScoreDetail {
  const layers = composition.layers

  // 1. Headline vertical position
  const headline = layers.find(l => l.id === 'headline')
  const headlinePosition = headline
    ? positionScore(headline.y, profile.headline.relativeY)
    : 0

  // 2. CTA vertical position
  const cta = layers.find(l => l.id === 'cta')
  const ctaPosition = cta
    ? positionScore(cta.y, profile.cta.relativeY)
    : (profile.cta.prominence === 'subtle' ? 80 : 0)

  // 3. Route card count match
  const routeCard = layers.find(l => l.type === 'route_card') as RouteCardLayer | undefined
  let routeCardCount = 0
  if (routeCard && routeCard.visible) {
    const countDiff = Math.abs(routeCard.routes.length - profile.routeLayout.count)
    routeCardCount = Math.max(0, 100 - countDiff * 25)
  } else if (profile.routeLayout.count === 0) {
    routeCardCount = 100
  } else {
    routeCardCount = 0
  }

  // 4. Logo position match
  const logo = layers.find(l => l.id === 'logo')
  let logoPosition = 50  // neutral when logo position is uncertain
  if (logo && logo.visible && profile.logoPosition !== 'none') {
    const expectedY = profile.logoPosition.startsWith('top') ? 0.05 : 0.92
    logoPosition = positionScore(logo.y, expectedY)
  } else if (!logo && profile.logoPosition === 'none') {
    logoPosition = 100
  }

  // 5. Subheadline visibility match
  const subheadline = layers.find(l => l.id === 'subheadline')
  const subheadlineMatch = subheadline
    ? (subheadline.visible === profile.subheadline.visible ? 100 : 30)
    : (profile.subheadline.visible ? 0 : 100)

  // 6. Content density match (visible non-background layers vs profile spacing)
  const visibleContent = layers.filter(l =>
    l.visible && !['bg_image', 'logo'].includes(l.id)
  ).length
  const expectedDense  = profile.spacingDensity === 'tight'  // many layers
  const expectedAiry   = profile.spacingDensity === 'airy'   // few layers
  let contentDensity = 70  // neutral
  if (expectedDense && visibleContent >= 5) contentDensity = 100
  if (expectedDense && visibleContent <= 3) contentDensity = 30
  if (expectedAiry  && visibleContent <= 3) contentDensity = 100
  if (expectedAiry  && visibleContent >= 5) contentDensity = 30
  if (!expectedDense && !expectedAiry && visibleContent >= 3 && visibleContent <= 5) contentDensity = 100

  // 7. Footer presence / style match
  const contactBar = layers.find(l => l.id === 'contact_bar' || l.id === 'contact')
  let footerPresence = 70
  if (profile.footer.height === 'minimal' && !contactBar) footerPresence = 100
  if (profile.footer.height !== 'minimal' && contactBar?.visible) footerPresence = 100
  if (profile.footer.height !== 'minimal' && !contactBar)         footerPresence = 30

  // ── Weighted total ────────────────────────────────────────────────────────

  const WEIGHTS = {
    headlinePosition: 0.25,
    ctaPosition:      0.18,
    routeCardCount:   0.20,
    logoPosition:     0.10,
    subheadlineMatch: 0.10,
    contentDensity:   0.10,
    footerPresence:   0.07,
  }

  const dimensions = {
    headlinePosition,
    ctaPosition,
    routeCardCount,
    logoPosition,
    subheadlineMatch,
    contentDensity,
    footerPresence,
  }

  const total = Math.round(
    Object.entries(dimensions).reduce((sum, [key, val]) => {
      return sum + val * WEIGHTS[key as keyof typeof WEIGHTS]
    }, 0)
  )

  return { total, dimensions }
}
