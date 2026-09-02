/**
 * Walz Orbit — Apply Reference Design Profile to a DesignComposition.
 *
 * Pure function — no AI, no network calls, no JSX.
 *
 * INVARIANT: This function only adjusts visual geometry (x, y, fontSize, visible).
 * It NEVER modifies text content. Staff commercial fields are always authoritative.
 *
 * Strength mapping:
 *   loose    — factor 0.15 — barely moves elements; inherits general mood
 *   balanced — factor 0.50 — matches zone order and density
 *   close    — factor 0.88 — closely reproduces layout proportions
 */

import type { DesignComposition, TextLayer, LogoLayer, RouteCardLayer } from '@/lib/orbit/composer/layer-model'
import type { DesignControls } from '@/lib/orbit/composer/design-controls'
import type { ReferenceDesignProfile, DesignMatchStrength } from './types'

const STRENGTH_FACTOR: Record<DesignMatchStrength, number> = {
  loose:    0.15,
  balanced: 0.50,
  close:    0.88,
}

/** Linear interpolation: move from `current` towards `target` by `factor`. */
function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

/** Map profile relativeSize to a concrete fontSize multiplier. */
function sizeMultiplier(size: 'small' | 'medium' | 'large' | 'display'): number {
  return { small: 0.80, medium: 1.0, large: 1.20, display: 1.40 }[size]
}

/**
 * Map a reference profile's subjectPosition to a DesignControls subjectPosition.
 * Reduces to the three-value set supported by DesignControls.
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

  const existingControls: Partial<DesignControls> = composition.controls ?? {}
  const newControls: DesignControls = {
    subjectPosition:     mapSubjectPosition(profile.subjectPosition),
    subjectScale:        profile.subjectScale === 'full' ? 'large' : (profile.subjectScale as DesignControls['subjectScale']),
    imageCrop:           existingControls.imageCrop ?? 'cover',
    backgroundIntensity: existingControls.backgroundIntensity ?? 'normal',
    overlayStrength:     existingControls.overlayStrength ?? 55,
    textAlignment:       profile.headline.alignment,
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
        // Adjust logo position based on profile
        if (profile.logoPosition !== 'none') {
          const parts = profile.logoPosition.split('_')
          const vPart = parts[0]
          const hPart = parts[1]
          const targetY = vPart === 'top' ? 0.04 : 0.93
          const targetX = hPart === 'left' ? 0.12 : hPart === 'right' ? 0.88 : 0.5
          l.y = lerp(l.y, targetY, f)
          l.x = lerp(l.x, targetX, f)
        }
        break
      }

      case 'headline': {
        const tl = l as TextLayer
        l.y = lerp(l.y, profile.headline.relativeY, f)
        ;(l as TextLayer).align = profile.headline.alignment
        // Adjust font size towards profile's relative size
        if (tl.fontSize) {
          const mult = sizeMultiplier(profile.headline.relativeSize)
          ;(l as TextLayer).fontSize = Math.round(lerp(tl.fontSize, tl.fontSize * mult, f))
        }
        break
      }

      case 'subheadline': {
        l.y      = lerp(l.y, profile.subheadline.relativeY, f)
        l.visible = strength === 'loose'
          ? l.visible
          : profile.subheadline.visible
        ;(l as TextLayer).align = profile.subheadline.alignment
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
        // Terms near the bottom — keep below CTA
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
