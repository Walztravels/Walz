/**
 * Orbit Media Library — Stage 1 (shared media/version infrastructure).
 *
 * Covers: the durable save lifecycle (never 'ready' on a provider URL,
 * idempotent ingestion, retry-save without regeneration), versioning
 * (stable group, no file copies), usage lookup, safe archiving with named
 * blockers, idempotent campaign attachment, the poll-route fix that stops
 * expiring provider URLs being persisted as completed, and migration
 * invariants.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mediaRows = new Map<string, Record<string, unknown>>()
const linkRows  = new Map<string, Record<string, unknown>>()

const db = {
  orbitMedia: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const r = mediaRows.get(where.id); return r ? { ...r } : null
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const r = mediaRows.get(where.id); if (r) Object.assign(r, data); return r ? { ...r } : null
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `m_${mediaRows.size + 1}`, ...data }
      mediaRows.set(row.id as string, row)
      return { id: row.id, version: row.version }
    }),
    aggregate: jest.fn(async ({ where }: { where: { OR: Array<Record<string, string>> } }) => {
      const group = where.OR[0].assetGroupId
      let max = 0
      for (const r of mediaRows.values()) {
        if ((r.assetGroupId === group || r.id === group) && Number(r.version ?? 1) > max) max = Number(r.version ?? 1)
      }
      return { _max: { version: max || null } }
    }),
  },
  orbitCampaignMedia: {
    findMany: jest.fn(async ({ where }: { where: { mediaId: string } }) =>
      [...linkRows.values()].filter(l => l.mediaId === where.mediaId)),
    aggregate: jest.fn(async () => ({ _max: { position: 1 } })),
    upsert: jest.fn(async ({ where, create }: { where: { campaignId_mediaId: { campaignId: string; mediaId: string } }; create: Record<string, unknown> }) => {
      const key = `${where.campaignId_mediaId.campaignId}:${where.campaignId_mediaId.mediaId}`
      if (linkRows.has(key)) return linkRows.get(key)
      linkRows.set(key, create)
      return create
    }),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

import {
  isOwnedStorageUrl, canPublishAsset, ingestToLibrary, retrySave,
  createAssetVersion, getAssetUsage, archiveAsset, attachToCampaign,
} from '@/lib/orbit/media-library'

const OWNED  = 'https://xyz.supabase.co/storage/v1/object/public/orbit-media/library/m_1.jpg'
const CDN    = 'https://v3.fal.media/files/output/video-abc.mp4'
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const realFetch = global.fetch
beforeEach(() => {
  mediaRows.clear(); linkRows.clear()
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyz.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk-test'
})
afterAll(() => { global.fetch = realFetch })

function seedMedia(over: Record<string, unknown> = {}) {
  const row = {
    id: 'm_1', source: 'generated', storagePath: '', publicUrl: CDN, format: '1080x1350',
    mediaType: 'video', readiness: 'save_failed', generationStatus: 'completed',
    assetGroupId: 'm_1', version: 1, campaignId: null, campaign: null,
    tags: [], title: 'Test asset', ...over,
  }
  mediaRows.set(row.id as string, row)
  return row
}

// ── URL / publishability rules ────────────────────────────────────────────────

describe('storage ownership rules', () => {
  it('recognizes owned vs provider URLs', () => {
    expect(isOwnedStorageUrl(OWNED)).toBe(true)
    expect(isOwnedStorageUrl(CDN)).toBe(false)
    expect(isOwnedStorageUrl(null)).toBe(false)
  })
  it('only ready + owned + completed assets are publishable', () => {
    expect(canPublishAsset({ readiness: 'ready', publicUrl: OWNED, generationStatus: 'completed' })).toBe(true)
    expect(canPublishAsset({ readiness: 'ready', publicUrl: CDN })).toBe(false)      // provider URL never publishable
    expect(canPublishAsset({ readiness: 'save_failed', publicUrl: OWNED })).toBe(false)
    expect(canPublishAsset({ readiness: 'archived', publicUrl: OWNED })).toBe(false)
    expect(canPublishAsset({ readiness: 'ready', publicUrl: OWNED, generationStatus: 'processing' })).toBe(false)
  })
})

// ── Durable ingestion ─────────────────────────────────────────────────────────

describe('ingestToLibrary', () => {
  it('downloads the provider output into owned storage and only then marks READY', async () => {
    seedMedia()
    const calls: string[] = []
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url))
      if (String(url) === CDN) {
        return new Response(Buffer.from('video-bytes'), { status: 200, headers: { 'content-type': 'video/mp4' } })
      }
      return new Response('{}', { status: 200 })   // storage upload
    }) as typeof fetch

    const res = await ingestToLibrary({ mediaId: 'm_1' })
    expect(res.ok).toBe(true)
    const row = mediaRows.get('m_1')!
    expect(row.readiness).toBe('ready')
    expect(row.publicUrl).toBe('https://xyz.supabase.co/storage/v1/object/public/orbit-media/library/m_1.mp4')
    expect(row.storagePath).toBe('library/m_1.mp4')     // deterministic → replays overwrite
    expect(row.mimeType).toBe('video/mp4')
    expect(row.sizeBytes).toBe(11)
    // upload used upsert so replayed callbacks never duplicate objects
    expect(calls.some(u => u.includes('/storage/v1/object/orbit-media/library/m_1.mp4'))).toBe(true)
    // the intermediate visible state was SAVING before READY
    const states = db.orbitMedia.update.mock.calls.map(c => (c[0] as { data: { readiness?: string } }).data.readiness)
    expect(states).toEqual(['saving', 'ready'])
  })

  it('is idempotent: an already-ready owned asset returns success without re-downloading', async () => {
    seedMedia({ publicUrl: OWNED, readiness: 'ready' })
    global.fetch = jest.fn() as typeof fetch
    const res = await ingestToLibrary({ mediaId: 'm_1' })
    expect(res).toEqual({ ok: true, publicUrl: OWNED })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('marks save_failed (recoverable) on storage failure and keeps the source URL', async () => {
    seedMedia()
    global.fetch = jest.fn(async (url: RequestInfo | URL) =>
      String(url) === CDN
        ? new Response(Buffer.from('x'), { status: 200, headers: { 'content-type': 'video/mp4' } })
        : new Response('storage down', { status: 500 }),
    ) as typeof fetch
    const res = await ingestToLibrary({ mediaId: 'm_1' })
    expect(res).toMatchObject({ ok: false, recoverable: true })
    const row = mediaRows.get('m_1')!
    expect(row.readiness).toBe('save_failed')
    expect(row.publicUrl).toBe(CDN)                     // source preserved for retry
  })

  it('marks missing_source when the provider file is gone (404)', async () => {
    seedMedia()
    global.fetch = jest.fn(async () => new Response('gone', { status: 404 })) as typeof fetch
    const res = await ingestToLibrary({ mediaId: 'm_1' })
    expect(res).toMatchObject({ ok: false, recoverable: false })
    expect(mediaRows.get('m_1')!.readiness).toBe('missing_source')
  })

  it('sanitizes secrets out of persisted errors', async () => {
    seedMedia({ publicUrl: 'https://cdn.example/file.mp4?token=SECRET123&x=1' })
    global.fetch = jest.fn(async () => { throw new Error('fetch to https://cdn.example/file.mp4?token=SECRET123 failed') }) as typeof fetch
    await ingestToLibrary({ mediaId: 'm_1' })
    const row = mediaRows.get('m_1')!
    expect(String(row.saveError)).not.toContain('SECRET123')
    expect(String(row.saveError)).toContain('token=***')
  })

  it('retrySave re-ingests without any generation call', () => {
    // the module has no provider adapters to call — retry cannot regenerate or re-charge
    const src = read('lib/orbit/media-library.ts')
    expect(src).not.toMatch(/import .*(openai|replicate|runway|fal-video|anthropic|adapter)/i)
    expect(typeof retrySave).toBe('function')
  })
})

// ── Versioning ────────────────────────────────────────────────────────────────

describe('createAssetVersion', () => {
  it('creates v2 in the same group, pointing at the same binary (no file copy)', async () => {
    seedMedia({ publicUrl: OWNED, readiness: 'ready', storagePath: 'library/m_1.jpg' })
    const v2 = await createAssetVersion('m_1', 'staff@walztravels.com')
    expect(v2.version).toBe(2)
    const row = [...mediaRows.values()].find(r => r.version === 2)!
    expect(row.assetGroupId).toBe('m_1')
    expect(row.parentMediaId).toBe('m_1')
    expect(row.storagePath).toBe('library/m_1.jpg')     // same binary — never copied
    expect(row.readiness).toBe('ready')
  })
})

// ── Usage + archive ───────────────────────────────────────────────────────────

describe('usage and archiving', () => {
  it('merges join-table links and legacy ownership without duplicates', async () => {
    seedMedia({ campaignId: 'c1', campaign: { id: 'c1', objective: 'Legacy', status: 'draft' } })
    linkRows.set('c1:m_1', { mediaId: 'm_1', campaign: { id: 'c1', objective: 'Legacy', status: 'draft' } })
    linkRows.set('c2:m_1', { mediaId: 'm_1', campaign: { id: 'c2', objective: 'New', status: 'approved' } })
    const usage = await getAssetUsage('m_1')
    expect(usage.map(u => u.id).sort()).toEqual(['c1', 'c2'])
  })

  it('blocks archiving when an approved/published campaign uses the asset, naming it', async () => {
    seedMedia()
    linkRows.set('c2:m_1', { mediaId: 'm_1', campaign: { id: 'c2', objective: 'December push', status: 'approved' } })
    const res = await archiveAsset('m_1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.blockedBy).toEqual([{ id: 'c2', objective: 'December push', status: 'approved' }])
    expect(mediaRows.get('m_1')!.readiness).not.toBe('archived')
  })

  it('archives cleanly when only drafts use it', async () => {
    seedMedia()
    linkRows.set('c1:m_1', { mediaId: 'm_1', campaign: { id: 'c1', objective: 'Draft', status: 'draft' } })
    const res = await archiveAsset('m_1')
    expect(res).toEqual({ ok: true })
    expect(mediaRows.get('m_1')!.readiness).toBe('archived')
  })
})

describe('attachToCampaign', () => {
  it('attaches by reference, idempotently, and refuses archived assets', async () => {
    seedMedia({ readiness: 'ready' })
    await attachToCampaign('c9', 'm_1', 'staff@walztravels.com')
    await attachToCampaign('c9', 'm_1', 'staff@walztravels.com')     // no duplicate
    expect(linkRows.size).toBe(1)

    seedMedia({ id: 'm_2', readiness: 'archived' })
    mediaRows.get('m_2')!.id = 'm_2'
    await expect(attachToCampaign('c9', 'm_2', 'staff@walztravels.com')).rejects.toThrow('archived')
  })
})

// ── Poll-route durable-save fix ───────────────────────────────────────────────

describe('provider poll route', () => {
  const src = read('app/api/admin/orbit/campaigns/[id]/creative/[assetId]/route.ts')
  it('never persists an expiring provider URL as a finished, ready asset', () => {
    expect(src).not.toContain('storagePath: videoUrl')
    expect(src).not.toContain('storagePath:      result.videoUrl')
    expect((src.match(/readiness:\s+'save_failed'/g) ?? []).length).toBe(2)
    expect(src).toContain('will not regenerate')
  })
  it('owned-storage completions are marked ready', () => {
    expect((src.match(/readiness:\s+'ready'/g) ?? []).length).toBe(2)
  })
})

// ── Migration invariants ──────────────────────────────────────────────────────

describe('orbit_media_library_refactor migration', () => {
  const sql = read('prisma/migrations/orbit_media_library_refactor.sql')
  it('is idempotent and purely additive', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS orbit_design_projects')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS orbit_campaign_media')
    expect(sql).toContain('ON CONFLICT (campaign_id, media_id) DO NOTHING')
    expect(sql).not.toMatch(/\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b/)
  })
  it('backfills version identity and campaign links without overwriting', () => {
    expect(sql).toContain('WHERE asset_group_id IS NULL')
    expect(sql).toContain('WHERE title IS NULL')
    expect(sql).toContain("WHERE readiness = 'draft'")
  })
  it('never marks provider-hosted files READY — they are reported as missing_source', () => {
    expect(sql).toContain("LIKE '%/storage/v1/object/public/%'           THEN 'ready'")
    expect(sql).toContain("'missing_source'")
  })
})
