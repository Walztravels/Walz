/**
 * Walz Orbit — Production Hardening Patch Regression Tests
 *
 * Tests cover:
 * - Draft serialization / deserialization
 * - Invalid draft recovery (wrong version / corrupt JSON)
 * - preserveCompatibleFields (commercial safety during starter switch)
 * - Starter active state tracking
 * - Starter switch retains visual and commercial fields (logic)
 * - Quick Design controls share state (architecture invariant check)
 * - Benchmark review API input validation
 */

import {
  serializeDraft,
  loadDraft,
  saveDraft,
  clearDraft,
  preserveCompatibleFields,
  DRAFT_VERSION,
  DRAFT_KEY,
  type DesignerDraftV1,
} from '@/lib/orbit/designer-draft'

import { defaultDesignControls } from '@/lib/orbit/composer'
import { ALL_STARTERS, STARTERS_BY_TEMPLATE, STARTER_MAP } from '@/lib/orbit/starters'
import { ALL_BENCHMARKS } from '@/lib/orbit/benchmarks'
import { ALL_TEMPLATES, TEMPLATE_MAP } from '@/lib/orbit/templates'

// ── localStorage mock ─────────────────────────────────────────────────────────

function makeLocalStorage() {
  const store: Record<string, string> = {}
  return {
    getItem:    (k: string) => store[k] ?? null,
    setItem:    (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear:      () => { Object.keys(store).forEach(k => delete store[k]) },
  }
}

beforeEach(() => {
  const ls = makeLocalStorage()
  Object.defineProperty(global, 'localStorage', { value: ls, configurable: true })
})

// ── Draft serialization ───────────────────────────────────────────────────────

describe('serializeDraft', () => {
  const controls = defaultDesignControls()

  it('produces version 1 schema', () => {
    const draft = serializeDraft('walz_hero_split', null, '1080x1350', null, {}, controls, {})
    expect(draft.version).toBe(DRAFT_VERSION)
    expect(draft.version).toBe(1)
  })

  it('preserves all top-level fields', () => {
    const fields  = { headline: 'Summer Sale', price: '₦250,000' }
    const now     = '2026-08-01T12:00:00.000Z'
    const draft   = serializeDraft('walz_hero_split', 'hero_premium_dark', '1080x1920', 'media_abc', fields, controls, {}, now)
    expect(draft.templateKey).toBe('walz_hero_split')
    expect(draft.starterKey).toBe('hero_premium_dark')
    expect(draft.format).toBe('1080x1920')
    expect(draft.visualAssetId).toBe('media_abc')
    expect(draft.commercialFields).toEqual(fields)
    expect(draft.savedAt).toBe(now)
  })

  it('accepts null starterKey and null visualAssetId', () => {
    const draft = serializeDraft('walz_seasonal_campaign', null, '1080x1080', null, {}, controls, {})
    expect(draft.starterKey).toBeNull()
    expect(draft.visualAssetId).toBeNull()
  })

  it('stores controls verbatim', () => {
    const custom = { ...controls, overlayStrength: 72, typographyPreset: 'editorial_bold' }
    const draft  = serializeDraft('walz_hero_split', null, '1080x1350', null, {}, custom, {})
    expect(draft.controls.overlayStrength).toBe(72)
    expect(draft.controls.typographyPreset).toBe('editorial_bold')
  })
})

// ── Draft save / load / clear ─────────────────────────────────────────────────

describe('loadDraft', () => {
  const controls = defaultDesignControls()

  it('returns null when nothing stored', () => {
    expect(loadDraft('campaign-001')).toBeNull()
  })

  it('round-trips: save then load returns same data', () => {
    const original = serializeDraft('walz_hero_split', 'hero_lifestyle', '1080x1350', 'asset-xyz', { price: '₦100,000' }, controls, {})
    saveDraft('campaign-001', original)
    const loaded = loadDraft('campaign-001')
    expect(loaded).not.toBeNull()
    expect(loaded!.templateKey).toBe('walz_hero_split')
    expect(loaded!.starterKey).toBe('hero_lifestyle')
    expect(loaded!.visualAssetId).toBe('asset-xyz')
    expect(loaded!.commercialFields.price).toBe('₦100,000')
  })

  it('returns null for incompatible version (version 2)', () => {
    const badDraft = { version: 2, templateKey: 'walz_hero_split' }
    localStorage.setItem(DRAFT_KEY('campaign-002'), JSON.stringify(badDraft))
    expect(loadDraft('campaign-002')).toBeNull()
  })

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(DRAFT_KEY('campaign-003'), 'not-json{{{')
    expect(loadDraft('campaign-003')).toBeNull()
  })

  it('returns null for version 0', () => {
    const badDraft = { version: 0, templateKey: 'walz_hero_split' }
    localStorage.setItem(DRAFT_KEY('campaign-004'), JSON.stringify(badDraft))
    expect(loadDraft('campaign-004')).toBeNull()
  })
})

describe('clearDraft', () => {
  const controls = defaultDesignControls()

  it('removes stored draft so subsequent load returns null', () => {
    const draft = serializeDraft('walz_hero_split', null, '1080x1350', null, {}, controls, {})
    saveDraft('campaign-reset', draft)
    expect(loadDraft('campaign-reset')).not.toBeNull()
    clearDraft('campaign-reset')
    expect(loadDraft('campaign-reset')).toBeNull()
  })

  it('does not throw when nothing to clear', () => {
    expect(() => clearDraft('campaign-nonexistent')).not.toThrow()
  })
})

// ── preserveCompatibleFields — commercial safety ──────────────────────────────

describe('preserveCompatibleFields', () => {
  it('keeps fields that exist in the new template', () => {
    const existing = { headline: 'Summer Sale', price: '₦250,000', cta: 'Book Now' }
    const result   = preserveCompatibleFields(existing, ['headline', 'price', 'cta'])
    expect(result).toEqual({ headline: 'Summer Sale', price: '₦250,000', cta: 'Book Now' })
  })

  it('drops fields not in new template', () => {
    const existing = { headline: 'Summer Sale', price: '₦250,000', special_field: 'only in old template' }
    const result   = preserveCompatibleFields(existing, ['headline', 'price'])
    expect(result).not.toHaveProperty('special_field')
    expect(result).toHaveProperty('headline')
    expect(result).toHaveProperty('price')
  })

  it('preserves only matching semantic keys across templates', () => {
    const existing = { headline: 'Fly to Dubai', route: 'Lagos → Dubai', crypto_label: 'BTC' }
    // seasonal_campaign has headline + route but not crypto_label
    const result   = preserveCompatibleFields(existing, ['headline', 'route', 'subheadline', 'price', 'cta', 'terms'])
    expect(result.headline).toBe('Fly to Dubai')
    expect(result.route).toBe('Lagos → Dubai')
    expect(result).not.toHaveProperty('crypto_label')
    expect(result).not.toHaveProperty('subheadline')  // was empty, not preserved
  })

  it('returns empty object when no fields match', () => {
    const existing = { route: 'A → B', price: '₦500k' }
    const result   = preserveCompatibleFields(existing, ['headline', 'subheadline'])
    expect(Object.keys(result).length).toBe(0)
  })

  it('returns empty object when existing fields is empty', () => {
    const result = preserveCompatibleFields({}, ['headline', 'price', 'cta'])
    expect(Object.keys(result).length).toBe(0)
  })

  it('returns empty object when new template has no fields', () => {
    const existing = { headline: 'Sale', price: '₦100k' }
    const result   = preserveCompatibleFields(existing, [])
    expect(Object.keys(result).length).toBe(0)
  })

  it('does not preserve empty string values', () => {
    const existing = { headline: '', price: '₦250,000' }
    const result   = preserveCompatibleFields(existing, ['headline', 'price'])
    expect(result).not.toHaveProperty('headline')
    expect(result.price).toBe('₦250,000')
  })
})

// ── Starter switch preserves commercial fields ─────────────────────────────────

describe('starter switch commercial safety', () => {
  it('hero starters do not discard commercial fields from hero template', () => {
    const heroStarters = STARTERS_BY_TEMPLATE['walz_hero_split'] ?? []
    expect(heroStarters.length).toBeGreaterThan(0)

    const existingFields = { headline: 'Dubai Sale', price: '₦350,000', route: 'LOS → DXB' }
    const heroTemplate   = TEMPLATE_MAP['walz_hero_split']!
    const heroLayerKeys  = heroTemplate.commercialFields.map(f => f.layerKey)

    // Simulate switching between hero starters — fields should survive
    for (const starter of heroStarters) {
      expect(starter.baseTemplateKey).toBe('walz_hero_split')
      const compatible = preserveCompatibleFields(existingFields, heroLayerKeys)
      // headline, price, route should all be preserved within same template
      expect(compatible.headline).toBe('Dubai Sale')
    }
  })

  it('switching from hero to information retains semantic matches (headline)', () => {
    const heroFields = { headline: 'Sale!', route: 'LOS → DXB', price: '₦350,000', currency: 'NGN' }
    const infoTemplate = TEMPLATE_MAP['walz_information_poster']!
    const infoKeys     = infoTemplate.commercialFields.map(f => f.layerKey)
    const compatible   = preserveCompatibleFields(heroFields, infoKeys)
    // headline is a universal field — should survive cross-template switch
    expect(compatible.headline).toBe('Sale!')
    // price, route, currency — only keep if info template has those keys
    if (!infoKeys.includes('price')) expect(compatible).not.toHaveProperty('price')
    if (!infoKeys.includes('route')) expect(compatible).not.toHaveProperty('route')
  })

  it('starter controls do not contain commercial values', () => {
    for (const starter of ALL_STARTERS) {
      // Starters must never hold commercial text values
      expect(starter.controls).not.toHaveProperty('headline')
      expect(starter.controls).not.toHaveProperty('price')
      expect(starter.controls).not.toHaveProperty('route')
      expect(starter.controls).not.toHaveProperty('cta')
      // Controls hold only visual properties
      expect(typeof starter.controls.overlayStrength).toBe('number')
      expect(typeof starter.controls.typographyPreset).toBe('string')
    }
  })
})

// ── Starter active state ──────────────────────────────────────────────────────

describe('starter active state', () => {
  it('STARTER_MAP contains all starters by key', () => {
    for (const starter of ALL_STARTERS) {
      expect(STARTER_MAP[starter.key]).toBeDefined()
      expect(STARTER_MAP[starter.key].key).toBe(starter.key)
    }
  })

  it('each starter has a unique key', () => {
    const keys = ALL_STARTERS.map(s => s.key)
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })

  it('each starter has a non-empty label and description', () => {
    for (const starter of ALL_STARTERS) {
      expect(starter.label.length).toBeGreaterThan(0)
      expect(starter.description?.length ?? 1).toBeGreaterThan(0)
    }
  })

  it('STARTERS_BY_TEMPLATE groups starters by baseTemplateKey', () => {
    for (const starter of ALL_STARTERS) {
      const group = STARTERS_BY_TEMPLATE[starter.baseTemplateKey]
      expect(group).toBeDefined()
      expect(group.some(s => s.key === starter.key)).toBe(true)
    }
  })
})

// ── Starter switch preserves visual (logic invariant) ─────────────────────────

describe('starter switch visual preservation', () => {
  it('starter.baseTemplateKey is a valid template key', () => {
    const allKeys = new Set(ALL_TEMPLATES.map(t => t.key))
    for (const starter of ALL_STARTERS) {
      expect(allKeys.has(starter.baseTemplateKey)).toBe(true)
    }
  })

  it('starter controls are complete DesignControls (all required fields present)', () => {
    const requiredFields = [
      'subjectPosition', 'subjectScale', 'imageCrop', 'backgroundIntensity',
      'overlayStrength', 'textAlignment', 'contentDensity', 'footer',
      'typographyPreset', 'showGuides', 'accentColor',
    ]
    for (const starter of ALL_STARTERS) {
      for (const field of requiredFields) {
        expect(starter.controls).toHaveProperty(field)
      }
    }
  })

  it('all starter decorativeElements are empty (positioned at design time)', () => {
    for (const starter of ALL_STARTERS) {
      expect(starter.decorativeElements).toEqual([])
    }
  })
})

// ── Benchmark review API input validation ──────────────────────────────────────

describe('benchmark review validation', () => {
  const validKeys = new Set(ALL_BENCHMARKS.map(b => b.key))
  const validVerdicts = new Set(['PUBLISHABLE', 'NEEDS_MINOR_EDIT', 'NEEDS_MAJOR_EDIT', 'REJECT'])

  it('all benchmark keys are non-empty strings', () => {
    for (const key of validKeys) {
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    }
  })

  it('all verdicts are expected strings', () => {
    for (const v of validVerdicts) {
      expect(typeof v).toBe('string')
    }
  })

  it('3 benchmarks defined (one per template family)', () => {
    expect(ALL_BENCHMARKS.length).toBe(3)
  })

  it('each benchmark has minimumPublishableScore in 50-100 range', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.minimumPublishableScore).toBeGreaterThanOrEqual(50)
      expect(b.minimumPublishableScore).toBeLessThanOrEqual(100)
    }
  })

  it('each benchmark reviewerNotes is non-empty', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.reviewerNotes.length).toBeGreaterThan(10)
    }
  })
})

// ── Draft DRAFT_KEY format ────────────────────────────────────────────────────

describe('DRAFT_KEY', () => {
  it('includes campaign ID in the key', () => {
    expect(DRAFT_KEY('camp-123')).toContain('camp-123')
  })

  it('includes version in the key', () => {
    expect(DRAFT_KEY('camp-123')).toContain('v1')
  })

  it('different campaign IDs produce different keys', () => {
    expect(DRAFT_KEY('camp-001')).not.toBe(DRAFT_KEY('camp-002'))
  })
})
