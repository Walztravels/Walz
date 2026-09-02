/**
 * Walz Orbit Compositor — Composition Bounds Normalization.
 *
 * Every composition MUST pass through normalizeCompositionBounds() AFTER:
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
 *
 * Pure functions — no AI, no network, no JSX.
 */

import type {
  DesignComposition, DesignLayer,
  TextLayer, RouteCardLayer, CTAButtonLayer,
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

// ── Estimated character width factor for font size ───────────────────────────
const CHAR_WIDTH_FACTOR = 0.55  // average character width ≈ fontSize × 0.55

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
 * Estimate the right-most x coordinate (0–1) reached by a layer.
 * Used to detect right-boundary overflow.
 * Horizontal center of route_card / cta_button is layer.x; text left-anchored when align='left'.
 */
export function estimateLayerRight(layer: DesignLayer): number {
  if (layer.type === 'route_card') {
    const rc = layer as RouteCardLayer
    if ((rc.layoutStrategy ?? 'horizontal') === 'vertical') {
      return layer.x + 0.30  // one pill — estimated width
    }
    // Horizontal: estimate ~0.22 per pill + small gaps, centered at layer.x
    const pillW = 0.22
    const gapW  = 0.01
    const halfTotal = (rc.routes.length * pillW + (rc.routes.length - 1) * gapW) / 2
    return layer.x + halfTotal
  }

  if (layer.type === 'cta_button') {
    const cta = layer as CTAButtonLayer
    const charCount = cta.text?.length ?? 10
    // paddingX ≈ 0.08 canvas frac × 2 sides + text width estimate
    const estimatedHalfW = Math.min((charCount * 0.011 + 0.10), 0.42)
    return layer.x + estimatedHalfW
  }

  if (layer.type === 'text') {
    const tl = layer as TextLayer
    if (tl.align === 'left') return layer.x + (tl.maxWidth ?? 0.50)
    if (tl.align === 'center') return layer.x + (tl.maxWidth ?? 0.60) / 2
    return layer.x  // right-aligned: x is the right edge
  }

  return layer.x + (layer.width ?? 0)
}

/**
 * Detect layers that exceed canvas bounds or overlap the footer zone.
 * Returns an empty array when the composition is clean.
 *
 * Only checks visible non-bleed layers.
 * Uses estimated bounding boxes — conservative (favours fewer false positives).
 */
export function detectLayerOverflow(composition: DesignComposition): OverflowWarning[] {
  const warnings: OverflowWarning[] = []

  for (const layer of composition.layers) {
    if (!layer.visible) continue
    // Background images may bleed — don't check them
    if (layer.type === 'image') continue
    // Contact bar always pins to bottom — skip
    if (layer.id === 'contact_bar' || layer.id === 'contact') continue

    const isCritical = CRITICAL_IDS.has(layer.id) ||
      layer.type === 'cta_button' || layer.type === 'route_card' || layer.type === 'price_block'

    // Left boundary
    if (layer.x < 0) {
      warnings.push({
        layerId: layer.id, code: codeFor(layer.id, layer.type),
        message:  `Layer "${layer.id}" x=${layer.x.toFixed(3)} — extends left of canvas.`,
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
 * Estimate the normalized height of a text layer block on a given canvas height.
 * Uses fontSize, lineHeight, and a character-count heuristic for line count.
 * Returns a fraction 0–1 of canvas height.
 */
export function estimateTextHeight(
  text: string,
  fontSize: number,        // in design points at 1080px baseline
  maxWidthFrac: number,    // 0–1 fraction of canvas width
  canvasWidth:  number,
  canvasHeight: number,
  lineHeightMult = 1.25,
): number {
  const scale     = canvasWidth / 1080
  const fsPx      = fontSize * scale
  const maxWidthPx = maxWidthFrac * canvasWidth
  const charWidthPx = fsPx * CHAR_WIDTH_FACTOR
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
  const totalHeightPx = lines * fsPx * lineHeightMult
  return totalHeightPx / canvasHeight
}

/**
 * Estimate the normalized height of a route card group.
 * strategy='vertical': cards stacked vertically.
 * strategy='horizontal': single row height.
 */
export function estimateRouteGroupHeight(
  routeCount:    number,
  fontSizePt:    number,   // design points at 1080 baseline
  canvasWidth:   number,
  canvasHeight:  number,
  strategy:      'horizontal' | 'vertical' | 'grid' = 'horizontal',
): number {
  const scale    = canvasWidth / 1080
  const fsPx     = fontSizePt * scale
  const padding  = 16 * scale
  const cardH    = fsPx + padding * 2
  const gap      = 10 * scale
  if (strategy === 'vertical') {
    return (routeCount * cardH + (routeCount - 1) * gap) / canvasHeight
  }
  return cardH / canvasHeight  // single row
}

// ── reflowComposition ─────────────────────────────────────────────────────────

/**
 * Reflow a composition so that downstream layers follow the rendered bounds of
 * upstream layers, rather than relying on fixed Y percentages.
 *
 * Dependency chain:
 *   logo → headline → subheadline → routes → CTA → terms → (footer fixed)
 *
 * Uses estimated text heights — accurate enough for layout, not pixel-perfect.
 * Always followed by normalizeCompositionBounds() as the final safety pass.
 *
 * Only reflowed when the canvas dimensions are provided; otherwise returns unchanged.
 */
export function reflowComposition(
  composition: DesignComposition,
  canvasWidth:  number,
  canvasHeight: number,
): DesignComposition {
  const layers = [...composition.layers]
  const byId   = (id: string) => layers.find(l => l.id === id)

  const headline    = byId('headline')   as (TextLayer | undefined)
  const subheadline = byId('subheadline')
  const routeCard   = byId('route_card') as (RouteCardLayer | undefined)
  const cta         = byId('cta')
  const terms       = byId('terms')

  // Gap constants (normalized)
  const GAP_S = 18 / canvasHeight  // small gap between headline and subheadline
  const GAP_M = 28 / canvasHeight  // gap between subheadline and routes
  const GAP_L = 36 / canvasHeight  // gap between routes and CTA
  const GAP_T = 18 / canvasHeight  // gap between CTA and terms

  let cursor = 0  // tracks the bottom of the last placed element

  if (headline?.visible && headline.text) {
    const hh = estimateTextHeight(
      headline.text, headline.fontSize, headline.maxWidth ?? 0.7, canvasWidth, canvasHeight,
    )
    // headline.y is the CENTER of the text block; top = y - hh/2, bottom = y + hh/2
    cursor = headline.y + hh / 2
  }

  if (subheadline?.visible) {
    const sh = subheadline as TextLayer
    if (cursor > 0) {
      const shH = estimateTextHeight(
        sh.text ?? '', sh.fontSize ?? 26, sh.maxWidth ?? 0.7, canvasWidth, canvasHeight,
      )
      const newY = cursor + GAP_S + shH / 2
      // Only reflow if it would produce a meaningful movement
      if (Math.abs(newY - subheadline.y) > 0.015) {
        const idx = layers.indexOf(subheadline)
        layers[idx] = { ...subheadline, y: newY }
        cursor = newY + shH / 2
      } else {
        cursor = subheadline.y + shH / 2
      }
    }
  }

  if (routeCard?.visible && routeCard.routes.length > 0) {
    const strategy = routeCard.layoutStrategy ?? 'horizontal'
    const rh = estimateRouteGroupHeight(
      routeCard.routes.length, routeCard.fontSize ?? 20, canvasWidth, canvasHeight, strategy,
    )
    if (cursor > 0) {
      const newY = cursor + GAP_M + rh / 2
      if (Math.abs(newY - routeCard.y) > 0.015) {
        const idx = layers.indexOf(routeCard)
        layers[idx] = { ...routeCard, y: newY } as DesignLayer
        cursor = newY + rh / 2
      } else {
        cursor = routeCard.y + rh / 2
      }
    }
  }

  if (cta?.visible) {
    const ctaH = 52 / canvasHeight  // approximate CTA button height
    if (cursor > 0) {
      const newY = cursor + GAP_L + ctaH / 2
      if (Math.abs(newY - cta.y) > 0.015) {
        const idx = layers.indexOf(cta)
        layers[idx] = { ...cta, y: newY }
        cursor = newY + ctaH / 2
      } else {
        cursor = cta.y + ctaH / 2
      }
    }
  }

  if (terms?.visible) {
    if (cursor > 0) {
      const newY = cursor + GAP_T
      if (Math.abs(newY - terms.y) > 0.01) {
        const idx = layers.indexOf(terms)
        layers[idx] = { ...terms, y: newY }
      }
    }
  }

  return { ...composition, layers }
}

// ── normalizeCompositionBounds ────────────────────────────────────────────────

/**
 * Final bounds normalization pass.
 *
 * Clamps every visible non-bleed layer so it remains within canvas safe margins.
 * Background image layers (type='image') and contact bars are exempt.
 *
 * Called after ALL composition transforms and before quality scoring / export.
 */
export function normalizeCompositionBounds(composition: DesignComposition): DesignComposition {
  const normalizedLayers = composition.layers.map(layer => {
    // Background images: may bleed to edges — exempt
    if (layer.type === 'image') return layer
    // Contact bar: pinned to bottom — exempt from y clamping
    if (layer.id === 'contact_bar' || layer.id === 'contact') return layer

    const p = { ...layer }

    // ── X clamping ────────────────────────────────────────────────────────────

    if (layer.type === 'route_card') {
      const rc = layer as RouteCardLayer
      const strategy = rc.layoutStrategy ?? 'horizontal'
      if (strategy === 'horizontal') {
        // Centered at x — ensure the entire pill group fits
        const pillW  = 0.22
        const gapW   = 0.01
        const halfW  = (rc.routes.length * pillW + (rc.routes.length - 1) * gapW) / 2
        const minX   = SAFE_MARGIN_H + halfW
        const maxX   = 1 - SAFE_MARGIN_H - halfW
        p.x = Math.min(maxX, Math.max(minX, layer.x))
      } else {
        // Vertical: x is the center of each pill — clamp to fit one pill
        const maxPillHalfW = 0.20
        p.x = Math.max(SAFE_MARGIN_H + maxPillHalfW, Math.min(layer.x, 1 - SAFE_MARGIN_H - maxPillHalfW))
      }
    } else if (layer.type === 'cta_button') {
      const cta = layer as CTAButtonLayer
      const charCount = cta.text?.length ?? 10
      const halfBtnW = Math.min((charCount * 0.011 + 0.10), 0.42)
      const minX = SAFE_MARGIN_H + halfBtnW
      const maxX = 1 - SAFE_MARGIN_H - halfBtnW
      p.x = Math.min(maxX, Math.max(minX, layer.x))
    } else if (layer.type === 'text') {
      const tl = layer as TextLayer
      if (tl.align === 'left') {
        // x is the left edge — clamp to safe margin
        p.x = Math.max(SAFE_MARGIN_H, layer.x)
      } else if (tl.align === 'center') {
        // x is the text center — ensure half-maxWidth fits inside margins
        const halfW = (tl.maxWidth ?? 0.60) / 2
        p.x = Math.min(1 - SAFE_MARGIN_H - halfW, Math.max(SAFE_MARGIN_H + halfW, layer.x))
      } else {
        // right-aligned: x is the right edge
        p.x = Math.min(1 - SAFE_MARGIN_H, layer.x)
      }
    } else {
      p.x = Math.max(SAFE_MARGIN_H, Math.min(layer.x, 1 - SAFE_MARGIN_H))
    }

    // ── Y clamping ────────────────────────────────────────────────────────────
    p.y = Math.max(SAFE_MARGIN_TOP, layer.y)
    p.y = Math.min(MAX_CONTENT_BOTTOM, p.y)

    return p as DesignLayer
  })

  return { ...composition, layers: normalizedLayers }
}
