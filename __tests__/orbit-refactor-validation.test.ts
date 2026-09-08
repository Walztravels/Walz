/**
 * Orbit refactor — deep validation pass (post-review hardening).
 *
 * Item 4: deterministic storage paths are PER-ROW — replayed callbacks
 * overwrite only their own row's object; separate versions write separate
 * objects and a READY asset is immutable to further ingestion.
 *
 * Item 5: provider-first reconciliation — a channel with a Buffer post id
 * can ONLY be resolved by querying Buffer (its 'sent' status is the sole
 * path to 'published'); manual resolution exists only when no provider id
 * ever arrived and requires written evidence. Retry-failed-only leaves
 * queued, fresh-submitting and unresolved channels untouched.
 *
 * All provider calls are mocked — nothing real is sent or queried live.
 */

import fs from 'fs'
import path from 'path'

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mediaRows = new Map<string, Record<string, unknown>>()
const logs: Array<Record<string, unknown>> = []
let logSeq = 0

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
    aggregate: jest.fn(async () => ({ _max: { version: 1 } })),
    findMany: jest.fn(async () => []),
  },
  orbitCampaignMedia: { findMany: jest.fn(async () => []), aggregate: jest.fn(async () => ({ _max: { position: 0 } })), upsert: jest.fn() },
  orbitCampaign: {
    findUnique: jest.fn(async () => ({
      id: 'c1', status: 'approved', platforms: ['instagram'],
      content: { instagram_captions: ['hi'] }, mediaOrder: [], destination: '', objective: 'T',
    })),
    update: jest.fn(async () => ({})),
  },
  orbitIntegration: {
    findUnique: jest.fn(async () => ({ connected: true, meta: { accessToken: 'tok-123456789012', channels: { instagram: 'ch_ig' } } })),
  },
  orbitSettings: { findUnique: jest.fn(async () => ({})) },
  orbitPublishLog: {
    findMany: jest.fn(async () => [...logs].sort((a, b) => new Date(b.sentAt as string).getTime() - new Date(a.sentAt as string).getTime())),
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) => logs.find(l => l.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `log_${++logSeq}`, sentAt: new Date().toISOString(), ...data }
      logs.push(row); return row
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = logs.find(l => l.id === where.id)
      if (row) Object.assign(row, data); return row
    }),
  },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => ({ email: 'admin@walztravels.com', role: 'super_admin', id: 's1' })) }))
jest.mock('@/lib/orbit/notify', () => ({ notifyPublishComplete: jest.fn() }))

const postStatusMock = jest.fn()
const publishMock = jest.fn(async () => ({ bufferUpdateId: 'buf_new' }))
jest.mock('@/lib/orbit/buffer-publisher', () => ({
  publishToBuffer: (...a: unknown[]) => publishMock(...a),
  isBufferConfigured: () => true,
  getBufferPostStatus: (...a: unknown[]) => postStatusMock(...a),
}))

import { ingestToLibrary, createAssetVersion, isOwnedStorageUrl } from '@/lib/orbit/media-library'
import { PATCH as publishPATCH, POST as publishPOST } from '@/app/api/admin/orbit/campaigns/[id]/publish/route'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const OWNED_ORBIT = 'https://xyz.supabase.co/storage/v1/object/public/orbit-media/library/m_1.jpg'
const OWNED_MKT   = 'https://xyz.supabase.co/storage/v1/object/public/marketing-media/photo.jpg'
const CDN         = 'https://v3.fal.media/files/output/x.mp4'

const realFetch = global.fetch
beforeEach(() => {
  mediaRows.clear(); logs.length = 0; logSeq = 0
  jest.clearAllMocks()
  publishMock.mockImplementation(async () => ({ bufferUpdateId: 'buf_new' }))
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://xyz.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk-test'
})
afterAll(() => { global.fetch = realFetch })

const makeReq = (body: Record<string, unknown>) => ({ json: async () => body } as never)

// ── Item 4: version immutability + idempotent replays ────────────────────────

describe('storage ownership (regression fix)', () => {
  it('accepts any of OUR public storage buckets, never provider CDNs', () => {
    expect(isOwnedStorageUrl(OWNED_ORBIT)).toBe(true)
    expect(isOwnedStorageUrl(OWNED_MKT)).toBe(true)     // MarketingMedia refs stay publishable
    expect(isOwnedStorageUrl(CDN)).toBe(false)
    expect(isOwnedStorageUrl('https://replicate.delivery/xyz/out.png')).toBe(false)
  })
})

describe('version immutability', () => {
  it('a READY asset is immutable — ingest with a new source is a no-op', async () => {
    mediaRows.set('m_1', {
      id: 'm_1', publicUrl: OWNED_ORBIT, storagePath: 'library/m_1.jpg',
      readiness: 'ready', mediaType: 'image',
    })
    global.fetch = jest.fn() as typeof fetch
    const res = await ingestToLibrary({ mediaId: 'm_1', sourceUrl: 'https://cdn.example/other.jpg' })
    expect(res).toEqual({ ok: true, publicUrl: OWNED_ORBIT })
    expect(global.fetch).not.toHaveBeenCalled()                       // nothing downloaded/uploaded
    expect(mediaRows.get('m_1')!.storagePath).toBe('library/m_1.jpg') // untouched
  })

  it('re-ingesting a NEW version writes its own object — the campaign-referenced v1 file is never overwritten', async () => {
    mediaRows.set('m_1', {
      id: 'm_1', publicUrl: OWNED_ORBIT, storagePath: 'library/m_1.jpg', readiness: 'ready',
      mediaType: 'image', source: 'generated', format: '1080x1350', tags: [], version: 1,
      assetGroupId: 'm_1', altText: '', title: 'v1',
    })
    const v2 = await createAssetVersion('m_1', 'staff@walztravels.com')
    // simulate v2 getting a fresh render from a provider URL
    const v2row = mediaRows.get(v2.id)!
    v2row.publicUrl = CDN
    v2row.readiness = 'save_failed'
    const uploads: string[] = []
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      if (u === CDN) return new Response(Buffer.from('v2-bytes'), { status: 200, headers: { 'content-type': 'image/jpeg' } })
      uploads.push(u)
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    const res = await ingestToLibrary({ mediaId: v2.id })
    expect(res.ok).toBe(true)
    expect(mediaRows.get(v2.id)!.storagePath).toBe(`library/${v2.id}.jpg`)   // v2's own object
    expect(mediaRows.get('m_1')!.storagePath).toBe('library/m_1.jpg')        // v1 untouched
    expect(mediaRows.get('m_1')!.publicUrl).toBe(OWNED_ORBIT)
    expect(uploads.every(u => !u.includes('library/m_1.jpg'))).toBe(true)    // never wrote to v1's path
  })
})

// ── Item 5: provider-first reconciliation with evidence ──────────────────────

describe('publish reconciliation (PATCH)', () => {
  function seedLog(over: Record<string, unknown> = {}) {
    const row = {
      id: 'log_u', campaignId: 'c1', platform: 'instagram', status: 'unknown',
      bufferUpdateId: null, error: 'timed out', sentAt: new Date().toISOString(),
      ...over,
    }
    logs.push(row)
    return row
  }

  it("Buffer-confirmed 'sent' is the ONLY path to published", async () => {
    seedLog({ bufferUpdateId: 'abc123abc123abc123abc123' })
    postStatusMock.mockResolvedValueOnce({ found: true, status: 'sent', sentAt: '2026-09-08T19:00:00Z', externalLink: 'https://instagram.com/p/x' })
    const res = await publishPATCH(makeReq({ logId: 'log_u' }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(data.log.status).toBe('published')
    expect(data.log.providerStatus).toBe('sent')
    expect(String(data.log.error)).toContain('Provider-confirmed published')
  })

  it('Buffer error/not-found reconciles to failed with the provider evidence', async () => {
    seedLog({ id: 'log_e', bufferUpdateId: 'abc123abc123abc123abc123' })
    postStatusMock.mockResolvedValueOnce({ found: true, status: 'error', errorMessage: 'Instagram rejected media' })
    let res = await publishPATCH(makeReq({ logId: 'log_e' }), { params: { id: 'c1' } })
    expect((await res.json()).log.status).toBe('failed')

    seedLog({ id: 'log_nf', bufferUpdateId: 'abc123abc123abc123abc124', status: 'unknown' })
    postStatusMock.mockResolvedValueOnce({ found: false })
    res = await publishPATCH(makeReq({ logId: 'log_nf' }), { params: { id: 'c1' } })
    const nf = await res.json()
    expect(nf.log.status).toBe('failed')
    expect(String(nf.log.error)).toContain('no post with this id')
  })

  it('"Mark failed" cannot bypass provider truth when a Buffer post id exists', async () => {
    seedLog({ bufferUpdateId: 'abc123abc123abc123abc123' })
    postStatusMock.mockResolvedValueOnce({ found: true, status: 'scheduled' })
    // even when the caller ASKS for failed, the provider answer governs
    const res = await publishPATCH(makeReq({ logId: 'log_u', resolvedStatus: 'failed', evidence: 'I want to resend this' }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(data.log.status).toBe('queued_buffer')        // provider says still queued
    expect(postStatusMock).toHaveBeenCalled()
  })

  it('manual resolution (no provider id) demands written evidence', async () => {
    seedLog()
    let res = await publishPATCH(makeReq({ logId: 'log_u', resolvedStatus: 'failed' }), { params: { id: 'c1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('written evidence')

    res = await publishPATCH(makeReq({ logId: 'log_u', resolvedStatus: 'failed', evidence: 'short' }), { params: { id: 'c1' } })
    expect(res.status).toBe(400)

    res = await publishPATCH(makeReq({
      logId: 'log_u', resolvedStatus: 'failed',
      evidence: 'Checked Buffer queue for Instagram at 14:32 — post not present.',
    }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(data.log.status).toBe('failed')
    expect(String(data.log.error)).toContain('Evidence: Checked Buffer queue')
  })

  it('a resolved (failed) channel becomes retryable; unresolved and fresh-submitting stay protected', async () => {
    logs.push(
      { id: 'l1', campaignId: 'c1', platform: 'instagram', status: 'failed',     sentAt: new Date(Date.now() - 30_000).toISOString() },
      { id: 'l2', campaignId: 'c1', platform: 'facebook',  status: 'unknown',    sentAt: new Date(Date.now() - 20_000).toISOString() },
      { id: 'l3', campaignId: 'c1', platform: 'linkedin',  status: 'submitting', sentAt: new Date().toISOString() },
    )
    ;(db.orbitCampaign.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1', status: 'approved', platforms: ['instagram', 'facebook', 'linkedin'],
      content: { instagram_captions: ['hi'], meta_ads: [{ headline: 'H', body: 'B' }], linkedin_post: 'x' },
      mediaOrder: [], destination: '', objective: 'T',
    })
    ;(db.orbitIntegration.findUnique as jest.Mock).mockResolvedValue({
      connected: true, meta: { accessToken: 'tok-123456789012', channels: { instagram: 'ch1', facebook: 'ch2', linkedin: 'ch3' } },
    })
    ;(db.orbitMedia.findMany as jest.Mock).mockResolvedValue([{
      id: 'm1', mediaType: 'image', status: 'approved', isReference: false,
      publicUrl: OWNED_ORBIT, readiness: 'ready', generationStatus: 'completed', format: '1080x1350', title: 'x',
    }])
    const res = await publishPOST(makeReq({ retryFailedOnly: true }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(publishMock).toHaveBeenCalledTimes(1)
    expect(data.results[0].platform).toBe('instagram')   // only the FAILED channel
    const protectedPlatforms = data.skippedProtected.map((s: { platform: string }) => s.platform).sort()
    expect(protectedPlatforms).toEqual(['facebook', 'linkedin'])
  })
})

// ── Source invariants for the new hardening ──────────────────────────────────

describe('hardening source invariants', () => {
  it('buffer-publisher gained a real post-status query (verified against the introspected schema)', () => {
    const src = read('lib/orbit/buffer-publisher.ts')
    expect(src).toContain('query PostStatus($input: PostInput!)')
    expect(src).toContain('getBufferPostStatus')
    expect(src).toContain("Buffer's \"sent\" means DELIVERED")
  })
  it('library asset detail HEAD-checks the stored file (a URL alone proves nothing)', () => {
    const src = read('app/api/admin/orbit/library/[mediaId]/route.ts')
    expect(src).toContain("method: 'HEAD'")
    expect(src).toContain('fileCheck')
    expect(read('app/admin/orbit/library/page.tsx')).toContain('Storage check:')
  })
})
