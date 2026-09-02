/**
 * Walz Orbit — Reference Design Matching types.
 *
 * Pure type declarations. No JSX, no AI, no side effects.
 *
 * COMMERCIAL FIREWALL INVARIANT:
 *   ReferenceDesignProfile MUST NEVER contain prices, routes, phone numbers,
 *   email addresses, program names, visa terms, or any other commercial data.
 *   It describes ONLY visual structure: positions, proportions, palette, density.
 */

// ── Reference mode ────────────────────────────────────────────────────────────

/**
 * Controls what the reference image is used for.
 *
 * visual_style  — reference guides AI artwork generation only
 * design_layout — reference guides deterministic poster composition only
 * both          — reference guides both artwork and composition
 */
export type ReferenceMode = 'visual_style' | 'design_layout' | 'both'

/**
 * How closely the composition should match the reference profile.
 *
 * loose    — inherit general mood and rough composition zone
 * balanced — match hierarchy, zone positions, and density
 * close    — reproduce layout proportions, spacing, and visual hierarchy
 *            using Walz branding and original staff content
 */
export type DesignMatchStrength = 'loose' | 'balanced' | 'close'

// ── Structured routes ─────────────────────────────────────────────────────────

export interface StructuredRoute {
  from: string
  to:   string
}

/**
 * Convert structured routes to the delimited string format expected by
 * buildRouteCardLayer(). Returns empty string when no valid routes.
 */
export function structuredRoutesToString(routes: StructuredRoute[]): string {
  return routes
    .filter(r => r.from.trim() && r.to.trim())
    .map(r => `${r.from.trim()} → ${r.to.trim()}`)
    .join(' • ')
}

// ── Reference Design Profile ──────────────────────────────────────────────────

/**
 * Structural description of a reference poster's visual layout.
 *
 * All values describe HOW content is arranged — never WHAT the content says.
 * Commercial text (prices, routes, numbers, names) must never appear here.
 */
export interface ReferenceDesignProfile {
  // ── Layout ─────────────────────────────────────────────────────────────────
  layoutFamily: (
    | 'split_horizontal'   // image left/right, text on the other side
    | 'split_vertical'     // image top/bottom, text on the other side
    | 'overlay_centered'   // image full-bleed with centered text overlay
    | 'overlay_bottom'     // image full-bleed, text block at bottom
    | 'full_bleed'         // image fills entire canvas
    | 'grid'               // multi-panel / grid arrangement
    | 'asymmetric'         // complex asymmetric layout
  )
  backgroundMode: 'photography' | 'illustration' | 'gradient' | 'solid' | 'pattern'

  // ── Subject (main photographic element) ──────────────────────────────────
  subjectPosition: 'left' | 'right' | 'center' | 'top' | 'bottom' | 'full'
  subjectScale:    'small' | 'medium' | 'large' | 'full'
  imageCoverage:   number   // 0–1: fraction of canvas the image occupies

  // ── Logo zone ─────────────────────────────────────────────────────────────
  logoPosition: (
    | 'top_left' | 'top_center' | 'top_right'
    | 'bottom_left' | 'bottom_center' | 'bottom_right'
    | 'none'
  )
  logoScale: 'small' | 'standard' | 'prominent'

  // ── Headline ──────────────────────────────────────────────────────────────
  headline: {
    relativeY:     number   // 0–1 from top
    alignment:     'left' | 'center' | 'right'
    width:         'narrow' | 'medium' | 'wide' | 'full'
    relativeSize:  'small' | 'medium' | 'large' | 'display'
    lineCount:     number   // 1–4
    accentPattern: 'none' | 'underline' | 'highlight' | 'color_split' | 'weight_split'
  }

  // ── Subheadline ───────────────────────────────────────────────────────────
  subheadline: {
    relativeY:    number
    alignment:    'left' | 'center' | 'right'
    relativeSize: 'small' | 'medium' | 'large'
    visible:      boolean
  }

  // ── Route / destination card arrangement ──────────────────────────────────
  routeLayout: {
    count:       number   // 0–4
    orientation: 'horizontal' | 'vertical' | 'grid'
    cardStyle:   'pill' | 'card' | 'text' | 'badge'
    relativeY:   number
    spacing:     'tight' | 'balanced' | 'loose'
  }

  // ── CTA ───────────────────────────────────────────────────────────────────
  cta: {
    relativeY:  number
    width:      'narrow' | 'medium' | 'wide' | 'full'
    prominence: 'subtle' | 'normal' | 'prominent'
    style:      'text' | 'button' | 'badge'
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    height:  'minimal' | 'compact' | 'full'
    columns: number   // 1–3
    style:   'dark' | 'light' | 'transparent'
  }

  // ── Visual character (no commercial content) ──────────────────────────────
  palette:             string[]   // up to 5 dominant hex colors
  typographyCharacter: 'editorial' | 'bold' | 'elegant' | 'technical' | 'playful'
  borderRadiusStyle:   'sharp' | 'soft' | 'rounded'
  spacingDensity:      'tight' | 'balanced' | 'airy'
  decorativeDensity:   'none' | 'minimal' | 'moderate' | 'rich'

  // ── Meta ──────────────────────────────────────────────────────────────────
  confidence:    number   // 0–1
  analysisNotes: string   // structural observation — NO commercial data
}
