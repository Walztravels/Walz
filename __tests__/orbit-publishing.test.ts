/**
 * Orbit publishing — Stage 4 (validation, honest statuses, safe retry).
 *
 * All provider interaction is MOCKED — no real social posts are sent.
 * Functional tests drive the actual route handler with a fake Prisma and a
 * mocked Buffer adapter; unit tests cover the preflight/status library;
 * source tests pin the UI's honest summary rendering.
 */

import fs from 'fs'
import path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const logs: Array<Record<string, unknown>> = []
let logSeq = 0
let campaignRow: Record<string, unknown>
let mediaRows: Array<Record<string, unknown>> = []
let linkRows: Array<Record<string, unknown>> = []

const db = {
  orbitCampaign: {
    findUnique: jest.fn(async () => campaignRow),
    update:     jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(campaignRow, data)),
  },
  orbitIntegration: {
    findUnique: jest.fn(async () => ({
      connected: true,
      meta: { accessToken: 'buffer-test-token-123', channels: { instagram: 'ch_ig', facebook: 'ch_fb', linkedin: 'ch_li' } },
    })),
  },
  orbitSettings: { findUnique: jest.fn(async () => ({ notificationsEmail: null })) },
  orbitPublishLog: {
    findMany: jest.fn(async () => [...logs].sort((a, b) =>
      new Date(b.sentAt as string).getTime() - new Date(a.sentAt as string).getTime())),
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) => logs.find(l => l.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `log_${++logSeq}`, sentAt: new Date().toISOString(), ...data }
      logs.push(row)
      return row
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = logs.find(l => l.id === where.id)
      if (row) Object.assign(row, data)
      return row
    }),
  },
  orbitMedia:         { findMany: jest.fn(async () => mediaRows) },
  orbitCampaignMedia: { findMany: jest.fn(async () => linkRows) },
}
jest.mock('@/lib/db', () => ({ __esModule: true, default: db, prisma: db }))

const sessionMock = { email: 'admin@walztravels.com', role: 'super_admin', id: 's1' }
jest.mock('@/lib/admin-auth', () => ({ getAdminSession: jest.fn(async () => sessionMock) }))

const publishMock = jest.fn(async () => ({ bufferUpdateId: `buf_${Math.random().toString(36).slice(2, 8)}` }))
jest.mock('@/lib/orbit/buffer-publisher', () => ({
  publishToBuffer: (...args: unknown[]) => publishMock(...args),
  isBufferConfigured: () => true,
}))
jest.mock('@/lib/orbit/notify', () => ({ notifyPublishComplete: jest.fn() }))

import {
  normalizeLogStatus, preflightChannel, summarizeResults, latestPerChannel,
  isStaleSubmitting, isAmbiguousSubmitError, RETRYABLE_STATUSES, CAPTION_LIMITS,
} from '@/lib/orbit/publish-preflight'
import { POST as publishPOST } from '@/app/api/admin/orbit/campaigns/[id]/publish/route'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const OWNED = 'https://xyz.supabase.co/storage/v1/object/public/orbit-media/library/a.jpg'

function makeReq(body: Record<string, unknown>) {
  return { json: async () => body } as never
}

beforeEach(() => {
  logs.length = 0; logSeq = 0
  publishMock.mockClear()
  publishMock.mockImplementation(async () => ({ bufferUpdateId: `buf_${++logSeq}00` }))
  campaignRow = {
    id: 'c1', status: 'approved',
    platforms: ['instagram', 'facebook', 'linkedin'],
    content: {
      instagram_captions: ['IG caption'],
      meta_ads: [{ headline: 'H', body: 'B' }],
      linkedin_post: 'LI post',
    },
    mediaOrder: [], destination: '', objective: 'Test',
  }
  mediaRows = [{
    id: 'm1', mediaType: 'image', status: 'approved', isReference: false,
    publicUrl: OWNED, readiness: 'ready', generationStatus: 'completed',
    format: '1080x1350', title: 'Hero',
  }]
  linkRows = []
})

// ── Status vocabulary ─────────────────────────────────────────────────────────

describe('status vocabulary', () => {
  it("legacy 'sent' reads as queued_buffer — NEVER upgraded to published", () => {
    expect(normalizeLogStatus('sent')).toBe('queued_buffer')
    expect(normalizeLogStatus('error')).toBe('failed')
    expect(normalizeLogStatus('published')).toBe('published')
    expect(normalizeLogStatus('gibberish')).toBe('unknown')
  })
  it('retry may touch only failed/validation_failed channels', () => {
    expect(RETRYABLE_STATUSES.sort()).toEqual(['failed', 'validation_failed'])
  })
  it('stale submitting detection + ambiguous-error classification', () => {
    expect(isStaleSubmitting({ status: 'submitting', sentAt: new Date(Date.now() - 4 * 60_000) })).toBe(true)
    expect(isStaleSubmitting({ status: 'submitting', sentAt: new Date() })).toBe(false)
    expect(isAmbiguousSubmitError(new Error('fetch failed: ETIMEDOUT'))).toBe(true)
    expect(isAmbiguousSubmitError(new Error('Buffer rejected post: bad caption'))).toBe(false)
  })
})

// ── Preflight validation ──────────────────────────────────────────────────────

describe('preflightChannel', () => {
  const okMedia = { imageCount: 1, videoCount: 0, allOwnedAndReady: true, notReadyTitles: [] }

  it('passes a fully configured image post', () => {
    expect(preflightChannel({ platform: 'instagram', channelId: 'ch', text: 'hi', media: okMedia })).toEqual([])
  })
  it('blocks missing channel, missing text and over-limit captions', () => {
    expect(preflightChannel({ platform: 'instagram', channelId: null, text: 'hi', media: okMedia }).join(' ')).toContain('No Buffer channel')
    expect(preflightChannel({ platform: 'linkedin', channelId: 'ch', text: '  ', media: okMedia }).join(' ')).toContain('No post text')
    const long = 'x'.repeat(CAPTION_LIMITS.twitter + 1)
    expect(preflightChannel({ platform: 'twitter', channelId: 'ch', text: long, media: okMedia }).join(' ')).toContain('character limit')
  })
  it('states the TikTok limitation as an adapter capability, not a platform claim', () => {
    const blockers = preflightChannel({ platform: 'tiktok', channelId: 'ch', text: 'hi', media: okMedia })
    expect(blockers.join(' ')).toContain('This integration currently supports TikTok video posts only')
    expect(blockers.join(' ')).not.toMatch(/TikTok can never|TikTok does not accept/)
  })
  it('blocks mixed media, multi-video, media-less Instagram, and unready assets by name', () => {
    expect(preflightChannel({ platform: 'facebook', channelId: 'ch', text: 'hi',
      media: { imageCount: 1, videoCount: 1, allOwnedAndReady: true, notReadyTitles: [] } }).join(' ')).toContain('cannot be mixed')
    expect(preflightChannel({ platform: 'facebook', channelId: 'ch', text: 'hi',
      media: { imageCount: 0, videoCount: 2, allOwnedAndReady: true, notReadyTitles: [] } }).join(' ')).toContain('one video')
    expect(preflightChannel({ platform: 'instagram', channelId: 'ch', text: 'hi',
      media: { imageCount: 0, videoCount: 0, allOwnedAndReady: true, notReadyTitles: [] } }).join(' ')).toContain('at least one image or video')
    expect(preflightChannel({ platform: 'facebook', channelId: 'ch', text: 'hi',
      media: { imageCount: 1, videoCount: 0, allOwnedAndReady: false, notReadyTitles: ['Dubai hero'] } }).join(' ')).toContain('Dubai hero')
  })
})

describe('summarizeResults', () => {
  it('reports partial success honestly (acceptance #13)', () => {
    const { summary, tone } = summarizeResults({ queued: 1, failed: 3, skipped: 2, unknown: 0 })
    expect(summary).toContain('Partial success')
    expect(summary).toContain('1 queued')
    expect(summary).toContain('3 failed')
    expect(summary).toContain('2 skipped')
    expect(tone).toBe('partial')
  })
  it('never wraps failures in a success tone, and full queueing still notes it is not publication', () => {
    expect(summarizeResults({ queued: 0, failed: 2, skipped: 0, unknown: 0 }).tone).toBe('failure')
    const full = summarizeResults({ queued: 3, failed: 0, skipped: 0, unknown: 0 })
    expect(full.tone).toBe('success')
    expect(full.summary).toContain('not publication')
  })
})

// ── Functional route flows (mocked providers — nothing real is sent) ─────────

describe('publish route (mocked end-to-end)', () => {
  it('queues clean channels with durable per-channel records (submitting → queued_buffer)', async () => {
    const res = await publishPOST(makeReq({}), { params: { id: 'c1' } })
    const data = await res.json()
    expect(data.counts).toEqual({ queued: 3, failed: 0, skipped: 0, unknown: 0 })
    expect(data.summary).toContain('All channels queued on Buffer (3)')
    expect(logs).toHaveLength(3)
    for (const log of logs) {
      expect(log.status).toBe('queued_buffer')          // Buffer ack ≠ published
      expect(log.attempt).toBe(1)
      expect(log.mediaIds).toEqual(['m1'])
      expect(log.channelId).toBeTruthy()
    }
  })

  it('one queued + one failed + blockers surface as partial, never green-all-good (acceptance #13)', async () => {
    publishMock
      .mockImplementationOnce(async () => ({ bufferUpdateId: 'buf_ok' }))
      .mockImplementationOnce(async () => { throw new Error('Buffer rejected post: caption invalid') })
    const res = await publishPOST(makeReq({ platforms: ['instagram', 'facebook'] }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(data.counts.queued).toBe(1)
    expect(data.counts.failed).toBe(1)
    expect(data.summary).toContain('Partial success')
    expect(data.tone).toBe('partial')
  })

  it('validation blockers stop the send entirely — nothing silently skipped (acceptance #12)', async () => {
    campaignRow.content = {}     // no text for any platform
    const res = await publishPOST(makeReq({}), { params: { id: 'c1' } })
    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error).toContain('Nothing was sent')
    expect(publishMock).not.toHaveBeenCalled()
    expect(logs).toHaveLength(0)
    expect(data.preflight.every((p: { blockers: string[] }) => p.blockers.length > 0)).toBe(true)
  })

  it('retry-failed-only resubmits ONLY the failed channel; queued channels are untouched (acceptance #14)', async () => {
    logs.push(
      { id: 'log_a', platform: 'instagram', status: 'queued_buffer', sentAt: new Date(Date.now() - 60_000).toISOString() },
      { id: 'log_b', platform: 'facebook',  status: 'failed',        sentAt: new Date(Date.now() - 50_000).toISOString() },
      { id: 'log_c', platform: 'linkedin',  status: 'sent',          sentAt: new Date(Date.now() - 40_000).toISOString() },
    )
    const res = await publishPOST(makeReq({ retryFailedOnly: true }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(publishMock).toHaveBeenCalledTimes(1)         // facebook only
    expect(data.results).toHaveLength(1)
    expect(data.results[0].platform).toBe('facebook')
    expect(data.results[0].attempt).toBe(2)
    expect(data.skippedProtected.map((s: { platform: string }) => s.platform).sort()).toEqual(['instagram', 'linkedin'])
  })

  it('an ambiguous timeout becomes UNKNOWN and is protected from blind retry (acceptance #15)', async () => {
    publishMock.mockImplementationOnce(async () => { throw new Error('fetch failed: ETIMEDOUT') })
    await publishPOST(makeReq({ platforms: ['instagram'] }), { params: { id: 'c1' } })
    expect(logs[0].status).toBe('unknown')
    expect(String(logs[0].error)).toContain('check Buffer before retrying')

    // a retry run must NOT resubmit the unknown channel
    publishMock.mockClear()
    const res2 = await publishPOST(makeReq({ platforms: ['instagram'], retryFailedOnly: true }), { params: { id: 'c1' } })
    const data2 = await res2.json()
    expect(publishMock).not.toHaveBeenCalled()
    expect(data2.skippedProtected[0].reason).toContain('reconcile')
  })

  it('a fresh in-flight submission blocks a concurrent double-click for that channel', async () => {
    logs.push({ id: 'log_x', platform: 'instagram', status: 'submitting', sentAt: new Date().toISOString() })
    const res = await publishPOST(makeReq({ platforms: ['instagram'] }), { params: { id: 'c1' } })
    const data = await res.json()
    expect(publishMock).not.toHaveBeenCalled()
    expect(data.skippedProtected[0].reason).toContain('already in progress')
  })

  it('a STALE submitting row is reconciled to unknown instead of resent', async () => {
    logs.push({ id: 'log_y', platform: 'instagram', status: 'submitting', sentAt: new Date(Date.now() - 10 * 60_000).toISOString() })
    await publishPOST(makeReq({ platforms: ['instagram'], retryFailedOnly: true }), { params: { id: 'c1' } })
    expect(logs.find(l => l.id === 'log_y')!.status).toBe('unknown')
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('media comes from the shared library attachments too, deduped with legacy rows', async () => {
    linkRows = [{ media: {
      id: 'm2', mediaType: 'image', status: 'draft', isReference: false,
      publicUrl: OWNED.replace('a.jpg', 'b.jpg'), readiness: 'ready', generationStatus: 'completed',
      format: '1080x1350', title: 'Attached',
    } }]
    await publishPOST(makeReq({ platforms: ['instagram'] }), { params: { id: 'c1' } })
    expect(logs[0].mediaIds).toEqual(['m2', 'm1'])       // attachment order first
  })

  it('a Buffer queue acknowledgement is never recorded as published (acceptance #16)', async () => {
    await publishPOST(makeReq({}), { params: { id: 'c1' } })
    expect(logs.every(l => l.status !== 'published')).toBe(true)
    const routeSrc = read('app/api/admin/orbit/campaigns/[id]/publish/route.ts')
    expect(routeSrc).toContain("status: 'queued_buffer'")
    expect(routeSrc).toContain('that is not publication')
  })
})

// ── UI honesty ────────────────────────────────────────────────────────────────

describe('PublishSection UI', () => {
  const src = read('app/admin/orbit/campaigns/[id]/PublishSection.tsx')
  it('the misleading green banner formula is gone; summaries are tone-aware', () => {
    expect(src).not.toContain('Queued on Buffer: ${')
    expect(src).not.toContain('error(s)')
    expect(src).toContain("resultTone === 'success'")
    expect(src).toContain("resultTone === 'partial'")
  })
  it("legacy 'sent' displays as queued-unconfirmed, never as published", () => {
    expect(src).toContain("sent:              'queued on Buffer (unconfirmed)'")
  })
  it('offers Validate, Retry failed channels only, blockers display and reconciliation', () => {
    for (const needle of ['Validate', 'Retry failed channels only', 'Blockers — nothing was sent',
                          'Check Buffer status', 'Mark failed (evidence)', 'hasRetryableFailures']) {
      expect(src).toContain(needle)
    }
  })
  it('shows attempt numbers, Buffer post ids, channel and media counts per entry', () => {
    expect(src).toContain('attempt {log.attempt}')
    expect(src).toContain('Buffer post ID')
    expect(src).toContain('media')
  })
})
