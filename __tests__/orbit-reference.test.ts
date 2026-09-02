/**
 * Walz Orbit — Reference Design Matching test suite.
 *
 * Covers: structuredRoutesToString, applyReferenceDesignProfile,
 * scoreReferenceMatch, buildReferenceCompositionHints, structured
 * route rendering, and the commercial firewall invariant.
 */

import {
  structuredRoutesToString,
  type ReferenceDesignProfile,
  type StructuredRoute,
} from '@/lib/orbit/reference/types'
import { applyReferenceDesignProfile } from '@/lib/orbit/reference/apply-profile'
import { scoreReferenceMatch, type ReferenceMatchScoreDetail } from '@/lib/orbit/reference/match-score'
import { buildReferenceCompositionHints } from '@/lib/orbit/reference/prompt-enhancer'
import type { DesignComposition, TextLayer, RouteCardLayer, CTAButtonLayer } from '@/lib/orbit/composer/layer-model'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<ReferenceDesignProfile> = {}): ReferenceDesignProfile {
  return {
    layoutFamily:        'overlay_centered',
    backgroundMode:      'photography',
    subjectPosition:     'center',
    subjectScale:        'large',
    imageCoverage:       0.75,
    logoPosition:        'top_center',
    logoScale:           'standard',
    headline: {
      relativeY:     0.30,
      alignment:     'center',
      width:         'wide',
      relativeSize:  'display',
      lineCount:     2,
      accentPattern: 'none',
    },
    subheadline: {
      relativeY:    0.52,
      alignment:    'center',
      relativeSize: 'medium',
      visible:      true,
    },
    routeLayout: {
      count:       3,
      orientation: 'horizontal',
      cardStyle:   'pill',
      relativeY:   0.62,
      spacing:     'balanced',
    },
    cta: {
      relativeY:  0.80,
      width:      'medium',
      prominence: 'prominent',
      style:      'button',
    },
    footer: {
      height:  'compact',
      columns: 2,
      style:   'dark',
    },
    palette:             ['#1a1a2e', '#d4af37', '#ffffff'],
    typographyCharacter: 'bold',
    borderRadiusStyle:   'rounded',
    spacingDensity:      'balanced',
    decorativeDensity:   'minimal',
    confidence:          0.9,
    analysisNotes:       'Test reference profile.',
    ...overrides,
  }
}

function makeComposition(layerOverrides: Partial<DesignComposition['layers'][0]>[] = []): DesignComposition {
  const baseLayers: DesignComposition['layers'] = [
    { id: 'bg_image',  type: 'image',    src: 'https://example.com/img.jpg', objectFit: 'cover', x: 0,   y: 0,    width: 1, height: 1, zIndex: 0,  visible: true },
    { id: 'logo',      type: 'logo',     text: 'WALZ TRAVELS', fontWeight: '800', fontSize: 28, color: '#fff', align: 'center', x: 0.5, y: 0.06, zIndex: 10, visible: true },
    { id: 'headline',  type: 'text',     text: 'December flights home.', fontFamily: 'sans-serif', fontWeight: '800', fontSize: 64, color: '#fff', align: 'center', x: 0.5, y: 0.30, zIndex: 20, visible: true },
    { id: 'subheadline', type: 'text',   text: 'Book now. Pay in instalments.', fontFamily: 'sans-serif', fontWeight: '600', fontSize: 32, color: '#fff', align: 'center', x: 0.5, y: 0.50, zIndex: 21, visible: true },
    { id: 'route_card', type: 'route_card', routes: ['LONDON → LAGOS', 'TORONTO → LAGOS', 'LONDON → ACCRA'], x: 0.5, y: 0.62, zIndex: 40, visible: true },
    { id: 'cta',       type: 'cta_button', text: 'Secure your December flight today', backgroundColor: '#d4af37', textColor: '#1a1a2e', borderRadius: 24, fontSize: 26, x: 0.5, y: 0.80, zIndex: 50, visible: true, paddingX: 0.08, paddingY: 0.02 },
    { id: 'contact_bar', type: 'contact_bar', variant: 'dark', items: [], x: 0.5, y: 0.975, zIndex: 80, visible: true },
  ]
  return {
    canvas:          { key: 'portrait', width: 1080, height: 1350 },
    templateKey:     'flights_hero',
    layers:          baseLayers,
    commercialFields: { headline: 'December flights home.', route: 'LONDON → LAGOS', cta: 'Secure your December flight today' },
    controls:        { subjectPosition: 'center', subjectScale: 'large', imageCrop: 'cover', backgroundIntensity: 'normal', overlayStrength: 55, textAlignment: 'center', contentDensity: 'standard', footer: 'auto', typographyPreset: 'campaign_heavy', showGuides: false, accentColor: '#d4af37' },
  }
}

// ── structuredRoutesToString ──────────────────────────────────────────────────

describe('structuredRoutesToString', () => {
  it('formats a single route', () => {
    const routes: StructuredRoute[] = [{ from: 'London', to: 'Lagos' }]
    expect(structuredRoutesToString(routes)).toBe('London → Lagos')
  })

  it('joins multiple routes with bullet separator', () => {
    const routes: StructuredRoute[] = [
      { from: 'London', to: 'Lagos' },
      { from: 'Toronto', to: 'Lagos' },
      { from: 'London', to: 'Accra' },
    ]
    expect(structuredRoutesToString(routes)).toBe('London → Lagos • Toronto → Lagos • London → Accra')
  })

  it('trims whitespace from city names', () => {
    const routes: StructuredRoute[] = [{ from: '  London  ', to: '  Lagos  ' }]
    expect(structuredRoutesToString(routes)).toBe('London → Lagos')
  })

  it('filters out entries with empty from or to', () => {
    const routes: StructuredRoute[] = [
      { from: 'London', to: 'Lagos' },
      { from: '', to: 'Lagos' },
      { from: 'Toronto', to: '' },
      { from: '', to: '' },
    ]
    expect(structuredRoutesToString(routes)).toBe('London → Lagos')
  })

  it('returns empty string when all routes are empty', () => {
    const routes: StructuredRoute[] = [{ from: '', to: '' }, { from: '  ', to: '  ' }]
    expect(structuredRoutesToString(routes)).toBe('')
  })

  it('handles 4 routes without truncating', () => {
    const routes: StructuredRoute[] = [
      { from: 'London', to: 'Lagos' },
      { from: 'Toronto', to: 'Lagos' },
      { from: 'London', to: 'Accra' },
      { from: 'New York', to: 'Lagos' },
    ]
    const result = structuredRoutesToString(routes)
    expect(result.split(' • ')).toHaveLength(4)
  })
})

// ── applyReferenceDesignProfile ───────────────────────────────────────────────

describe('applyReferenceDesignProfile', () => {
  it('returns a DesignComposition with the same number of layers', () => {
    const profile  = makeProfile()
    const comp     = makeComposition()
    const result   = applyReferenceDesignProfile(comp, profile, 'balanced')
    expect(result.layers).toHaveLength(comp.layers.length)
  })

  it('loose strength barely moves headline y', () => {
    const profile = makeProfile({ headline: { ...makeProfile().headline, relativeY: 0.10 } })
    const comp    = makeComposition()
    const origY   = comp.layers.find(l => l.id === 'headline')!.y  // 0.30
    const result  = applyReferenceDesignProfile(comp, profile, 'loose')
    const newY    = result.layers.find(l => l.id === 'headline')!.y
    // loose factor = 0.15; movement should be 0.15 × (0.10 - 0.30) = -0.03
    expect(Math.abs(newY - origY)).toBeLessThan(0.05)
  })

  it('close strength moves headline y substantially', () => {
    const profile = makeProfile({ headline: { ...makeProfile().headline, relativeY: 0.10 } })
    const comp    = makeComposition()
    const origY   = comp.layers.find(l => l.id === 'headline')!.y  // 0.30
    const result  = applyReferenceDesignProfile(comp, profile, 'close')
    const newY    = result.layers.find(l => l.id === 'headline')!.y
    // close factor = 0.88; should move close to 0.10
    expect(newY).toBeLessThan(origY)
    expect(Math.abs(newY - 0.10)).toBeLessThan(0.05)
  })

  it('balanced strength applies partial movement (interpolated)', () => {
    const profile = makeProfile({ headline: { ...makeProfile().headline, relativeY: 0.10 } })
    const comp    = makeComposition()
    const origY   = comp.layers.find(l => l.id === 'headline')!.y   // 0.30
    const target  = 0.10
    const result  = applyReferenceDesignProfile(comp, profile, 'balanced')
    const newY    = result.layers.find(l => l.id === 'headline')!.y
    // balanced factor = 0.50; expected: 0.30 + (0.10 - 0.30) × 0.50 = 0.20
    expect(newY).toBeCloseTo(origY + (target - origY) * 0.50, 1)
  })

  it('does NOT overwrite any text content fields', () => {
    const profile = makeProfile()
    const comp    = makeComposition()
    const result  = applyReferenceDesignProfile(comp, profile, 'close')
    const origHeadline = comp.layers.find(l => l.id === 'headline') as TextLayer
    const newHeadline  = result.layers.find(l => l.id === 'headline') as TextLayer
    expect(newHeadline.text).toBe(origHeadline.text)
  })

  it('does NOT override controls.textAlignment — alignment is owned by the template layout', () => {
    // ALIGNMENT SAFETY RULE: applyReferenceDesignProfile must never change textAlignment.
    // Changing it without also adjusting layer.x would clip left-column layouts.
    const profile = makeProfile({ headline: { ...makeProfile().headline, alignment: 'left' } })
    const comp    = makeComposition()
    const origAlignment = comp.controls?.textAlignment ?? 'center'
    const result  = applyReferenceDesignProfile(comp, profile, 'balanced')
    expect(result.controls?.textAlignment).toBe(origAlignment)
  })

  it('hides subheadline in close mode when profile says invisible', () => {
    const profile = makeProfile({
      subheadline: { relativeY: 0.52, alignment: 'center', relativeSize: 'medium', visible: false },
    })
    const comp   = makeComposition()
    const result = applyReferenceDesignProfile(comp, profile, 'close')
    const sub    = result.layers.find(l => l.id === 'subheadline')
    expect(sub?.visible).toBe(false)
  })

  it('preserves subheadline visibility in loose mode regardless of profile', () => {
    const profile = makeProfile({
      subheadline: { relativeY: 0.52, alignment: 'center', relativeSize: 'medium', visible: false },
    })
    const comp   = makeComposition()
    const result = applyReferenceDesignProfile(comp, profile, 'loose')
    const sub    = result.layers.find(l => l.id === 'subheadline')
    // loose keeps original visibility
    const origSub = comp.layers.find(l => l.id === 'subheadline')
    expect(sub?.visible).toBe(origSub?.visible)
  })
})

// ── scoreReferenceMatch ───────────────────────────────────────────────────────

describe('scoreReferenceMatch', () => {
  it('returns total in 0-100 range', () => {
    const score = scoreReferenceMatch(makeComposition(), makeProfile())
    expect(score.total).toBeGreaterThanOrEqual(0)
    expect(score.total).toBeLessThanOrEqual(100)
  })

  it('returns a score near 100 when composition matches profile exactly', () => {
    const profile = makeProfile()
    const comp    = makeComposition()
    const score   = scoreReferenceMatch(comp, profile)
    // Composition built to match the default profile — expect high score
    expect(score.total).toBeGreaterThan(60)
  })

  it('returns low headlinePosition score when headline y is far from target', () => {
    const profile = makeProfile({ headline: { ...makeProfile().headline, relativeY: 0.90 } })
    const comp    = makeComposition()  // headline at y=0.30
    const score   = scoreReferenceMatch(comp, profile)
    expect(score.dimensions.headlinePosition).toBeLessThan(40)
  })

  it('gives full routeCardCount score when route count matches', () => {
    // profile has 3 routes; composition has 3 routes
    const profile = makeProfile({ routeLayout: { ...makeProfile().routeLayout, count: 3 } })
    const comp    = makeComposition()
    const score   = scoreReferenceMatch(comp, profile)
    expect(score.dimensions.routeCardCount).toBe(100)
  })

  it('penalises routeCardCount when count differs', () => {
    const profile = makeProfile({ routeLayout: { ...makeProfile().routeLayout, count: 1 } })
    const comp    = makeComposition()   // 3 routes
    const score   = scoreReferenceMatch(comp, profile)
    expect(score.dimensions.routeCardCount).toBeLessThan(80)
  })

  it('gives full subheadlineMatch when visibility agrees', () => {
    const profile = makeProfile({ subheadline: { ...makeProfile().subheadline, visible: true } })
    const comp    = makeComposition()   // subheadline is visible
    const score   = scoreReferenceMatch(comp, profile)
    expect(score.dimensions.subheadlineMatch).toBe(100)
  })

  it('returns all required dimension keys', () => {
    const score = scoreReferenceMatch(makeComposition(), makeProfile())
    const keys  = Object.keys(score.dimensions)
    expect(keys).toContain('headlinePosition')
    expect(keys).toContain('ctaPosition')
    expect(keys).toContain('routeCardCount')
    expect(keys).toContain('logoPosition')
    expect(keys).toContain('subheadlineMatch')
    expect(keys).toContain('contentDensity')
    expect(keys).toContain('footerPresence')
  })
})

// ── buildReferenceCompositionHints ───────────────────────────────────────────

describe('buildReferenceCompositionHints', () => {
  it('always ends with the no-text invariant', () => {
    const hints = buildReferenceCompositionHints(makeProfile())
    expect(hints).toMatch(/No text.*no logos.*no lettering/i)
  })

  it('mentions subject position', () => {
    const hints = buildReferenceCompositionHints(makeProfile({ subjectPosition: 'left' }))
    expect(hints.toLowerCase()).toContain('left')
  })

  it('mentions negative space when image coverage < 0.75', () => {
    const hints = buildReferenceCompositionHints(makeProfile({ imageCoverage: 0.60 }))
    expect(hints).toMatch(/Reserve approximately 40%/)
  })

  it('mentions footer clearance for full footer', () => {
    const hints = buildReferenceCompositionHints(
      makeProfile({ footer: { height: 'full', columns: 2, style: 'dark' } })
    )
    expect(hints).toMatch(/20%.*footer/i)
  })

  it('does not mention footer clearance for minimal footer', () => {
    const hints = buildReferenceCompositionHints(
      makeProfile({ footer: { height: 'minimal', columns: 1, style: 'transparent' } })
    )
    expect(hints).not.toMatch(/6%.*footer/i)
  })

  it('does not contain any price, route, phone or email text', () => {
    const hints = buildReferenceCompositionHints(makeProfile())
    expect(hints).not.toMatch(/[£$€₦]\d+/)
    expect(hints).not.toMatch(/\+\d{7,}/)
    expect(hints).not.toMatch(/@[\w.]+\.\w+/)
    expect(hints).not.toMatch(/Lagos|London|Toronto|Accra/i)
  })
})

// ── Structured route rendering ────────────────────────────────────────────────

describe('Structured route rendering (4 separate pills)', () => {
  it('structuredRoutesToString produces separate bullet-separated pills', () => {
    const routes: StructuredRoute[] = [
      { from: 'London', to: 'Lagos' },
      { from: 'Toronto', to: 'Lagos' },
      { from: 'London', to: 'Accra' },
    ]
    const result = structuredRoutesToString(routes)
    const pills  = result.split(' • ')
    expect(pills).toHaveLength(3)
    expect(pills[0]).toBe('London → Lagos')
    expect(pills[1]).toBe('Toronto → Lagos')
    expect(pills[2]).toBe('London → Accra')
  })

  it('does not compress 3 routes into a single string without separators', () => {
    const routes: StructuredRoute[] = [
      { from: 'London', to: 'Lagos' },
      { from: 'Toronto', to: 'Lagos' },
      { from: 'London', to: 'Accra' },
    ]
    const result = structuredRoutesToString(routes)
    // Must not be a single unseparated string
    expect(result).toContain(' • ')
    expect(result.split(' • ')).toHaveLength(3)
  })

  it('allows up to 4 routes without truncation', () => {
    const routes: StructuredRoute[] = [
      { from: 'London',   to: 'Lagos' },
      { from: 'Toronto',  to: 'Lagos' },
      { from: 'London',   to: 'Accra' },
      { from: 'New York', to: 'Lagos' },
    ]
    const result = structuredRoutesToString(routes)
    expect(result.split(' • ')).toHaveLength(4)
  })
})

// ── Commercial firewall ───────────────────────────────────────────────────────

describe('Commercial firewall — ReferenceDesignProfile contains no commercial text', () => {
  it('profile has no price, currency, or monetary field', () => {
    const profile = makeProfile()
    const json    = JSON.stringify(profile)
    expect(json).not.toMatch(/[£$€₦]\d+/)
    expect(json).not.toMatch(/"price"/)
    expect(json).not.toMatch(/"amount"/)
    expect(json).not.toMatch(/"currency"/)
    expect(json).not.toMatch(/"fee"/)
  })

  it('profile has no phone or contact fields', () => {
    const profile = makeProfile()
    const json    = JSON.stringify(profile)
    expect(json).not.toMatch(/\+\d{7,}/)
    expect(json).not.toMatch(/"phone"/)
    expect(json).not.toMatch(/"whatsapp"/)
    expect(json).not.toMatch(/"email"/)
    expect(json).not.toMatch(/"contact"/)
  })

  it('profile has no route destination text fields', () => {
    const profile = makeProfile()
    const json    = JSON.stringify(profile)
    // The profile may describe route COUNT and layout, but not destination names
    expect(json).not.toMatch(/"from"/)
    expect(json).not.toMatch(/"to"/)
    expect(json).not.toMatch(/Lagos|London|Toronto|Accra/i)
  })

  it('applyReferenceDesignProfile never overwrites commercial text', () => {
    const profile    = makeProfile()
    const comp       = makeComposition()
    const origText   = (comp.layers.find(l => l.id === 'headline') as TextLayer).text
    const origRoutes = (comp.layers.find(l => l.type === 'route_card') as RouteCardLayer).routes.slice()
    const origCta    = (comp.layers.find(l => l.id === 'cta') as CTAButtonLayer).text

    const result     = applyReferenceDesignProfile(comp, profile, 'close')

    expect((result.layers.find(l => l.id === 'headline') as TextLayer).text).toBe(origText)
    expect((result.layers.find(l => l.type === 'route_card') as RouteCardLayer).routes).toEqual(origRoutes)
    expect((result.layers.find(l => l.id === 'cta') as CTAButtonLayer).text).toBe(origCta)
  })
})
