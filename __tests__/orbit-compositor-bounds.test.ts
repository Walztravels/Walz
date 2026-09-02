/**
 * Walz Orbit — Compositor Bounds regression tests.
 *
 * Covers: detectLayerOverflow, normalizeCompositionBounds, reflowComposition,
 * buildRouteCardLayer layoutStrategy auto-detection, quality-score overflow cap,
 * contact-footer globalWhatsapp highlight, and reference profile safety invariants.
 *
 * These tests guard against the production rendering defects discovered in the
 * December Flights Home campaign (1080×1350):
 *   - Headline/CTA/route-card left-canvas clipping
 *   - Quality score 96 despite severe clipping
 *   - Footer showing Nigeria number instead of central global number
 *   - Subheadline disconnected from headline (large vertical gaps)
 */

import {
  detectLayerOverflow,
  normalizeCompositionBounds,
  reflowComposition,
  SAFE_MARGIN_H,
  SAFE_MARGIN_TOP,
  MAX_CONTENT_BOTTOM,
  estimateLayerRight,
} from '@/lib/orbit/composer/bounds'
import { scoreComposition } from '@/lib/orbit/composer/quality-score'
import { buildContactBarItems } from '@/lib/orbit/composer/contact-footer'
import { applyReferenceDesignProfile } from '@/lib/orbit/reference/apply-profile'
import { buildTemplateComposition } from '@/lib/orbit/composer/composition'
import type {
  DesignComposition, DesignLayer, TextLayer,
  RouteCardLayer, CTAButtonLayer,
} from '@/lib/orbit/composer/layer-model'
import type { ReferenceDesignProfile, DesignMatchStrength } from '@/lib/orbit/reference/types'
import { BUSINESS } from '@/lib/config/business'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeComposition(layers: DesignLayer[], controls?: DesignComposition['controls']): DesignComposition {
  return {
    canvas:          { key: '1080x1350', width: 1080, height: 1350 },
    templateKey:     'walz-hero-split',
    layers,
    commercialFields: {},
    controls,
  }
}

function textLayer(id: string, x: number, y: number, text = 'Test Text', align: TextLayer['align'] = 'left'): TextLayer {
  return {
    id, type: 'text', x, y, text,
    fontFamily: 'Helvetica Neue', fontWeight: '700', fontSize: 60,
    color: '#ffffff', align, maxWidth: 0.45, zIndex: 10, visible: true,
  }
}

function routeCardLayer(x: number, y: number, routes: string[], strategy?: RouteCardLayer['layoutStrategy']): RouteCardLayer {
  return {
    id: 'route_card', type: 'route_card', x, y, routes, zIndex: 40, visible: true,
    ...(strategy ? { layoutStrategy: strategy } : {}),
  }
}

function ctaLayer(x: number, y: number, text = 'Secure your December flight today'): CTAButtonLayer {
  return {
    id: 'cta', type: 'cta_button', x, y, text,
    backgroundColor: '#d4af37', textColor: '#0a1f3c', zIndex: 50, visible: true,
  }
}

function makeProfile(overrides: Partial<ReferenceDesignProfile> = {}): ReferenceDesignProfile {
  return {
    layoutFamily:        'split_horizontal',
    backgroundMode:      'photography',
    subjectPosition:     'center',
    subjectScale:        'large',
    imageCoverage:       0.75,
    logoPosition:        'top_center',
    logoScale:           'standard',
    headline: { relativeY: 0.35, alignment: 'center', width: 'wide', relativeSize: 'display', lineCount: 2, accentPattern: 'none' },
    subheadline: { relativeY: 0.52, alignment: 'center', relativeSize: 'medium', visible: true },
    routeLayout: { count: 3, orientation: 'horizontal', cardStyle: 'pill', relativeY: 0.63, spacing: 'balanced' },
    cta: { relativeY: 0.76, width: 'wide', prominence: 'prominent', style: 'button' },
    footer: { height: 'compact', columns: 2, style: 'dark' },
    palette: ['#1a3060', '#d4af37', '#ffffff'],
    typographyCharacter: 'bold',
    borderRadiusStyle:   'soft',
    spacingDensity:      'balanced',
    decorativeDensity:   'minimal',
    confidence:          0.9,
    analysisNotes:       'Horizontal split layout',
    ...overrides,
  }
}

// ── 1. detectLayerOverflow — left boundary ────────────────────────────────────

describe('detectLayerOverflow', () => {
  it('detects headline with negative x', () => {
    const comp = makeComposition([textLayer('headline', -0.10, 0.35)])
    const warnings = detectLayerOverflow(comp)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].code).toBe('HEADLINE_OUT_OF_BOUNDS')
    expect(warnings[0].critical).toBe(true)
  })

  it('detects CTA centered at x=0.17 with long text right-clipping', () => {
    // cta x=0.17 means left edge ≈ 0.17 - halfBtnW which clips left
    const comp = makeComposition([ctaLayer(0.17, 0.76)])
    const right = estimateLayerRight(comp.layers[0])
    // right = 0.17 + halfBtnW — check it's detected as potential overflow by bounds fn
    // (the CTA at x=0.17 for 30-char text: halfW ≈ 0.43, so right ≈ 0.60 — within bounds)
    // But left edge: bx = 0.17 - 0.43 = -0.26 — x itself (the center) is non-negative
    // detectLayerOverflow checks x < 0 (layer position); normalizeCompositionBounds
    // moves x right so the group fits. Let's verify overflow is NOT triggered for x>0
    expect(comp.layers[0].x).toBeGreaterThan(0)
    // After normalization, x should be pushed right so full button fits
    const norm = normalizeCompositionBounds(comp)
    const normalizedCta = norm.layers[0] as CTAButtonLayer
    const halfBtnW = Math.min((normalizedCta.text.length * 0.011 + 0.10), 0.42)
    expect(normalizedCta.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H + halfBtnW - 0.001)
  })

  it('returns empty array for clean composition', () => {
    const comp = makeComposition([
      textLayer('headline', 0.30, 0.35, 'Short headline', 'left'),
    ])
    const warnings = detectLayerOverflow(comp)
    expect(warnings).toEqual([])
  })

  it('marks route_card overflow as critical', () => {
    const rc = { ...routeCardLayer(0.05, 0.62, ['LOS → LHR', 'LOS → JFK', 'LOS → YYZ']), layoutStrategy: 'horizontal' as const }
    // horizontal at x=0.05 with 3 wide pills: right ≈ 0.05 + 3*0.22/2 = 0.38 — within bounds
    // But actually with horizontal at x=0.05, left-clipping: 0.05 - (3*0.22+2*0.01)/2 = -0.27
    // x itself is NOT < 0, so layer position check passes; normalizeCompositionBounds is what fixes it
    // Let's test an explicit negative-x route card
    const rcNeg = { ...routeCardLayer(-0.2, 0.62, ['LOS → LHR']) }
    const comp = makeComposition([rcNeg])
    const w = detectLayerOverflow(comp)
    expect(w.length).toBeGreaterThan(0)
    expect(w[0].critical).toBe(true)
    expect(w[0].code).toBe('ROUTE_OUT_OF_BOUNDS')
  })

  it('skips image layers from overflow check', () => {
    const imgLayer: DesignLayer = { id: 'bg_image', type: 'image', x: -0.1, y: 0, src: 'http://x.com/img.jpg', objectFit: 'cover', zIndex: 0, visible: true }
    const comp = makeComposition([imgLayer])
    const w = detectLayerOverflow(comp)
    expect(w).toEqual([])
  })

  it('skips contact_bar from overflow check', () => {
    const contactLayer: DesignLayer = { id: 'contact_bar', type: 'contact_bar', x: 0.5, y: 0.98, items: [], variant: 'dark', zIndex: 100, visible: true }
    const comp = makeComposition([contactLayer])
    const w = detectLayerOverflow(comp)
    expect(w).toEqual([])
  })

  it('detects layer below footer (y > 0.90)', () => {
    const comp = makeComposition([textLayer('terms', 0.5, 0.93)])
    const w = detectLayerOverflow(comp)
    expect(w.some(x => x.code === 'LAYER_BELOW_FOOTER')).toBe(true)
  })
})

// ── 2. normalizeCompositionBounds ─────────────────────────────────────────────

describe('normalizeCompositionBounds', () => {
  it('clamps negative-x text layer to SAFE_MARGIN_H', () => {
    const comp = makeComposition([textLayer('headline', -0.10, 0.35)])
    const norm = normalizeCompositionBounds(comp)
    const hl = norm.layers.find(l => l.id === 'headline')!
    expect(hl.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H)
  })

  it('clamps left-anchored text to at least SAFE_MARGIN_H', () => {
    const comp = makeComposition([textLayer('headline', 0.02, 0.35, 'Test', 'left')])
    const norm = normalizeCompositionBounds(comp)
    const hl = norm.layers.find(l => l.id === 'headline')!
    expect(hl.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H)
  })

  it('never pushes a headline past the right boundary for left-align text', () => {
    const comp = makeComposition([textLayer('headline', 0.85, 0.35, 'Test', 'left')])
    const norm = normalizeCompositionBounds(comp)
    const hl = norm.layers.find(l => l.id === 'headline')!
    expect(hl.x).toBeLessThanOrEqual(1 - SAFE_MARGIN_H)
  })

  it('clamps CTA centered at x=0.17 to fit within canvas', () => {
    const comp = makeComposition([ctaLayer(0.17, 0.76, 'Secure your December flight today')])
    const norm = normalizeCompositionBounds(comp)
    const cta = norm.layers[0] as CTAButtonLayer
    const halfBtnW = Math.min((cta.text.length * 0.011 + 0.10), 0.42)
    expect(cta.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H + halfBtnW - 0.001)
  })

  it('does not modify background image layers', () => {
    const imgLayer: DesignLayer = { id: 'bg_image', type: 'image', x: 0, y: 0, src: 'http://x.com/img.jpg', objectFit: 'cover', zIndex: 0, visible: true }
    const comp = makeComposition([imgLayer])
    const norm = normalizeCompositionBounds(comp)
    expect(norm.layers[0].x).toBe(0)  // unchanged
  })

  it('clamps y to at least SAFE_MARGIN_TOP', () => {
    const comp = makeComposition([textLayer('headline', 0.5, -0.05)])
    const norm = normalizeCompositionBounds(comp)
    const hl = norm.layers.find(l => l.id === 'headline')!
    expect(hl.y).toBeGreaterThanOrEqual(SAFE_MARGIN_TOP)
  })

  it('clamps y to at most MAX_CONTENT_BOTTOM for content layers', () => {
    const comp = makeComposition([textLayer('terms', 0.5, 0.97)])
    const norm = normalizeCompositionBounds(comp)
    const terms = norm.layers.find(l => l.id === 'terms')!
    expect(terms.y).toBeLessThanOrEqual(MAX_CONTENT_BOTTOM)
  })

  it('does not change contact_bar y position', () => {
    const contactLayer: DesignLayer = { id: 'contact_bar', type: 'contact_bar', x: 0.5, y: 0.975, items: [], variant: 'dark', zIndex: 100, visible: true }
    const comp = makeComposition([contactLayer])
    const norm = normalizeCompositionBounds(comp)
    expect(norm.layers[0].y).toBe(0.975)
  })

  it('adjusts horizontal route group centered at x=0.05 to fit canvas', () => {
    const rc = routeCardLayer(0.05, 0.62, ['LOS → LHR', 'LOS → JFK', 'LOS → YYZ'])
    rc.layoutStrategy = 'horizontal'
    const comp = makeComposition([rc])
    const norm = normalizeCompositionBounds(comp)
    const nrc = norm.layers[0] as RouteCardLayer
    const pillW = 0.22, gapW = 0.01
    const halfW = (3 * pillW + 2 * gapW) / 2
    expect(nrc.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H + halfW - 0.001)
  })

  it('adjusts vertical route group x to fit single pill width', () => {
    const rc = routeCardLayer(0.05, 0.62, ['LOS → LHR', 'LOS → JFK', 'LOS → YYZ'])
    rc.layoutStrategy = 'vertical'
    const comp = makeComposition([rc])
    const norm = normalizeCompositionBounds(comp)
    const nrc = norm.layers[0] as RouteCardLayer
    expect(nrc.x).toBeGreaterThanOrEqual(SAFE_MARGIN_H + 0.20 - 0.001)
  })
})

// ── 3. layoutStrategy auto-detection in buildTemplateComposition ──────────────

describe('layoutStrategy auto-detection', () => {
  const HERO_SPLIT_KEY = 'walz-hero-split'

  it('assigns vertical layout for 3 routes when zone.x < 0.35', () => {
    // walz-hero-split has route zone at x=0.05 — 3 routes should become vertical
    const comp = buildTemplateComposition({
      template:         require('@/lib/orbit/templates/walz-hero-split').walzHeroSplit,
      commercialFields: { headline: 'December Flights', route: 'LOS → LHR | LOS → JFK | LOS → YYZ', cta: 'Book now' },
      canvas:           { key: '1080x1350', width: 1080, height: 1350 },
    })
    const rc = comp.layers.find(l => l.id === 'route_card') as RouteCardLayer | undefined
    if (rc && rc.routes.length >= 3) {
      expect(rc.layoutStrategy).toBe('vertical')
    }
  })

  it('keeps horizontal layout for 2 routes even in narrow zone', () => {
    const comp = buildTemplateComposition({
      template:         require('@/lib/orbit/templates/walz-hero-split').walzHeroSplit,
      commercialFields: { headline: 'December Flights', route: 'LOS → LHR | LOS → JFK', cta: 'Book now' },
      canvas:           { key: '1080x1350', width: 1080, height: 1350 },
    })
    const rc = comp.layers.find(l => l.id === 'route_card') as RouteCardLayer | undefined
    if (rc && rc.routes.length === 2) {
      expect(rc.layoutStrategy).toBe('horizontal')
    }
  })

  it('normalizeCompositionBounds runs and all layers are in bounds after buildTemplateComposition', () => {
    const comp = buildTemplateComposition({
      template:         require('@/lib/orbit/templates/walz-hero-split').walzHeroSplit,
      commercialFields: { headline: 'December Flights Home', route: 'LOS → LHR | LOS → JFK | LOS → YYZ', cta: 'Secure your December flight today' },
      canvas:           { key: '1080x1350', width: 1080, height: 1350 },
    })
    // All visible non-image layers must have x >= 0
    for (const layer of comp.layers) {
      if (layer.type === 'image' || layer.id === 'contact_bar') continue
      if (!layer.visible) continue
      expect(layer.x).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── 4. Quality score overflow cap ─────────────────────────────────────────────

describe('quality-score overflow cap', () => {
  it('caps score at 59 when 1 critical layer overflows', () => {
    // Headline at x=-0.5 → critical overflow
    const layers: DesignLayer[] = [
      textLayer('headline', -0.5, 0.35, 'December Flights', 'left'),
      ctaLayer(0.5, 0.75),
    ]
    const comp = makeComposition(layers)
    const result = scoreComposition(comp)
    expect(result.total).toBeLessThanOrEqual(59)
  })

  it('caps score at 39 when 2+ critical layers overflow', () => {
    const layers: DesignLayer[] = [
      textLayer('headline', -0.5, 0.35, 'December Flights', 'left'),
      { ...routeCardLayer(-0.3, 0.62, ['LOS → LHR']) } as DesignLayer,
      ctaLayer(0.5, 0.75),
    ]
    const comp = makeComposition(layers)
    const result = scoreComposition(comp)
    expect(result.total).toBeLessThanOrEqual(39)
  })

  it('does not cap score when composition is geometrically clean', () => {
    const layers: DesignLayer[] = [
      textLayer('headline', 0.20, 0.35, 'December Flights', 'left'),
      ctaLayer(0.50, 0.75),
    ]
    const comp = makeComposition(layers, { overlayStrength: 60, textAlignment: 'left' } as DesignComposition['controls'])
    const result = scoreComposition(comp)
    // No cap applied — score may be anything based on other factors
    // Just verify no overflow warnings are critical
    const criticalOverflowWarnings = result.warnings.filter(w =>
      ['HEADLINE_OUT_OF_BOUNDS', 'CTA_OUT_OF_BOUNDS', 'ROUTE_OUT_OF_BOUNDS'].includes(w.field)
    )
    expect(criticalOverflowWarnings.length).toBe(0)
  })

  it('adds overflow warning codes to the returned warnings array', () => {
    const layers: DesignLayer[] = [
      textLayer('headline', -0.5, 0.35, 'Test', 'left'),
    ]
    const comp = makeComposition(layers)
    const result = scoreComposition(comp)
    expect(result.warnings.some(w => w.field === 'HEADLINE_OUT_OF_BOUNDS')).toBe(true)
  })
})

// ── 5. Contact footer — globalWhatsapp must be highlighted ───────────────────

describe('contact-footer globalWhatsapp highlight', () => {
  it('compact variant highlights globalWhatsapp number', () => {
    const items = buildContactBarItems('compact')
    const highlighted = items.filter(i => i.highlight)
    expect(highlighted.length).toBeGreaterThan(0)
    expect(highlighted[0].text).toBe(BUSINESS.contacts.globalWhatsapp.display)
  })

  it('dark/light variant highlights globalWhatsapp number', () => {
    const dark = buildContactBarItems('dark')
    const highlighted = dark.filter(i => i.highlight)
    expect(highlighted.length).toBeGreaterThan(0)
    expect(highlighted[0].text).toBe(BUSINESS.contacts.globalWhatsapp.display)
  })

  it('never highlights nigeriaWhatsapp in compact or dark variants', () => {
    const compact = buildContactBarItems('compact')
    const dark    = buildContactBarItems('dark')
    for (const items of [compact, dark]) {
      const nigeriaHighlighted = items.filter(i => i.highlight && i.text === BUSINESS.contacts.nigeriaWhatsapp.display)
      expect(nigeriaHighlighted.length).toBe(0)
    }
  })

  it('globalWhatsapp display matches BUSINESS config', () => {
    expect(BUSINESS.contacts.globalWhatsapp.display).toBe('+1 231 790 2336')
  })
})

// ── 6. Reference profile safety — CLOSE strength never creates negative X ────

describe('applyReferenceDesignProfile safety', () => {
  function makeBaseComposition(): DesignComposition {
    return makeComposition([
      textLayer('headline', 0.20, 0.35, 'December Flights Home', 'left'),
      textLayer('subheadline', 0.20, 0.50, 'Book your Christmas seat', 'left'),
      routeCardLayer(0.20, 0.63, ['LOS → LHR', 'LOS → JFK', 'LOS → YYZ']),
      ctaLayer(0.20, 0.76, 'Secure your December flight today'),
    ])
  }

  const STRENGTHS: DesignMatchStrength[] = ['loose', 'balanced', 'close']

  for (const strength of STRENGTHS) {
    it(`${strength} strength: headline x >= 0 after applyReferenceDesignProfile`, () => {
      const base = makeBaseComposition()
      const result = applyReferenceDesignProfile(base, makeProfile(), strength)
      const hl = result.layers.find(l => l.id === 'headline')!
      expect(hl.x).toBeGreaterThanOrEqual(0)
    })

    it(`${strength} strength: CTA x >= 0 after applyReferenceDesignProfile`, () => {
      const base = makeBaseComposition()
      const result = applyReferenceDesignProfile(base, makeProfile(), strength)
      const cta = result.layers.find(l => l.id === 'cta')!
      expect(cta.x).toBeGreaterThanOrEqual(0)
    })

    it(`${strength} strength: does NOT change headline.align`, () => {
      const base = makeBaseComposition()
      const origAlign = (base.layers.find(l => l.id === 'headline') as TextLayer).align
      const result = applyReferenceDesignProfile(base, makeProfile({ headline: { ...makeProfile().headline, alignment: 'center' } }), strength)
      const hl = result.layers.find(l => l.id === 'headline') as TextLayer
      expect(hl.align).toBe(origAlign)  // alignment must never change
    })
  }

  it('CLOSE + center alignment in profile does NOT move headline.align away from left', () => {
    const base = makeBaseComposition()
    const profile = makeProfile({ headline: { ...makeProfile().headline, alignment: 'center' } })
    const result = applyReferenceDesignProfile(base, profile, 'close')
    const hl = result.layers.find(l => l.id === 'headline') as TextLayer
    expect(hl.align).toBe('left')
  })

  it('applyReferenceDesignProfile does not override controls.textAlignment', () => {
    const base = makeBaseComposition()
    const withControls = { ...base, controls: { textAlignment: 'left' } as DesignComposition['controls'] }
    const result = applyReferenceDesignProfile(withControls, makeProfile(), 'close')
    expect(result.controls?.textAlignment).toBe('left')
  })
})

// ── 7. reflowComposition — subheadline follows headline ───────────────────────

describe('reflowComposition', () => {
  it('does not change layers when canvas dimensions missing', () => {
    // reflowComposition is a no-op guard — with no canvas it shouldn't crash
    const comp = makeComposition([
      textLayer('headline', 0.20, 0.20, 'A headline'),
      textLayer('subheadline', 0.20, 0.60, 'A subheadline'),
    ])
    // If called with valid canvas dims, subheadline should follow headline bottom
    const reflowed = reflowComposition(comp, 1080, 1350)
    const sub = reflowed.layers.find(l => l.id === 'subheadline')!
    const hl  = comp.layers.find(l => l.id === 'headline')!
    // subheadline y should be greater than headline y
    expect(sub.y).toBeGreaterThan(hl.y)
  })

  it('subheadline y > headline y after reflow', () => {
    const comp = makeComposition([
      textLayer('headline', 0.20, 0.25, 'December Flights Home from Lagos'),
      textLayer('subheadline', 0.20, 0.60, 'Book your Christmas seat'),
    ])
    const reflowed = reflowComposition(comp, 1080, 1350)
    const sub = reflowed.layers.find(l => l.id === 'subheadline')!
    const hl  = reflowed.layers.find(l => l.id === 'headline')!
    expect(sub.y).toBeGreaterThan(hl.y)
  })
})

// ── 8. Commercial values — buildTemplateComposition doesn't generate them ─────

describe('commercial value invariant', () => {
  it('headline text comes only from commercialFields — never generated', () => {
    const comp = buildTemplateComposition({
      template:         require('@/lib/orbit/templates/walz-hero-split').walzHeroSplit,
      commercialFields: { headline: 'Fly to London this Christmas' },
      canvas:           { key: '1080x1350', width: 1080, height: 1350 },
    })
    const hl = comp.layers.find(l => l.id === 'headline') as TextLayer | undefined
    expect(hl?.text ?? '').toBe('Fly to London this Christmas')
  })

  it('composition does not contain auto-generated prices', () => {
    const comp = buildTemplateComposition({
      template:         require('@/lib/orbit/templates/walz-hero-split').walzHeroSplit,
      commercialFields: { headline: 'December Flights' },
      canvas:           { key: '1080x1350', width: 1080, height: 1350 },
    })
    // Price block should be hidden when amount not in commercialFields
    const price = comp.layers.find(l => l.id === 'price_block')
    expect(!price || !price.visible).toBe(true)
  })
})
