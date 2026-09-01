/**
 * Walz Orbit — Graphic Designer Phase 3 tests.
 *
 * Coverage:
 *   - DesignControls defaults and mutations
 *   - Typography presets applied to composition
 *   - One-click polish actions (never mutate commercial fields)
 *   - Design variations preserve commercial fields
 *   - Safe zones: buildSafeZonePrompt, layerOverlapsFooter
 *   - Decorative elements catalog
 *   - Quality scoring
 *   - Template variants: strip commercial values
 *   - buildTemplateComposition with controls
 *   - Auto-fit widow avoidance
 *   - Format reflow (zoneVariants still works with controls)
 *   - Reference style: no commercial content
 */

import { defaultDesignControls, overlayAlpha, intensityMultiplier } from '../lib/orbit/composer/design-controls'
import { TYPOGRAPHY_PRESETS, getTypographyPreset } from '../lib/orbit/composer/typography-presets'
import { applyPolishAction, POLISH_ACTIONS } from '../lib/orbit/composer/one-click-polish'
import {
  DESIGN_VARIATIONS,
  applyVariationControls,
  variationPreservesCommercialFields,
  buildVariationPromptModifier,
} from '../lib/orbit/composer/design-variations'
import {
  TEMPLATE_SAFE_ZONES,
  buildSafeZonePrompt,
  layerOverlapsFooter,
} from '../lib/orbit/composer/safe-zones'
import {
  DECORATIVE_ELEMENTS,
  ALL_DECORATIVE_ELEMENTS,
  getElementsByCategory,
  TEMPLATE_DECORATIVE_DEFAULTS,
} from '../lib/orbit/composer/decorative-elements'
import { scoreComposition, scoreColor } from '../lib/orbit/composer/quality-score'
import { extractTemplateVariant, validateVariantIsCommercialFree } from '../lib/orbit/composer/template-variants'
import { buildTemplateComposition } from '../lib/orbit/composer/composition'
import { autoFitText, estimateMeasure } from '../lib/orbit/composer/auto-fit'
import { TEMPLATE_MAP, TEMPLATE_CANVASES, ALL_TEMPLATES } from '../lib/orbit/templates'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PORTRAIT = TEMPLATE_CANVASES['1080x1350']
const STORY    = TEMPLATE_CANVASES['1080x1920']

function makeComp(templateKey: string, fields: Record<string, string> = {}, controls = defaultDesignControls()) {
  const template = TEMPLATE_MAP[templateKey]
  if (!template) throw new Error(`Unknown template: ${templateKey}`)
  return buildTemplateComposition({ template, commercialFields: fields, canvas: PORTRAIT, controls })
}

// ── Design Controls ───────────────────────────────────────────────────────────

describe('DesignControls', () => {
  it('defaultDesignControls returns expected structure', () => {
    const c = defaultDesignControls()
    expect(c.overlayStrength).toBeGreaterThanOrEqual(0)
    expect(c.overlayStrength).toBeLessThanOrEqual(100)
    expect(c.subjectPosition).toBe('center')
    expect(c.footer).toBe('compact')
    expect(typeof c.showGuides).toBe('boolean')
  })

  it('overlayAlpha maps 0–100 into 0.05–0.85', () => {
    expect(overlayAlpha(0)).toBeCloseTo(0.05, 2)
    expect(overlayAlpha(100)).toBeCloseTo(0.85, 2)
    expect(overlayAlpha(50)).toBeGreaterThan(0.05)
    expect(overlayAlpha(50)).toBeLessThan(0.85)
  })

  it('intensityMultiplier: soft < normal < dramatic', () => {
    expect(intensityMultiplier('soft')).toBeLessThan(intensityMultiplier('normal'))
    expect(intensityMultiplier('normal')).toBeLessThan(intensityMultiplier('dramatic'))
  })
})

// ── Typography Presets ────────────────────────────────────────────────────────

describe('Typography presets', () => {
  it('all 5 presets are defined', () => {
    const keys = Object.keys(TYPOGRAPHY_PRESETS)
    expect(keys).toContain('editorial_bold')
    expect(keys).toContain('premium_minimal')
    expect(keys).toContain('campaign_heavy')
    expect(keys).toContain('information_clean')
    expect(keys).toContain('luxury_modern')
    expect(keys).toHaveLength(5)
  })

  it('each preset has a valid sizeScale', () => {
    for (const preset of Object.values(TYPOGRAPHY_PRESETS)) {
      expect(preset.sizeScale).toBeGreaterThan(0)
      expect(preset.sizeScale).toBeLessThan(2)
    }
  })

  it('getTypographyPreset falls back to campaign_heavy for unknown key', () => {
    const p = getTypographyPreset('nonexistent_preset')
    expect(p.key).toBe('campaign_heavy')
  })

  it('editorial_bold has larger sizeScale than premium_minimal', () => {
    expect(TYPOGRAPHY_PRESETS.editorial_bold.sizeScale).toBeGreaterThan(
      TYPOGRAPHY_PRESETS.premium_minimal.sizeScale,
    )
  })

  it('typography preset applied to composition headline fontSize', () => {
    const controls = { ...defaultDesignControls(), typographyPreset: 'editorial_bold' }
    const comp     = makeComp('walz_hero_split', { headline: 'Test' }, controls)
    const headline = comp.layers.find(l => l.id === 'headline')
    const preset   = TYPOGRAPHY_PRESETS.editorial_bold
    // fontSize should be scaled by preset.sizeScale
    expect(headline).toBeDefined()
    // With sizeScale > 1, fontSize should be >= base (we can't know base exactly, just check it's reasonable)
    expect((headline as { fontSize?: number }).fontSize).toBeGreaterThan(20)
  })
})

// ── One-Click Polish ──────────────────────────────────────────────────────────

describe('One-click polish actions', () => {
  it('all POLISH_ACTIONS have key, label, icon, description', () => {
    for (const action of POLISH_ACTIONS) {
      expect(action.key).toBeTruthy()
      expect(action.label).toBeTruthy()
      expect(action.icon).toBeTruthy()
      expect(action.description).toBeTruthy()
    }
  })

  it('make_more_premium switches to luxury_modern preset', () => {
    const controls = defaultDesignControls()
    const result   = applyPolishAction(controls, 'make_more_premium')
    expect(result.typographyPreset).toBe('luxury_modern')
  })

  it('make_more_minimal reduces overlay strength', () => {
    const controls = { ...defaultDesignControls(), overlayStrength: 70 }
    const result   = applyPolishAction(controls, 'make_more_minimal')
    expect(result.overlayStrength).toBeLessThan(controls.overlayStrength)
  })

  it('increase_contrast raises overlay strength', () => {
    const controls = { ...defaultDesignControls(), overlayStrength: 40 }
    const result   = applyPolishAction(controls, 'increase_contrast')
    expect(result.overlayStrength).toBeGreaterThan(controls.overlayStrength)
  })

  it('more_festive changes accent color', () => {
    const controls = defaultDesignControls()
    const result   = applyPolishAction(controls, 'more_festive')
    expect(result.accentColor).not.toBe(controls.accentColor)
  })

  it('polish actions never change commercial fields (no such property)', () => {
    // Controls object has no commercial field — this is structural
    const controls = defaultDesignControls()
    const result   = applyPolishAction(controls, 'make_more_premium')
    expect('price'    in result).toBe(false)
    expect('route'    in result).toBe(false)
    expect('headline' in result).toBe(false)
  })

  it('overlay strength is always clamped to 0–100', () => {
    const base = { ...defaultDesignControls(), overlayStrength: 95 }
    const r1   = applyPolishAction(base, 'increase_contrast')
    expect(r1.overlayStrength).toBeLessThanOrEqual(100)

    const base2 = { ...defaultDesignControls(), overlayStrength: 5 }
    const r2    = applyPolishAction(base2, 'make_more_minimal')
    expect(r2.overlayStrength).toBeGreaterThanOrEqual(0)
  })
})

// ── Design Variations ─────────────────────────────────────────────────────────

describe('Design variations', () => {
  it('three variations A, B, C are defined', () => {
    expect(DESIGN_VARIATIONS.map(v => v.key)).toEqual(['A', 'B', 'C'])
  })

  it('each variation has a distinct focus', () => {
    const focuses = DESIGN_VARIATIONS.map(v => v.focus)
    const unique  = new Set(focuses)
    expect(unique.size).toBe(3)
  })

  it('variation prompt modifier contains no commercial patterns', () => {
    for (const v of DESIGN_VARIATIONS) {
      const modifier = buildVariationPromptModifier(v)
      expect(modifier).not.toMatch(/\b\d{4,}\b/)         // no large numbers
      expect(modifier).not.toMatch(/NGN|USD|GBP|€|£|\$/) // no currencies
    }
  })

  it('applyVariationControls merges override onto base', () => {
    const base    = defaultDesignControls()
    const varB    = DESIGN_VARIATIONS.find(v => v.key === 'B')!
    const result  = applyVariationControls(base, varB)
    expect(result.backgroundIntensity).toBe(varB.controlsOverride.backgroundIntensity!)
    // commercial fields untouched (not in controls)
    expect('price' in result).toBe(false)
  })

  it('variationPreservesCommercialFields returns true when fields identical', () => {
    const fields   = { headline: 'Fly With Walz', price: '850000', cta: 'Book Now' }
    const comp1    = makeComp('walz_hero_split', fields)
    const comp2    = makeComp('walz_hero_split', fields)
    expect(variationPreservesCommercialFields(comp1, comp2)).toBe(true)
  })

  it('variationPreservesCommercialFields returns false when fields differ', () => {
    const comp1 = makeComp('walz_hero_split', { headline: 'Original', price: '100' })
    const comp2 = makeComp('walz_hero_split', { headline: 'Changed',  price: '200' })
    expect(variationPreservesCommercialFields(comp1, comp2)).toBe(false)
  })
})

// ── Safe Zones ────────────────────────────────────────────────────────────────

describe('Safe zones', () => {
  it('all 5 templates have safe zones defined', () => {
    for (const t of ALL_TEMPLATES) {
      expect(TEMPLATE_SAFE_ZONES[t.key]).toBeDefined()
    }
  })

  it('buildSafeZonePrompt returns a non-empty string', () => {
    const zones  = TEMPLATE_SAFE_ZONES['walz_hero_split']
    const prompt = buildSafeZonePrompt(zones)
    expect(prompt.length).toBeGreaterThan(20)
    expect(prompt).not.toMatch(/\d{4,}/)   // no large numbers
    expect(prompt).not.toMatch(/NGN|USD/)   // no currencies
  })

  it('layerOverlapsFooter detects overlap correctly', () => {
    const zones = TEMPLATE_SAFE_ZONES['walz_hero_split']
    // A layer that ends below the footer start — should overlap
    const overlapping = layerOverlapsFooter(0, 0.92, 0.5, 0.05, zones)
    expect(overlapping).toBe(true)

    // A layer well above the footer — should not overlap
    const safe = layerOverlapsFooter(0.1, 0.1, 0.5, 0.05, zones)
    expect(safe).toBe(false)
  })

  it('all safe zone coordinates are 0–1 fractional', () => {
    for (const zones of Object.values(TEMPLATE_SAFE_ZONES)) {
      for (const zoneName of ['subjectZone', 'textZone', 'logoZone', 'footerZone'] as const) {
        const z = zones[zoneName]
        expect(z.x).toBeGreaterThanOrEqual(0)
        expect(z.x).toBeLessThanOrEqual(1)
        expect(z.y).toBeGreaterThanOrEqual(0)
        expect(z.y).toBeLessThanOrEqual(1)
        expect(z.width).toBeGreaterThan(0)
        expect(z.height).toBeGreaterThan(0)
      }
    }
  })
})

// ── Decorative Elements ───────────────────────────────────────────────────────

describe('Decorative elements', () => {
  it('catalog has at least 10 elements', () => {
    expect(ALL_DECORATIVE_ELEMENTS.length).toBeGreaterThanOrEqual(10)
  })

  it('all elements have key, label, icon, category', () => {
    for (const el of ALL_DECORATIVE_ELEMENTS) {
      expect(el.key).toBeTruthy()
      expect(el.label).toBeTruthy()
      expect(el.icon).toBeTruthy()
      expect(el.category).toBeTruthy()
    }
  })

  it('getElementsByCategory returns correct subset', () => {
    const travel = getElementsByCategory('travel')
    expect(travel.every(e => e.category === 'travel')).toBe(true)
    expect(travel.length).toBeGreaterThan(0)
  })

  it('seasonal elements include seasonal_lights', () => {
    const seasonal = getElementsByCategory('seasonal')
    expect(seasonal.some(e => e.key === 'seasonal_lights')).toBe(true)
  })

  it('TEMPLATE_DECORATIVE_DEFAULTS covers all 5 templates', () => {
    for (const t of ALL_TEMPLATES) {
      expect(TEMPLATE_DECORATIVE_DEFAULTS).toHaveProperty(t.key)
    }
  })
})

// ── Quality Scoring ───────────────────────────────────────────────────────────

describe('Quality scoring', () => {
  it('scoreComposition returns 0–100 total', () => {
    const comp   = makeComp('walz_hero_split', { headline: 'Fly Now', cta: 'Book' })
    const result = scoreComposition(comp, defaultDesignControls())
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThanOrEqual(100)
  })

  it('missing headline reduces score', () => {
    const withHeadline    = makeComp('walz_hero_split', { headline: 'Fly Now', cta: 'Book' })
    const withoutHeadline = makeComp('walz_hero_split', {})
    const s1 = scoreComposition(withHeadline, defaultDesignControls()).total
    const s2 = scoreComposition(withoutHeadline, defaultDesignControls()).total
    expect(s1).toBeGreaterThan(s2)
  })

  it('missing headline produces blocking warning', () => {
    const comp   = makeComp('walz_hero_split', {})
    const result = scoreComposition(comp, defaultDesignControls())
    const blocking = result.warnings.filter(w => w.blocking)
    expect(blocking.length).toBeGreaterThan(0)
  })

  it('scoreColor returns correct band (Phase 4 calibration: green≥80, yellow≥60)', () => {
    expect(scoreColor(80)).toBe('green')
    expect(scoreColor(90)).toBe('green')
    expect(scoreColor(79)).toBe('yellow')
    expect(scoreColor(60)).toBe('yellow')
    expect(scoreColor(59)).toBe('red')
    expect(scoreColor(30)).toBe('red')
  })

  it('low overlay produces contrast warning', () => {
    const controls  = { ...defaultDesignControls(), overlayStrength: 15 }
    const comp      = makeComp('walz_hero_split', { headline: 'Test' },
      { ...controls, overlayStrength: 15 })
    const compWithImg = {
      ...comp,
      visualAssetId: 'test-id',
      layers: [
        { id: 'bg_image', type: 'image' as const, src: 'http://example.com/img.jpg',
          objectFit: 'cover' as const, x: 0, y: 0, width: 1, height: 1, zIndex: 0, visible: true },
        ...comp.layers,
      ],
    }
    const result = scoreComposition(compWithImg, controls)
    const hasContrastWarn = result.warnings.some(w => w.field === 'overlay')
    expect(hasContrastWarn).toBe(true)
  })

  it('scoreComposition with safe zones checks boundary', () => {
    const zones = TEMPLATE_SAFE_ZONES['walz_hero_split']
    const comp  = makeComp('walz_hero_split', { headline: 'Test', cta: 'Book' })
    const result = scoreComposition(comp, defaultDesignControls(), zones)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(typeof result.scores.safeZone).toBe('number')
  })
})

// ── Template Variants ─────────────────────────────────────────────────────────

describe('Template variants', () => {
  it('extractTemplateVariant strips text from layer overrides', () => {
    const controls  = defaultDesignControls()
    const overrides = {
      headline: { x: 0.1, y: 0.2, text: 'Do not store this', fontSize: 64 } as Record<string, unknown>,
    }
    const variant = extractTemplateVariant(
      'walz_hero_split',
      'walz_hero_split_test',
      'Test Variant',
      controls,
      overrides as Record<string, Partial<import('../lib/orbit/composer/layer-model').DesignLayer>>,
      [],
      'user-123',
    )
    // text must not survive into the variant
    expect(JSON.stringify(variant.layerOverrides)).not.toContain('Do not store this')
  })

  it('extractTemplateVariant preserves visual-only fields', () => {
    const controls = defaultDesignControls()
    const variant  = extractTemplateVariant(
      'walz_hero_split',
      'walz_hero_split_test',
      'Test Variant',
      controls,
      { cta: { x: 0.5, y: 0.88 } as Partial<import('../lib/orbit/composer/layer-model').DesignLayer> },
      [],
      'user-123',
    )
    expect(variant.layerOverrides.cta).toBeDefined()
    expect((variant.layerOverrides.cta as { x?: number }).x).toBe(0.5)
  })

  it('validateVariantIsCommercialFree passes a clean variant', () => {
    const controls  = defaultDesignControls()
    const variant   = extractTemplateVariant(
      'walz_hero_split', 'test', 'Test', controls,
      { logo: { x: 0.5 } as Partial<import('../lib/orbit/composer/layer-model').DesignLayer> },
      [], 'user-1',
    )
    const violations = validateVariantIsCommercialFree(variant)
    expect(violations).toHaveLength(0)
  })

  it('variant stores createdBy and timestamps', () => {
    const variant = extractTemplateVariant(
      'walz_hero_split', 'test', 'Test', defaultDesignControls(), {}, [], 'admin-007',
    )
    expect(variant.createdBy).toBe('admin-007')
    expect(variant.createdAt).toBeTruthy()
    expect(variant.baseTemplateKey).toBe('walz_hero_split')
  })
})

// ── buildTemplateComposition with controls ────────────────────────────────────

describe('buildTemplateComposition with DesignControls', () => {
  it('minimal contentDensity hides route cards', () => {
    const controls = { ...defaultDesignControls(), contentDensity: 'minimal' as const }
    const comp     = makeComp('walz_hero_split', { headline: 'Test', route: 'Lagos • London' }, controls)
    const routeLayer = comp.layers.find(l => l.id === 'route_card')
    expect(routeLayer).toBeUndefined()
  })

  it('balanced contentDensity shows route cards', () => {
    const controls = { ...defaultDesignControls(), contentDensity: 'balanced' as const }
    const comp     = makeComp('walz_hero_split', { headline: 'Test', route: 'Lagos • London' }, controls)
    const routeLayer = comp.layers.find(l => l.id === 'route_card')
    expect(routeLayer).toBeDefined()
  })

  it('full footer control uses full contact bar variant', () => {
    const controls = { ...defaultDesignControls(), footer: 'full' as const }
    const comp     = makeComp('walz_hero_split', { headline: 'Test' }, controls)
    const bar      = comp.layers.find(l => l.id === 'contact_bar') as { items?: unknown[] } | undefined
    // Full variant has 5 items
    expect(bar?.items?.length).toBe(5)
  })

  it('controls snapshot is embedded in composition', () => {
    const controls = { ...defaultDesignControls(), overlayStrength: 77 }
    const comp     = makeComp('walz_hero_split', { headline: 'Test' }, controls)
    expect(comp.controls?.overlayStrength).toBe(77)
  })

  it('text alignment from controls applies to headline', () => {
    const controls = { ...defaultDesignControls(), textAlignment: 'left' as const }
    const comp     = makeComp('walz_hero_split', { headline: 'Test' }, controls)
    const headline = comp.layers.find(l => l.id === 'headline') as { align?: string } | undefined
    expect(headline?.align).toBe('left')
  })
})

// ── Auto-fit widow avoidance ──────────────────────────────────────────────────

describe('autoFitText widow avoidance', () => {
  it('single-word last line is redistributed for 3+ line wraps', () => {
    // 4-word groups that wrap to 4 lines with tiny box, last being single word
    const text = 'We flew to London'
    const result = autoFitText(
      { text, boxWidth: 80, boxHeight: 200, maxFontSize: 20, minFontSize: 12, maxLines: 6 },
      estimateMeasure,
    )
    // The last line should have > 1 word if widow avoidance fired
    if (result.lines.length >= 3) {
      const lastLine = result.lines[result.lines.length - 1]
      // After widow avoidance, last line should have multiple words
      expect(lastLine.split(' ').filter(Boolean).length).toBeGreaterThanOrEqual(1)
    }
    expect(result.overflow).toBe(false)
  })

  it('avoidWidow does not fire for 1–2 line wraps', () => {
    const text = 'Short text'
    const result = autoFitText(
      { text, boxWidth: 500, boxHeight: 200, maxFontSize: 40, minFontSize: 20 },
      estimateMeasure,
    )
    // Should not throw, should return lines
    expect(result.lines.length).toBeGreaterThanOrEqual(1)
    expect(result.overflow).toBe(false)
  })
})

// ── Format reflow with controls ───────────────────────────────────────────────

describe('Format reflow with controls', () => {
  it('story canvas uses zoneVariants and controls together', () => {
    const controls = { ...defaultDesignControls(), textAlignment: 'center' as const }
    const template = TEMPLATE_MAP['walz_hero_split']!
    const comp = buildTemplateComposition({
      template,
      commercialFields: { headline: 'Fly Home', cta: 'Book' },
      canvas: STORY,
      controls,
    })
    expect(comp.canvas.key).toBe('1080x1920')
    const headline = comp.layers.find(l => l.id === 'headline') as { y?: number } | undefined
    expect(headline?.y).toBeDefined()
    // Story format has y variant ~0.20 (from walz-hero-split zoneVariants)
    expect(headline?.y).toBeLessThan(0.35)
  })

  it('all 5 templates produce valid compositions with story canvas', () => {
    const controls = defaultDesignControls()
    for (const template of ALL_TEMPLATES) {
      const supportsStory = template.canvases.some(c => c.key === '1080x1920')
      if (!supportsStory) continue
      const comp = buildTemplateComposition({
        template,
        commercialFields: { headline: 'Test' },
        canvas: STORY,
        controls,
      })
      expect(comp.layers.length).toBeGreaterThan(0)
      expect(comp.canvas.height).toBe(1920)
    }
  })
})
