/**
 * Regression tests: Orbit FAL video provider detection consistency.
 *
 * Covers the false "FAL.ai video is not enabled" bug where isFalVideoConfigured()
 * used strict string equality for ORBIT_AI_VIDEO_ENABLED while provider-health.ts
 * used envFlag() — creating contradictory diagnostic vs generation states.
 *
 * Spec: WALZ ORBIT — FIX FALSE FAL "VIDEO NOT ENABLED" ERROR
 * Sections 4, 6, 8, 9, 15.
 */

import { isFalVideoConfigured } from '../lib/orbit/fal-video-adapter'
import { getProviderHealth } from '../lib/orbit/provider-health'

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

// ── isFalVideoConfigured() flag normalization ─────────────────────────────────

describe('isFalVideoConfigured() — flag normalization', () => {
  it('returns true for flag "true" with key present', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(true)
    })
  })

  it('returns true for flag "True" (case-insensitive)', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'True', FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(true)
    })
  })

  it('returns true for flag "TRUE"', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'TRUE', FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(true)
    })
  })

  it('returns true for flag " true " (surrounding whitespace)', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: ' true ', FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(true)
    })
  })

  it('returns false when flag is "false"', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(false)
    })
  })

  it('returns false when flag is missing', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: undefined, FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(false)
    })
  })

  it('returns false when flag is "1" (not a valid true value)', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: '1', FALAI_API_KEY: 'fal-secret' }, () => {
      expect(isFalVideoConfigured()).toBe(false)
    })
  })

  it('returns false when FALAI_API_KEY is missing (even if flag is true)', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: undefined }, () => {
      expect(isFalVideoConfigured()).toBe(false)
    })
  })

  it('returns false when FALAI_API_KEY is whitespace-only', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: '   ' }, () => {
      expect(isFalVideoConfigured()).toBe(false)
    })
  })
})

// ── Consistency: isFalVideoConfigured() must agree with getProviderHealth().video.configured ───

describe('consistency: isFalVideoConfigured() and health.video.configured always agree', () => {
  const scenarios = [
    { ORBIT_AI_VIDEO_ENABLED: 'true',    FALAI_API_KEY: 'fal-secret' },
    { ORBIT_AI_VIDEO_ENABLED: 'false',   FALAI_API_KEY: 'fal-secret' },
    { ORBIT_AI_VIDEO_ENABLED: 'true',    FALAI_API_KEY: undefined     },
    { ORBIT_AI_VIDEO_ENABLED: undefined, FALAI_API_KEY: 'fal-secret' },
    { ORBIT_AI_VIDEO_ENABLED: 'True',    FALAI_API_KEY: 'fal-secret' },
    { ORBIT_AI_VIDEO_ENABLED: ' true ',  FALAI_API_KEY: 'fal-secret' },
    { ORBIT_AI_VIDEO_ENABLED: '1',       FALAI_API_KEY: 'fal-secret' },
    { ORBIT_AI_VIDEO_ENABLED: 'TRUE',    FALAI_API_KEY: 'fal-secret' },
  ] as const

  for (const s of scenarios) {
    it(`flag="${s.ORBIT_AI_VIDEO_ENABLED ?? '(unset)'}" key="${s.FALAI_API_KEY ? 'PRESENT' : '(unset)'}" — configured values agree`, () => {
      withEnv({
        ORBIT_AI_VIDEO_ENABLED: s.ORBIT_AI_VIDEO_ENABLED as string | undefined,
        FALAI_API_KEY:          s.FALAI_API_KEY as string | undefined,
        ORBIT_AI_IMAGE_ENABLED: 'false',
        OPENAI_API_KEY:         undefined,
      }, () => {
        const configured = isFalVideoConfigured()
        const health     = getProviderHealth()
        // Health and adapter must never contradict each other
        expect(health.video.configured).toBe(configured)
      })
    })
  }
})

// ── envPresence for video flag reports VALUE, not just presence ───────────────

describe('envPresence.ORBIT_AI_VIDEO_ENABLED reports flag value, not just presence', () => {
  it('reports false when flag is "false"', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: 'fal-secret', ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      expect(envPresence.ORBIT_AI_VIDEO_ENABLED).toBe(false)
    })
  })

  it('reports true when flag is "true"', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: 'fal-secret', ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      expect(envPresence.ORBIT_AI_VIDEO_ENABLED).toBe(true)
    })
  })

  it('reports false when flag is present but "1" (not a valid true)', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: '1', FALAI_API_KEY: 'fal-secret', ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const { envPresence } = getProviderHealth()
      expect(envPresence.ORBIT_AI_VIDEO_ENABLED).toBe(false)
    })
  })
})

// ── ORBIT_RUNWAY_VIDEO_ENABLED must not disable FAL ───────────────────────────

describe('ORBIT_RUNWAY_VIDEO_ENABLED does not affect FAL configuration', () => {
  it('FAL is configured regardless of ORBIT_RUNWAY_VIDEO_ENABLED value', () => {
    withEnv({
      ORBIT_AI_VIDEO_ENABLED:   'true',
      FALAI_API_KEY:            'fal-secret',
      ORBIT_RUNWAY_VIDEO_ENABLED: 'false',
    }, () => {
      expect(isFalVideoConfigured()).toBe(true)
    })
  })

  it('FAL is disabled based on ORBIT_AI_VIDEO_ENABLED, not Runway flag', () => {
    withEnv({
      ORBIT_AI_VIDEO_ENABLED:   'false',
      FALAI_API_KEY:            'fal-secret',
      ORBIT_RUNWAY_VIDEO_ENABLED: 'true',  // Runway enabled but irrelevant
    }, () => {
      expect(isFalVideoConfigured()).toBe(false)
    })
  })
})

// ── Video status gives distinct failure modes ─────────────────────────────────

describe('getProviderHealth().video — distinct failure modes', () => {
  it('status is "disabled" when flag is false', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'false', FALAI_API_KEY: 'fal-secret', ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const h = getProviderHealth()
      expect(h.video.status).toBe('disabled')
      expect(h.video.configured).toBe(false)
    })
  })

  it('status is "missing_key" when flag is true but key absent', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: undefined, ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const h = getProviderHealth()
      expect(h.video.status).toBe('missing_key')
      expect(h.video.configured).toBe(false)
    })
  })

  it('status is "configured" when flag is true and key present', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: 'fal-secret', ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const h = getProviderHealth()
      expect(h.video.status).toBe('configured')
      expect(h.video.configured).toBe(true)
    })
  })

  it('FALAI_API_KEY value is never present in serialized health report', () => {
    withEnv({ ORBIT_AI_VIDEO_ENABLED: 'true', FALAI_API_KEY: 'super-secret-fal-key', ORBIT_AI_IMAGE_ENABLED: 'false', OPENAI_API_KEY: undefined }, () => {
      const h = getProviderHealth()
      expect(JSON.stringify(h)).not.toContain('super-secret-fal-key')
    })
  })
})
