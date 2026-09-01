/**
 * Orbit — server-approved FAL video model registry.
 *
 * Server-side only. NEVER import from client components.
 * FAL endpoint paths must not be sent to the browser.
 *
 * The browser submits a model key ('kling', 'veo', 'seedance').
 * The server validates the key against this registry and resolves
 * the endpoint internally. No arbitrary FAL endpoint strings
 * are accepted from the browser.
 *
 * Optional env vars:
 *   ORBIT_FAL_VIDEO_MODEL  — overrides the primary Kling endpoint;
 *                            e.g. fal-ai/kling-video/v3/pro/image-to-video
 *   ORBIT_VIDEO_PROVIDER   — must be 'fal' (default; reserved for future providers)
 */

// ── Model definitions ─────────────────────────────────────────────────────────

export interface FalVideoModel {
  key:            string
  name:           string                              // staff-facing display name
  tier:           'recommended' | 'premium' | 'alternative'
  falEndpoint:    string                              // FAL queue endpoint — NEVER expose to browser
  supportsImage:  boolean
  maxDurationSec: number
  costPerSecond:  number                              // approximate USD
}

// Internal registry with private _endpoint field
const _REGISTRY: Record<string, {
  key:            string
  name:           string
  tier:           'recommended' | 'premium' | 'alternative'
  _endpoint:      string
  supportsImage:  boolean
  maxDurationSec: number
  costPerSecond:  number
}> = {
  kling: {
    key:            'kling',
    name:           'Kling 3.0',
    tier:           'recommended',
    // Default endpoint — override via ORBIT_FAL_VIDEO_MODEL env var
    _endpoint:      'fal-ai/kling-video/v3/pro/image-to-video',
    supportsImage:  true,
    maxDurationSec: 10,
    costPerSecond:  0.045,
  },
  veo: {
    key:            'veo',
    name:           'Veo 3',
    tier:           'premium',
    _endpoint:      'fal-ai/veo3',
    supportsImage:  true,
    maxDurationSec: 8,
    costPerSecond:  0.12,
  },
  seedance: {
    key:            'seedance',
    name:           'Seedance',
    tier:           'alternative',
    _endpoint:      'fal-ai/seedance-v1-lite/image-to-video',
    supportsImage:  true,
    maxDurationSec: 5,
    costPerSecond:  0.025,
  },
}

/**
 * Resolves a model key to its full definition including FAL endpoint.
 * Returns null if the key is not in the registry — caller should 400.
 * For 'kling', the endpoint is overridable via ORBIT_FAL_VIDEO_MODEL.
 */
export function resolveVideoModel(key: string): FalVideoModel | null {
  const entry = _REGISTRY[key]
  if (!entry) return null
  const { _endpoint, ...rest } = entry
  const endpoint = (key === 'kling' && process.env.ORBIT_FAL_VIDEO_MODEL)
    ? process.env.ORBIT_FAL_VIDEO_MODEL
    : _endpoint
  return { ...rest, falEndpoint: endpoint }
}

/**
 * Returns all registry keys — for use in validation and testing only.
 * Does NOT expose falEndpoint.
 */
export function listVideoModelKeys(): string[] {
  return Object.keys(_REGISTRY)
}

/**
 * Returns display metadata for all models — safe to include in API responses.
 * falEndpoint is intentionally excluded.
 */
export function listVideoModels(): Omit<FalVideoModel, 'falEndpoint'>[] {
  return Object.values(_REGISTRY).map(({ _endpoint: _, ...rest }) => rest)
}

// ── Motion presets ────────────────────────────────────────────────────────────
// Staff-friendly preset motion instructions for the VIDEO tab.
// These are prompt strings only — no commercial values, no prices, no routes.

export interface MotionPreset {
  key:    string
  label:  string
  prompt: string
}

export const MOTION_PRESETS: MotionPreset[] = [
  {
    key:    'cinematic_push',
    label:  'Cinematic Push In',
    prompt: 'Slow cinematic push-in camera movement, golden hour light, cinematic depth of field',
  },
  {
    key:    'slow_zoom',
    label:  'Slow Zoom',
    prompt: 'Gentle slow zoom into the scene, smooth parallax, soft ambient natural light',
  },
  {
    key:    'airport_arrival',
    label:  'Airport Arrival',
    prompt: 'Bustling airport arrival atmosphere, travellers in motion, warm terminal lighting, sense of anticipation',
  },
  {
    key:    'luxury_reveal',
    label:  'Luxury Reveal',
    prompt: 'Elegant luxury reveal with slow pan, premium atmosphere, rich warm tones, cinematic quality',
  },
  {
    key:    'destination_panorama',
    label:  'Destination Panorama',
    prompt: 'Wide sweeping panorama across the destination landscape, cinematic drone-like perspective',
  },
  {
    key:    'people_walking',
    label:  'People Walking',
    prompt: 'Travellers walking through the destination, natural movement, lively authentic atmosphere',
  },
  {
    key:    'ocean_movement',
    label:  'Ocean Movement',
    prompt: 'Gentle ocean waves and coastal atmosphere, slow rhythmic movement, serene and peaceful',
  },
  {
    key:    'city_motion',
    label:  'City Motion',
    prompt: 'City in motion with subtle camera drift, urban energy, vibrant street life',
  },
  {
    key:    'aircraft_movement',
    label:  'Aircraft Movement',
    prompt: 'Aircraft in graceful motion against a clear sky, contrails, sense of journey and adventure',
  },
  {
    key:    'celebration',
    label:  'Celebration',
    prompt: 'Joyful celebration atmosphere, people smiling and connecting, warm ambient golden light',
  },
]
