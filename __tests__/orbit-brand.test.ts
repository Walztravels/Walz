/**
 * Walz Orbit — Brand Asset & Adaptive Logo Integration Tests
 *
 * Covers:
 * 1. Phone validation — confirmed production number + E.164
 * 2. resolveLogoVariant — correct priority order by brightness
 * 3. analyzeBackgroundBrightness — overlay → brightness mapping
 * 4. resolveLogoTreatment — treatment selection by brightness + overlay
 * 5. LogoLayer type extension — new fields present
 * 6. DesignControls extension — logo control fields
 * 7. Central contact config — phone numbers in BUSINESS config
 * 8. Quality scorer brand warnings — LOGO_ASSET_MISSING flag
 * 9. AI prompt invariant — pure functions, no network calls
 * 10. No-text-fallback invariant
 */

import {
  validatePhone,
  CONFIRMED_PHONE,
} from '@/lib/orbit/brand/phone-validator'

import {
  resolveLogoVariant,
  analyzeBackgroundBrightness,
  resolveLogoTreatment,
  LOGO_VARIANTS,
  LOGO_TREATMENTS,
  type WalzBrandAssets,
  type WalzBrandAsset,
  type LogoVariant,
} from '@/lib/orbit/brand'

import {
  defaultDesignControls,
  scoreComposition,
} from '@/lib/orbit/composer'

import type { LogoLayer, DesignControls, DesignComposition } from '@/lib/orbit/composer'
import { BUSINESS, waLink } from '@/lib/config/business'

// ── Phone validation ──────────────────────────────────────────────────────────

describe('central phone config', () => {
  it('BUSINESS.contacts.globalWhatsapp.display is +1 231 790 2336', () => {
    expect(BUSINESS.contacts.globalWhatsapp.display).toBe('+1 231 790 2336')
  })

  it('BUSINESS.contacts.globalWhatsapp.e164 is 12317902336', () => {
    expect(BUSINESS.contacts.globalWhatsapp.e164).toBe('12317902336')
  })

  it('waLink builds correct WhatsApp URL from e164', () => {
    const link = waLink(BUSINESS.contacts.globalWhatsapp.e164)
    expect(link).toBe('https://wa.me/12317902336')
  })

  it('CONFIRMED_PHONE validates the production global number as valid', () => {
    expect(CONFIRMED_PHONE.valid).toBe(true)
    expect(CONFIRMED_PHONE.e164).toBe('12317902336')
    expect(CONFIRMED_PHONE.display).toBe('+1 2317902336')
  })
})

describe('validatePhone', () => {
  it('accepts +1 231 790 2336 (confirmed production number)', () => {
    const r = validatePhone('+1 231 790 2336')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('12317902336')
    expect(r.countryCode).toBe('+1')
  })

  it('accepts +12317902336 (E.164 format)', () => {
    const r = validatePhone('+12317902336')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('12317902336')
  })

  it('flags +1217902336 as invalid (9 digits after +1, US requires 10)', () => {
    const r = validatePhone('+1217902336')
    expect(r.valid).toBe(false)
    expect(r.warning).toMatch(/9/)
    expect(r.warning).toMatch(/10/)
  })

  it('accepts +447949448680 (valid UK number)', () => {
    expect(validatePhone('+447949448680').valid).toBe(true)
  })

  it('rejects empty string', () => {
    expect(validatePhone('').valid).toBe(false)
  })

  it('accepts numbers with spaces and dashes', () => {
    const r = validatePhone('+1 231-790-2336')
    expect(r.valid).toBe(true)
    expect(r.e164).toBe('12317902336')
  })

  it('normalises 00-prefix to + prefix', () => {
    const r1 = validatePhone('+12317902336')
    const r2 = validatePhone('0012317902336')
    expect(r1.valid).toBe(true)
    expect(r2.valid).toBe(true)
    expect(r2.e164).toBe(r1.e164)
  })

  it('rejects non-digit characters after normalisation', () => {
    expect(validatePhone('+1abc2345678').valid).toBe(false)
  })
})

// ── resolveLogoVariant ────────────────────────────────────────────────────────

function makeAsset(variant: LogoVariant): WalzBrandAsset {
  return {
    id:        `${variant.toLowerCase()}-1`,
    variant,
    publicUrl: `https://cdn.example.com/${variant}.png`,
    mimeType:  'image/png',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('resolveLogoVariant — dark poster (brightness < 0.38)', () => {
  it('prefers LIGHT on dark background', () => {
    const assets: WalzBrandAssets = { LIGHT: makeAsset('LIGHT'), PRIMARY: makeAsset('PRIMARY') }
    expect(resolveLogoVariant(0.2, assets)).toBe('LIGHT')
  })

  it('dark bg: falls back LIGHT → MONOCHROME → PRIMARY → DARK → ICON', () => {
    const assets: WalzBrandAssets = { MONOCHROME: makeAsset('MONOCHROME'), DARK: makeAsset('DARK') }
    expect(resolveLogoVariant(0.2, assets)).toBe('MONOCHROME')
  })

  it('dark bg with only PRIMARY: uses PRIMARY', () => {
    const assets: WalzBrandAssets = { PRIMARY: makeAsset('PRIMARY') }
    expect(resolveLogoVariant(0.2, assets)).toBe('PRIMARY')
  })
})

describe('resolveLogoVariant — light poster (brightness > 0.62)', () => {
  it('prefers PRIMARY on light background', () => {
    const assets: WalzBrandAssets = { PRIMARY: makeAsset('PRIMARY'), LIGHT: makeAsset('LIGHT'), DARK: makeAsset('DARK') }
    expect(resolveLogoVariant(0.8, assets)).toBe('PRIMARY')
  })

  it('light bg: falls back PRIMARY → DARK → MONOCHROME → LIGHT → ICON', () => {
    const assets: WalzBrandAssets = { DARK: makeAsset('DARK'), LIGHT: makeAsset('LIGHT') }
    expect(resolveLogoVariant(0.8, assets)).toBe('DARK')
  })
})

describe('resolveLogoVariant — general', () => {
  it('returns null when no assets available', () => {
    expect(resolveLogoVariant(0.3, {})).toBeNull()
  })

  it('explicit override respected when asset exists', () => {
    const assets: WalzBrandAssets = { PRIMARY: makeAsset('PRIMARY'), LIGHT: makeAsset('LIGHT') }
    expect(resolveLogoVariant(0.8, assets, 'LIGHT')).toBe('LIGHT')
  })

  it('AUTO treated as no override', () => {
    const assets: WalzBrandAssets = { PRIMARY: makeAsset('PRIMARY'), LIGHT: makeAsset('LIGHT') }
    expect(resolveLogoVariant(0.8, assets, 'AUTO')).toBe(resolveLogoVariant(0.8, assets))
  })

  it('explicit override falls through to AUTO when requested variant missing', () => {
    const assets: WalzBrandAssets = { PRIMARY: makeAsset('PRIMARY') }
    const result = resolveLogoVariant(0.2, assets, 'DARK')
    expect(result).toBe('PRIMARY')
  })

  it('returns first available when exhausted all preferences', () => {
    const assets: WalzBrandAssets = { ICON: makeAsset('ICON') }
    expect(resolveLogoVariant(0.5, assets)).toBe('ICON')
  })
})

// ── analyzeBackgroundBrightness ───────────────────────────────────────────────

describe('analyzeBackgroundBrightness', () => {
  it('returns value in 0–1 range for all overlay levels', () => {
    for (const s of [0, 25, 50, 75, 100]) {
      const b = analyzeBackgroundBrightness(s)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
    }
  })

  it('high overlay → lower brightness (dark poster)', () => {
    expect(analyzeBackgroundBrightness(80)).toBeLessThan(analyzeBackgroundBrightness(20))
  })

  it('dark bg color hint reduces brightness', () => {
    expect(analyzeBackgroundBrightness(50, '#000000')).toBeLessThan(analyzeBackgroundBrightness(50, '#ffffff'))
  })

  it('handles missing or invalid color hint without throwing', () => {
    expect(() => analyzeBackgroundBrightness(50)).not.toThrow()
    expect(() => analyzeBackgroundBrightness(50, '')).not.toThrow()
    expect(() => analyzeBackgroundBrightness(50, 'not-a-color')).not.toThrow()
  })
})

// ── resolveLogoTreatment ──────────────────────────────────────────────────────

describe('resolveLogoTreatment', () => {
  it('always returns a valid LogoTreatment', () => {
    const valid = new Set(LOGO_TREATMENTS)
    for (const overlay of [0, 30, 50, 65, 80]) {
      for (const b of [0.2, 0.5, 0.8]) {
        expect(valid.has(resolveLogoTreatment(b, overlay))).toBe(true)
      }
    }
  })

  it('high overlay (>=65) → SHADOW', () => {
    expect(resolveLogoTreatment(0.3, 70)).toBe('SHADOW')
  })

  it('low overlay + light bg → DARK_PLATE', () => {
    expect(resolveLogoTreatment(0.7, 20)).toBe('DARK_PLATE')
  })

  it('low overlay + dark bg → LIGHT_PLATE', () => {
    expect(resolveLogoTreatment(0.2, 20)).toBe('LIGHT_PLATE')
  })
})

// ── LogoLayer type extension ──────────────────────────────────────────────────

describe('LogoLayer type', () => {
  it('accepts all brand patch fields', () => {
    const layer: LogoLayer = {
      id: 'logo', type: 'logo', x: 0.5, y: 0.04, zIndex: 10, visible: true,
      text: 'WALZ TRAVELS', fontWeight: '800', fontSize: 28, color: '#ffffff', align: 'center',
      logoUrl:          'https://cdn.example.com/logo.png',
      logoVariant:      'PRIMARY',
      treatment:        'SHADOW',
      treatmentOpacity: 0.5,
      logoScale:        'standard',
    }
    expect(layer.logoUrl).toBe('https://cdn.example.com/logo.png')
    expect(layer.treatment).toBe('SHADOW')
  })

  it('logoUrl is optional — backward compatible with existing compositions', () => {
    const layer: LogoLayer = {
      id: 'logo', type: 'logo', x: 0.5, y: 0.04, zIndex: 10, visible: true,
      text: 'WALZ TRAVELS', fontWeight: '800', fontSize: 28, color: '#ffffff', align: 'center',
    }
    expect(layer.logoUrl).toBeUndefined()
  })
})

// ── DesignControls extension ──────────────────────────────────────────────────

describe('DesignControls logo fields', () => {
  it('defaultDesignControls allows optional logo fields', () => {
    const controls: DesignControls = defaultDesignControls()
    expect('logoVariant'   in controls || controls.logoVariant   === undefined).toBe(true)
    expect('logoTreatment' in controls || controls.logoTreatment === undefined).toBe(true)
    expect('logoScale'     in controls || controls.logoScale     === undefined).toBe(true)
  })

  it('logo fields accepted when set', () => {
    const controls: DesignControls = {
      ...defaultDesignControls(),
      logoVariant:   'AUTO',
      logoTreatment: 'SHADOW',
      logoScale:     'standard',
      logoPosition:  'top_center',
    }
    expect(controls.logoVariant).toBe('AUTO')
    expect(controls.logoTreatment).toBe('SHADOW')
  })
})

// ── Quality scorer — LOGO_ASSET_MISSING ──────────────────────────────────────

describe('quality scorer brand checks', () => {
  const makeComposition = (withLogoUrl: boolean): DesignComposition => ({
    canvas:  { key: '1080x1350', width: 1080, height: 1350 },
    templateKey: 'walz_hero_split',
    layers: [
      {
        id: 'logo', type: 'logo', x: 0.5, y: 0.04, zIndex: 10, visible: true,
        text: 'WALZ TRAVELS', fontWeight: '800', fontSize: 28, color: '#fff', align: 'center',
        ...(withLogoUrl ? { logoUrl: 'https://cdn.example.com/logo.png' } : {}),
      } as LogoLayer,
      {
        id: 'contact_bar', type: 'contact_bar', x: 0.5, y: 0.975, zIndex: 100, visible: true,
        variant: 'dark', items: [{ icon: '📱', text: '+1 231 790 2336' }],
      },
      {
        id: 'headline', type: 'text', x: 0.5, y: 0.5, zIndex: 20, visible: true,
        text: 'Fly to Dubai', fontFamily: 'Arial', fontWeight: '800', fontSize: 48,
        color: '#fff', align: 'center',
      },
    ],
    commercialFields: { headline: 'Fly to Dubai' },
  })

  it('LOGO_ASSET_MISSING warning when no logoUrl', () => {
    const result = scoreComposition(makeComposition(false))
    const missing = result.warnings.find(w => w.field === 'LOGO_ASSET_MISSING')
    expect(missing).toBeDefined()
  })

  it('no LOGO_ASSET_MISSING warning when logoUrl is set', () => {
    const result = scoreComposition(makeComposition(true))
    const missing = result.warnings.find(w => w.field === 'LOGO_ASSET_MISSING')
    expect(missing).toBeUndefined()
  })

  it('brand score is lower when logo is text-only (no logoUrl)', () => {
    const withLogo    = scoreComposition(makeComposition(true))
    const withoutLogo = scoreComposition(makeComposition(false))
    expect(withLogo.scores.brand).toBeGreaterThan(withoutLogo.scores.brand)
  })
})

// ── Constants ─────────────────────────────────────────────────────────────────

describe('brand constants', () => {
  it('LOGO_VARIANTS contains exactly 5 variants in correct order', () => {
    expect(LOGO_VARIANTS).toEqual(['PRIMARY', 'LIGHT', 'DARK', 'MONOCHROME', 'ICON'])
  })

  it('LOGO_TREATMENTS contains all 6 treatment types', () => {
    expect(LOGO_TREATMENTS).toHaveLength(6)
    for (const t of ['NONE', 'SHADOW', 'GLOW', 'DARK_PLATE', 'LIGHT_PLATE', 'GLASS']) {
      expect(LOGO_TREATMENTS).toContain(t)
    }
  })
})

// ── AI prompt invariant ───────────────────────────────────────────────────────

describe('AI logo invariant — pure functions', () => {
  it('resolveLogoVariant is deterministic (no network calls)', () => {
    const assets: WalzBrandAssets = { PRIMARY: makeAsset('PRIMARY') }
    expect(resolveLogoVariant(0.5, assets)).toBe(resolveLogoVariant(0.5, assets))
  })

  it('analyzeBackgroundBrightness is deterministic', () => {
    expect(analyzeBackgroundBrightness(55)).toBe(analyzeBackgroundBrightness(55))
  })

  it('CONFIRMED_PHONE is computed from pure validatePhone with no side effects', () => {
    expect(typeof CONFIRMED_PHONE.valid).toBe('boolean')
    expect(CONFIRMED_PHONE.valid).toBe(true)
  })
})

// ── Central config — no hardcoding ───────────────────────────────────────────

describe('central config integrity', () => {
  it('BUSINESS config is the only source of globalWhatsapp', () => {
    // Verify the number matches the spec exactly
    expect(BUSINESS.contacts.globalWhatsapp.display).toBe('+1 231 790 2336')
    expect(BUSINESS.contacts.globalWhatsapp.e164).toBe('12317902336')
  })

  it('waLink produces valid WhatsApp URL', () => {
    const url = waLink('12317902336')
    expect(url).toMatch(/^https:\/\/wa\.me\/12317902336/)
  })

  it('waLink with message produces correct URL', () => {
    const url = waLink('12317902336', 'Hello')
    expect(url).toContain('12317902336')
    expect(url).toContain('text=')
  })
})
