/**
 * Walz Orbit — Design quality scoring.
 *
 * Produces a 0–100 score across 7 categories.
 * Pure functions — no JSX, no AI, no commercial validation.
 */

import type { DesignComposition, TextLayer, LogoLayer, CTAButtonLayer } from './layer-model'
import type { QualityWarning } from './quality-checks'
import type { DesignControls } from './design-controls'
import type { TemplateSafeZones } from './safe-zones'
import { layerOverlapsFooter } from './safe-zones'

export interface QualityScores {
  brand:            number   // logo present, colors consistent
  typography:       number   // headline weight, size hierarchy
  spacing:          number   // content density, safe zones respected
  contrast:         number   // overlay strength, text legibility
  contentFit:       number   // headline filled, no missing required fields
  ctaVisibility:    number   // CTA present and prominent
  safeZone:         number   // layers within safe zones
}

export interface QualityScoreResult {
  total:    number
  scores:   QualityScores
  warnings: QualityWarning[]
}

const WEIGHTS: QualityScores = {
  brand:         15,
  typography:    15,
  spacing:       15,
  contrast:      15,
  contentFit:    20,
  ctaVisibility: 10,
  safeZone:      10,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function scoreBrand(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  const logo = composition.layers.find(l => l.id === 'logo')
  if (!logo || !logo.visible) {
    warnings.push({ field: 'logo', message: 'Logo is hidden — brand not visible.', blocking: false })
    return { score: 40, warnings }
  }
  return { score: 100, warnings }
}

function scoreTypography(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  const headline = composition.layers.find(l => l.id === 'headline') as TextLayer | undefined

  if (!headline || !headline.visible || !headline.text) {
    warnings.push({ field: 'headline', message: 'Headline is empty — required for any campaign.', blocking: true })
    return { score: 0, warnings }
  }

  let score = 100

  // Headline should have bold weight
  if (headline.fontWeight !== '800' && headline.fontWeight !== '700') {
    score -= 20
    warnings.push({ field: 'headline_weight', message: 'Headline weight is light — use 700 or 800 for impact.', blocking: false })
  }

  // Headline font size baseline check
  if (headline.fontSize < 28) {
    score -= 15
    warnings.push({ field: 'headline_size', message: 'Headline font size seems small — may be hard to read on mobile.', blocking: false })
  }

  return { score, warnings }
}

function scoreSpacing(
  composition: DesignComposition,
  controls?: DesignControls,
  safeZones?: TemplateSafeZones,
): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  let score = 100

  // Check content density vs layer count
  const visibleContentLayers = composition.layers.filter(l =>
    l.visible && !['bg_image', 'logo', 'contact_bar'].includes(l.id)
  ).length

  if (controls?.contentDensity === 'minimal' && visibleContentLayers > 4) {
    score -= 15
    warnings.push({ field: 'density', message: 'Density set to "Minimal" but many content layers are visible.', blocking: false })
  }

  // Check headline proximity to safe-area boundary
  if (safeZones) {
    const headline = composition.layers.find(l => l.id === 'headline')
    if (headline) {
      const textZoneBottom = safeZones.textZone.y + safeZones.textZone.height
      if (headline.y > textZoneBottom - 0.05) {
        score -= 10
        warnings.push({ field: 'headline_safe', message: 'Headline is close to the safe-area boundary.', blocking: false })
      }
    }
  }

  return { score, warnings }
}

function scoreContrast(
  composition: DesignComposition,
  controls?: DesignControls,
): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  let score = 100

  const hasImage = composition.layers.some(l => l.type === 'image' && l.visible)

  if (hasImage) {
    const overlay = controls?.overlayStrength ?? 55
    if (overlay < 30) {
      score -= 25
      warnings.push({ field: 'overlay', message: 'Overlay strength is very low — text may be illegible over the image.', blocking: false })
    } else if (overlay < 45) {
      score -= 10
      warnings.push({ field: 'overlay', message: 'Overlay strength is low — check text legibility on bright images.', blocking: false })
    }
  }

  return { score, warnings }
}

function scoreContentFit(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  let score = 100

  const fields = composition.commercialFields ?? {}

  if (!fields['headline']) {
    warnings.push({ field: 'headline', message: 'Headline is empty.', blocking: true })
    score -= 50
  }

  if (!composition.visualAssetId) {
    warnings.push({ field: 'visual', message: 'No background visual selected — image not generated yet.', blocking: false })
    score -= 20
  }

  return { score, warnings }
}

function scoreCTAVisibility(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  const cta = composition.layers.find(l => l.id === 'cta') as CTAButtonLayer | undefined

  if (!cta || !cta.visible || !cta.text) {
    warnings.push({ field: 'cta', message: 'No CTA button — consider adding a call to action.', blocking: false })
    return { score: 50, warnings }
  }

  return { score: 100, warnings }
}

function scoreSafeZone(
  composition: DesignComposition,
  safeZones?: TemplateSafeZones,
): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  if (!safeZones) return { score: 100, warnings }

  let score = 100
  const textLayers = composition.layers.filter(l =>
    ['text', 'logo', 'cta_button', 'route_card', 'price_block'].includes(l.type) && l.visible
  )

  for (const layer of textLayers) {
    if (layer.id === 'contact_bar') continue
    if (layerOverlapsFooter(layer.x, layer.y, layer.width ?? 0.1, layer.height ?? 0.05, safeZones)) {
      score = Math.max(0, score - 15)
      warnings.push({
        field: layer.id,
        message: `Layer "${layer.id}" overlaps the footer safe zone.`,
        blocking: false,
      })
    }
  }

  return { score, warnings }
}

// ── Main score function ───────────────────────────────────────────────────────

export function scoreComposition(
  composition: DesignComposition,
  controls?:   DesignControls,
  safeZones?:  TemplateSafeZones,
): QualityScoreResult {
  const brand      = scoreBrand(composition)
  const typography = scoreTypography(composition)
  const spacing    = scoreSpacing(composition, controls, safeZones)
  const contrast   = scoreContrast(composition, controls)
  const contentFit = scoreContentFit(composition)
  const ctaVis     = scoreCTAVisibility(composition)
  const safeZone   = scoreSafeZone(composition, safeZones)

  const scores: QualityScores = {
    brand:         clamp(brand.score, 0, 100),
    typography:    clamp(typography.score, 0, 100),
    spacing:       clamp(spacing.score, 0, 100),
    contrast:      clamp(contrast.score, 0, 100),
    contentFit:    clamp(contentFit.score, 0, 100),
    ctaVisibility: clamp(ctaVis.score, 0, 100),
    safeZone:      clamp(safeZone.score, 0, 100),
  }

  // Weighted total
  const total = Math.round(
    (scores.brand         * WEIGHTS.brand +
     scores.typography    * WEIGHTS.typography +
     scores.spacing       * WEIGHTS.spacing +
     scores.contrast      * WEIGHTS.contrast +
     scores.contentFit    * WEIGHTS.contentFit +
     scores.ctaVisibility * WEIGHTS.ctaVisibility +
     scores.safeZone      * WEIGHTS.safeZone)
    / 100
  )

  const warnings = [
    ...brand.warnings,
    ...typography.warnings,
    ...spacing.warnings,
    ...contrast.warnings,
    ...contentFit.warnings,
    ...ctaVis.warnings,
    ...safeZone.warnings,
  ]

  return { total, scores, warnings }
}

/** Colour band for UI display */
export function scoreColor(total: number): 'green' | 'yellow' | 'red' {
  if (total >= 75) return 'green'
  if (total >= 50) return 'yellow'
  return 'red'
}
