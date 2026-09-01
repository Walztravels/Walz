/**
 * Walz Orbit — Design Variations A / B / C.
 *
 * Generates three layout/visual variants from the same commercial fields.
 * INVARIANT: All commercial facts (price, route, headline, CTA, terms)
 * remain identical across all variations. Only visual treatment changes.
 */

import type { DesignComposition, DesignLayer } from './layer-model'
import type { DesignControls } from './design-controls'

export type VariantFocus = 'human_focused' | 'destination_focused' | 'typography_focused'

export interface DesignVariation {
  key:                 'A' | 'B' | 'C'
  focus:               VariantFocus
  label:               string
  description:         string
  visualMoodModifier:  string
  controlsOverride:    Partial<DesignControls>
  layerOverrides:      Record<string, Partial<DesignLayer>>
}

export const DESIGN_VARIATIONS: DesignVariation[] = [
  {
    key:                'A',
    focus:              'human_focused',
    label:              'Variation A — Human Focused',
    description:        'Emphasis on people: travellers, families, lifestyle moments. Subject prominent and warm.',
    visualMoodModifier: 'lifestyle, warm and welcoming, candid travellers, authentic moments',
    controlsOverride: {
      subjectPosition:     'center',
      subjectScale:        'large',
      backgroundIntensity: 'soft',
      overlayStrength:     45,
      contentDensity:      'balanced',
    },
    layerOverrides: {},
  },
  {
    key:                'B',
    focus:              'destination_focused',
    label:              'Variation B — Destination Focused',
    description:        'Emphasis on the destination: landmarks, skylines, landscapes. Cinematic and aspirational.',
    visualMoodModifier: 'cinematic destination, dramatic landscape, iconic skyline, aspirational',
    controlsOverride: {
      subjectPosition:     'center',
      subjectScale:        'medium',
      backgroundIntensity: 'dramatic',
      overlayStrength:     60,
      contentDensity:      'minimal',
    },
    layerOverrides: {},
  },
  {
    key:                'C',
    focus:              'typography_focused',
    label:              'Variation C — Typography Focused',
    description:        'Text-forward design. Subtle, blurred, or abstract background — headline is the hero.',
    visualMoodModifier: 'abstract, blurred bokeh, subtle gradient, minimal distraction, color wash',
    controlsOverride: {
      subjectPosition:     'center',
      subjectScale:        'small',
      backgroundIntensity: 'soft',
      overlayStrength:     70,
      contentDensity:      'balanced',
      typographyPreset:    'editorial_bold',
    },
    layerOverrides: {},
  },
]

/**
 * Build a visual mood modifier string to append to the AI generation prompt.
 * This adjusts the image tone WITHOUT passing any commercial values.
 */
export function buildVariationPromptModifier(variation: DesignVariation): string {
  return `[Variation ${variation.key} — ${variation.focus.replace(/_/g, ' ')}] ${variation.visualMoodModifier}.`
}

/**
 * Merge variation controls onto base controls.
 * Returns a new controls object — does not mutate.
 */
export function applyVariationControls(
  base: DesignControls,
  variation: DesignVariation,
): DesignControls {
  return { ...base, ...variation.controlsOverride }
}

/**
 * Guard: verify a composition preserves commercial fields across a variation.
 * Returns true if all commercial values match the original.
 */
export function variationPreservesCommercialFields(
  original: DesignComposition,
  varied:   DesignComposition,
): boolean {
  const orig = original.commercialFields ?? {}
  const vary = varied.commercialFields ?? {}
  return Object.keys(orig).every(k => orig[k] === vary[k])
}
