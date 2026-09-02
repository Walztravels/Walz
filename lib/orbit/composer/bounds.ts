/**
 * Walz Orbit Compositor — Composition Bounds Normalization.
 *
 * Every composition MUST pass through reflowComposition() + normalizeCompositionBounds()
 * AFTER:
 *   - template construction
 *   - reference profile application
 *   - design controls
 *   - variation / polish
 *   - layer overrides
 *
 * and BEFORE:
 *   - preview rendering
 *   - quality scoring
 *   - export
 *
 * All coordinates are 0–1 fractional normalized to canvas dimensions.
 * Width estimates mirror the actual PosterCompositor render math
 * (Helvetica ≈ fontSize × 0.55 average char width at the 1080px baseline).
 *
 * Pure functions — no AI, no network, no JSX.
 */

import type {
  DesignComposition, DesignLayer,
  TextLayer, RouteCardLayer, CTAButtonLayer, PriceBlockLayer,
} from './layer-model'

// ── Safe margin constants ─────────────────────────────────────────────────────

/** Horizontal safe margin: ~5.5% of canvas width (≈59px at 1080px canvas). */
export const SAFE_MARGIN_H     = 0.055
/** Top safe margin: ~4% of canvas height. */
export const SAFE_MARGIN_TOP   = 0.04
/** Footer reserved zone height: bottom 10% of canvas. */
export const FOOTER_RESERVED_H = 0.10
/** Content must stay above this y value (=1 - FOOTER_RESERVED_H). */
export const MAX_CONTENT_BOTTOM = 1 - FOOTER_RESERVED_H  // 0.90

// ── Width estimation (mirrors PosterCompositor render math) ───────────────────

/** Average character width as a fraction of canvas width, for a fontSize in 1080-baseline pt. */
function charWidthFrac(fontSize: number): number {
  return (fontSize * 0.55) / 1080
}

/**
 * Estimated half-width (0–1 canvas fraction) of a rendered CTA button.
 * Mirrors renderCTAButton: bw = measuredTextWidth + 2 × paddingX(0.08 × cw).
 */
export function estimateCtaHalfWidth(layer: Pick<CTAButtonLayer, 'text' | 'fontSize' | 'paddingX'>): number {
  const chars = layer.text?.length ?? 10
  const fs    = layer.fontSize ?? 26
  // paddingX is a canvas-width fraction; tolerate legacy pixel values (>1 → px at 1080 baseline)
  const rawPad   = layer.paddingX ?? 0.08
  const paddingX = rawPad > 1 ? rawPad / 1080 : rawPad
  const textW    = chars * charWidthFrac(fs)
  return Math.min(textW / 2 + paddingX, 0.42)
}

/**
 * Estimated width (0–1 canvas fraction) of one route pill.
 * Mirrors renderRouteCards: cardW = measuredTextWidth + 2 × padding(16px).
 */
export function estimateRoutePillWidth(routeText: string, fontSize = 20): number {
  return routeText.length * charWidthFrac(fontSize) + (16 * 2) / 1080
}

/** Estimated half-width of the full horizontal route pill group. */
export function estimateRouteGroupHalfWidth(layer: Pick<RouteCardLayer, 'routes' | 'fontSize'>): number {
  const fs   = layer.fontSize ?? 20
  const gap  = 10 / 1080
  const total = layer.routes.reduce((s, r) => s + estimateRoutePillWidth(r, fs), 0)
    + gap * Math.max(0, layer.routes.length - 1)
  return total / 2
}

/** Estimated widest single pill in a route group (for vertical stacking). */
export function estimateMaxRoutePillWidth(layer: Pick<RouteCardLayer, 'routes' | 'fontSize'>): number {
  const fs = layer.fontSize ?? 20
  return layer.routes.reduce((m, r) => Math.max(m, estimateRoutePillWidth(r, fs)), 0)
}

/** Estimated half-width of a rendered price amount (always centered by renderPriceBlock). */
export function estimatePriceHalfWidth(layer: Pick<PriceBlockLayer, 'amount' | 'fontSize'>): number {
  const chars = layer.amount?.length ?? 0
  const fs    = layer.fontSize ?? 80
  return (chars * charWidthFrac(fs)) / 2
}

/**
 * Estimate the LEFT-most x coordinate (0–1) reached by a layer's rendered content.
 * Rendering semantics:
 *   text align='left'    → x is the left edge
 *   text align='center'  → x is the center
 *   text align='right'   → x is the right edge
 *   cta_button / price_block            → x is the center
 *   route_card horizontal               → group centered at x
 *   route_card vertical                 → pills LEFT-anchored at x
 */
export function estimateLayerLeft(layer: DesignLayer): number {
  if (layer.type === 'route_card') {
    const rc = layer as RouteCardLayer
    if ((rc.layoutStrategy ?? 'horizontal') === 'vertical') return layer.x
    return layer.x - estimateRouteGroupHalfWidth(rc)
  }
  if (layer.type === 'cta_button') return layer.x - estimateCtaHalfWidth(layer as CTAButtonLayer)
  if (layer.type === 'price_block') return layer.x - estimatePriceHalfWidth(layer as PriceBlockLayer)
  if (layer.type === 'text') {
    const tl = layer as TextLayer
    if (tl.align === 'left')   return layer.x
    if (tl.align === 'center') return layer.x - (tl.maxWidth ?? 0.60) / 2
    return layer.x - (tl.maxWidth ?? 0.50)
  }
  return layer.x
}

/** Estimate the RIGHT-most x coordinate (0–1) reached by a layer's rendered content. */
export function estimateLayerRight(layer: DesignLayer): number {
  if (layer.type === 'route_card') {
    const rc = layer as RouteCardLayer
    if ((rc.layoutStrategy ?? 'horizontal') === 'vertical') return layer.x + estimateMaxRoutePillWidth(rc)
    return layer.x + estimateRouteGroupHalfWidth(rc)
  }
  if (layer.type === 'cta_button') return layer.x + estimateCtaHalfWidth(layer as CTAButtonLayer)
  if (layer.type === 'price_block') return layer.x + estimatePriceHalfWidth(layer as PriceBlockLayer)
  if (layer.type === 'text') {
    const tl = layer as TextLayer
    if (tl.align === 'left')   return layer.x + (tl.maxWidth ?? 0.50)
    if (tl.align === 'center') return layer.x + (tl.maxWidth ?? 0.60) / 2
    return layer.x
  }
  return layer.x + (layer.width ?? 0)
}

// ── Overflow warnings ─────────────────────────────────────────────────────────

export type OverflowWarningCode =
  | 'HEADLINE_OUT_OF_BOUNDS'
  | 'CTA_OUT_OF_BOUNDS'
  | 'ROUTE_OUT_OF_BOUNDS'
  | 'LOGO_OUT_OF_BOUNDS'
  | 'TEXT_CLIPPED'
  | 'LAYER_BELOW_FOOTER'

export interface OverflowWarning {
  layerId:  string
  code:     OverflowWarningCode
  message:  string
  critical: boolean
}

const CRITICAL_IDS = new Set(['headline', 'logo', 'route_card', 'cta', 'price_block'])

function codeFor(id: string, type: string): OverflowWarningCode {
  if (id === 'headline' || id === 'subheadline') return 'HEADLINE_OUT_OF_BOUNDS'
  if (id === 'cta' || type === 'cta_button')     return 'CTA_OUT_OF_BOUNDS'
  if (id === 'route_card' || type === 'route_card') return 'ROUTE_OUT_OF_BOUNDS'
  if (id === 'logo')                             return 'LOGO_OUT_OF_BOUNDS'
  return 'TEXT_CLIPPED'
}

/**
 * Detect layers whose rendered content exceeds canvas bounds or overlaps the footer.
 * Returns an empty array when the composition is clean.
 * Only checks visible non-bleed layers. Uses render-math-matched bounding estimates.
 */
export function detectLayerOverflow(composition: DesignComposition): OverflowWarning[] {
  const warnings: OverflowWarning[] = []

  for (const layer of composition.layers) {
    if (!layer.visible) continue
    // Background images may bleed — don't check them
    if (layer.type === 'image' || layer.allowBleed) continue
    // Contact bar always pins to bottom, full width — skip
    if (layer.id === 'contact_bar' || layer.id === 'contact') continue

    const isCritical = CRITICAL_IDS.has(layer.id) ||
      layer.type === 'cta_button' || layer.type === 'route_card' || layer.type === 'price_block'

    // Left boundary — estimated content edge, not just the anchor
    const left = estimateLayerLeft(layer)
    if (left < -0.005) {
      warnings.push({
        layerId: layer.id, code: codeFor(layer.id, layer.type),
        message:  `Layer "${layer.id}" estimated left edge ${left.toFixed(3)} — extends left of canvas.`,
        critical: isCritical,
      })
    }

    // Right boundary
    const right = estimateLayerRight(layer)
    if (right > 1.005) {
      warnings.push({
        layerId: layer.id, code: codeFor(layer.id, layer.type),
        message:  `Layer "${layer.id}" estimated right edge ${right.toFixed(3)} — extends right of canvas.`,
        critical: isCritical,
      })
    }

    // Top boundary
    if (layer.y < 0) {
      warnings.push({
        layerId: layer.id, code: codeFor(layer.id, layer.type),
        message:  `Layer "${layer.id}" y=${layer.y.toFixed(3)} — extends above canvas.`,
        critical: isCritical,
      })
    }

    // Footer overlap for non-footer layers
    if (layer.y > MAX_CONTENT_BOTTOM) {
      warnings.push({
        layerId: layer.id, code: 'LAYER_BELOW_FOOTER',
        message:  `Layer "${layer.id}" y=${layer.y.toFixed(3)} is inside the footer reserved zone (y>${MAX_CONTENT_BOTTOM}).`,
        critical: isCritical,
      })
    }
  }

  return warnings
}

// ── Estimated height helpers ──────────────────────────────────────────────────

/**
 * Estimate the normalized height of a text layer block on a given canvas.
 * Uses fontSize, lineHeight, and a word-wrap heuristic for line count.
 */
export function estimateTextHeight(
  text: string,
  fontSize: number,        // in design points at 1080px baseline
  maxWidthFrac: number,    // 0–1 fraction of canvas width
  canvasWidth:  number,
  canvasHeight: number,
  lineHeightMult = 1.25,
): number {
  const scale       = canvasWidth / 1080
  const fsPx        = fontSize * scale
  const maxWidthPx  = maxWidthFrac * canvasWidth
  const charWidthPx = fsPx * 0.55
  const charsPerLine = Math.max(1, Math.floor(maxWidthPx / charWidthPx))
  const words = text.trim().split(/\s+/)
  let lines = 1, lineChars = 0
  for (const w of words) {
    if (lineChars + w.length + (lineChars > 0 ? 1 : 0) > charsPerLine) {
      lines++; lineChars = w.length
    } else {
      lineChars += (lineChars > 0 ? 1 : 0) + w.length
    }
  }
  return (lines * fsPx * lineHeightMult) / canvasHeight
}

/**
 * Estimate the normalized height of a route card group.
 * strategy='vertical': cards stacked vertically. Others: single row.
 */
export function estimateRouteGroupHeight(
  routeCount:    number,
  fontSizePt:    number,
  canvasWidth:   number,
  canvasHeight:  number,
  strategy:      'horizontal' | 'vertical' | 'grid' = 'horizontal',
): number {
  const scale   = canvasWidth / 1080
  const fsPx    = fontSizePt * scale
  const cardH   = fsPx + (16 * scale) * 2
  const gap     = 10 * scale
  if (strategy === 'vertical') {
    return (routeCount * cardH + (routeCount - 1) * gap) / canvasHeight
  }
  return cardH / canvasHeight
}

// ── reflowComposition ─────────────────────────────────────────────────────────

interface ChainSpec {
  id:      string
  /** Maximum allowed gap above this layer (canvas-height fraction). Gaps beyond this are closed. */
  maxGap:  number
  /** When true the layer is only pushed DOWN to avoid overlap, never pulled up. */
  pushOnly?: boolean
}

// Vertical dependency chain below the headline. Gaps larger than maxGap are
// closed (the "large unexplained vertical gaps" defect); overlaps are pushed apart.
const REFLOW_CHAIN: ChainSpec[] = [
  { id: 'subheadline', maxGap: 0.035 },
  { id: 'route_card',  maxGap: 0.050 },
  { id: 'price_block', maxGap: 0.050 },
  { id: 'cta',         maxGap: 0.080 },
  { id: 'terms',       maxGap: 0.030, pushOnly: true },  // terms belong near the footer — never pulled up
]

const MIN_GAP = 0.010  // minimum breathing room between stacked elements

/**
 * Reflow a composition so downstream layers follow the rendered bounds of
 * upstream layers instead of relying on fixed template Y percentages.
 *
 * Behavior per layer in the chain (headline → subheadline → routes → price → CTA → terms):
 *   - PUSH DOWN when the layer would overlap the element above it.
 *   - PULL UP only when the gap above it exceeds maxGap (closes egregious gaps
 *     while preserving the template's vertical rhythm).
 *   - Never move a layer below MAX_CONTENT_BOTTOM.
 *
 * Heights are estimates — accurate enough for layout, not pixel-perfect.
 * Always followed by normalizeCompositionBounds() as the final safety pass.
 */
export function reflowComposition(
  composition:  DesignComposition,
  canvasWidth:  number,
  canvasHeight: number,
): DesignComposition {
  if (!canvasWidth || !canvasHeight) return composition

  const layers = [...composition.layers]
  const byId   = (id: string) => layers.findIndex(l => l.id === id)

  function estimateHeight(layer: DesignLayer): number {
    if (layer.type === 'text') {
      const tl = layer as TextLayer
      return estimateTextHeight(tl.text ?? '', tl.fontSize ?? 24, tl.maxWidth ?? 0.7, canvasWidth, canvasHeight)
    }
    if (layer.type === 'route_card') {
      const rc = layer as RouteCardLayer
      return estimateRouteGroupHeight(rc.routes.length, rc.fontSize ?? 20, canvasWidth, canvasHeight, rc.layoutStrategy ?? 'horizontal')
    }
    if (layer.type === 'cta_button') {
      const cta = layer as CTAButtonLayer
      const scale = canvasWidth / 1080
      return ((cta.fontSize ?? 26) * scale + 2 * ((cta.paddingY ?? 0.02) * canvasHeight)) / canvasHeight
    }
    if (layer.type === 'price_block') {
      const pb = layer as PriceBlockLayer
      const scale = canvasWidth / 1080
      return ((pb.fontSize ?? 80) * scale * 1.4) / canvasHeight  // amount + currency label
    }
    return layer.height ?? 0.04
  }

  // Anchor: headline bottom
  const headlineIdx = byId('headline')
  if (headlineIdx === -1) return composition
  const headline = layers[headlineIdx] as TextLayer
  if (!headline.visible || !headline.text) return composition

  let cursor = headline.y + estimateHeight(headline) / 2

  for (const spec of REFLOW_CHAIN) {
    const idx = byId(spec.id)
    if (idx === -1) continue
    const layer = layers[idx]
    if (!layer.visible) continue
    if (layer.type === 'route_card' && (layer as RouteCardLayer).routes.length === 0) continue

    const h    = estimateHeight(layer)
    const minY = cursor + MIN_GAP + h / 2         // pushed down to avoid overlap
    const maxY = cursor + spec.maxGap + h / 2     // pulled up to close egregious gaps

    let newY = layer.y
    if (newY < minY) newY = minY
    else if (!spec.pushOnly && newY > maxY) newY = maxY

    newY = Math.min(newY, MAX_CONTENT_BOTTOM - h / 2)

    if (Math.abs(newY - layer.y) > 0.002) {
      layers[idx] = { ...layer, y: newY } as DesignLayer
    }
    cursor = newY + h / 2
  }

  return { ...composition, layers }
}

// ── normalizeCompositionBounds ────────────────────────────────────────────────

function clampRange(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Final bounds normalization pass.
 *
 * Clamps every visible non-bleed layer so its rendered content remains within
 * canvas safe margins. Background image layers and contact bars are exempt.
 * Uses the same width estimates as detectLayerOverflow, which mirror the
 * PosterCompositor render math.
 *
 * Called after ALL composition transforms and before quality scoring / export.
 */
export function normalizeCompositionBounds(composition: DesignComposition): DesignComposition {
  const normalizedLayers = composition.layers.map(layer => {
    // Background images: may bleed to edges — exempt
    if (layer.type === 'image' || layer.allowBleed) return layer
    // Contact bar: pinned to bottom, full width — exempt
    if (layer.id === 'contact_bar' || layer.id === 'contact') return layer

    const p = { ...layer }

    // ── X clamping (per rendered-content semantics) ───────────────────────────

    if (layer.type === 'route_card') {
      const rc = layer as RouteCardLayer
      if ((rc.layoutStrategy ?? 'horizontal') === 'vertical') {
        // Vertical pills are LEFT-anchored at x (flush with the text column)
        const maxPillW = estimateMaxRoutePillWidth(rc)
        p.x = clampRange(layer.x, SAFE_MARGIN_H, 1 - SAFE_MARGIN_H - maxPillW)
      } else {
        // Horizontal group centered at x — the whole pill row must fit
        const halfW = estimateRouteGroupHalfWidth(rc)
        p.x = clampRange(layer.x, SAFE_MARGIN_H + halfW, 1 - SAFE_MARGIN_H - halfW)
      }
    } else if (layer.type === 'cta_button') {
      const halfW = estimateCtaHalfWidth(layer as CTAButtonLayer)
      p.x = clampRange(layer.x, SAFE_MARGIN_H + halfW, 1 - SAFE_MARGIN_H - halfW)
    } else if (layer.type === 'price_block') {
      // renderPriceBlock always centers at x
      const halfW = estimatePriceHalfWidth(layer as PriceBlockLayer)
      p.x = clampRange(layer.x, SAFE_MARGIN_H + halfW, 1 - SAFE_MARGIN_H - halfW)
    } else if (layer.type === 'text') {
      const tl = layer as TextLayer
      if (tl.align === 'left') {
        const w = tl.maxWidth ?? 0.50
        p.x = clampRange(layer.x, SAFE_MARGIN_H, 1 - SAFE_MARGIN_H - w)
      } else if (tl.align === 'center') {
        const halfW = (tl.maxWidth ?? 0.60) / 2
        p.x = clampRange(layer.x, SAFE_MARGIN_H + halfW, 1 - SAFE_MARGIN_H - halfW)
      } else {
        // right-aligned: x is the right edge
        const w = tl.maxWidth ?? 0.50
        p.x = clampRange(layer.x, Math.min(SAFE_MARGIN_H + w, 1 - SAFE_MARGIN_H), 1 - SAFE_MARGIN_H)
      }
    } else {
      p.x = clampRange(layer.x, SAFE_MARGIN_H, 1 - SAFE_MARGIN_H)
    }

    // ── Y clamping ────────────────────────────────────────────────────────────
    p.y = Math.max(SAFE_MARGIN_TOP, layer.y)
    p.y = Math.min(MAX_CONTENT_BOTTOM, p.y)

    return p as DesignLayer
  })

  return { ...composition, layers: normalizedLayers }
}
