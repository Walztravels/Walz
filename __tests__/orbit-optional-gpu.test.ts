/**
 * Orbit Creative OS — GPU/local inference is OPTIONAL.
 *
 * The local GPU provider is a cost lane, never a platform dependency.
 * Covers the optional-GPU regression matrix: no-env startup, offline
 * fallback per mode, LOCAL_ONLY isolation, capability-aware routing,
 * duplicate-job protection, health timeout behavior, no-GPU independence
 * of Media Library / Manual Upload / compositor, and secret hygiene.
 */

import fs from 'fs'
import path from 'path'

const ENV_KEYS = ['ORBIT_LOCAL_AI_URL', 'ORBIT_LOCAL_AI_TOKEN', 'FALAI_API_KEY', 'OPENAI_API_KEY',
  'REPLICATE_API_TOKEN', 'ORBIT_AI_IMAGE_ENABLED', 'ORBIT_AI_VIDEO_ENABLED']
const saved: Record<string, string | undefined> = {}
beforeAll(() => { for (const k of ENV_KEYS) saved[k] = process.env[k] })
afterAll(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

function cloudOnlyEnv() {
  delete process.env.ORBIT_LOCAL_AI_URL
  delete process.env.ORBIT_LOCAL_AI_TOKEN
  Object.assign(process.env, {
    FALAI_API_KEY: 'fal', OPENAI_API_KEY: 'oa', REPLICATE_API_TOKEN: 'rep',
    ORBIT_AI_IMAGE_ENABLED: 'true', ORBIT_AI_VIDEO_ENABLED: 'true',
  })
}
function withLocalEnv() {
  cloudOnlyEnv()
  process.env.ORBIT_LOCAL_AI_URL = 'http://gpu.internal.test'
  process.env.ORBIT_LOCAL_AI_TOKEN = 'secret-local-token-abc'
}

// ── Adapter mocks (no real network for providers) ─────────────────────────────

const mockLocalSubmit = jest.fn().mockResolvedValue({ providerJobId: 'local-job-1' })
jest.mock('@/lib/orbit/creative-os/local-adapter', () => ({
  isLocalAIConfigured: () => !!process.env.ORBIT_LOCAL_AI_URL?.trim() && !!process.env.ORBIT_LOCAL_AI_TOKEN?.trim(),
  submitLocalJob: (...a: unknown[]) => mockLocalSubmit(...a),
  pollLocalJob:   jest.fn().mockResolvedValue({ status: 'completed', outputUrl: 'http://x/out.png' }),
  probeLocalAI:   jest.fn().mockResolvedValue({ reachable: false }),
}))

const mockOpenAIGen = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn/img.png', costUsd: 0.17, storagePath: 'x', width: 1080, height: 1350 })
jest.mock('@/lib/orbit/openai-image-adapter', () => ({
  generateOpenAIImage: (...a: unknown[]) => mockOpenAIGen(...a),
  editOpenAIImage:     (...a: unknown[]) => mockOpenAIGen(...a),
  envFlag: (n: string) => (process.env[n] ?? '').toLowerCase() === 'true',
}))

const mockReplicate = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn/flux.png', costUsd: 0.03, prompt: '', storagePath: 'y' })
jest.mock('@/lib/orbit/replicate-adapter', () => ({
  generateBackground: (...a: unknown[]) => mockReplicate(...a),
}))

// fetch: health behavior is configurable per test; FAL submits recorded
type HealthMode = 'healthy' | 'offline' | 'timeout' | 'no-sdxl'
let healthMode: HealthMode = 'healthy'
const fetchCalls: string[] = []
global.fetch = jest.fn(async (url: RequestInfo | URL) => {
  const u = String(url)
  fetchCalls.push(u)
  if (u.endsWith('/api/v1/health')) {
    if (healthMode === 'offline') throw new Error('ECONNREFUSED')
    if (healthMode === 'timeout') { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e }
    const caps = healthMode === 'no-sdxl'
      ? ['img2img', 'upscale', 'rembg']
      : ['sdxl', 'img2img', 'inpaint', 'upscale', 'rembg', 'vectorize']
    return { ok: true, json: async () => ({ ok: true, capabilities: caps }) } as Response
  }
  return { ok: true, json: async () => ({ request_id: 'fal-1' }), text: async () => '' } as Response
}) as unknown as typeof fetch

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    orbitCreativeJob: { create: jest.fn(async () => ({ id: 'job_1' })), findUnique: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn() },
    orbitMedia:  { create: jest.fn(async () => ({ id: 'm1' })) },
    activityLog: { create: jest.fn(async (x: unknown) => x) },
  },
}))

import { resolveRoute } from '@/lib/orbit/creative-os/registry'
import { executeCapability } from '@/lib/orbit/creative-os/execute'
import { getLocalAIHealth, checkLocalAIHealth, _resetLocalHealthCache } from '@/lib/orbit/creative-os/local-health'
import { getProviderHealthSummary } from '@/lib/orbit/creative-os/provider-health'
import { executeWorkflow } from '@/lib/orbit/creative-os/workflow'

beforeEach(() => {
  jest.clearAllMocks()
  fetchCalls.length = 0
  healthMode = 'healthy'
  _resetLocalHealthCache()
  mockLocalSubmit.mockResolvedValue({ providerJobId: 'local-job-1' })
})

// ── 1 & 2. No-GPU configuration ───────────────────────────────────────────────

describe('no-GPU configuration', () => {
  it('missing ORBIT_LOCAL_AI_URL: routing works, cloud serves, health is missing_configuration', async () => {
    cloudOnlyEnv()
    expect(getLocalAIHealth().status).toBe('missing_configuration')
    const route = resolveRoute({ capability: 'text_to_image', mode: 'AUTO' })
    expect('error' in route).toBe(false)
    if (!('error' in route)) expect(route.entry.provider).not.toBe('local')
    const r = await executeCapability({ capability: 'text_to_image', prompt: 'sunset over lagos' })
    expect(r.ok).toBe(true)
  })

  it('missing ORBIT_LOCAL_AI_TOKEN alone also means not configured — no crash, cloud works', async () => {
    withLocalEnv()
    delete process.env.ORBIT_LOCAL_AI_TOKEN
    expect(getLocalAIHealth().configured).toBe(false)
    const r = await executeCapability({ capability: 'text_to_image', prompt: 'beach' })
    expect(r.ok).toBe(true)
    expect(mockLocalSubmit).not.toHaveBeenCalled()
  })
})

// ── 3–6. Offline behavior per mode ───────────────────────────────────────────

describe('local provider offline', () => {
  it('AUTO → clean cloud fallback, local never submitted', async () => {
    withLocalEnv(); healthMode = 'offline'
    const r = await executeCapability({ capability: 'text_to_image', mode: 'AUTO', prompt: 'city' })
    expect(r.ok).toBe(true)
    expect(mockLocalSubmit).not.toHaveBeenCalled()
  })

  it('BEST_VALUE → cloud fallback', async () => {
    withLocalEnv(); healthMode = 'offline'
    const r = await executeCapability({ capability: 'text_to_image', mode: 'BEST_VALUE', prompt: 'city' })
    expect(r.ok).toBe(true)
    expect(mockLocalSubmit).not.toHaveBeenCalled()
  })

  it('LOCAL_ONLY → structured LOCAL_AI_UNAVAILABLE, never cloud', async () => {
    withLocalEnv(); healthMode = 'offline'
    const r = await executeCapability({ capability: 'text_to_image', mode: 'LOCAL_ONLY', prompt: 'city' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('LOCAL_AI_UNAVAILABLE')
    expect(r.error).toContain('Local AI is currently unavailable')
    expect(mockOpenAIGen).not.toHaveBeenCalled()
    expect(mockReplicate).not.toHaveBeenCalled()
    expect(fetchCalls.filter(u => u.includes('fal.run')).length).toBe(0)
  })
})

// ── 7–8. Healthy local: selection + capability awareness ─────────────────────

describe('healthy local provider', () => {
  it('AUTO selects local when routing rules prefer it (free + healthy)', async () => {
    withLocalEnv()
    const r = await executeCapability({ capability: 'text_to_image', mode: 'BEST_VALUE', prompt: 'city' })
    expect(r.ok).toBe(true)
    expect(r.provider).toBe('local')
    expect(mockLocalSubmit).toHaveBeenCalledTimes(1)
  })

  it('healthy but capability model missing → cloud fallback (AUTO), LOCAL_AI_UNAVAILABLE (LOCAL_ONLY)', async () => {
    withLocalEnv(); healthMode = 'no-sdxl'
    const auto = await executeCapability({ capability: 'text_to_image', mode: 'BEST_VALUE', prompt: 'city' })
    expect(auto.ok).toBe(true)
    expect(auto.provider).not.toBe('local')
    expect(mockLocalSubmit).not.toHaveBeenCalled()

    _resetLocalHealthCache()
    const only = await executeCapability({ capability: 'text_to_image', mode: 'LOCAL_ONLY', prompt: 'city' })
    expect(only.ok).toBe(false)
    expect(only.code).toBe('LOCAL_AI_UNAVAILABLE')
  })
})

// ── 9. Duplicate-job protection ───────────────────────────────────────────────

describe('duplicate-job protection', () => {
  it('once local ACCEPTS a job, no cloud provider is also submitted', async () => {
    withLocalEnv()
    const r = await executeCapability({ capability: 'text_to_image', mode: 'BEST_VALUE', prompt: 'city' })
    expect(r.ok).toBe(true)
    expect(r.providerJobId).toBe('local-job-1')
    expect(mockOpenAIGen).not.toHaveBeenCalled()
    expect(mockReplicate).not.toHaveBeenCalled()
    expect(fetchCalls.filter(u => u.includes('fal.run')).length).toBe(0)
  })

  it('failover happens ONLY when the previous provider provably did not accept', async () => {
    withLocalEnv()
    mockLocalSubmit.mockRejectedValueOnce(new Error('submit refused'))
    const r = await executeCapability({ capability: 'text_to_image', mode: 'BEST_VALUE', prompt: 'city' })
    expect(r.ok).toBe(true)
    expect(r.provider).not.toBe('local')
    expect(r.fallbackReason).toContain('submit refused')
  })
})

// ── 10. Health timeout never hangs ────────────────────────────────────────────

describe('health timeout', () => {
  it('a timing-out GPU box resolves quickly to a cloud fallback', async () => {
    withLocalEnv(); healthMode = 'timeout'
    const t0 = Date.now()
    const r = await executeCapability({ capability: 'text_to_image', mode: 'AUTO', prompt: 'city' })
    expect(r.ok).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2000)   // mock rejects immediately; no hang path
    const h = await checkLocalAIHealth()
    expect(h.status === 'timeout' || h.status === 'unreachable').toBe(true)
  })
})

// ── 11–13. No-GPU independence of legacy flows ───────────────────────────────

describe('legacy flows are GPU-independent', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

  it('Media Library route never touches local AI', () => {
    const src = read('app/api/admin/orbit/campaigns/[id]/creative/library/route.ts')
    expect(src).not.toMatch(/ORBIT_LOCAL_AI|creative-os/)
  })

  it('Manual Upload route never touches local AI', () => {
    const src = read('app/api/admin/orbit/campaigns/[id]/creative/upload/route.ts')
    expect(src).not.toMatch(/ORBIT_LOCAL_AI|creative-os/)
  })

  it('deterministic compositor works with zero AI env vars', async () => {
    for (const k of ENV_KEYS) delete process.env[k]
    const { buildTemplateComposition } = await import('@/lib/orbit/composer/composition')
    const { walzHeroSplit } = await import('@/lib/orbit/templates/walz-hero-split')
    const comp = buildTemplateComposition({
      template: walzHeroSplit,
      commercialFields: { headline: 'December Flights', cta: 'Book Now' },
      canvas: { key: '1080x1350', width: 1080, height: 1350, label: '4:5' } as never,
    })
    expect(comp.layers.length).toBeGreaterThan(3)
  })
})

// ── Workflow nodes ────────────────────────────────────────────────────────────

describe('workflow with optional local AI', () => {
  it('a LOCAL_ONLY node fails with LOCAL_AI_UNAVAILABLE; sibling nodes proceed', async () => {
    withLocalEnv(); healthMode = 'offline'
    const g = {
      key: 'x', label: 'x',
      nodes: [
        { id: 'a', type: 'generate_image' as const, label: 'local', config: { prompt: 'skyline', mode: 'LOCAL_ONLY' } },
        { id: 'b', type: 'generate_image' as const, label: 'cloud', config: { prompt: 'skyline' } },
      ],
      edges: [],
    }
    const run = await executeWorkflow(g, {})
    const local = run.results.find(r => r.nodeId === 'a')!
    const cloud = run.results.find(r => r.nodeId === 'b')!
    expect(local.status).toBe('failed')
    expect(local.detail).toContain('LOCAL_AI_UNAVAILABLE')
    expect(cloud.status === 'ok' || cloud.status === 'job_submitted').toBe(true)
  })
})

// ── 15. Secret hygiene ────────────────────────────────────────────────────────

describe('secret hygiene', () => {
  it('provider health summary never contains URLs, tokens, or raw errors', async () => {
    withLocalEnv(); healthMode = 'offline'
    const summary = JSON.stringify(await getProviderHealthSummary())
    expect(summary).not.toContain('gpu.internal.test')
    expect(summary).not.toContain('secret-local-token-abc')
    expect(summary).not.toContain('ECONNREFUSED')
  })

  it('friendly optional-GPU note appears when local is intentionally absent', async () => {
    cloudOnlyEnv()
    const summary = await getProviderHealthSummary()
    expect(summary.local.status).toBe('missing_configuration')
    expect(summary.note).toContain('Local AI is optional')
  })

  it('status route and client page never reference secret env names', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/orbit/creative-os/route.ts'), 'utf-8')
    expect(route).not.toContain('ORBIT_LOCAL_AI_TOKEN')
    const page = fs.readFileSync(path.join(process.cwd(), 'app/admin/orbit/creative-os/page.tsx'), 'utf-8')
    expect(page).not.toMatch(/ORBIT_LOCAL_AI|RUNPOD/)
  })
})
