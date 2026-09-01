/**
 * Walz Orbit — One-click polish actions.
 *
 * Deterministic adjustments to DesignControls.
 * INVARIANT: No polish action may change commercial fields or AI-generated content.
 */

import type { DesignControls } from './design-controls'

export type PolishAction =
  | 'make_more_premium'
  | 'make_more_minimal'
  | 'increase_contrast'
  | 'improve_spacing'
  | 'emphasize_cta'
  | 'more_lifestyle'
  | 'more_corporate'
  | 'more_festive'

export interface PolishActionDef {
  key:         PolishAction
  label:       string
  icon:        string
  description: string
}

export const POLISH_ACTIONS: PolishActionDef[] = [
  { key: 'make_more_premium',  label: 'Make More Premium',   icon: '💎', description: 'Refines spacing, tightens typography, reduces clutter' },
  { key: 'make_more_minimal',  label: 'Make More Minimal',   icon: '⬜', description: 'Reduces content density, lightens overlay, compact footer' },
  { key: 'increase_contrast',  label: 'Increase Contrast',   icon: '🔆', description: 'Strengthens overlay, boosts text legibility' },
  { key: 'improve_spacing',    label: 'Improve Spacing',     icon: '↕️', description: 'Relaxes line height, balances content density' },
  { key: 'emphasize_cta',      label: 'Emphasize CTA',       icon: '🎯', description: 'Makes the call-to-action more prominent' },
  { key: 'more_lifestyle',     label: 'More Lifestyle',      icon: '🌅', description: 'Softer overlay, warmer feel, human-focused framing' },
  { key: 'more_corporate',     label: 'More Corporate',      icon: '🏢', description: 'Crisp typography, tighter overlay, clean information layout' },
  { key: 'more_festive',       label: 'More Festive',        icon: '🎉', description: 'Warmer palette, festive decorative mode, vibrant intensity' },
]

/**
 * Apply a polish action to the current design controls.
 * Returns a new controls object — never mutates the original.
 *
 * INVARIANT: Only visual layout properties are changed.
 * Commercial fields are never referenced here.
 */
export function applyPolishAction(
  controls: DesignControls,
  action: PolishAction,
): DesignControls {
  const c = { ...controls }

  switch (action) {
    case 'make_more_premium':
      c.typographyPreset    = 'luxury_modern'
      c.contentDensity      = 'minimal'
      c.overlayStrength     = Math.min(c.overlayStrength + 10, 80)
      c.backgroundIntensity = 'normal'
      c.footer              = 'compact'
      break

    case 'make_more_minimal':
      c.typographyPreset    = 'premium_minimal'
      c.contentDensity      = 'minimal'
      c.overlayStrength     = Math.max(c.overlayStrength - 15, 25)
      c.backgroundIntensity = 'soft'
      c.footer              = 'minimal'
      break

    case 'increase_contrast':
      c.overlayStrength     = Math.min(c.overlayStrength + 20, 90)
      c.backgroundIntensity = 'dramatic'
      break

    case 'improve_spacing':
      c.contentDensity      = 'balanced'
      c.typographyPreset    = c.typographyPreset === 'campaign_heavy' ? 'editorial_bold' : c.typographyPreset
      break

    case 'emphasize_cta':
      c.contentDensity      = 'balanced'
      c.overlayStrength     = Math.min(c.overlayStrength + 5, 75)
      break

    case 'more_lifestyle':
      c.backgroundIntensity = 'soft'
      c.overlayStrength     = Math.max(c.overlayStrength - 10, 30)
      c.subjectScale        = 'large'
      c.subjectPosition     = 'center'
      break

    case 'more_corporate':
      c.typographyPreset    = 'information_clean'
      c.contentDensity      = 'information_heavy'
      c.backgroundIntensity = 'normal'
      c.overlayStrength     = Math.min(c.overlayStrength + 8, 70)
      break

    case 'more_festive':
      c.backgroundIntensity = 'dramatic'
      c.contentDensity      = 'balanced'
      c.accentColor         = '#ff6b35'   // festive orange-red
      break
  }

  return c
}
