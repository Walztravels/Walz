/**
 * Orbit publishing — per-channel preflight validation, status vocabulary
 * and honest result summaries.
 *
 * Capability rules mirror the ACTUAL Buffer adapter (lib/orbit/buffer-
 * publisher.ts), not UI labels: e.g. this integration posts TikTok VIDEO
 * only — that is an adapter/pipeline limitation, not a claim that TikTok
 * can never accept images.
 *
 * Status vocabulary (per channel):
 *   draft | validation_failed | submitting | queued_buffer | published |
 *   failed | skipped | unknown
 * Legacy rows: 'sent' reads as queued_buffer, 'error' as failed. A Buffer
 * queue acknowledgement is NOT publication — 'published' is reserved for
 * provider confirmation, which this integration does not yet receive, so
 * statuses stay explicit at queued_buffer.
 */

export const CHANNEL_STATUSES = [
  'draft', 'validation_failed', 'submitting', 'queued_buffer',
  'published', 'failed', 'skipped', 'unknown',
] as const
export type ChannelStatus = typeof CHANNEL_STATUSES[number]

/** Map legacy log statuses onto the new vocabulary (never upgraded to published). */
export function normalizeLogStatus(status: string): ChannelStatus {
  if (status === 'sent')  return 'queued_buffer'
  if (status === 'error') return 'failed'
  if ((CHANNEL_STATUSES as readonly string[]).includes(status)) return status as ChannelStatus
  return 'unknown'
}

/** Channel states that a "Retry failed channels only" run may resubmit. */
export const RETRYABLE_STATUSES: ChannelStatus[] = ['failed', 'validation_failed']

/** States that must NEVER be resubmitted by a retry run. */
export const NON_RETRYABLE_STATUSES: ChannelStatus[] = ['queued_buffer', 'published', 'submitting']

/** Caption limits per channel (platform documentation values; twitter uses
 *  the adapter's conservative truncation threshold). */
export const CAPTION_LIMITS: Record<string, number> = {
  instagram:      2200,
  facebook:       63206,
  linkedin:       3000,
  twitter:        255,
  tiktok:         2200,
  googlebusiness: 1500,
}

export interface PreflightMedia {
  imageCount: number
  videoCount: number
  allOwnedAndReady: boolean       // every asset ready + in owned storage
  notReadyTitles: string[]
}

export interface ChannelPreflightInput {
  platform:   string
  channelId?: string | null
  text:       string
  media:      PreflightMedia
}

/** Validate one channel before submission. Returns human-readable blockers. */
export function preflightChannel(input: ChannelPreflightInput): string[] {
  const blockers: string[] = []
  const { platform, channelId, text, media } = input
  const totalMedia = media.imageCount + media.videoCount

  if (!channelId) {
    blockers.push('No Buffer channel/account is configured for this platform — add it in Orbit → Settings → Integrations.')
  }
  if (!text.trim()) {
    blockers.push('No post text exists for this platform — generate content or write it in Edit & Re-send.')
  }
  const limit = CAPTION_LIMITS[platform]
  if (limit && text.length > limit) {
    blockers.push(`Caption is ${text.length} characters — over this channel's ${limit}-character limit.`)
  }

  // Adapter media-shape rules
  if (media.imageCount > 0 && media.videoCount > 0) {
    blockers.push('Images and videos cannot be mixed in one post via this integration — keep one media type.')
  }
  if (media.videoCount > 1) {
    blockers.push('Only one video per post is supported by this integration.')
  }
  if (platform === 'tiktok' && media.videoCount === 0) {
    blockers.push('This integration currently supports TikTok video posts only — attach a ready video to include TikTok.')
  }
  if (platform === 'instagram' && totalMedia === 0) {
    blockers.push('Instagram requires at least one image or video.')
  }
  if (totalMedia > 0 && !media.allOwnedAndReady) {
    const names = media.notReadyTitles.slice(0, 3).join(', ')
    blockers.push(`Selected media is not ready in Walz storage (${names || 'unnamed asset'}) — Buffer could not fetch it. Use Retry save in the Media Library first.`)
  }
  return blockers
}

export interface ChannelResultCounts {
  queued:  number
  failed:  number
  skipped: number
  unknown: number
}

/** Honest, human summary — never a green "success" wrapping failures. */
export function summarizeResults(counts: ChannelResultCounts): { summary: string; tone: 'success' | 'partial' | 'failure' } {
  const { queued, failed, skipped, unknown } = counts
  const parts: string[] = []
  if (queued)  parts.push(`${queued} queued on Buffer`)
  if (failed)  parts.push(`${failed} failed`)
  if (skipped) parts.push(`${skipped} skipped`)
  if (unknown) parts.push(`${unknown} unknown (needs reconciliation)`)
  const body = parts.join(', ') || 'nothing to send'

  if (queued > 0 && failed === 0 && skipped === 0 && unknown === 0) {
    return { summary: `All channels queued on Buffer (${queued}). Queueing is not publication — confirm delivery in Buffer.`, tone: 'success' }
  }
  if (queued > 0) {
    return { summary: `Partial success: ${body}.`, tone: 'partial' }
  }
  return { summary: `Not queued: ${body}.`, tone: 'failure' }
}

/** Latest log per platform (logs must be sorted newest-first). */
export function latestPerChannel<T extends { platform: string }>(logs: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const log of logs) {
    if (!map.has(log.platform)) map.set(log.platform, log)
  }
  return map
}

/** A 'submitting' row older than this is ambiguous → needs reconciliation. */
export const SUBMITTING_STALE_MS = 3 * 60 * 1000

export function isStaleSubmitting(log: { status: string; sentAt: Date | string }): boolean {
  return log.status === 'submitting'
    && Date.now() - new Date(log.sentAt).getTime() > SUBMITTING_STALE_MS
}

/** Errors that mean "we cannot know whether Buffer accepted the post". */
export function isAmbiguousSubmitError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return /abort|timeout|timed out|network|fetch failed|socket|ECONNRESET|ETIMEDOUT/i.test(msg)
}
