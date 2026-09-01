/**
 * Regression tests: Orbit image provider detection consistency.
 *
 * Covers the false "No image provider configured" bug where envPresence
 * reported PRESENT (presence check) while isOpenAIImageEnabled() returned
 * false (strict string equality), and where flag values like "True" or
 * " true " silently disabled the feature.
 *
 * Spec: WALZ ORBIT — FIX FALSE "NO IMAGE PROVIDER CONFIGURED" ERROR
 * Sections 7, 13 — flag normalization and regression tests.
 */

import { envFlag, isOpenAIImageEnabled } from '../lib/orbit/openai-image-adapter'
import { getProviderHealth } from '../lib/orbit/provider-health'

// ── Helper: set env vars for a test and restore afterwards ───────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k]
    if (vars[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = vars[k]
    }
  }
  try { fn() } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

// ── envFlag() normalization ───────────────────────────────────────────────────

describe('envFlag()', () => {
  it('returns true for exact "true"', () => {
    withEnv({ TEST_FLAG: 'true' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(true)
    })
  })

  it('returns true for "True" (capital T)', () => {
    withEnv({ TEST_FLAG: 'True' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(true)
    })
  })

  it('returns true for "TRUE" (all caps)', () => {
    withEnv({ TEST_FLAG: 'TRUE' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(true)
    })
  })

  it('returns true for " true " (surrounding whitespace)', () => {
    withEnv({ TEST_FLAG: ' true ' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(true)
    })
  })

  it('returns false for "1"', () => {
    withEnv({ TEST_FLAG: '1' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(false)
    })
  })

  it('returns false for "yes"', () => {
    withEnv({ TEST_FLAG: 'yes' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(false)
    })
  })

  it('returns false for empty string', () => {
    withEnv({ TEST_FLAG: '' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(false)
    })
  })

  it('returns false when var is not set', () => {
    withEnv({ TEST_FLAG: undefined }, () => {
      expect(envFlag('TEST_FLAG')).toBe(false)
    })
  })

  it('returns false for "false"', () => {
    withEnv({ TEST_FLAG: 'false' }, () => {
      expect(envFlag('TEST_FLAG')).toBe(false)
    })
  })
})

// ── isOpenAIImageEnabled() ────────────────────────────────────────────────────

describe('isOpenAIImageEnabled()', () => {
  it('returns true when flag is "true" and key is set', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'true', OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(true)
    })
  })

  it('returns true when flag is "True" (case-insensitive normalization)', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'True', OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(true)
    })
  })

  it('returns true when flag is "TRUE"', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'TRUE', OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(true)
    })
  })

  it('returns true when flag has leading/trailing whitespace', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: ' true ', OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(true)
    })
  })

  it('returns false when flag is "true" but key is missing', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'true', OPENAI_API_KEY: undefined }, () => {
      expect(isOpenAIImageEnabled()).toBe(false)
    })
  })

  it('returns false when flag is missing', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: undefined, OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(false)
    })
  })

  it('returns false when flag is "1" (not normalized to true)', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: '1', OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(false)
    })
  })

  it('returns false when flag is "false"', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: 'sk-test' }, () => {
      expect(isOpenAIImageEnabled()).toBe(false)
    })
  })
})

// ── getProviderHealth() consistency ──────────────────────────────────────────

describe('getProviderHealth() — consistency with isOpenAIImageEnabled()', () => {
  it('image.status is "configured" iff isOpenAIImageEnabled() is true', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'true', OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const health = getProviderHealth()
      expect(health.image.status).toBe('configured')
      expect(isOpenAIImageEnabled()).toBe(true)
      // The two must agree — this was the root of the production bug
      expect(health.image.configured).toBe(isOpenAIImageEnabled())
    })
  })

  it('image.status is "disabled" when flag is off, isOpenAIImageEnabled() also false', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const health = getProviderHealth()
      expect(health.image.status).toBe('disabled')
      expect(isOpenAIImageEnabled()).toBe(false)
      expect(health.image.configured).toBe(isOpenAIImageEnabled())
    })
  })

  it('image.status is "missing_key" when flag is on but key absent, isOpenAIImageEnabled() false', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'true', OPENAI_API_KEY: undefined, ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const health = getProviderHealth()
      expect(health.image.status).toBe('missing_key')
      expect(isOpenAIImageEnabled()).toBe(false)
      expect(health.image.configured).toBe(isOpenAIImageEnabled())
    })
  })

  it('image.configured === true is impossible when isOpenAIImageEnabled() is false', () => {
    // The false "configured but disabled" state that caused the bug
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'True', OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const health = getProviderHealth()
      const enabled = isOpenAIImageEnabled()
      // Both must agree — contradictory state was the bug
      expect(health.image.configured).toBe(enabled)
      // With normalized envFlag, "True" is treated as true
      expect(enabled).toBe(true)
      expect(health.image.status).toBe('configured')
    })
  })
})

// ── envPresence reports value, not just presence ──────────────────────────────

describe('envPresence — ORBIT_AI_IMAGE_ENABLED reports flag VALUE not just presence', () => {
  it('reports false when var is set to "false"', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      expect(envPresence.ORBIT_AI_IMAGE_ENABLED).toBe(false)
    })
  })

  it('reports true when var is set to "true"', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: 'true', OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      expect(envPresence.ORBIT_AI_IMAGE_ENABLED).toBe(true)
    })
  })

  it('reports false when var is present but not "true" (prevents misleading PRESENT status)', () => {
    // This was the bug: presence check showed PRESENT even for "True" or " true "
    // but the strict === 'true' check would fail, causing a contradictory state.
    // Now both use envFlag, so they agree.
    withEnv({ ORBIT_AI_IMAGE_ENABLED: '1', OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      // "1" is not a valid true value — should report false
      expect(envPresence.ORBIT_AI_IMAGE_ENABLED).toBe(false)
    })
  })

  it('reports false when var is absent', () => {
    withEnv({ ORBIT_AI_IMAGE_ENABLED: undefined, OPENAI_API_KEY: 'sk-test', ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      expect(envPresence.ORBIT_AI_IMAGE_ENABLED).toBe(false)
    })
  })
})

// ── No contradictory state possible ──────────────────────────────────────────

describe('no contradictory state: image.configured and isOpenAIImageEnabled() always agree', () => {
  const scenarios = [
    { ORBIT_AI_IMAGE_ENABLED: 'true',  OPENAI_API_KEY: 'sk-test' },
    { ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: 'sk-test' },
    { ORBIT_AI_IMAGE_ENABLED: 'true',  OPENAI_API_KEY: undefined  },
    { ORBIT_AI_IMAGE_ENABLED: undefined, OPENAI_API_KEY: 'sk-test' },
    { ORBIT_AI_IMAGE_ENABLED: 'True',  OPENAI_API_KEY: 'sk-test' },
    { ORBIT_AI_IMAGE_ENABLED: ' true ', OPENAI_API_KEY: 'sk-test' },
    { ORBIT_AI_IMAGE_ENABLED: '1',     OPENAI_API_KEY: 'sk-test' },
    { ORBIT_AI_IMAGE_ENABLED: 'yes',   OPENAI_API_KEY: 'sk-test' },
  ] as const

  for (const s of scenarios) {
    it(`flag="${s.ORBIT_AI_IMAGE_ENABLED ?? '(unset)'}" key="${s.OPENAI_API_KEY ?? '(unset)'}" — health.image.configured === isOpenAIImageEnabled()`, () => {
      withEnv({
        ORBIT_AI_IMAGE_ENABLED: s.ORBIT_AI_IMAGE_ENABLED as string | undefined,
        OPENAI_API_KEY:         s.OPENAI_API_KEY as string | undefined,
        ORBIT_AI_VIDEO_ENABLED: 'false',
        FALAI_API_KEY:          undefined,
      }, () => {
        const health  = getProviderHealth()
        const enabled = isOpenAIImageEnabled()
        expect(health.image.configured).toBe(enabled)
      })
    })
  }
})
