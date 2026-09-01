/**
 * Walz Orbit — Safe zone model.
 *
 * Defines where subjects, text, logos, and footers live on a canvas.
 * Used to guide AI image generation prompts and to validate layer placement.
 *
 * All coordinates are 0–1 fractional.
 */

export interface SafeZone {
  x:      number   // left edge (0–1)
  y:      number   // top edge (0–1)
  width:  number   // width fraction
  height: number   // height fraction
}

export interface TemplateSafeZones {
  /** Where the photographic subject (person, destination) should be placed */
  subjectZone: SafeZone
  /** Where text overlays are drawn — should be clear of subject */
  textZone: SafeZone
  /** Where the Walz logo lives */
  logoZone: SafeZone
  /** Footer area — keep subject out of this zone */
  footerZone: SafeZone
  /** Safe margin around the whole canvas (guides) */
  margin: number   // fraction (e.g. 0.04 = 4%)
}

// ── Per-template default safe zones ──────────────────────────────────────────

export const HERO_SPLIT_SAFE_ZONES: TemplateSafeZones = {
  subjectZone: { x: 0.50, y: 0.10, width: 0.50, height: 0.75 },
  textZone:    { x: 0.02, y: 0.15, width: 0.48, height: 0.60 },
  logoZone:    { x: 0.02, y: 0.02, width: 0.30, height: 0.08 },
  footerZone:  { x: 0.00, y: 0.90, width: 1.00, height: 0.10 },
  margin:      0.04,
}

export const DESTINATION_EDITORIAL_SAFE_ZONES: TemplateSafeZones = {
  subjectZone: { x: 0.10, y: 0.08, width: 0.80, height: 0.50 },
  textZone:    { x: 0.05, y: 0.55, width: 0.90, height: 0.35 },
  logoZone:    { x: 0.35, y: 0.02, width: 0.30, height: 0.07 },
  footerZone:  { x: 0.00, y: 0.90, width: 1.00, height: 0.10 },
  margin:      0.04,
}

export const SEASONAL_CAMPAIGN_SAFE_ZONES: TemplateSafeZones = {
  subjectZone: { x: 0.15, y: 0.05, width: 0.70, height: 0.50 },
  textZone:    { x: 0.05, y: 0.10, width: 0.90, height: 0.40 },
  logoZone:    { x: 0.35, y: 0.02, width: 0.30, height: 0.07 },
  footerZone:  { x: 0.00, y: 0.90, width: 1.00, height: 0.10 },
  margin:      0.04,
}

export const INFORMATION_POSTER_SAFE_ZONES: TemplateSafeZones = {
  subjectZone: { x: 0.05, y: 0.05, width: 0.90, height: 0.35 },
  textZone:    { x: 0.04, y: 0.38, width: 0.92, height: 0.52 },
  logoZone:    { x: 0.35, y: 0.02, width: 0.30, height: 0.06 },
  footerZone:  { x: 0.00, y: 0.92, width: 1.00, height: 0.08 },
  margin:      0.04,
}

export const TRAVEL_COLLAGE_SAFE_ZONES: TemplateSafeZones = {
  subjectZone: { x: 0.05, y: 0.05, width: 0.90, height: 0.70 },
  textZone:    { x: 0.05, y: 0.70, width: 0.90, height: 0.22 },
  logoZone:    { x: 0.35, y: 0.02, width: 0.30, height: 0.07 },
  footerZone:  { x: 0.00, y: 0.92, width: 1.00, height: 0.08 },
  margin:      0.04,
}

export const TEMPLATE_SAFE_ZONES: Record<string, TemplateSafeZones> = {
  walz_hero_split:               HERO_SPLIT_SAFE_ZONES,
  walz_destination_editorial:    DESTINATION_EDITORIAL_SAFE_ZONES,
  walz_seasonal_campaign:        SEASONAL_CAMPAIGN_SAFE_ZONES,
  walz_information_poster:       INFORMATION_POSTER_SAFE_ZONES,
  walz_travel_collage:           TRAVEL_COLLAGE_SAFE_ZONES,
}

/**
 * Build safe zone prompt guidance for AI image generation.
 * Returns a string appended to the visual prompt.
 */
export function buildSafeZonePrompt(zones: TemplateSafeZones): string {
  const sz = zones.subjectZone
  const tz = zones.textZone

  const subjectSide = sz.x > 0.5 ? 'right side' : sz.x + sz.width < 0.5 ? 'left side' : 'center'
  const clearSide   = tz.x < 0.4 ? 'left area' : tz.x + tz.width > 0.6 ? 'right area' : 'lower area'

  return [
    `Place the main subject on the ${subjectSide} of the frame.`,
    `Leave clean negative space in the ${clearSide} for text overlays — no important content there.`,
    `Keep the bottom ${Math.round(zones.footerZone.height * 100)}% of the image subtle or blurred for the contact footer.`,
  ].join(' ')
}

/**
 * Check whether a layer (x, y, width, height all 0–1) overlaps the footer zone.
 */
export function layerOverlapsFooter(
  lx: number, ly: number, lw: number, lh: number,
  zones: TemplateSafeZones,
): boolean {
  const fz = zones.footerZone
  const lBottom = ly + (lh ?? 0)
  const fTop    = fz.y
  return lBottom > fTop && ly < fz.y + fz.height
}
