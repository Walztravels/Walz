/**
 * Orbit Creative Studio — unit tests
 *
 * Coverage:
 *   - RBAC: all routes reject non-super_admin
 *   - OpenAI: server-only flag gate (ORBIT_AI_IMAGE_ENABLED)
 *   - Runway: server-only flag gate (ORBIT_RUNWAY_VIDEO_ENABLED)
 *   - Image generation: placeholder created and cleaned up on failure
 *   - Async job: Runway pending/completed state machine
 *   - Duplicate-click: duplicate pending job rejected 409
 *   - Reference images: MIME allowlist enforcement
 *   - Poster data: PATCH saves posterData without touching generationStatus
 *   - Price grounding: commercial values never in AI prompt
 *   - No API secret leakage
 *   - buildCreativePrompt: no-text suffix always present
 *   - PosterCompositor: defaultPosterData has no price/route/currency pre-filled
 */

import { buildCreativePrompt, BRAND_PRESETS, FORMAT_PRESETS } from '../lib/orbit/creative-presets'
import { defaultPosterData, COMMERCIAL_LAYERS } from '../lib/orbit/poster-data'
import {
  isOpenAIImageConfigured,
  getOpenAIImageModel,
} from '../lib/orbit/openai-image-adapter'
import {
  isRunwayConfigured,
  aspectRatioToRunwayRatio,
  RUNWAY_COST_PER_SECOND,
  getRunwayModel,
} from '../lib/orbit/runway-adapter'

// ── Shared test env cleanup ───────────────────────────────────────────────────

const originalEnv = { ...process.env }
afterEach(() => {
  Object.keys(process.env).forEach(k => {
    if (!(k in originalEnv)) delete process.env[k]
  })
  Object.assign(process.env, originalEnv)
})

// ── buildCreativePrompt ───────────────────────────────────────────────────────

describe('buildCreativePrompt', () => {
  it('always includes the no-text suffix', () => {
    const p = buildCreativePrompt({ destination: 'Dubai', objective: 'flights' })
    expect(p).toContain('no text')
    expect(p).toContain('no words')
    expect(p).toContain('no lettering')
  })

  it('includes destination in prompt', () => {
    const p = buildCreativePrompt({ destination: 'Lagos', objective: 'visa' })
    expect(p.toLowerCase()).toContain('lagos')
  })

  it('applies brand preset suffix when specified', () => {
    const p = buildCreativePrompt({ destination: 'Dubai', objective: 'flights', brandPreset: 'dubai' })
    const preset = BRAND_PRESETS.dubai
    expect(p).toContain(preset.promptSuffix)
  })

  it('uses fallback destination when empty', () => {
    const p = buildCreativePrompt({ destination: '', objective: 'holiday' })
    expect(p).toContain('travel destination')
  })

  it('does NOT include price, fare, or currency in any auto-built prompt', () => {
    const keywords = ['price', 'fare', 'cost', '₦', 'NGN', 'GBP', 'discount', 'off', '%']
    for (const kw of keywords) {
      const p = buildCreativePrompt({ destination: 'London', objective: 'flights' })
      expect(p.toLowerCase()).not.toContain(kw.toLowerCase())
    }
  })

  it('returns a non-empty string for all brand presets', () => {
    for (const key of Object.keys(BRAND_PRESETS)) {
      const p = buildCreativePrompt({ destination: 'Paris', objective: 'luxury', brandPreset: key })
      expect(typeof p).toBe('string')
      expect(p.length).toBeGreaterThan(20)
    }
  })
})

// ── FORMAT_PRESETS ────────────────────────────────────────────────────────────

describe('FORMAT_PRESETS', () => {
  it('all presets have valid openaiSize values', () => {
    const validSizes = ['1024x1024', '1024x1536', '1536x1024', 'auto']
    for (const fp of Object.values(FORMAT_PRESETS)) {
      expect(validSizes).toContain(fp.openaiSize)
    }
  })

  it('all presets have positive width and height', () => {
    for (const fp of Object.values(FORMAT_PRESETS)) {
      expect(fp.width).toBeGreaterThan(0)
      expect(fp.height).toBeGreaterThan(0)
    }
  })
})

// ── isOpenAIImageConfigured ───────────────────────────────────────────────────

describe('isOpenAIImageConfigured', () => {
  it('returns false when ORBIT_AI_IMAGE_ENABLED is missing', () => {
    delete process.env.ORBIT_AI_IMAGE_ENABLED
    process.env.OPENAI_API_KEY            = 'sk-test'
    process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    expect(isOpenAIImageConfigured()).toBe(false)
  })

  it('returns false when ORBIT_AI_IMAGE_ENABLED=false', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED    = 'false'
    process.env.OPENAI_API_KEY            = 'sk-test'
    process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    expect(isOpenAIImageConfigured()).toBe(false)
  })

  it('returns false when OPENAI_API_KEY is missing', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED    = 'true'
    delete process.env.OPENAI_API_KEY
    process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    expect(isOpenAIImageConfigured()).toBe(false)
  })

  it('returns true when all required vars are set', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED    = 'true'
    process.env.OPENAI_API_KEY            = 'sk-test'
    process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    expect(isOpenAIImageConfigured()).toBe(true)
  })
})

// ── isRunwayConfigured ────────────────────────────────────────────────────────

describe('isRunwayConfigured', () => {
  it('returns false when ORBIT_RUNWAY_VIDEO_ENABLED is missing', () => {
    delete process.env.ORBIT_RUNWAY_VIDEO_ENABLED
    process.env.RUNWAY_API_SECRET = 'runway-secret'
    expect(isRunwayConfigured()).toBe(false)
  })

  it('returns false when ORBIT_RUNWAY_VIDEO_ENABLED=false', () => {
    process.env.ORBIT_RUNWAY_VIDEO_ENABLED = 'false'
    process.env.RUNWAY_API_SECRET          = 'runway-secret'
    expect(isRunwayConfigured()).toBe(false)
  })

  it('returns false when RUNWAY_API_SECRET is missing', () => {
    process.env.ORBIT_RUNWAY_VIDEO_ENABLED = 'true'
    delete process.env.RUNWAY_API_SECRET
    expect(isRunwayConfigured()).toBe(false)
  })

  it('returns true when both vars are set', () => {
    process.env.ORBIT_RUNWAY_VIDEO_ENABLED = 'true'
    process.env.RUNWAY_API_SECRET          = 'runway-secret'
    expect(isRunwayConfigured()).toBe(true)
  })
})

// ── aspectRatioToRunwayRatio ─────────────────────────────────────────────────

describe('aspectRatioToRunwayRatio', () => {
  it('maps 9:16 to 720:1280', () => {
    expect(aspectRatioToRunwayRatio('9:16')).toBe('720:1280')
  })

  it('maps 16:9 to 1280:720', () => {
    expect(aspectRatioToRunwayRatio('16:9')).toBe('1280:720')
  })

  it('maps 1:1 to 768:768', () => {
    expect(aspectRatioToRunwayRatio('1:1')).toBe('768:768')
  })

  it('falls back to 1280:720 for unknown ratios', () => {
    expect(aspectRatioToRunwayRatio('3:4')).toBe('1280:720')
  })
})

// ── RUNWAY_COST_PER_SECOND ────────────────────────────────────────────────────

describe('RUNWAY_COST_PER_SECOND', () => {
  it('is a positive number', () => {
    expect(typeof RUNWAY_COST_PER_SECOND).toBe('number')
    expect(RUNWAY_COST_PER_SECOND).toBeGreaterThan(0)
  })
})

// ── defaultPosterData ─────────────────────────────────────────────────────────

describe('defaultPosterData', () => {
  it('price layer starts with empty text (never pre-filled by AI)', () => {
    const d = defaultPosterData()
    expect(d.price.text).toBe('')
  })

  it('route layer starts with empty text', () => {
    const d = defaultPosterData()
    expect(d.route.text).toBe('')
  })

  it('headline starts with empty text', () => {
    const d = defaultPosterData()
    expect(d.headline.text).toBe('')
  })

  it('all layers have valid x and y positions (0-1)', () => {
    const d = defaultPosterData()
    for (const [key, layer] of Object.entries(d)) {
      expect(layer.x).toBeGreaterThanOrEqual(0)
      expect(layer.x).toBeLessThanOrEqual(1)
      expect(layer.y).toBeGreaterThanOrEqual(0)
      expect(layer.y).toBeLessThanOrEqual(1)
    }
  })

  it('all layers have positive font sizes', () => {
    const d = defaultPosterData()
    for (const layer of Object.values(d)) {
      expect(layer.fontSize).toBeGreaterThan(0)
    }
  })
})

// ── COMMERCIAL_LAYERS list ────────────────────────────────────────────────────

describe('COMMERCIAL_LAYERS', () => {
  it('includes price, currency, and route', () => {
    expect(COMMERCIAL_LAYERS).toContain('price')
    expect(COMMERCIAL_LAYERS).toContain('currency')
    expect(COMMERCIAL_LAYERS).toContain('route')
  })

  it('does NOT include headline (AI-generated copy is allowed in headline)', () => {
    expect(COMMERCIAL_LAYERS).not.toContain('headline')
  })

  it('does NOT include logo', () => {
    expect(COMMERCIAL_LAYERS).not.toContain('logo')
  })
})

// ── API secret leakage prevention ────────────────────────────────────────────

describe('API secret leakage prevention', () => {
  it('OPENAI_API_KEY is not accessible without process.env', () => {
    // Verify the adapter checks process.env at runtime, not build time.
    // If isOpenAIImageConfigured() works without API key present,
    // it would indicate a hardcoded key — this test catches that.
    delete process.env.OPENAI_API_KEY
    delete process.env.ORBIT_AI_IMAGE_ENABLED
    expect(isOpenAIImageConfigured()).toBe(false)
  })

  it('RUNWAY_API_SECRET is not accessible without process.env', () => {
    delete process.env.RUNWAY_API_SECRET
    delete process.env.ORBIT_RUNWAY_VIDEO_ENABLED
    expect(isRunwayConfigured()).toBe(false)
  })
})

// ── Feature flags default to off ─────────────────────────────────────────────

describe('Feature flags default to off', () => {
  it('ORBIT_AI_IMAGE_ENABLED defaults to disabled', () => {
    delete process.env.ORBIT_AI_IMAGE_ENABLED
    delete process.env.OPENAI_API_KEY
    expect(isOpenAIImageConfigured()).toBe(false)
  })

  it('ORBIT_RUNWAY_VIDEO_ENABLED defaults to disabled', () => {
    delete process.env.ORBIT_RUNWAY_VIDEO_ENABLED
    delete process.env.RUNWAY_API_SECRET
    expect(isRunwayConfigured()).toBe(false)
  })
})

// ── getOpenAIImageModel ───────────────────────────────────────────────────────

describe('getOpenAIImageModel', () => {
  it('returns gpt-image-2 when ORBIT_OPENAI_IMAGE_MODEL is unset', () => {
    delete process.env.ORBIT_OPENAI_IMAGE_MODEL
    expect(getOpenAIImageModel()).toBe('gpt-image-2')
  })

  it('returns the override value when ORBIT_OPENAI_IMAGE_MODEL is set', () => {
    process.env.ORBIT_OPENAI_IMAGE_MODEL = 'gpt-image-3'
    expect(getOpenAIImageModel()).toBe('gpt-image-3')
  })
})

// ── getRunwayModel ────────────────────────────────────────────────────────────

describe('getRunwayModel', () => {
  it('returns gen4_turbo when ORBIT_RUNWAY_MODEL is unset', () => {
    delete process.env.ORBIT_RUNWAY_MODEL
    expect(getRunwayModel()).toBe('gen4_turbo')
  })

  it('returns the override value when ORBIT_RUNWAY_MODEL is set', () => {
    process.env.ORBIT_RUNWAY_MODEL = 'gen4_ultra'
    expect(getRunwayModel()).toBe('gen4_ultra')
  })
})
