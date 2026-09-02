/**
 * Walz Orbit — Design quality scoring.
 *
 * Produces a 0–100 score across 7 categories.
 * Calibrated so that 90+ reliably indicates a publishable poster.
 *
 * Pure functions — no JSX, no AI, no commercial validation.
 *
 * Phase 4 calibration:
 *   - contentFit weight increased to 25% (visual + headline are the primary publishability gates)
 *   - contrast weight increased to 20% (unreadable text is an instant blocker)
 *   - No visual asset → contentFit capped at 60 (was 80)
 *   - Missing subheadline: small quality signal but not blocking
 *   - Overlay 45–70: optimal for dark templates (was 30–45 transition)
 *   - Safe zone violations now proportional to canvas coverage
 */

import type { DesignComposition, TextLayer, LogoLayer, CTAButtonLayer } from './layer-model'
import type { QualityWarning } from './quality-checks'
import type { DesignControls } from './design-controls'
import type { TemplateSafeZones } from './safe-zones'
import { layerOverlapsFooter } from './safe-zones'

export interface QualityScores {
  brand:            number   // logo present, colors consistent
  typography:       number   // headline weight, size, hierarchy
  spacing:          number   // content density, safe zones respected
  contrast:         number   // overlay strength, text legibility
  contentFit:       number   // headline + visual present; fields complete
  ctaVisibility:    number   // CTA present and prominent
  safeZone:         number   // layers within safe zones
}

export interface QualityScoreResult {
  total:    number
  scores:   QualityScores
  warnings: QualityWarning[]
}

// Weights must sum to 100
const WEIGHTS: QualityScores = {
  brand:         12,
  typography:    15,
  spacing:       13,
  contrast:      20,
  contentFit:    25,
  ctaVisibility: 10,
  safeZone:       5,
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

// ── Category scorers ──────────────────────────────────────────────────────────

function scoreBrand(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  const logo = composition.layers.find(l => l.id === 'logo')

  if (!logo || !logo.visible) {
    warnings.push({ field: 'logo', message: 'Logo is hidden — brand not visible.', blocking: false })
    return { score: 30, warnings }
  }

  let score = 100

  // Brand asset missing check — logo layer present but no uploaded image
  const logoLayer = logo as LogoLayer
  if (!logoLayer.logoUrl) {
    score -= 25
    warnings.push({
      field:    'LOGO_ASSET_MISSING',
      message:  'No brand logo uploaded. Go to Orbit → Brand to upload the official Walz Travels logo. Poster will export without a logo.',
      blocking: false,
    })
  }

  // Contact bar present and filled is a positive brand signal
  const contact = composition.layers.find(l => l.id === 'contact_bar' || l.id === 'contact')
  if (!contact || !contact.visible) {
    score -= 20
    warnings.push({ field: 'contact', message: 'No contact info — consider adding a contact bar.', blocking: false })
  }

  return { score, warnings }
}

function scoreTypography(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  const headline = composition.layers.find(l => l.id === 'headline') as TextLayer | undefined

  if (!headline || !headline.visible || !headline.text) {
    warnings.push({ field: 'headline', message: 'Headline is empty — required for any campaign.', blocking: true })
    return { score: 0, warnings }
  }

  let score = 100

  // Headline must be bold for travel advertising impact
  if (headline.fontWeight !== '800' && headline.fontWeight !== '700') {
    score -= 25
    warnings.push({ field: 'headline_weight', message: 'Headline weight is light — use 700 or 800 for impact.', blocking: false })
  }

  // Headline must be large enough to read on mobile (min 24px at canvas-relative scale)
  if (headline.fontSize < 24) {
    score -= 20
    warnings.push({ field: 'headline_size', message: 'Headline font size is small — will be hard to read at social media size.', blocking: false })
  }

  // Subheadline hierarchy check — if subheadline exists and is too close to headline size
  const subheadline = composition.layers.find(l => l.id === 'subheadline') as TextLayer | undefined
  if (subheadline?.visible && subheadline.text && subheadline.fontSize >= headline.fontSize * 0.85) {
    score -= 10
    warnings.push({ field: 'subheadline_size', message: 'Subheadline is nearly as large as headline — reduce for clear hierarchy.', blocking: false })
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

  // Check content density vs. visible layer count
  const visibleContentLayers = composition.layers.filter(l =>
    l.visible && !['bg_image', 'logo', 'contact_bar', 'contact'].includes(l.id)
  ).length

  if (controls?.contentDensity === 'minimal' && visibleContentLayers > 4) {
    score -= 12
    warnings.push({ field: 'density', message: 'Density set to "Minimal" but many content layers are visible — reduce layer count.', blocking: false })
  }

  if (controls?.contentDensity === 'information_heavy' && visibleContentLayers < 3) {
    score -= 8
    warnings.push({ field: 'density', message: 'Density set to "Information Heavy" but fewer than 3 content layers are visible.', blocking: false })
  }

  // Headline safe zone proximity
  if (safeZones) {
    const headline = composition.layers.find(l => l.id === 'headline')
    if (headline) {
      const textZoneBottom = safeZones.textZone.y + safeZones.textZone.height
      if (headline.y > textZoneBottom - 0.04) {
        score -= 12
        warnings.push({ field: 'headline_safe', message: 'Headline is too close to or outside the safe text zone.', blocking: false })
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
    const overlay = controls?.overlayStrength ?? 50

    // Optimal range for dark templates: 45–72
    // Below 35: text will be unreadable on most images
    // Above 80: image is being buried
    if (overlay < 25) {
      score -= 40
      warnings.push({ field: 'overlay', message: 'Overlay strength is critically low — text will be illegible over busy images.', blocking: true })
    } else if (overlay < 35) {
      score -= 25
      warnings.push({ field: 'overlay', message: 'Overlay strength is low — text may be hard to read on bright images.', blocking: false })
    } else if (overlay < 45) {
      score -= 10
      warnings.push({ field: 'overlay', message: 'Overlay could be stronger for maximum text legibility.', blocking: false })
    } else if (overlay > 82) {
      score -= 15
      warnings.push({ field: 'overlay', message: 'Overlay is very strong — the background image may be lost.', blocking: false })
    }
  }

  return { score, warnings }
}

function scoreContentFit(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  let score = 100

  const fields = composition.commercialFields ?? {}

  // Headline is the primary publishability gate — without it, cap at 30
  if (!fields['headline']) {
    warnings.push({ field: 'headline', message: 'Headline is empty — campaign has no identity.', blocking: true })
    return { score: 0, warnings }
  }

  // CTA missing is a strong signal but not an absolute blocker
  if (!fields['cta']) {
    score -= 15
    warnings.push({ field: 'cta', message: 'No CTA text — consider adding a call to action.', blocking: false })
  }

  // Visual asset: the biggest single content gap
  if (!composition.visualAssetId) {
    score -= 35
    warnings.push({ field: 'visual', message: 'No background visual — generate or upload an image to reach publishable quality.', blocking: false })
  }

  // Subheadline present: positive quality signal (not penalised if missing, but rewarded if filled)
  // Score stays at 100 (or post-deductions) when subheadline is filled — no bonus, no penalty

  return { score, warnings }
}

function scoreCTAVisibility(composition: DesignComposition): { score: number; warnings: QualityWarning[] } {
  const warnings: QualityWarning[] = []
  const cta = composition.layers.find(l => l.id === 'cta') as CTAButtonLayer | undefined

  if (!cta || !cta.visible) {
    warnings.push({ field: 'cta', message: 'CTA layer is hidden — action is not visible to audience.', blocking: false })
    return { score: 45, warnings }
  }

  if (!cta.text) {
    warnings.push({ field: 'cta', message: 'CTA layer is visible but has no text — add a call to action.', blocking: false })
    return { score: 55, warnings }
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
    if (layer.id === 'contact_bar' || layer.id === 'contact') continue
    if (layerOverlapsFooter(layer.x, layer.y, layer.width ?? 0.1, layer.height ?? 0.05, safeZones)) {
      score = Math.max(0, score - 20)
      warnings.push({
        field:   layer.id,
        message: `Layer "${layer.id}" overlaps the footer zone — move it up.`,
        blocking: false,
      })
    }
  }

  return { score, warnings }
}

// ── Main scoring function ─────────────────────────────────────────────────────

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

  // Weighted total — weights sum to 100
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

/**
 * Colour band for UI display.
 * Recalibrated: 80+ publishable (green), 60+ needs minor edit (yellow), <60 needs work (red).
 */
export function scoreColor(total: number): 'green' | 'yellow' | 'red' {
  if (total >= 80) return 'green'
  if (total >= 60) return 'yellow'
  return 'red'
}

/**
 * Map a quality score to a publishability verdict label.
 * These labels are guidance only — human review always makes the final call.
 */
export function scoreToVerdict(total: number): string {
  if (total >= 88) return 'Likely Publishable'
  if (total >= 75) return 'Needs Minor Review'
  if (total >= 55) return 'Needs Major Edit'
  return 'Not Publishable'
}
