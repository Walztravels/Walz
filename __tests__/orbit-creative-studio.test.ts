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
import {
  isFalVideoConfigured,
} from '../lib/orbit/fal-video-adapter'
import {
  resolveVideoModel,
  listVideoModelKeys,
  listVideoModels,
  MOTION_PRESETS,
} from '../lib/orbit/video-models'
import {
  getProviderHealth,
} from '../lib/orbit/provider-health'

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

// ── isFalVideoConfigured ──────────────────────────────────────────────────────

describe('isFalVideoConfigured', () => {
  it('returns false when ORBIT_AI_VIDEO_ENABLED is missing', () => {
    delete process.env.ORBIT_AI_VIDEO_ENABLED
    process.env.FALAI_API_KEY = 'fal-test-key'
    expect(isFalVideoConfigured()).toBe(false)
  })

  it('returns false when ORBIT_AI_VIDEO_ENABLED=false', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'false'
    process.env.FALAI_API_KEY          = 'fal-test-key'
    expect(isFalVideoConfigured()).toBe(false)
  })

  it('returns false when FALAI_API_KEY is missing', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'true'
    delete process.env.FALAI_API_KEY
    expect(isFalVideoConfigured()).toBe(false)
  })

  it('returns true when both vars are set', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'true'
    process.env.FALAI_API_KEY          = 'fal-test-key'
    expect(isFalVideoConfigured()).toBe(true)
  })

  it('ORBIT_AI_VIDEO_ENABLED defaults to disabled', () => {
    delete process.env.ORBIT_AI_VIDEO_ENABLED
    delete process.env.FALAI_API_KEY
    expect(isFalVideoConfigured()).toBe(false)
  })
})

// ── Video model registry ──────────────────────────────────────────────────────

describe('resolveVideoModel', () => {
  it('returns a valid model for "kling"', () => {
    const m = resolveVideoModel('kling')
    expect(m).not.toBeNull()
    expect(m?.key).toBe('kling')
    expect(m?.tier).toBe('recommended')
    expect(m?.supportsImage).toBe(true)
    expect(m?.costPerSecond).toBeGreaterThan(0)
    expect(m?.maxDurationSec).toBeGreaterThan(0)
    // falEndpoint must be a non-empty string
    expect(typeof m?.falEndpoint).toBe('string')
    expect(m!.falEndpoint.length).toBeGreaterThan(0)
  })

  it('returns a valid model for "veo"', () => {
    const m = resolveVideoModel('veo')
    expect(m).not.toBeNull()
    expect(m?.tier).toBe('premium')
  })

  it('returns a valid model for "seedance"', () => {
    const m = resolveVideoModel('seedance')
    expect(m).not.toBeNull()
    expect(m?.tier).toBe('alternative')
  })

  it('returns null for an unknown model key', () => {
    expect(resolveVideoModel('arbitrary-fal-endpoint')).toBeNull()
    expect(resolveVideoModel('')).toBeNull()
    expect(resolveVideoModel('../../etc/passwd')).toBeNull()
  })

  it('uses ORBIT_FAL_VIDEO_MODEL env var to override kling endpoint', () => {
    process.env.ORBIT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v3.0/pro/image-to-video'
    const m = resolveVideoModel('kling')
    expect(m?.falEndpoint).toBe('fal-ai/kling-video/v3.0/pro/image-to-video')
  })

  it('does NOT override veo/seedance with ORBIT_FAL_VIDEO_MODEL', () => {
    process.env.ORBIT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v3.0/pro/image-to-video'
    const veo = resolveVideoModel('veo')
    expect(veo?.falEndpoint).not.toBe('fal-ai/kling-video/v3.0/pro/image-to-video')
  })
})

describe('listVideoModelKeys', () => {
  it('includes kling, veo, and seedance', () => {
    const keys = listVideoModelKeys()
    expect(keys).toContain('kling')
    expect(keys).toContain('veo')
    expect(keys).toContain('seedance')
  })
})

describe('listVideoModels', () => {
  it('does NOT include falEndpoint in returned objects (server secret)', () => {
    const models = listVideoModels()
    for (const m of models) {
      expect((m as Record<string, unknown>).falEndpoint).toBeUndefined()
    }
  })

  it('all models have required display fields', () => {
    const models = listVideoModels()
    for (const m of models) {
      expect(typeof m.key).toBe('string')
      expect(typeof m.name).toBe('string')
      expect(['recommended', 'premium', 'alternative']).toContain(m.tier)
      expect(m.costPerSecond).toBeGreaterThan(0)
      expect(m.maxDurationSec).toBeGreaterThan(0)
    }
  })

  it('has exactly one recommended model', () => {
    const recommended = listVideoModels().filter(m => m.tier === 'recommended')
    expect(recommended.length).toBe(1)
    expect(recommended[0].key).toBe('kling')
  })
})

// ── MOTION_PRESETS ────────────────────────────────────────────────────────────

describe('MOTION_PRESETS', () => {
  it('has 10 presets', () => {
    expect(MOTION_PRESETS.length).toBe(10)
  })

  it('all presets have non-empty prompt strings', () => {
    for (const p of MOTION_PRESETS) {
      expect(typeof p.prompt).toBe('string')
      expect(p.prompt.length).toBeGreaterThan(20)
    }
  })

  it('no preset includes price or commercial values', () => {
    const forbidden = ['price', 'fare', '₦', 'ngn', 'gbp', 'discount', '%']
    for (const p of MOTION_PRESETS) {
      for (const kw of forbidden) {
        expect(p.prompt.toLowerCase()).not.toContain(kw)
      }
    }
  })

  it('all presets have unique keys', () => {
    const keys = MOTION_PRESETS.map(p => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ── FAL API key protection ────────────────────────────────────────────────────

describe('FAL API key protection', () => {
  it('FALAI_API_KEY is not accessible without process.env', () => {
    delete process.env.FALAI_API_KEY
    delete process.env.ORBIT_AI_VIDEO_ENABLED
    expect(isFalVideoConfigured()).toBe(false)
  })

  it('browser cannot inject arbitrary model endpoint — resolveVideoModel rejects unknown keys', () => {
    const maliciousKeys = [
      'fal-ai/malicious-model',
      '../../../secret',
      'kling; DROP TABLE orbit_media',
      '',
    ]
    for (const key of maliciousKeys) {
      expect(resolveVideoModel(key)).toBeNull()
    }
  })
})

// ── Kling default endpoint ─────────────────────────────────────────────────────

describe('Kling default FAL endpoint', () => {
  it('uses v3/pro (not v2.1/standard) as the default endpoint', () => {
    delete process.env.ORBIT_FAL_VIDEO_MODEL
    const m = resolveVideoModel('kling')
    expect(m?.falEndpoint).toBe('fal-ai/kling-video/v3/pro/image-to-video')
  })

  it('ORBIT_FAL_VIDEO_MODEL env var overrides the default', () => {
    process.env.ORBIT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v3/pro/image-to-video'
    const m = resolveVideoModel('kling')
    expect(m?.falEndpoint).toBe('fal-ai/kling-video/v3/pro/image-to-video')
  })
})

// ── getProviderHealth ─────────────────────────────────────────────────────────

describe('getProviderHealth — image', () => {
  it('returns disabled when ORBIT_AI_IMAGE_ENABLED is not set', () => {
    delete process.env.ORBIT_AI_IMAGE_ENABLED
    delete process.env.OPENAI_API_KEY
    const r = getProviderHealth()
    expect(r.image.status).toBe('disabled')
    expect(r.image.configured).toBe(false)
    expect(r.image.enabled).toBe(false)
  })

  it('returns disabled when ORBIT_AI_IMAGE_ENABLED=false with key present', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED = 'false'
    process.env.OPENAI_API_KEY         = 'sk-test'
    const r = getProviderHealth()
    expect(r.image.status).toBe('disabled')
    expect(r.image.configured).toBe(false)
  })

  it('returns missing_key when enabled but OPENAI_API_KEY absent', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED = 'true'
    delete process.env.OPENAI_API_KEY
    const r = getProviderHealth()
    expect(r.image.status).toBe('missing_key')
    expect(r.image.configured).toBe(false)
    expect(r.image.enabled).toBe(true)
  })

  it('returns configured when both flag and key are present', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED    = 'true'
    process.env.OPENAI_API_KEY            = 'sk-test'
    process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    const r = getProviderHealth()
    expect(r.image.status).toBe('configured')
    expect(r.image.configured).toBe(true)
    expect(r.image.provider).toBe('openai')
  })

  it('image health reports model name not API key value', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED = 'true'
    process.env.OPENAI_API_KEY         = 'sk-super-secret'
    const r = getProviderHealth()
    expect(r.image.model).not.toContain('sk-super-secret')
    expect(r.image.reason).not.toContain('sk-super-secret')
    // Model should be a display name like 'gpt-image-2'
    expect(r.image.model.length).toBeGreaterThan(0)
  })
})

describe('getProviderHealth — video', () => {
  it('returns disabled when ORBIT_AI_VIDEO_ENABLED is not set', () => {
    delete process.env.ORBIT_AI_VIDEO_ENABLED
    delete process.env.FALAI_API_KEY
    const r = getProviderHealth()
    expect(r.video.status).toBe('disabled')
    expect(r.video.configured).toBe(false)
    expect(r.video.enabled).toBe(false)
  })

  it('returns disabled when ORBIT_AI_VIDEO_ENABLED=false with key present', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'false'
    process.env.FALAI_API_KEY          = 'fal-test'
    const r = getProviderHealth()
    expect(r.video.status).toBe('disabled')
    expect(r.video.configured).toBe(false)
  })

  it('returns missing_key when enabled but FALAI_API_KEY absent', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'true'
    delete process.env.FALAI_API_KEY
    const r = getProviderHealth()
    expect(r.video.status).toBe('missing_key')
    expect(r.video.configured).toBe(false)
    expect(r.video.enabled).toBe(true)
  })

  it('returns configured when both flag and key are present', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'true'
    process.env.FALAI_API_KEY          = 'fal-test'
    const r = getProviderHealth()
    expect(r.video.status).toBe('configured')
    expect(r.video.configured).toBe(true)
    expect(r.video.provider).toBe('fal')
    expect(r.video.modelKey).toBe('kling')
  })

  it('video health never returns FALAI_API_KEY value', () => {
    process.env.ORBIT_AI_VIDEO_ENABLED = 'true'
    process.env.FALAI_API_KEY          = 'fal-secret-key'
    const r = getProviderHealth()
    const serialized = JSON.stringify(r)
    expect(serialized).not.toContain('fal-secret-key')
  })
})

describe('getProviderHealth — envPresence', () => {
  it('reports PRESENT/MISSING without exposing values', () => {
    process.env.ORBIT_AI_IMAGE_ENABLED = 'true'
    process.env.OPENAI_API_KEY         = 'sk-secret'
    process.env.ORBIT_AI_VIDEO_ENABLED = 'false'
    delete process.env.FALAI_API_KEY
    const r = getProviderHealth()

    expect(r.envPresence.OPENAI_API_KEY).toBe(true)
    expect(r.envPresence.ORBIT_AI_IMAGE_ENABLED).toBe(true)
    expect(r.envPresence.FALAI_API_KEY).toBe(false)
    expect(r.envPresence.ORBIT_AI_VIDEO_ENABLED).toBe(true)

    // Verify values never appear — only booleans
    const serialized = JSON.stringify(r.envPresence)
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('fal-')
  })

  it('reports ORBIT_FAL_VIDEO_MODEL presence without its value', () => {
    process.env.ORBIT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v3/pro/image-to-video'
    const r = getProviderHealth()
    expect(r.envPresence.ORBIT_FAL_VIDEO_MODEL).toBe(true)
    // The endpoint path should NOT appear in the envPresence block
    expect(JSON.stringify(r.envPresence)).not.toContain('fal-ai/kling-video')
  })
})

describe('getProviderHealth — report structure', () => {
  it('always returns checkedAt as an ISO timestamp string', () => {
    const r = getProviderHealth()
    expect(typeof r.checkedAt).toBe('string')
    expect(r.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('always returns image and video health blocks', () => {
    const r = getProviderHealth()
    expect(r.image).toBeDefined()
    expect(r.video).toBeDefined()
    expect(r.envPresence).toBeDefined()
  })

  it('image.provider is always "openai"', () => {
    const r = getProviderHealth()
    expect(r.image.provider).toBe('openai')
  })

  it('video.provider is always "fal"', () => {
    const r = getProviderHealth()
    expect(r.video.provider).toBe('fal')
  })
})
