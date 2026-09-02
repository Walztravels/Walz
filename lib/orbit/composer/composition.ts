/**
 * Walz Orbit Composer — Template → DesignComposition bridge.
 *
 * buildTemplateComposition() is the single entry point that converts:
 *   WalzTemplate + commercialFields + visual asset + canvas
 *   → deterministic DesignComposition ready for rendering.
 *
 * INVARIANT: commercialFields come from staff only. This function
 * does not call any AI system and never generates commercial values.
 */

import type { WalzTemplate, TemplateCanvas, ZoneVariantMap } from '@/lib/orbit/templates/schema'
import type {
  DesignComposition, DesignLayer, DesignCanvas,
  ImageLayer, TextLayer, LogoLayer, CTAButtonLayer,
  RouteCardLayer, PriceBlockLayer, ContactBarLayer,
} from './layer-model'
import { buildContactBarLayer } from './contact-footer'
import { BUSINESS } from '@/lib/config/business'
import type { DesignControls } from './design-controls'
import { overlayAlpha } from './design-controls'
import { getTypographyPreset } from './typography-presets'
import { normalizeCompositionBounds, reflowComposition } from './bounds'

export interface CompositionInput {
  template:          WalzTemplate
  commercialFields:  Record<string, string>
  visualAsset?:      { url: string; id?: string }
  canvas:            TemplateCanvas
  layerOverrides?:   Record<string, Partial<DesignLayer>>
  controls?:         DesignControls
  /** Structured routes — when present, take precedence over commercialFields['route'] */
  structuredRoutes?: Array<{ from: string; to: string }>
}

/**
 * Returns a `DesignCanvas` from a `TemplateCanvas`.
 */
function toDesignCanvas(c: TemplateCanvas): DesignCanvas {
  return { key: c.key, width: c.width, height: c.height }
}

/**
 * Resolve zone overrides for a specific canvas key.
 * Templates can define per-canvas layout variants in `zoneVariants`.
 * Zone variants override position/style but never text (text comes from commercialFields).
 */
function resolveZones(
  template: WalzTemplate,
  canvasKey: string,
): WalzTemplate['zones'] {
  const variants: Record<string, ZoneVariantMap> | undefined = template.zoneVariants
  if (!variants || !variants[canvasKey]) return template.zones

  const variantOverrides = variants[canvasKey]
  const merged = { ...template.zones } as WalzTemplate['zones']
  for (const key of Object.keys(variantOverrides) as Array<keyof ZoneVariantMap>) {
    const base    = template.zones[key]
    const override = variantOverrides[key]
    if (base && override) {
      // Merge override into base — preserve `text` from base (staff-only)
      ;(merged as Record<string, object>)[key] = { ...base, ...override, text: base.text }
    }
  }
  return merged
}

/**
 * Build the image background layer from the visual asset (if present).
 */
function buildImageLayer(url: string, controls?: DesignControls): ImageLayer {
  let objectFit: ImageLayer['objectFit'] = 'cover'
  if (controls?.imageCrop === 'contain') objectFit = 'contain'
  return {
    id: 'bg_image', type: 'image', src: url, objectFit,
    x: 0, y: 0, width: 1, height: 1, zIndex: 0, visible: true,
  }
}

/**
 * Build the logo layer from the template zone config.
 */
function buildLogoLayer(zone: NonNullable<WalzTemplate['zones']['logo']>): LogoLayer {
  return {
    id:         'logo',
    type:       'logo',
    text:       zone.text || 'WALZ TRAVELS',
    fontWeight: '800',
    fontSize:   zone.fontSize ?? 28,
    color:      zone.color ?? '#ffffff',
    align:      zone.align ?? 'center',
    x:          zone.x ?? 0.5,
    y:          zone.y ?? 0.06,
    zIndex:     10,
    visible:    zone.visible ?? true,
  }
}

/**
 * Build a TextLayer from a PosterLayer zone config and optional staff text.
 */
function buildTextLayer(
  id:        string,
  zone:      NonNullable<WalzTemplate['zones'][keyof WalzTemplate['zones']]>,
  staffText: string,
  zIndex:    number,
  controls?: DesignControls,
): TextLayer {
  const preset   = controls?.typographyPreset ? getTypographyPreset(controls.typographyPreset) : null
  const baseSize = zone.fontSize ?? 32
  const fontSize = preset ? Math.round(baseSize * preset.sizeScale) : baseSize
  const align    = (controls?.textAlignment ?? zone.align ?? 'center') as 'left' | 'center' | 'right'

  return {
    id,
    type:       'text',
    text:       staffText,
    fontFamily: preset?.headlineFamily ?? "'Helvetica Neue', Arial, sans-serif",
    fontWeight: preset?.headlineWeight ?? zone.fontWeight ?? '800',
    fontSize,
    lineHeight: preset?.lineHeight,
    color:      zone.color ?? '#ffffff',
    align,
    x:          zone.x ?? 0.5,
    y:          zone.y ?? 0.5,
    maxWidth:   zone.maxWidth,
    zIndex,
    visible:    (zone.visible ?? true) && !!staffText,
    autoFit:    true,
    shadow:     true,
  }
}

/**
 * Build a CTA button layer.
 */
function buildCTALayer(
  zone:    NonNullable<WalzTemplate['zones']['cta']>,
  text:    string,
): CTAButtonLayer {
  return {
    id:              'cta',
    type:            'cta_button',
    text,
    backgroundColor: '#d4af37',
    textColor:       '#1a1a2e',
    borderRadius:    24,
    fontSize:        zone.fontSize ?? 26,
    x:               zone.x ?? 0.5,
    y:               zone.y ?? 0.90,
    zIndex:          50,
    visible:         !!text,
    paddingX:        0.08,
    paddingY:        0.02,
  }
}

/**
 * Build a route card layer from either structured routes or a
 * comma/bullet-separated string. Structured routes take precedence.
 *
 * Each entry in routes[] is rendered as one pill on the canvas, so three
 * structured routes produce three distinct, readable cards rather than
 * one compressed string.
 */
function buildRouteCardLayer(
  zone:            NonNullable<WalzTemplate['zones']['route']>,
  raw:             string,
  structuredInput?: Array<{ from: string; to: string }>,
): RouteCardLayer {
  let routes: string[]
  let structuredRoutes: Array<{ from: string; to: string }> | undefined

  if (structuredInput && structuredInput.length > 0) {
    // Structured editor — each route is its own pill
    structuredRoutes = structuredInput.filter(r => r.from.trim() && r.to.trim()).slice(0, 4)
    routes = structuredRoutes.map(r => `${r.from.trim()} → ${r.to.trim()}`)
  } else {
    // Legacy: split delimited string
    routes = raw
      .split(/[•,|→]/)
      .map(r => r.trim())
      .filter(Boolean)
      .slice(0, 4)
  }

  const zoneX = zone.x ?? 0.5
  // Auto-select vertical layout for 3+ routes in a narrow left-column zone (x < 0.35).
  // Horizontal pill groups at x=0.05 with 3 pills would extend ~600px left of the anchor,
  // clipping completely off the left canvas boundary.
  const layoutStrategy: 'horizontal' | 'vertical' | 'grid' =
    (routes.length >= 3 && zoneX < 0.35) ? 'vertical' : 'horizontal'

  return {
    id:        'route_card',
    type:      'route_card',
    routes,
    ...(structuredRoutes ? { structuredRoutes } : {}),
    fontSize:  zone.fontSize ?? 20,
    cardColor: '#1a3060',
    textColor: '#d4af37',
    x:         zoneX,
    y:         zone.y ?? 0.62,
    zIndex:    40,
    visible:   routes.length > 0,
    layoutStrategy,
  }
}

/**
 * Build a price block from currency + amount fields.
 */
function buildPriceLayer(
  priceZone:    NonNullable<WalzTemplate['zones']['price']>,
  currencyZone: NonNullable<WalzTemplate['zones']['currency']>,
  amount:       string,
  currency:     string,
): PriceBlockLayer {
  return {
    id:           'price_block',
    type:         'price_block',
    currency:     currency || 'NGN',
    amount,
    fontSize:     priceZone.fontSize ?? 80,
    color:        priceZone.color ?? '#ffffff',
    currencyColor: currencyZone.color ?? '#d4af37',
    x:            priceZone.x ?? 0.5,
    y:            priceZone.y ?? 0.80,
    zIndex:       45,
    visible:      !!amount,
  }
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildTemplateComposition(input: CompositionInput): DesignComposition {
  const { template, commercialFields, visualAsset, canvas, layerOverrides = {}, controls, structuredRoutes } = input
  const zones = resolveZones(template, canvas.key)
  const layers: DesignLayer[] = []

  // 1. Background image
  if (visualAsset?.url) {
    layers.push(buildImageLayer(visualAsset.url, controls))
  }

  // 2. Logo
  if (zones.logo) {
    layers.push(buildLogoLayer(zones.logo))
  }

  // 3. Headline
  const headlineText = commercialFields['headline'] ?? ''
  if (zones.headline) {
    layers.push(buildTextLayer('headline', zones.headline, headlineText, 20, controls))
  }

  // 4. Subheadline
  const subText = commercialFields['subheadline'] ?? ''
  if (zones.subheadline) {
    layers.push(buildTextLayer('subheadline', zones.subheadline, subText, 21, controls))
  }

  // 5. Route cards — only show if not minimal density
  const routeRaw = commercialFields['route'] ?? ''
  const hasRoutes = structuredRoutes ? structuredRoutes.some(r => r.from.trim() && r.to.trim()) : !!routeRaw
  if (hasRoutes && zones.route && controls?.contentDensity !== 'minimal') {
    layers.push(buildRouteCardLayer(zones.route, routeRaw, structuredRoutes))
  }

  // 6. Price block
  const priceAmount   = commercialFields['price'] ?? ''
  const priceCurrency = commercialFields['currency'] ?? ''
  if ((priceAmount || priceCurrency) && zones.price && zones.currency) {
    layers.push(buildPriceLayer(zones.price, zones.currency, priceAmount, priceCurrency))
  }

  // 7. CTA button — always shown when text is present
  const ctaText = commercialFields['cta'] ?? ''
  if (zones.cta) {
    layers.push(buildCTALayer(zones.cta, ctaText))
  }

  // 8. Terms — hidden in minimal density
  const termsText = commercialFields['terms'] ?? ''
  if (termsText && zones.terms && controls?.contentDensity !== 'minimal') {
    layers.push(buildTextLayer('terms', zones.terms, termsText, 60, controls))
  }

  // 9. Contact bar — variant driven by footer control and template background
  const baseFooterVariant = template.background === 'light_editorial' || template.background === 'white_card'
    ? 'light'
    : 'dark'
  const footerVariant = controls?.footer === 'full'
    ? 'full'
    : controls?.footer === 'minimal'
    ? 'compact'
    : baseFooterVariant

  layers.push(buildContactBarLayer(footerVariant, {
    y:      zones.contact?.y ?? 0.975,
    zIndex: 80,
  }))

  // 10. Apply any layer overrides
  const finalLayers = layers.map(layer => {
    const override = layerOverrides[layer.id]
    if (!override) return layer
    return { ...layer, ...override } as DesignLayer
  })

  const rawComposition: DesignComposition = {
    canvas:          toDesignCanvas(canvas),
    templateKey:     template.key,
    layers:          finalLayers.sort((a, b) => a.zIndex - b.zIndex),
    visualAssetId:   visualAsset?.id,
    commercialFields,
    layerOverrides,
    controls,
  }

  // Reflow chains vertical positions (headline → subheadline → routes → price →
  // CTA → terms): closes egregious gaps and pushes apart overlaps.
  const reflowed = reflowComposition(rawComposition, canvas.width, canvas.height)

  // Final mandatory bounds normalization — clamps all layers to safe margins.
  // Must run AFTER all transforms and BEFORE preview / quality scoring / export.
  return normalizeCompositionBounds(reflowed)
}

// Export overlayAlpha for compositor use
export { overlayAlpha }

/**
 * Build the contact string to display in a simple text layer fallback.
 * Used when ContactBarLayer rendering is not available.
 */
export function buildContactString(): string {
  const { contacts } = BUSINESS
  return `${contacts.nigeriaWhatsapp.display}  |  ${contacts.email}  |  @walz_travels`
}
