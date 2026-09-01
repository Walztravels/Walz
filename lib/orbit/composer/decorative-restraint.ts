/**
 * Walz Orbit — Decorative element restraint rules.
 *
 * Enforces per-template limits on decorative elements
 * and prevents placement in critical layout zones.
 *
 * Rules:
 *   - Never place decoratives over headline, CTA, or footer
 *   - Respect per-template max counts by category
 *   - Certain element types are forbidden for specific templates
 */

import type { DecorativeCategory, DecorativeElementInstance } from './decorative-elements'
import type { TemplateSafeZones } from './safe-zones'

// ── Restraint rule shape ───────────────────────────────────────────────────────

export interface TemplateDecorativeRestraint {
  /** Maximum total decorative elements on canvas */
  maxTotal:            number
  /** Per-category maximum counts */
  maxPerCategory:      Partial<Record<DecorativeCategory, number>>
  /** Element keys explicitly forbidden for this template */
  forbidden:           string[]
  /** Zones where decoratives must not appear */
  noOverlapZones:      Array<'headline' | 'cta' | 'footer' | 'logo' | 'text_zone'>
  /** Notes for the reviewer/designer */
  notes:               string
}

export interface DecorativeViolation {
  elementKey:    string
  rule:          string
  message:       string
  blocking:      boolean
}

// ── Per-template restraint definitions ────────────────────────────────────────

export const TEMPLATE_DECORATIVE_RESTRAINTS: Record<string, TemplateDecorativeRestraint> = {
  walz_hero_split: {
    maxTotal:       2,
    maxPerCategory: { travel: 1, seasonal: 0, financial: 1, map: 0, texture: 1 },
    forbidden:      ['christmas_ornaments', 'seasonal_lights', 'world_map'],
    noOverlapZones: ['headline', 'cta', 'footer', 'logo'],
    notes:          'One aircraft maximum. Optional crypto_coin or landmark at low scale. Never seasonal elements on Hero Split.',
  },

  walz_seasonal_campaign: {
    maxTotal:       1,
    maxPerCategory: { travel: 0, seasonal: 1, financial: 0, map: 0, texture: 1 },
    forbidden:      ['aircraft', 'travel_ticket', 'crypto_coin', 'world_map', 'route_line', 'luggage', 'passport'],
    noOverlapZones: ['headline', 'cta', 'footer', 'logo', 'text_zone'],
    notes:          'Seasonal campaigns are image-led. At most one seasonal accent (lights or ornaments) at very small scale and high in frame.',
  },

  walz_information_poster: {
    maxTotal:       0,
    maxPerCategory: {},
    forbidden:      ['aircraft', 'travel_ticket', 'luggage', 'passport', 'crypto_coin', 'world_map', 'route_line', 'clouds', 'seasonal_lights', 'christmas_ornaments', 'landmark_accent'],
    noOverlapZones: ['headline', 'cta', 'footer', 'logo', 'text_zone'],
    notes:          'Zero decorative elements for information/visa/immigration posters. The document aesthetic demands clean whitespace. Decoration undermines credibility.',
  },

  walz_destination_editorial: {
    maxTotal:       2,
    maxPerCategory: { travel: 1, seasonal: 0, financial: 0, map: 1, texture: 1 },
    forbidden:      ['crypto_coin', 'christmas_ornaments', 'seasonal_lights', 'travel_ticket', 'passport'],
    noOverlapZones: ['headline', 'cta', 'footer', 'logo'],
    notes:          'Editorial template allows a landmark accent and/or route_line as floating detail. Keep decoratives small (scale ≤0.15) and near the image, not over text.',
  },

  walz_travel_collage: {
    maxTotal:       2,
    maxPerCategory: { travel: 1, seasonal: 0, financial: 0, map: 1, texture: 1 },
    forbidden:      ['crypto_coin', 'christmas_ornaments', 'seasonal_lights', 'passport'],
    noOverlapZones: ['headline', 'cta', 'footer', 'logo'],
    notes:          'Collage is already visually rich from the destination images. One aircraft and/or one landmark is the limit. Never place aircraft over text column.',
  },
}

// ── Validation function ────────────────────────────────────────────────────────

/**
 * Check a list of decorative element instances against the template's restraint rules.
 * Returns an array of violations (empty if all rules pass).
 */
export function checkDecorativeRestraints(
  templateKey:  string,
  elements:     DecorativeElementInstance[],
  safeZones?:   TemplateSafeZones,
): DecorativeViolation[] {
  const rule = TEMPLATE_DECORATIVE_RESTRAINTS[templateKey]
  if (!rule) return []

  const violations: DecorativeViolation[] = []
  const visible = elements.filter(e => e.visible)

  // ── Max total ──
  if (visible.length > rule.maxTotal) {
    violations.push({
      elementKey: '_total',
      rule:       'max_total',
      message:    `Too many decoratives: ${visible.length} visible, max ${rule.maxTotal} for ${templateKey}.`,
      blocking:   rule.maxTotal === 0,
    })
  }

  // ── Forbidden elements ──
  for (const el of visible) {
    if (rule.forbidden.includes(el.elementKey)) {
      violations.push({
        elementKey: el.elementKey,
        rule:       'forbidden',
        message:    `"${el.elementKey}" is not allowed for template "${templateKey}".`,
        blocking:   true,
      })
    }
  }

  // ── Footer overlap ──
  if (safeZones && rule.noOverlapZones.includes('footer')) {
    const footerY = safeZones.footerZone.y
    for (const el of visible) {
      const elBottom = el.y + (el.scale ?? 0.1)
      if (elBottom > footerY) {
        violations.push({
          elementKey: el.elementKey,
          rule:       'no_overlap_footer',
          message:    `Decorative "${el.elementKey}" overlaps the footer zone (y=${el.y.toFixed(2)}).`,
          blocking:   false,
        })
      }
    }
  }

  // ── Headline / text zone overlap ──
  if (safeZones && (rule.noOverlapZones.includes('headline') || rule.noOverlapZones.includes('text_zone'))) {
    const tz = safeZones.textZone
    for (const el of visible) {
      const elR = el.x + (el.scale ?? 0.1)
      const elB = el.y + (el.scale ?? 0.1)
      const overlapX = el.x < tz.x + tz.width && elR > tz.x
      const overlapY = el.y < tz.y + tz.height && elB > tz.y
      if (overlapX && overlapY) {
        violations.push({
          elementKey: el.elementKey,
          rule:       'no_overlap_text_zone',
          message:    `Decorative "${el.elementKey}" overlaps the text zone — headline may be obscured.`,
          blocking:   false,
        })
      }
    }
  }

  return violations
}

/**
 * Returns a clean (violation-free) list of decoratives by removing
 * forbidden and over-limit elements. Does NOT move elements to avoid zone overlap.
 */
export function sanitiseDecoratives(
  templateKey: string,
  elements:    DecorativeElementInstance[],
): DecorativeElementInstance[] {
  const rule = TEMPLATE_DECORATIVE_RESTRAINTS[templateKey]
  if (!rule) return elements

  // Remove forbidden
  let clean = elements.filter(e => !rule.forbidden.includes(e.elementKey))

  // Remove excess (keep first maxTotal)
  const visible = clean.filter(e => e.visible)
  if (visible.length > rule.maxTotal) {
    let kept = 0
    clean = clean.map(e => {
      if (!e.visible) return e
      if (kept < rule.maxTotal) { kept++; return e }
      return { ...e, visible: false }
    })
  }

  return clean
}
