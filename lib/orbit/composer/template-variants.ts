/**
 * Walz Orbit — Template Variants.
 *
 * Super Admins can save polished designs as named template variants.
 * Variants store visual layout and style configuration only —
 * NEVER campaign-specific commercial values.
 *
 * Storage: Supabase `orbit_template_variants` table (separate from posterData).
 */

import type { DesignLayer } from './layer-model'
import type { DesignControls } from './design-controls'
import type { DecorativeElementInstance } from './decorative-elements'

export interface TemplateVariant {
  /** Slug, e.g. 'walz_hero_split_crypto' */
  key:                string
  /** Human label, e.g. 'Walz Hero Split — Crypto' */
  label:              string
  /** Base template this was derived from */
  baseTemplateKey:    string
  /** Visual controls — no commercial values stored here */
  controls:           DesignControls
  /** Per-layer style overrides (position, color, size — no text from commercial fields) */
  layerOverrides:     Record<string, Omit<Partial<DesignLayer>, 'text'>>
  /** Typography preset key */
  typographyPreset:   string
  /** Active decorative elements and their positions */
  decorativeElements: DecorativeElementInstance[]
  /** Created by (admin user ID) */
  createdBy:          string
  createdAt:          string   // ISO date
  updatedAt:          string
}

/**
 * Strip commercial values from a DesignComposition to produce a saveable variant.
 * Commercial fields (price, route, headline, cta, terms, currency) are never stored
 * in a template variant — they must come from staff at usage time.
 */
export function extractTemplateVariant(
  baseTemplateKey: string,
  variantKey:      string,
  variantLabel:    string,
  controls:        DesignControls,
  layerOverrides:  Record<string, Partial<DesignLayer>>,
  decoratives:     DecorativeElementInstance[],
  createdBy:       string,
): TemplateVariant {
  // Strip any text / commercial content from layer overrides
  const safeOverrides: Record<string, Omit<Partial<DesignLayer>, 'text'>> = {}
  for (const [id, override] of Object.entries(layerOverrides)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { text: _text, ...visualOnly } = override as DesignLayer & { text?: string }
    safeOverrides[id] = visualOnly
  }

  const now = new Date().toISOString()
  return {
    key:                variantKey,
    label:              variantLabel,
    baseTemplateKey,
    controls,
    layerOverrides:     safeOverrides,
    typographyPreset:   controls.typographyPreset,
    decorativeElements: decoratives,
    createdBy,
    createdAt:          now,
    updatedAt:          now,
  }
}

/**
 * Validate that a template variant does not contain commercial text.
 * Returns an array of violation descriptions (empty = clean).
 */
const COMMERCIAL_PATTERNS = [
  /\b\d{4,}\b/,                           // large numbers (prices)
  /NGN|USD|GBP|CAD|€|£|\$/,               // currencies
  /Lagos|London|Toronto|Dubai/i,           // route cities (naive check)
  /\bfrom\s+\d/i,                          // "From ₦..."
]

export function validateVariantIsCommercialFree(variant: TemplateVariant): string[] {
  const violations: string[] = []
  for (const [id, override] of Object.entries(variant.layerOverrides)) {
    const json = JSON.stringify(override)
    for (const pattern of COMMERCIAL_PATTERNS) {
      if (pattern.test(json)) {
        violations.push(`Layer "${id}" may contain commercial content matching ${pattern}`)
      }
    }
  }
  return violations
}
