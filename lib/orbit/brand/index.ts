/**
 * Walz Orbit — Brand Asset System
 *
 * Types, logo variant resolution, and background brightness estimation.
 * Pure functions — no JSX, no AI, no Canvas side-effects.
 *
 * INVARIANT: AI must NEVER be asked to generate, spell, redraw, or recreate
 * the Walz Travels logo. Uploaded logo images are the source of truth.
 */

// ── Logo variant types ────────────────────────────────────────────────────────

export type LogoVariant = 'PRIMARY' | 'LIGHT' | 'DARK' | 'MONOCHROME' | 'ICON'

export type LogoTreatment =
  | 'NONE'
  | 'SHADOW'
  | 'GLOW'
  | 'DARK_PLATE'
  | 'LIGHT_PLATE'
  | 'GLASS'

export const LOGO_VARIANTS: LogoVariant[] = ['PRIMARY', 'LIGHT', 'DARK', 'MONOCHROME', 'ICON']

export const LOGO_TREATMENTS: LogoTreatment[] = [
  'NONE', 'SHADOW', 'GLOW', 'DARK_PLATE', 'LIGHT_PLATE', 'GLASS',
]

export const LOGO_VARIANT_LABELS: Record<LogoVariant, string> = {
  PRIMARY:    'Primary (colour)',
  LIGHT:      'Light (white/light)',
  DARK:       'Dark (black/dark)',
  MONOCHROME: 'Monochrome',
  ICON:       'Icon only',
}

export const LOGO_TREATMENT_LABELS: Record<LogoTreatment, string> = {
  NONE:        'None',
  SHADOW:      'Drop Shadow',
  GLOW:        'Soft Glow',
  DARK_PLATE:  'Dark Plate',
  LIGHT_PLATE: 'Light Plate',
  GLASS:       'Glass',
}

// ── Brand asset types ─────────────────────────────────────────────────────────

export interface WalzBrandAsset {
  id:        string
  variant:   LogoVariant
  publicUrl: string
  mimeType:  string
  width?:    number
  height?:   number
  createdAt: string
}

export type WalzBrandAssets = Partial<Record<LogoVariant, WalzBrandAsset>>

// ── Logo variant resolution ───────────────────────────────────────────────────

/**
 * Select the best logo variant for a given background brightness.
 *
 * @param bgBrightness 0–1 where 0 = black, 1 = white
 * @param assets       Available uploaded logo assets
 * @param preferred    Optional explicit variant override ('AUTO' means auto-select)
 * @returns The best matching variant key, or null if no assets are available
 */
export function resolveLogoVariant(
  bgBrightness: number,
  assets: WalzBrandAssets,
  preferred?: LogoVariant | 'AUTO' | null,
): LogoVariant | null {
  const available = Object.keys(assets) as LogoVariant[]
  if (available.length === 0) return null

  // Explicit override (not AUTO)
  if (preferred && preferred !== 'AUTO' && assets[preferred]) return preferred

  // AUTO selection by background brightness
  if (bgBrightness < 0.38) {
    // Dark background — LIGHT → MONOCHROME → PRIMARY → DARK → ICON
    for (const v of ['LIGHT', 'MONOCHROME', 'PRIMARY', 'DARK', 'ICON'] as LogoVariant[]) {
      if (assets[v]) return v
    }
  } else if (bgBrightness > 0.62) {
    // Light background — PRIMARY → DARK → MONOCHROME → LIGHT → ICON
    for (const v of ['PRIMARY', 'DARK', 'MONOCHROME', 'LIGHT', 'ICON'] as LogoVariant[]) {
      if (assets[v]) return v
    }
  } else {
    // Mid-range / complex photo — PRIMARY → DARK → MONOCHROME → LIGHT → ICON
    for (const v of ['PRIMARY', 'DARK', 'MONOCHROME', 'LIGHT', 'ICON'] as LogoVariant[]) {
      if (assets[v]) return v
    }
  }

  // Fall back to first available
  return available[0]
}

/**
 * Estimate background brightness from design controls and composition context.
 *
 * Canvas-pixel analysis is unavailable on the server/during composition build,
 * so this estimates from the overlay strength setting, which is the primary
 * determinant of perceived background darkness in Orbit designs.
 *
 * @param overlayStrength 0–100 from DesignControls
 * @param bgDominantColor Optional CSS hex color hint from template metadata
 * @returns Estimated brightness 0–1 (0 = very dark, 1 = very bright)
 */
export function analyzeBackgroundBrightness(
  overlayStrength: number,
  bgDominantColor?: string,
): number {
  // High overlay → poster will be dark → brightness is low
  // overlayStrength maps 0→0.9 and 100→0.1 (heavy overlay makes it dark)
  const overlayBrightness = 1 - (overlayStrength / 100) * 0.8

  if (!bgDominantColor || !bgDominantColor.startsWith('#')) {
    return overlayBrightness
  }

  // Blend with background color hint if available
  const r = parseInt(bgDominantColor.slice(1, 3), 16) / 255
  const g = parseInt(bgDominantColor.slice(3, 5), 16) / 255
  const b = parseInt(bgDominantColor.slice(5, 7), 16) / 255
  const colorBrightness = 0.299 * r + 0.587 * g + 0.114 * b

  return overlayBrightness * 0.7 + colorBrightness * 0.3
}

/**
 * Auto-select a logo treatment based on background brightness and overlay level.
 * This is the default used when DesignControls.logoTreatment = 'AUTO'.
 */
export function resolveLogoTreatment(
  bgBrightness: number,
  overlayStrength: number,
): LogoTreatment {
  // Very high overlay → dark background → glow works well, shadow is subtle
  if (overlayStrength >= 65) return 'SHADOW'
  // Low overlay → image is prominent → plate keeps logo readable
  if (overlayStrength < 30) {
    return bgBrightness > 0.5 ? 'DARK_PLATE' : 'LIGHT_PLATE'
  }
  // Mid overlay → glass is a clean compromise
  if (overlayStrength < 45) return 'GLASS'
  return 'SHADOW'
}
