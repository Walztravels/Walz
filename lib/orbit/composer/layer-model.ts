/**
 * Walz Orbit Composer — rich layer model.
 *
 * This is the canonical type system for all composition layers.
 * All coordinates (x, y, width, height, maxWidth) are fractional 0-1
 * relative to the canvas dimensions.
 *
 * INVARIANT: No commercial values (prices, routes, fees) may be set
 * by AI systems. All such fields are staff-only.
 */

// ── Base ──────────────────────────────────────────────────────────────────────

export type LayerType =
  | 'image'
  | 'text'
  | 'text_segments'
  | 'shape'
  | 'logo'
  | 'contact_bar'
  | 'route_card'
  | 'price_block'
  | 'cta_button'

interface BaseLayer {
  id:          string
  type:        LayerType
  x:           number   // 0-1 fractional from canvas left
  y:           number   // 0-1 fractional from canvas top
  width?:      number   // 0-1 fractional; undefined = auto
  height?:     number   // 0-1 fractional; undefined = auto
  zIndex:      number
  visible:     boolean
  locked?:     boolean
  opacity?:    number   // 0-1
  rotation?:   number   // degrees
  allowBleed?: boolean  // when true, layer may extend to canvas edge (background images only)
}

// ── Layer types ───────────────────────────────────────────────────────────────

export interface ImageLayer extends BaseLayer {
  type:      'image'
  src:       string    // public URL
  objectFit: 'cover' | 'contain' | 'fill'
}

export interface TextLayer extends BaseLayer {
  type:        'text'
  text:        string
  fontFamily:  string
  fontWeight:  '400' | '600' | '700' | '800'
  fontSize:    number   // pt at 1080px baseline; scaled proportionally at other widths
  lineHeight?: number   // multiplier, default 1.25
  color:       string
  align:       'left' | 'center' | 'right'
  maxLines?:   number
  autoFit?:    boolean  // shrink font to fit box
  maxWidth?:   number   // 0-1 fractional
  shadow?:     boolean
}

export interface TextSegment {
  text:  string
  style: 'default' | 'accent' | 'muted'
}

export interface TextSegmentsLayer extends BaseLayer {
  type:        'text_segments'
  segments:    TextSegment[]
  fontFamily:  string
  fontWeight:  '400' | '600' | '700' | '800'
  fontSize:    number
  lineHeight?: number
  color:       string
  accentColor: string
  mutedColor?: string
  align:       'left' | 'center' | 'right'
  maxWidth?:   number
  autoFit?:    boolean
  shadow?:     boolean
}

export interface ShapeLayer extends BaseLayer {
  type:          'shape'
  background:    string    // CSS color or gradient descriptor
  border?:       string
  borderRadius?: number    // 0-1 fractional of height
}

export interface LogoLayer extends BaseLayer {
  type:              'logo'
  text:              string              // fallback display text (used when no logoUrl is uploaded)
  fontWeight:        '700' | '800'
  fontSize:          number
  color:             string
  align:             'left' | 'center' | 'right'
  letterSpacing?:    number             // em units
  // Brand Asset fields (Phase 5 brand patch)
  logoUrl?:          string             // URL of uploaded logo — when set, renders image instead of text
  logoVariant?:      'PRIMARY' | 'LIGHT' | 'DARK' | 'MONOCHROME' | 'ICON'
  treatment?:        'NONE' | 'SHADOW' | 'GLOW' | 'DARK_PLATE' | 'LIGHT_PLATE' | 'GLASS'
  treatmentOpacity?: number             // 0–1, default 0.5
  logoScale?:        'small' | 'standard' | 'prominent'
}

export interface ContactBarItem {
  icon:       string   // emoji or character
  text:       string
  highlight?: boolean
}

export interface ContactBarLayer extends BaseLayer {
  type:             'contact_bar'
  variant:          'dark' | 'light' | 'compact' | 'full'
  items:            ContactBarItem[]
  fontSize?:        number
  color?:           string
  backgroundColor?: string
}

export interface RouteCardLayer extends BaseLayer {
  type:              'route_card'
  routes:            string[]   // max 4 — each entry rendered as one pill
  structuredRoutes?: Array<{ from: string; to: string }>  // source data when using structured editor
  fontSize?:         number
  cardColor?:        string
  textColor?:        string
  /** Layout strategy chosen by buildRouteGroupLayout(). Vertical for 3+ routes in narrow left column (x<0.35). */
  layoutStrategy?:   'horizontal' | 'vertical' | 'grid'
}

export interface PriceBlockLayer extends BaseLayer {
  type:          'price_block'
  currency:      string
  amount:        string
  label?:        string   // e.g. "From"
  fontSize?:     number
  color?:        string
  currencyColor?: string
}

export interface CTAButtonLayer extends BaseLayer {
  type:            'cta_button'
  text:            string
  backgroundColor: string
  textColor:       string
  borderRadius?:   number   // px
  fontSize?:       number
  paddingX?:       number   // fractional of canvas width
  paddingY?:       number   // fractional of canvas height
}

export type DesignLayer =
  | ImageLayer
  | TextLayer
  | TextSegmentsLayer
  | ShapeLayer
  | LogoLayer
  | ContactBarLayer
  | RouteCardLayer
  | PriceBlockLayer
  | CTAButtonLayer

// ── Composition ───────────────────────────────────────────────────────────────

export interface DesignCanvas {
  key:    string
  width:  number
  height: number
}

export interface DesignComposition {
  canvas:             DesignCanvas
  templateKey:        string
  layers:             DesignLayer[]
  // Persistence fields (serialized to posterData JSON column)
  visualAssetId?:     string
  commercialFields?:  Record<string, string>
  layerOverrides?:    Record<string, Partial<DesignLayer>>
  // Phase 3: designer controls snapshot embedded in composition
  controls?:          import('./design-controls').DesignControls
}

// ── Serialization tag (stored in posterData JSON) ─────────────────────────────

export const DESIGN_COMPOSITION_TAG = '__walz_designer_v1' as const

export interface PersistedDesignComposition {
  [DESIGN_COMPOSITION_TAG]: true
  templateKey:      string
  canvasKey:        string
  visualAssetId?:   string
  commercialFields: Record<string, string>
  layerOverrides?:  Record<string, Partial<DesignLayer>>
}

export function isPersistedComposition(v: unknown): v is PersistedDesignComposition {
  return typeof v === 'object' && v !== null && (v as Record<string, unknown>)[DESIGN_COMPOSITION_TAG] === true
}
