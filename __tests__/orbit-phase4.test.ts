/**
 * Walz Orbit — Phase 4 tests: Production Design Calibration
 *
 * Covers:
 *   - Benchmark fixture completeness and schema correctness
 *   - Decorative restraint rules: forbidden elements, max counts, zone overlap
 *   - Production starters: completeness, commercial-free validation
 *   - Quality score recalibration: 90+ publishable, no-image cap, blocking gates
 *   - Template calibration: safe zone coordinate ranges
 *   - scoreToVerdict mapping
 *   - BenchmarkReviewRecord structure
 */

import {
  ALL_BENCHMARKS, BENCHMARK_MAP,
  VERDICT_DESCRIPTORS, REVIEW_ISSUE_DESCRIPTORS,
  getVerdictDescriptor,
} from '../lib/orbit/benchmarks'

import {
  TEMPLATE_DECORATIVE_RESTRAINTS,
  checkDecorativeRestraints,
  sanitiseDecoratives,
} from '../lib/orbit/composer/decorative-restraint'

import type { DecorativeElementInstance } from '../lib/orbit/composer/decorative-elements'
import { ALL_STARTERS, STARTERS_BY_TEMPLATE, STARTER_MAP } from '../lib/orbit/starters'
import { validateVariantIsCommercialFree } from '../lib/orbit/composer/template-variants'

import {
  scoreComposition,
  scoreColor,
  scoreToVerdict,
} from '../lib/orbit/composer/quality-score'

import type { DesignComposition } from '../lib/orbit/composer/layer-model'
import { TEMPLATE_SAFE_ZONES } from '../lib/orbit/composer/safe-zones'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMinimalComposition(overrides: Partial<DesignComposition> = {}): DesignComposition {
  return {
    tag:              '__walz_designer_v1',
    templateKey:      'walz_hero_split',
    canvas:           { key: '1080x1350', width: 1080, height: 1350, label: '4:5' },
    layers: [
      { id: 'logo',     type: 'logo',  x: 0.5, y: 0.045, visible: true, zIndex: 10, text: 'WALZ TRAVELS', fontSize: 28, fontWeight: '800', color: '#fff', align: 'center' },
      { id: 'headline', type: 'text',  x: 0.05, y: 0.20, visible: true, zIndex: 5,  text: 'Campaign headline', fontSize: 72, fontWeight: '800', color: '#fff', align: 'left', maxWidth: 0.5 },
      { id: 'cta',      type: 'cta_button', x: 0.17, y: 0.84, visible: true, zIndex: 8, text: 'Book Now', fontSize: 27, color: '#1a1a2e', backgroundColor: '#d4af37', borderRadius: 8, paddingX: 30, paddingY: 12 },
      { id: 'contact',  type: 'text',  x: 0.5, y: 0.96, visible: true, zIndex: 3, text: '+234 707 769 1701', fontSize: 16, fontWeight: '600', color: '#d4af37', align: 'center' },
    ],
    commercialFields: { headline: 'Campaign headline', cta: 'Book Now' },
    visualAssetId:    'asset_001',
    ...overrides,
  } as unknown as DesignComposition
}

// ── BENCHMARK FIXTURE TESTS ────────────────────────────────────────────────────

describe('Benchmark fixtures', () => {
  test('ALL_BENCHMARKS has exactly 3 entries', () => {
    expect(ALL_BENCHMARKS).toHaveLength(3)
  })

  test('BENCHMARK_MAP indexes all benchmarks by key', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(BENCHMARK_MAP[b.key]).toBeDefined()
      expect(BENCHMARK_MAP[b.key].key).toBe(b.key)
    }
  })

  test('each benchmark has a valid templateKey', () => {
    const validKeys = [
      'walz_hero_split', 'walz_seasonal_campaign', 'walz_information_poster',
      'walz_destination_editorial', 'walz_travel_collage',
    ]
    for (const b of ALL_BENCHMARKS) {
      expect(validKeys).toContain(b.templateKey)
    }
  })

  test('each benchmark has a canvas', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.canvas).toMatch(/^\d+x\d+$/)
    }
  })

  test('each benchmark has a label and description', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.label.length).toBeGreaterThan(3)
      expect(b.description.length).toBeGreaterThan(10)
    }
  })

  test('minimum publishable score is in range 60–95', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.minimumPublishableScore).toBeGreaterThanOrEqual(60)
      expect(b.minimumPublishableScore).toBeLessThanOrEqual(95)
    }
  })

  test('each benchmark has reviewer notes and reference prompt seed', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.reviewerNotes.length).toBeGreaterThan(20)
      expect(b.referencePromptSeed.length).toBeGreaterThan(20)
    }
  })

  test('sampleFields have label, example, and required', () => {
    for (const b of ALL_BENCHMARKS) {
      for (const f of b.sampleFields) {
        expect(f.label).toBeTruthy()
        expect(f.example).toBeTruthy()
        expect(typeof f.required).toBe('boolean')
      }
    }
  })

  test('benchmark A is hero_split template', () => {
    const a = ALL_BENCHMARKS.find(b => b.key === 'benchmark_hero_crypto')
    expect(a?.templateKey).toBe('walz_hero_split')
    expect(a?.expectedVisual.subjectPlacement).toBe('right')
  })

  test('benchmark B is seasonal_campaign template', () => {
    const b = ALL_BENCHMARKS.find(bm => bm.key === 'benchmark_seasonal_december')
    expect(b?.templateKey).toBe('walz_seasonal_campaign')
    expect(b?.expectedLayout.overlayStrength).toBeGreaterThanOrEqual(55)
  })

  test('benchmark C is information_poster template', () => {
    const c = ALL_BENCHMARKS.find(b => b.key === 'benchmark_information_work_permit')
    expect(c?.templateKey).toBe('walz_information_poster')
    expect(c?.expectedLayout.contentDensity).toBe('information_heavy')
    expect(c?.expectedDecoratives).toHaveLength(0)
  })
})

// ── VERDICT DESCRIPTOR TESTS ──────────────────────────────────────────────────

describe('Verdict descriptors', () => {
  test('all 4 verdict types are present', () => {
    const keys = VERDICT_DESCRIPTORS.map(d => d.verdict)
    expect(keys).toContain('PUBLISHABLE')
    expect(keys).toContain('NEEDS_MINOR_EDIT')
    expect(keys).toContain('NEEDS_MAJOR_EDIT')
    expect(keys).toContain('REJECT')
  })

  test('getVerdictDescriptor returns correct descriptor', () => {
    const d = getVerdictDescriptor('PUBLISHABLE')
    expect(d.verdict).toBe('PUBLISHABLE')
    expect(d.label).toBeTruthy()
    expect(d.color).toMatch(/^text-/)
  })

  test('getVerdictDescriptor falls back to REJECT for unknown', () => {
    const d = getVerdictDescriptor('UNKNOWN' as never)
    expect(d.verdict).toBe('REJECT')
  })

  test('at least 10 review issue descriptors exist', () => {
    expect(REVIEW_ISSUE_DESCRIPTORS.length).toBeGreaterThanOrEqual(10)
  })

  test('each issue has a remediation string', () => {
    for (const d of REVIEW_ISSUE_DESCRIPTORS) {
      expect(d.remediation.length).toBeGreaterThan(5)
    }
  })
})

// ── DECORATIVE RESTRAINT TESTS ────────────────────────────────────────────────

describe('Decorative restraint rules', () => {
  test('all 5 templates have restraint rules', () => {
    const templateKeys = [
      'walz_hero_split', 'walz_seasonal_campaign', 'walz_information_poster',
      'walz_destination_editorial', 'walz_travel_collage',
    ]
    for (const key of templateKeys) {
      expect(TEMPLATE_DECORATIVE_RESTRAINTS[key]).toBeDefined()
    }
  })

  test('information_poster has maxTotal 0', () => {
    const rule = TEMPLATE_DECORATIVE_RESTRAINTS['walz_information_poster']
    expect(rule.maxTotal).toBe(0)
  })

  test('hero_split allows aircraft but forbids seasonal elements', () => {
    const rule = TEMPLATE_DECORATIVE_RESTRAINTS['walz_hero_split']
    expect(rule.forbidden).toContain('christmas_ornaments')
    expect(rule.forbidden).toContain('seasonal_lights')
    expect(rule.forbidden).not.toContain('aircraft')
  })

  test('seasonal_campaign forbids aircraft', () => {
    const rule = TEMPLATE_DECORATIVE_RESTRAINTS['walz_seasonal_campaign']
    expect(rule.forbidden).toContain('aircraft')
  })

  test('checkDecorativeRestraints: aircraft on seasonal is a violation', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'aircraft', x: 0.7, y: 0.1, scale: 0.1, opacity: 0.8, visible: true },
    ]
    const violations = checkDecorativeRestraints('walz_seasonal_campaign', elements)
    expect(violations.some(v => v.rule === 'forbidden')).toBe(true)
  })

  test('checkDecorativeRestraints: 1 aircraft on hero_split passes', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'aircraft', x: 0.7, y: 0.1, scale: 0.1, opacity: 0.8, visible: true },
    ]
    const violations = checkDecorativeRestraints('walz_hero_split', elements)
    const forbidden = violations.filter(v => v.rule === 'forbidden')
    expect(forbidden).toHaveLength(0)
  })

  test('checkDecorativeRestraints: 3 elements on hero_split exceeds max of 2', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'aircraft',       x: 0.7, y: 0.1, scale: 0.08, opacity: 0.8, visible: true },
      { elementKey: 'landmark_accent',x: 0.6, y: 0.3, scale: 0.08, opacity: 0.7, visible: true },
      { elementKey: 'clouds',         x: 0.5, y: 0.2, scale: 0.08, opacity: 0.5, visible: true },
    ]
    const violations = checkDecorativeRestraints('walz_hero_split', elements)
    expect(violations.some(v => v.rule === 'max_total')).toBe(true)
  })

  test('checkDecorativeRestraints: any element on information_poster is a violation', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'landmark_accent', x: 0.5, y: 0.5, scale: 0.1, opacity: 0.8, visible: true },
    ]
    const violations = checkDecorativeRestraints('walz_information_poster', elements)
    expect(violations.some(v => v.blocking)).toBe(true)
  })

  test('checkDecorativeRestraints: hidden elements do not trigger max_total', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'aircraft',       x: 0.7, y: 0.1, scale: 0.08, opacity: 0.8, visible: false },
      { elementKey: 'landmark_accent',x: 0.6, y: 0.3, scale: 0.08, opacity: 0.7, visible: false },
      { elementKey: 'clouds',         x: 0.5, y: 0.2, scale: 0.08, opacity: 0.5, visible: false },
    ]
    const violations = checkDecorativeRestraints('walz_hero_split', elements)
    expect(violations.filter(v => v.rule === 'max_total')).toHaveLength(0)
  })

  test('sanitiseDecoratives removes forbidden elements', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'aircraft',        x: 0.7, y: 0.1, scale: 0.1, opacity: 0.8, visible: true },
      { elementKey: 'christmas_ornaments', x: 0.5, y: 0.9, scale: 0.1, opacity: 0.8, visible: true },
    ]
    const clean = sanitiseDecoratives('walz_hero_split', elements)
    expect(clean.some(e => e.elementKey === 'christmas_ornaments')).toBe(false)
    expect(clean.some(e => e.elementKey === 'aircraft')).toBe(true)
  })

  test('sanitiseDecoratives hides over-limit elements', () => {
    const elements: DecorativeElementInstance[] = [
      { elementKey: 'aircraft',        x: 0.7, y: 0.1, scale: 0.1, opacity: 0.8, visible: true },
      { elementKey: 'landmark_accent', x: 0.6, y: 0.3, scale: 0.1, opacity: 0.8, visible: true },
      { elementKey: 'clouds',          x: 0.5, y: 0.2, scale: 0.1, opacity: 0.5, visible: true },
    ]
    const clean = sanitiseDecoratives('walz_hero_split', elements)
    const visibleCount = clean.filter(e => e.visible).length
    expect(visibleCount).toBeLessThanOrEqual(2)
  })
})

// ── PRODUCTION STARTERS TESTS ─────────────────────────────────────────────────

describe('Production starters', () => {
  test('at least 8 starters exist', () => {
    expect(ALL_STARTERS.length).toBeGreaterThanOrEqual(8)
  })

  test('all starters have unique keys', () => {
    const keys = ALL_STARTERS.map(s => s.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  test('STARTERS_BY_TEMPLATE groups correctly', () => {
    expect(Object.keys(STARTERS_BY_TEMPLATE).length).toBeGreaterThanOrEqual(4)
    expect(STARTERS_BY_TEMPLATE['walz_hero_split']?.length).toBeGreaterThanOrEqual(2)
    expect(STARTERS_BY_TEMPLATE['walz_seasonal_campaign']?.length).toBeGreaterThanOrEqual(1)
  })

  test('STARTER_MAP indexes by key', () => {
    for (const s of ALL_STARTERS) {
      expect(STARTER_MAP[s.key]).toBeDefined()
    }
  })

  test('all starters have description', () => {
    for (const s of ALL_STARTERS) {
      expect(s.description?.length ?? 0).toBeGreaterThan(5)
    }
  })

  test('all starters have a typographyPreset', () => {
    const validPresets = ['editorial_bold', 'premium_minimal', 'campaign_heavy', 'information_clean', 'luxury_modern']
    for (const s of ALL_STARTERS) {
      expect(validPresets).toContain(s.typographyPreset)
    }
  })

  test('all starters have decorativeElements as empty array', () => {
    for (const s of ALL_STARTERS) {
      expect(Array.isArray(s.decorativeElements)).toBe(true)
      expect(s.decorativeElements).toHaveLength(0)
    }
  })

  test('all starters have layerOverrides as empty object', () => {
    for (const s of ALL_STARTERS) {
      expect(typeof s.layerOverrides).toBe('object')
      expect(Object.keys(s.layerOverrides)).toHaveLength(0)
    }
  })

  test('all starters pass validateVariantIsCommercialFree', () => {
    for (const s of ALL_STARTERS) {
      const violations = validateVariantIsCommercialFree(s)
      expect(violations).toHaveLength(0)
    }
  })

  test('information poster starters use information_clean or premium_minimal preset', () => {
    const infoStarters = STARTERS_BY_TEMPLATE['walz_information_poster'] ?? []
    for (const s of infoStarters) {
      expect(['information_clean', 'premium_minimal']).toContain(s.typographyPreset)
    }
  })

  test('hero split starters have subjectPosition right', () => {
    const heroStarters = STARTERS_BY_TEMPLATE['walz_hero_split'] ?? []
    for (const s of heroStarters) {
      expect(s.controls.subjectPosition).toBe('right')
    }
  })
})

// ── QUALITY SCORE CALIBRATION TESTS ──────────────────────────────────────────

describe('Quality score calibration (Phase 4)', () => {
  test('fully complete composition with image scores 85+', () => {
    const comp = makeMinimalComposition({
      commercialFields: { headline: 'Campaign headline', cta: 'Book Now' },
      visualAssetId:    'asset_001',
    })
    const controls = { overlayStrength: 55, contentDensity: 'balanced', footer: 'full' } as never
    const result = scoreComposition(comp, controls)
    expect(result.total).toBeGreaterThanOrEqual(85)
  })

  test('composition with no image includes a visual warning', () => {
    const comp = makeMinimalComposition({
      commercialFields: { headline: 'Campaign headline', cta: 'Book Now' },
      visualAssetId:    undefined,
    })
    const result = scoreComposition(comp)
    // Score is lower without an image, and a visual warning is present
    const visualWarning = result.warnings.find(w => w.field === 'visual')
    expect(visualWarning).toBeDefined()
    // contentFit is capped — score cannot be perfect without an image
    expect(result.scores.contentFit).toBeLessThan(100)
    expect(result.scores.contentFit).toBeLessThanOrEqual(75)
  })

  test('empty headline makes total 0 or close to it in contentFit', () => {
    const comp = makeMinimalComposition({
      commercialFields: {},
      layers: [
        { id: 'logo',    type: 'logo',  x: 0.5, y: 0.045, visible: true, zIndex: 10, text: 'WALZ TRAVELS', fontSize: 28, fontWeight: '800', color: '#fff', align: 'center' },
        { id: 'headline',type: 'text',  x: 0.05, y: 0.20, visible: true, zIndex: 5,  text: '', fontSize: 72, fontWeight: '800', color: '#fff', align: 'left' },
        { id: 'cta',     type: 'cta_button', x: 0.17, y: 0.84, visible: true, zIndex: 8, text: 'Book Now', fontSize: 27, color: '#1a1a2e', backgroundColor: '#d4af37', borderRadius: 8, paddingX: 30, paddingY: 12 },
      ],
    } as never)
    const result = scoreComposition(comp)
    // contentFit returns 0 for empty headline → total is substantially below publishable threshold
    expect(result.total).toBeLessThan(65)
  })

  test('low overlay strength (< 25) triggers blocking warning', () => {
    const comp = makeMinimalComposition({
      layers: [
        { id: 'bg_image', type: 'image', x: 0, y: 0, visible: true, zIndex: 1, src: 'https://example.com/img.jpg', objectFit: 'cover' },
        { id: 'logo',     type: 'logo',  x: 0.5, y: 0.045, visible: true, zIndex: 10, text: 'WALZ TRAVELS', fontSize: 28, fontWeight: '800', color: '#fff', align: 'center' },
        { id: 'headline', type: 'text',  x: 0.05, y: 0.20, visible: true, zIndex: 5,  text: 'Campaign', fontSize: 72, fontWeight: '800', color: '#fff', align: 'left' },
        { id: 'cta',      type: 'cta_button', x: 0.17, y: 0.84, visible: true, zIndex: 8, text: 'Book Now', fontSize: 27, color: '#1a1a2e', backgroundColor: '#d4af37', borderRadius: 8, paddingX: 30, paddingY: 12 },
        { id: 'contact',  type: 'text',  x: 0.5, y: 0.96, visible: true, zIndex: 3, text: '+234 707', fontSize: 16, fontWeight: '600', color: '#d4af37', align: 'center' },
      ],
      commercialFields: { headline: 'Campaign', cta: 'Book Now' },
      visualAssetId: 'asset_001',
    } as never)
    const controls = { overlayStrength: 15, contentDensity: 'balanced' } as never
    const result = scoreComposition(comp, controls)
    const blocking = result.warnings.some(w => w.blocking && w.field === 'overlay')
    expect(blocking).toBe(true)
  })

  test('overlay in optimal range 45–70 does not trigger overlay warning', () => {
    const comp = makeMinimalComposition({
      layers: [
        { id: 'bg_image', type: 'image', x: 0, y: 0, visible: true, zIndex: 1, src: 'https://ex.com', objectFit: 'cover' },
        { id: 'logo',     type: 'logo',  x: 0.5, y: 0.045, visible: true, zIndex: 10, text: 'WALZ', fontSize: 28, fontWeight: '800', color: '#fff', align: 'center' },
        { id: 'headline', type: 'text',  x: 0.05, y: 0.20, visible: true, zIndex: 5,  text: 'Test', fontSize: 72, fontWeight: '800', color: '#fff', align: 'left' },
        { id: 'cta',      type: 'cta_button', x: 0.17, y: 0.84, visible: true, zIndex: 8, text: 'Book', fontSize: 27, color: '#000', backgroundColor: '#d4af37', borderRadius: 8, paddingX: 20, paddingY: 10 },
        { id: 'contact',  type: 'text',  x: 0.5, y: 0.96, visible: true, zIndex: 3, text: 'contact', fontSize: 14, fontWeight: '600', color: '#d4af37', align: 'center' },
      ],
      commercialFields: { headline: 'Test', cta: 'Book' },
      visualAssetId: 'asset_001',
    } as never)
    const controls = { overlayStrength: 58, contentDensity: 'balanced' } as never
    const result = scoreComposition(comp, controls)
    const overlayWarnings = result.warnings.filter(w => w.field === 'overlay')
    expect(overlayWarnings).toHaveLength(0)
  })

  test('scoreColor bands: green≥80, yellow≥60, red<60', () => {
    expect(scoreColor(80)).toBe('green')
    expect(scoreColor(95)).toBe('green')
    expect(scoreColor(79)).toBe('yellow')
    expect(scoreColor(60)).toBe('yellow')
    expect(scoreColor(59)).toBe('red')
    expect(scoreColor(0)).toBe('red')
  })

  test('scoreToVerdict bands are correct', () => {
    expect(scoreToVerdict(90)).toBe('Likely Publishable')
    expect(scoreToVerdict(80)).toBe('Needs Minor Review')
    expect(scoreToVerdict(65)).toBe('Needs Major Edit')
    expect(scoreToVerdict(40)).toBe('Not Publishable')
  })

  test('hidden CTA reduces ctaVisibility score', () => {
    const comp = makeMinimalComposition({
      layers: [
        { id: 'logo',     type: 'logo',  x: 0.5, y: 0.045, visible: true, zIndex: 10, text: 'WALZ', fontSize: 28, fontWeight: '800', color: '#fff', align: 'center' },
        { id: 'headline', type: 'text',  x: 0.05, y: 0.20, visible: true, zIndex: 5,  text: 'Campaign', fontSize: 72, fontWeight: '800', color: '#fff', align: 'left' },
        { id: 'cta',      type: 'cta_button', x: 0.17, y: 0.84, visible: false, zIndex: 8, text: 'Book Now', fontSize: 27, color: '#000', backgroundColor: '#d4af37', borderRadius: 8, paddingX: 20, paddingY: 10 },
        { id: 'contact',  type: 'text',  x: 0.5, y: 0.96, visible: true, zIndex: 3, text: 'contact', fontSize: 14, fontWeight: '600', color: '#d4af37', align: 'center' },
      ],
      commercialFields: { headline: 'Campaign', cta: 'Book Now' },
      visualAssetId: 'asset_001',
    } as never)
    const result = scoreComposition(comp)
    expect(result.scores.ctaVisibility).toBeLessThan(100)
  })
})

// ── SAFE ZONE CALIBRATION TESTS ────────────────────────────────────────────────

describe('Safe zone calibration (Phase 4)', () => {
  const templates = [
    'walz_hero_split',
    'walz_seasonal_campaign',
    'walz_information_poster',
    'walz_destination_editorial',
    'walz_travel_collage',
  ]

  test('all 5 templates have safe zones', () => {
    for (const t of templates) {
      expect(TEMPLATE_SAFE_ZONES[t]).toBeDefined()
    }
  })

  test('all safe zone coordinates are 0–1', () => {
    for (const t of templates) {
      const zones = TEMPLATE_SAFE_ZONES[t]
      const all = [zones.subjectZone, zones.textZone, zones.logoZone, zones.footerZone]
      for (const z of all) {
        expect(z.x).toBeGreaterThanOrEqual(0)
        expect(z.y).toBeGreaterThanOrEqual(0)
        expect(z.x + z.width).toBeLessThanOrEqual(1.01)  // small float tolerance
        expect(z.y + z.height).toBeLessThanOrEqual(1.01)
      }
    }
  })

  test('hero_split: subject zone is on the right (x >= 0.40)', () => {
    const z = TEMPLATE_SAFE_ZONES['walz_hero_split'].subjectZone
    expect(z.x).toBeGreaterThanOrEqual(0.40)
  })

  test('hero_split: text zone is on the left (x + width <= 0.55)', () => {
    const z = TEMPLATE_SAFE_ZONES['walz_hero_split'].textZone
    expect(z.x + z.width).toBeLessThanOrEqual(0.55)
  })

  test('information_poster: textZone covers most of canvas height (height >= 0.60)', () => {
    const z = TEMPLATE_SAFE_ZONES['walz_information_poster'].textZone
    expect(z.height).toBeGreaterThanOrEqual(0.60)
  })

  test('footer zones start at y >= 0.85 for all templates', () => {
    for (const t of templates) {
      const fz = TEMPLATE_SAFE_ZONES[t].footerZone
      expect(fz.y).toBeGreaterThanOrEqual(0.85)
    }
  })

  test('margin is in sane range 0.02–0.06', () => {
    for (const t of templates) {
      const margin = TEMPLATE_SAFE_ZONES[t].margin
      expect(margin).toBeGreaterThanOrEqual(0.02)
      expect(margin).toBeLessThanOrEqual(0.06)
    }
  })
})
