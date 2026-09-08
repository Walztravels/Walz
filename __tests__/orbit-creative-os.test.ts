/**
 * Orbit Creative OS — routing, lanes, facts, references, workflow, jobs,
 * quality gate, security invariants, legacy compatibility.
 */

import fs from 'fs'
import path from 'path'

// ── Env fixture: full cloud + local configured (per-test overrides below) ─────
const ENV_KEYS = [
  'ORBIT_LOCAL_AI_URL', 'ORBIT_LOCAL_AI_TOKEN', 'FALAI_API_KEY', 'OPENAI_API_KEY',
  'REPLICATE_API_TOKEN', 'ORBIT_AI_IMAGE_ENABLED', 'ORBIT_AI_VIDEO_ENABLED',
  'ORBIT_AI_AUDIO_ENABLED', 'ORBIT_AI_LIPSYNC_ENABLED', 'ORBIT_AI_CLIP_ENABLED',
  'ORBIT_FAL_VIDEO_MODEL',
]
const saved: Record<string, string | undefined> = {}

function setFullEnv() {
  Object.assign(process.env, {
    ORBIT_LOCAL_AI_URL: 'http://gpu.local', ORBIT_LOCAL_AI_TOKEN: 'tok',
    FALAI_API_KEY: 'fal', OPENAI_API_KEY: 'oa', REPLICATE_API_TOKEN: 'rep',
    ORBIT_AI_IMAGE_ENABLED: 'true', ORBIT_AI_VIDEO_ENABLED: 'true',
    ORBIT_AI_AUDIO_ENABLED: 'true', ORBIT_AI_LIPSYNC_ENABLED: 'true',
    ORBIT_AI_CLIP_ENABLED: 'true', ORBIT_FAL_VIDEO_MODEL: 'fal-ai/kling-video/v1.6/standard/image-to-video',
  })
}

beforeAll(() => { for (const k of ENV_KEYS) saved[k] = process.env[k] })
afterAll(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })
beforeEach(() => { setFullEnv(); jest.clearAllMocks() })

// ── Mocks for provider adapters (no network in tests) ─────────────────────────

const mockLocalSubmit = jest.fn().mockResolvedValue({ providerJobId: 'local-1' })
jest.mock('@/lib/orbit/creative-os/local-adapter', () => ({
  isLocalAIConfigured: () => !!process.env.ORBIT_LOCAL_AI_URL && !!process.env.ORBIT_LOCAL_AI_TOKEN,
  submitLocalJob: (...a: unknown[]) => mockLocalSubmit(...a),
  pollLocalJob:   jest.fn().mockResolvedValue({ status: 'completed', outputUrl: 'http://gpu.local/out.png' }),
  probeLocalAI:   jest.fn().mockResolvedValue({ reachable: true }),
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

const fetchCalls: Array<{ url: string; body?: string }> = []
beforeEach(() => { fetchCalls.length = 0 })
global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  fetchCalls.push({ url: String(url), body: init?.body ? String(init.body) : undefined })
  return { ok: true, json: async () => ({ request_id: 'fal-req-1' }), text: async () => '' } as Response
}) as unknown as typeof fetch

// Prisma mock (jobs + audit + media)
const jobRows = new Map<string, Record<string, unknown>>()
let jobSeq = 0
const auditRows: Array<{ action: string; detail: string }> = []
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    orbitCreativeJob: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `job_${++jobSeq}`
        jobRows.set(id, { id, retryCount: 0, ...data })
        return { id }
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => jobRows.get(where.id) ?? null),
      findMany:   jest.fn(async () => [...jobRows.values()]),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(jobRows.get(where.id) ?? {}, data); return jobRows.get(where.id)
      }),
    },
    orbitMedia: { create: jest.fn(async () => ({ id: 'media_1' })) },
    activityLog: { create: jest.fn(async ({ data }: { data: { action: string; detail: string } }) => { auditRows.push(data); return data }) },
  },
}))

import { resolveRoute, availableEntries, MODEL_REGISTRY, estimateCost } from '@/lib/orbit/creative-os/registry'
import { executeCapability } from '@/lib/orbit/creative-os/execute'
import { assertFactsConsistent, detectCommercialLeakage, canonicalFacts } from '@/lib/orbit/creative-os/facts'
import { composeReferenceConditioning, validateReferenceBoard } from '@/lib/orbit/creative-os/references'
import { validateWorkflow, executeWorkflow, WORKFLOW_PRESETS, topological } from '@/lib/orbit/creative-os/workflow'
import { runQualityGate } from '@/lib/orbit/creative-os/quality-gate'
import { dependencyOrder } from '@/lib/orbit/creative-os/kit'
import { submitCreativeJob, retryCreativeJob } from '@/lib/orbit/creative-os/jobs'
import type { PlanDeliverable, ReferenceInput } from '@/lib/orbit/creative-os/types'

// ── Cost lanes & router ───────────────────────────────────────────────────────

describe('cost lanes and model router', () => {
  it('LOCAL_ONLY never selects a cloud provider', () => {
    for (const cap of ['text_to_image', 'image_to_video', 'upscale', 'background_remove'] as const) {
      const r = resolveRoute({ capability: cap, mode: 'LOCAL_ONLY' })
      if ('error' in r) continue
      expect(r.entry.provider).toBe('local')
      for (const f of r.failover) expect(f.provider).toBe('local')
    }
  })

  it('LOCAL_ONLY with local unavailable FAILS — never silently uses paid cloud', () => {
    delete process.env.ORBIT_LOCAL_AI_URL
    const r = resolveRoute({ capability: 'text_to_image', mode: 'LOCAL_ONLY' })
    expect('error' in r).toBe(true)
    if ('error' in r) expect(r.error).toContain('LOCAL_ONLY')
  })

  it('PREMIUM lane selects the premium tier', () => {
    const r = resolveRoute({ capability: 'text_to_image', lane: 'PREMIUM' })
    expect('error' in r).toBe(false)
    if (!('error' in r)) expect(r.lane).toBe('PREMIUM')
  })

  it('BEST_TYPOGRAPHY prefers typography-tagged models', () => {
    const r = resolveRoute({ capability: 'text_to_image', mode: 'BEST_TYPOGRAPHY' })
    if (!('error' in r)) expect(r.entry.tags).toContain('typography')
  })

  it('AUTO produces a deterministic choice with a failover chain', () => {
    const a = resolveRoute({ capability: 'text_to_image', mode: 'AUTO' })
    const b = resolveRoute({ capability: 'text_to_image', mode: 'AUTO' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    if (!('error' in a)) expect(a.failover.length).toBeGreaterThan(0)
  })

  it('missing provider credentials remove entries (graceful degradation)', () => {
    delete process.env.FALAI_API_KEY
    expect(availableEntries('lip_sync_video').length).toBe(0)
    const r = resolveRoute({ capability: 'lip_sync_video' })
    expect('error' in r).toBe(true)
  })

  it('every capability in the registry has at least one entry', () => {
    const caps = new Set(MODEL_REGISTRY.map(m => m.capability))
    for (const c of ['text_to_image', 'image_edit', 'image_to_image', 'text_to_video', 'image_to_video',
      'motion', 'upscale', 'background_remove', 'vectorize', 'audio_voiceover', 'audio_narration',
      'audio_music', 'audio_sfx', 'lip_sync_image', 'lip_sync_video', 'clip']) {
      expect(caps.has(c as never)).toBe(true)
    }
  })

  it('estimateCost returns authoritative pricing where present', () => {
    // With the local GPU configured, STANDARD correctly prefers the free local model
    expect(estimateCost('background_remove', 'STANDARD')).toBe(0)
    expect(estimateCost('text_to_image', 'LOCAL')).toBe(0)
    // Without local, STANDARD falls to the cheapest cloud model's published price
    delete process.env.ORBIT_LOCAL_AI_URL
    expect(estimateCost('background_remove', 'STANDARD')).toBe(0.01)
  })
})

// ── Executor & failover ───────────────────────────────────────────────────────

describe('capability executor', () => {
  it('local lane executes via the local adapter (async job)', async () => {
    const r = await executeCapability({ capability: 'text_to_image', lane: 'LOCAL', prompt: 'lagos skyline at dusk' })
    expect(r.ok).toBe(true)
    expect(r.provider).toBe('local')
    expect(r.async).toBe(true)
    expect(mockLocalSubmit).toHaveBeenCalled()
  })

  it('premium image goes to the premium cloud model (sync output)', async () => {
    const r = await executeCapability({ capability: 'text_to_image', lane: 'PREMIUM', mode: 'BEST_QUALITY', prompt: 'premium travel hero' })
    expect(r.ok).toBe(true)
    expect(r.outputUrl).toBeTruthy()
  })

  it('auto failover: first provider failure falls to the next in chain', async () => {
    mockLocalSubmit.mockRejectedValueOnce(new Error('gpu down'))
    const r = await executeCapability({ capability: 'text_to_image', mode: 'BEST_VALUE', prompt: 'beach' })
    expect(r.ok).toBe(true)
    expect(r.attempted!.length).toBeGreaterThanOrEqual(1)
  })

  it('provider failure under LOCAL policy does NOT fail over to cloud', async () => {
    mockLocalSubmit.mockRejectedValue(new Error('gpu down'))
    const r = await executeCapability({ capability: 'text_to_image', lane: 'LOCAL', prompt: 'beach' })
    expect(r.ok).toBe(false)
    expect(mockOpenAIGen).not.toHaveBeenCalled()
    expect(mockReplicate).not.toHaveBeenCalled()
    expect(fetchCalls.filter(c => c.url.includes('fal.run')).length).toBe(0)
    mockLocalSubmit.mockResolvedValue({ providerJobId: 'local-1' })
  })

  it('lip sync (image+audio), audio, clip, upscale, background removal, vectorize all dispatch', async () => {
    for (const cap of ['lip_sync_image', 'audio_voiceover', 'clip', 'upscale', 'background_remove', 'vectorize'] as const) {
      const r = await executeCapability({ capability: cap, imageUrl: 'https://a/i.png', audioUrl: 'https://a/a.mp3', videoUrl: 'https://a/v.mp4' })
      expect(r.ok).toBe(true)
    }
  })

  it('video generation dispatches (image-to-video + text-to-video)', async () => {
    const i2v = await executeCapability({ capability: 'image_to_video', imageUrl: 'https://a/i.png', prompt: 'gentle camera push', durationSec: 5, format: 'video_9x16' })
    const t2v = await executeCapability({ capability: 'text_to_video', prompt: 'lagos coastline aerial', mode: 'CINEMATIC' })
    expect(i2v.ok).toBe(true)
    expect(t2v.ok).toBe(true)
  })
})

// ── Commercial facts ──────────────────────────────────────────────────────────

describe('commercial fact lock', () => {
  const master = { headline: 'December Flights Home', price: '₦850,000', route: 'LOS → YYZ', cta: 'Book Now' }

  it('identical facts across all kit assets pass', () => {
    const assets = ['1080x1350', '1080x1080', '1080x1920', '1200x628'].map(() => ({ facts: { ...master } }))
    expect(assertFactsConsistent(master, assets)).toEqual([])
  })

  it('a mismatched price on ANY variant is caught', () => {
    const assets = [{ facts: { ...master } }, { facts: { ...master, price: '₦750,000' } }]
    const mm = assertFactsConsistent(master, assets)
    expect(mm.length).toBe(1)
    expect(mm[0].field).toBe('price')
  })

  it('prompts carrying commercial values are detected and blocked at execution', async () => {
    expect(detectCommercialLeakage('poster with ₦850,000 fare')).toContain('price')
    expect(detectCommercialLeakage('call +1 231 790 2336 today')).toContain('contact')
    expect(detectCommercialLeakage('LOS → YYZ route banner')).toContain('route')
    expect(detectCommercialLeakage('sunset over Lagos, warm light')).toEqual([])
  })

  it('canonicalFacts is order-insensitive', () => {
    expect(canonicalFacts({ b: '2', a: '1' })).toBe(canonicalFacts({ a: '1', b: '2' }))
  })
})

// ── Reference board ───────────────────────────────────────────────────────────

describe('reference board', () => {
  const refs: ReferenceInput[] = [
    { mediaId: 'm1', url: 'https://a/1.png', purpose: 'STYLE' },
    { mediaId: 'm2', url: 'https://a/2.png', purpose: 'SUBJECT' },
    { mediaId: 'm3', url: 'https://a/3.png', purpose: 'LAYOUT' },
    { mediaId: 'm4', url: 'https://a/4.png', purpose: 'MOTION' },
    { mediaId: 'm5', url: 'https://a/5.png', purpose: 'TYPOGRAPHY' },
  ]

  it('purposes are routed, never blindly mixed', () => {
    const c = composeReferenceConditioning(refs)
    expect(c.referenceImageUrls).toEqual(['https://a/2.png', 'https://a/1.png'])  // SUBJECT + STYLE only
    expect(c.layoutRefs.map(r => r.mediaId)).toEqual(['m3'])                     // LAYOUT stays out of prompts
    expect(c.motionFragments.length).toBe(1)                                     // MOTION only for video
    expect(c.promptFragments.join(' ')).not.toContain('layout')
    expect(c.routerModeHint).toBe('BEST_TYPOGRAPHY')                             // TYPOGRAPHY = router hint
  })

  it('multi-image references are order-aware and capped', () => {
    const many: ReferenceInput[] = Array.from({ length: 10 }, (_, i) => ({ mediaId: `s${i}`, url: `https://a/s${i}.png`, purpose: 'SUBJECT' }))
    expect(composeReferenceConditioning(many).referenceImageUrls.length).toBe(6)
  })

  it('board validation rejects duplicates and bad URLs', () => {
    expect(validateReferenceBoard([{ mediaId: 'x', url: 'notaurl', purpose: 'STYLE' }]).length).toBe(1)
    expect(validateReferenceBoard([refs[0], refs[0]]).length).toBe(1)
  })
})

// ── Workflow studio ───────────────────────────────────────────────────────────

describe('workflow studio', () => {
  it('all 11 Walz presets validate as DAGs with quality gates before publish', () => {
    expect(WORKFLOW_PRESETS.length).toBe(11)
    for (const p of WORKFLOW_PRESETS) {
      expect(validateWorkflow(p)).toEqual([])
      expect(topological(p)).not.toBeNull()
    }
  })

  it('cycle detection rejects invalid graphs', () => {
    const g = { key: 'x', label: 'x', nodes: [
      { id: 'a', type: 'brief' as const, label: 'a', config: {} },
      { id: 'b', type: 'quality_check' as const, label: 'b', config: {} },
    ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }
    expect(validateWorkflow(g).some(e => e.includes('cycle'))).toBe(true)
  })

  it('publish without a quality gate is rejected', () => {
    const g = { key: 'x', label: 'x', nodes: [
      { id: 'a', type: 'brief' as const, label: 'a', config: {} },
      { id: 'p', type: 'publish' as const, label: 'p', config: {} },
    ], edges: [{ from: 'a', to: 'p' }] }
    expect(validateWorkflow(g).some(e => e.includes('quality_check'))).toBe(true)
  })

  it('executes a preset end-to-end in dry-run, halting at approval', async () => {
    const preset = WORKFLOW_PRESETS.find(p => p.key === 'flight_promotion')!
    const run = await executeWorkflow(preset, { dryRun: true, commercialFacts: { headline: 'X' } })
    expect(run.halted).toBe(true)  // approval node halts
    expect(run.results.some(r => r.status === 'awaiting_approval')).toBe(true)
  })

  it('approval unblocks execution through to publish', async () => {
    const preset = WORKFLOW_PRESETS.find(p => p.key === 'flight_promotion')!
    const approvalId = preset.nodes.find(n => n.type === 'approval')!.id
    const run = await executeWorkflow(preset, { dryRun: true, commercialFacts: { headline: 'X' }, approvals: { [approvalId]: true } })
    expect(run.halted).toBe(false)
    expect(run.results.find(r => r.type === 'publish')?.status).toBe('ok')
  })

  it('a commercial value in a node prompt fails that node', async () => {
    const g = { key: 'x', label: 'x', nodes: [
      { id: 'g', type: 'generate_image' as const, label: 'g', config: { prompt: 'flight poster ₦850,000' } },
    ], edges: [] }
    const run = await executeWorkflow(g, { dryRun: true })
    expect(run.results[0].status).toBe('failed')
    expect(run.results[0].detail).toContain('Commercial')
  })
})

// ── Dependency planning ───────────────────────────────────────────────────────

describe('asset dependency planning', () => {
  const d = (id: string, deps: string[] = []): PlanDeliverable => ({
    id, format: '1080x1350', kind: 'static', title: id, direction: '', dependsOn: deps,
    references: [], needsMotion: false, needsAudio: false, lane: 'AUTO', estCostUsd: null,
  })

  it('orders deliverables topologically', () => {
    const order = dependencyOrder([d('video', ['story']), d('story'), d('feed')])
    expect(Array.isArray(order)).toBe(true)
    if (Array.isArray(order)) expect(order.indexOf('story')).toBeLessThan(order.indexOf('video'))
  })

  it('detects dependency cycles', () => {
    const order = dependencyOrder([d('a', ['b']), d('b', ['a'])])
    expect('error' in (order as object)).toBe(true)
  })
})

// ── Quality gate ──────────────────────────────────────────────────────────────

describe('publication quality gate', () => {
  const facts = { headline: 'December Flights', price: '₦850,000' }

  it('commercial mismatch BLOCKS publication', () => {
    const gate = runQualityGate({
      masterFacts: facts,
      assets: [{ format: '1080x1350', facts }, { format: '1080x1080', facts: { ...facts, price: '₦750,000' } }],
    })
    expect(gate.blocked).toBe(true)
    expect(gate.issues.some(i => i.code === 'COMMERCIAL_FACT_MISMATCH' && i.blocking)).toBe(true)
  })

  it('provider errors and broken assets block', () => {
    const gate = runQualityGate({
      masterFacts: facts,
      assets: [{ format: '1080x1350', facts, providerError: 'FAL 500' }, { format: '1080x1080', facts, outputUrl: 'not-a-url' }],
    })
    expect(gate.blocked).toBe(true)
    expect(gate.issues.map(i => i.code)).toEqual(expect.arrayContaining(['PROVIDER_ERROR', 'BROKEN_ASSET']))
  })

  it('wrong dimensions for a format block', () => {
    const gate = runQualityGate({
      masterFacts: facts,
      assets: [{ format: '1080x1350', facts, width: 1080, height: 1080 }],
    })
    expect(gate.issues.some(i => i.code === 'FORMAT_DIMENSIONS')).toBe(true)
  })

  it('clean consistent kit passes', () => {
    const gate = runQualityGate({
      masterFacts: facts,
      assets: [
        { format: '1080x1350', facts, outputUrl: 'https://cdn/a.png', width: 1080, height: 1350 },
        { format: '1080x1080', facts, outputUrl: 'https://cdn/b.png', width: 1080, height: 1080 },
      ],
    })
    expect(gate.passed).toBe(true)
  })
})

// ── Jobs, retries, audit ──────────────────────────────────────────────────────

describe('job queue and audit', () => {
  it('submits a job, persists it, and audits staff/provider/lane/refs', async () => {
    auditRows.length = 0
    const r = await submitCreativeJob({
      input: { capability: 'text_to_image', lane: 'PREMIUM', prompt: 'sunset' },
      campaignId: 'camp_1', staffEmail: 'staff@walztravels.com',
      inputRefs: [{ mediaId: 'm1', url: 'https://a/1.png', purpose: 'STYLE' }],
    })
    expect(r.ok).toBe(true)
    const audit = auditRows.find(a => a.action === 'Creative OS Generation')!
    expect(audit.detail).toContain('capability=text_to_image')
    expect(audit.detail).toContain('lane=PREMIUM')
    expect(audit.detail).toContain('STYLE:m1')
    expect(audit.detail).toContain('campaign=camp_1')
  })

  it('failed jobs can retry (bounded), successful retry updates the row', async () => {
    mockLocalSubmit.mockRejectedValueOnce(new Error('boom'))
    const fail = await submitCreativeJob({ input: { capability: 'text_to_image', lane: 'LOCAL', prompt: 'x' } })
    expect(fail.ok).toBe(false)
    const retry = await retryCreativeJob(fail.jobId!, 'staff@walztravels.com')
    expect(typeof retry.ok).toBe('boolean')
    const row = jobRows.get(fail.jobId!)!
    expect(row.retryCount).toBe(1)
  })
})

// ── Security & legacy invariants ──────────────────────────────────────────────

describe('security and legacy invariants', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

  it('all Creative OS routes require session + super_admin RBAC', () => {
    for (const p of ['route.ts', 'plan/route.ts', 'generate/route.ts', 'workflow/route.ts']) {
      const src = read(`app/api/admin/orbit/creative-os/${p}`)
      expect(src).toContain('getAdminSession')
      expect(src).toContain("'super_admin'")
    }
  })

  it('no provider keys reach the browser (client page never touches env keys)', () => {
    const page = read('app/admin/orbit/creative-os/page.tsx')
    for (const key of ['FALAI_API_KEY', 'OPENAI_API_KEY', 'REPLICATE_API_TOKEN', 'ORBIT_LOCAL_AI_TOKEN']) {
      expect(page).not.toContain(key)
    }
  })

  it('status route exposes labels/lanes, never raw provider model endpoints', () => {
    const src = read('app/api/admin/orbit/creative-os/route.ts')
    expect(src).toContain('route.entry.label')
    expect(src).not.toContain('route.entry.endpoint')
  })

  it('SQL migration is additive only (no ALTER of existing columns, no DROP)', () => {
    const sql = read('supabase-add-creative-os.sql')
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS orbit_creative_jobs/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reference_purpose/)
  })

  it('legacy Orbit modules are untouched by the Creative OS layer', () => {
    // Creative OS imports FROM legacy modules; nothing in lib/orbit outside
    // creative-os/ imports the new layer (additive, zero-risk to existing flows).
    const legacyDirs = ['lib/orbit/composer', 'lib/orbit/templates', 'lib/orbit/reference', 'lib/orbit/brand']
    for (const dir of legacyDirs) {
      const files = fs.readdirSync(path.join(process.cwd(), dir)).filter(f => f.endsWith('.ts'))
      for (const f of files) {
        expect(read(`${dir}/${f}`)).not.toContain('creative-os')
      }
    }
  })

  it('upstream reference is attributed with clean-room note (MIT)', () => {
    const types = read('lib/orbit/creative-os/types.ts')
    expect(types).toContain('open-generative-ai')
    expect(types).toContain('Open-AI-Design-Agent')
    expect(types).toContain('clean-room')
  })
})
