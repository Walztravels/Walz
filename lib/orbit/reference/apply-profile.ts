/**
 * Walz Orbit — Apply Reference Design Profile to a DesignComposition.
 *
 * Pure function — no AI, no network calls, no JSX.
 *
 * INVARIANT: This function only adjusts visual geometry (x, y, fontSize, visible).
 * It NEVER modifies text content. Staff commercial fields are always authoritative.
 * It NEVER changes layer alignment or x-position in a way that could cause
 * canvas overflow. Alignment is determined by the template layout, not the reference.
 *
 * Strength mapping:
 *   loose    — factor 0.15 — barely moves elements; inherits general mood
 *   balanced — factor 0.50 — matches zone order and density
 *   close    — factor 0.88 — closely reproduces layout proportions
 */

import type { DesignComposition, TextLayer } from '@/lib/orbit/composer/layer-model'
import type { DesignControls } from '@/lib/orbit/composer/design-controls'
import type { ReferenceDesignProfile, DesignMatchStrength } from './types'

const STRENGTH_FACTOR: Record<DesignMatchStrength, number> = {
  loose:    0.15,
  balanced: 0.50,
  close:    0.88,
}

/** Linear interpolation: move from `current` towards `target` by `factor`, clamped to [0, 1]. */
function lerp(current: number, target: number, factor: number): number {
  return Math.max(0, Math.min(1, current + (target - current) * factor))
}

/** Map profile relativeSize to a concrete fontSize multiplier. */
function sizeMultiplier(size: 'small' | 'medium' | 'large' | 'display'): number {
  return { small: 0.80, medium: 1.0, large: 1.20, display: 1.40 }[size]
}

/**
 * Map a reference profile's subjectPosition to a DesignControls subjectPosition.
 */
function mapSubjectPosition(pos: ReferenceDesignProfile['subjectPosition']): DesignControls['subjectPosition'] {
  if (pos === 'left')  return 'left'
  if (pos === 'right') return 'right'
  return 'center'
}

/**
 * Map spacingDensity to contentDensity.
 */
function mapContentDensity(density: ReferenceDesignProfile['spacingDensity']): DesignControls['contentDensity'] {
  if (density === 'tight') return 'information_heavy'
  if (density === 'airy')  return 'minimal'
  return 'balanced'
}

/**
 * Map footer height to DesignControls footer.
 */
function mapFooter(height: ReferenceDesignProfile['footer']['height']): DesignControls['footer'] {
  return height  // values happen to match
}

/**
 * Apply a ReferenceDesignProfile to a DesignComposition.
 *
 * ALIGNMENT SAFETY RULE:
 *   This function does NOT override layer.align or controls.textAlignment.
 *   Alignment direction (left/center/right) is determined by the template's structural
 *   layout — changing it without also moving the anchor x would cause canvas overflow.
 *   The reference profile influences Y positions, font sizes, visibility, and density.
 *   It does NOT rewire the fundamental horizontal layout axis.
 *
 * All lerp results are clamped to [0, 1] before assignment.
 *
 * @param composition   Base composition from buildTemplateComposition()
 * @param profile       Extracted structural profile (no commercial data)
 * @param strength      How closely to match the reference layout
 * @returns             New composition with adjusted layer geometry
 */
export function applyReferenceDesignProfile(
  composition:  DesignComposition,
  profile:      ReferenceDesignProfile,
  strength:     DesignMatchStrength,
): DesignComposition {
  const f = STRENGTH_FACTOR[strength]

  // ── Update controls to reflect reference preferences ──────────────────────
  // NOTE: textAlignment is intentionally NOT overridden — it belongs to the template layout.

  const existingControls: Partial<DesignControls> = composition.controls ?? {}
  const newControls: DesignControls = {
    subjectPosition:     mapSubjectPosition(profile.subjectPosition),
    subjectScale:        profile.subjectScale === 'full' ? 'large' : (profile.subjectScale as DesignControls['subjectScale']),
    imageCrop:           existingControls.imageCrop ?? 'cover',
    backgroundIntensity: existingControls.backgroundIntensity ?? 'normal',
    overlayStrength:     existingControls.overlayStrength ?? 55,
    // SAFETY: textAlignment is inherited from existing controls, NOT overridden by reference.
    // Overriding this without adjusting layer.x would cause left/right-column layouts to clip.
    textAlignment:       existingControls.textAlignment ?? 'center',
    contentDensity:      mapContentDensity(profile.spacingDensity),
    footer:              mapFooter(profile.footer.height),
    typographyPreset:    existingControls.typographyPreset ?? 'campaign_heavy',
    showGuides:          existingControls.showGuides ?? false,
    accentColor:         existingControls.accentColor ?? '#d4af37',
    logoVariant:         existingControls.logoVariant,
    logoTreatment:       existingControls.logoTreatment,
    logoScale:           existingControls.logoScale,
    logoPosition:        existingControls.logoPosition,
  }

  // ── Patch layers ──────────────────────────────────────────────────────────

  const patchedLayers = composition.layers.map(layer => {
    const l = { ...layer }

    switch (l.id) {
      case 'logo': {
        // Adjust logo position based on profile — clamp to valid bounds
        if (profile.logoPosition !== 'none') {
          const parts  = profile.logoPosition.split('_')
          const vPart  = parts[0]
          const hPart  = parts[1]
          const targetY = vPart === 'top' ? 0.04 : 0.93
          const targetX = hPart === 'left' ? 0.12 : hPart === 'right' ? 0.88 : 0.5
          l.y = lerp(l.y, targetY, f)
          l.x = lerp(l.x, targetX, f)
        }
        break
      }

      case 'headline': {
        const tl = l as TextLayer
        // Y position: interpolate towards reference Y
        l.y = lerp(l.y, profile.headline.relativeY, f)
        // SAFETY: Do NOT change align — it is fixed by the template layout.
        // Changing align without adjusting x causes overflow in split/column layouts.
        // Font size: scale towards profile's relative size preference
        if (tl.fontSize) {
          const mult = sizeMultiplier(profile.headline.relativeSize)
          ;(l as TextLayer).fontSize = Math.round(lerp(tl.fontSize, tl.fontSize * mult, f))
        }
        break
      }

      case 'subheadline': {
        l.y = lerp(l.y, profile.subheadline.relativeY, f)
        l.visible = strength === 'loose'
          ? l.visible
          : profile.subheadline.visible
        // SAFETY: Do NOT change align here either.
        break
      }

      case 'route_card': {
        l.y = lerp(l.y, profile.routeLayout.relativeY, f)
        break
      }

      case 'cta': {
        l.y = lerp(l.y, profile.cta.relativeY, f)
        break
      }

      case 'terms': {
        // Keep terms below CTA — clamp to a reasonable minimum
        const termsTargetY = Math.max(profile.cta.relativeY + 0.07, 0.87)
        l.y = lerp(l.y, termsTargetY, f)
        break
      }

      default:
        break
    }

    return l
  })

  return {
    ...composition,
    controls: newControls,
    layers:   patchedLayers,
  }
}
