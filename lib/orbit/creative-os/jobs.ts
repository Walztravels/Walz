/**
 * Orbit Creative OS — async job queue (persistence + retries + audit).
 *
 * Every generation is recorded: staff, campaign, provider, model, cost lane,
 * purpose-tagged input refs, output asset, timestamps. Retries re-execute
 * through the router (failover-aware). Completed outputs hand off to
 * Campaign Media via the existing OrbitMedia model.
 */

import prisma from '@/lib/db'
import { executeCapability, type ExecuteInput } from './execute'
import { pollLocalJob } from './local-adapter'
import { pollFalVideoTask } from '@/lib/orbit/fal-video-adapter'
import { MODEL_REGISTRY } from './registry'
import type { CapabilityKind, ReferenceInput } from './types'

export const MAX_RETRIES = 2

async function audit(action: string, detail: string, staffEmail?: string | null) {
  await prisma.activityLog.create({
    data: { staffId: null, staffName: staffEmail ?? 'Creative OS', action, detail },
  }).catch(() => {})
}

export async function submitCreativeJob(opts: {
  input:       ExecuteInput
  campaignId?: string | null
  staffEmail?: string | null
  inputRefs?:  ReferenceInput[]
}): Promise<{ ok: boolean; jobId?: string; outputUrl?: string; error?: string }> {
  const result = await executeCapability(opts.input)

  const row = await prisma.orbitCreativeJob.create({
    data: {
      campaignId:    opts.campaignId ?? null,
      capability:    opts.input.capability,
      lane:          result.lane ?? opts.input.lane ?? 'AUTO',
      provider:      result.provider ?? 'none',
      modelKey:      result.modelKey ?? 'none',
      status:        result.ok ? (result.async ? 'processing' : 'completed') : 'failed',
      providerJobId: result.providerJobId ?? null,
      inputRefs:     opts.inputRefs ? JSON.parse(JSON.stringify(opts.inputRefs)) : undefined,
      outputUrl:     result.outputUrl ?? null,
      costUsd:       result.costUsd ?? null,
      error:         result.error ?? null,
      staffEmail:    opts.staffEmail ?? null,
    },
    select: { id: true },
  }).catch((e: unknown) => {
    console.error('[creative-os] job persist failed (run supabase-add-creative-os.sql?):', e)
    return null
  })

  await audit(
    'Creative OS Generation',
    `capability=${opts.input.capability} provider=${result.provider ?? '-'} model=${result.modelKey ?? '-'} lane=${result.lane ?? '-'} ` +
    `status=${result.ok ? (result.async ? 'processing' : 'completed') : 'failed'} ` +
    `refs=${(opts.inputRefs ?? []).map(r => `${r.purpose}:${r.mediaId}`).join(',') || 'none'} ` +
    `campaign=${opts.campaignId ?? '-'}${result.error ? ` error=${result.error.slice(0, 120)}` : ''}`,
    opts.staffEmail,
  )

  return { ok: result.ok, jobId: row?.id, outputUrl: result.outputUrl, error: result.error }
}

/** Poll an async job's provider and update the row. */
export async function refreshCreativeJob(jobId: string): Promise<{ status: string; outputUrl?: string | null; error?: string | null }> {
  const job = await prisma.orbitCreativeJob.findUnique({ where: { id: jobId } })
  if (!job) return { status: 'not_found' }
  if (job.status !== 'processing' || !job.providerJobId) {
    return { status: job.status, outputUrl: job.outputUrl, error: job.error }
  }

  let status: string = 'processing'
  let outputUrl: string | undefined
  let error: string | undefined

  try {
    if (job.provider === 'local') {
      const r = await pollLocalJob(job.providerJobId)
      status = r.status; outputUrl = r.outputUrl; error = r.error
    } else if (job.provider === 'fal') {
      const entry = MODEL_REGISTRY.find(m => m.key === job.modelKey)
      const endpoint = entry?.endpoint.startsWith('env:')
        ? (process.env[entry.endpoint.slice(4)] ?? '')
        : (entry?.endpoint ?? '')
      const r = await pollFalVideoTask({ requestId: job.providerJobId, falEndpoint: endpoint })
      status = r.status; outputUrl = r.videoUrl; error = r.error
    }
  } catch (e) {
    // transient poll failure — keep processing
    console.error('[creative-os] poll failed:', e)
    return { status: 'processing' }
  }

  const done = status === 'completed' || status === 'failed'
  if (done) {
    await prisma.orbitCreativeJob.update({
      where: { id: jobId },
      data: { status, outputUrl: outputUrl ?? null, error: error ?? null },
    }).catch(() => {})
  }
  return { status, outputUrl, error }
}

/** Retry a failed job through the router (failover chain applies again). */
export async function retryCreativeJob(jobId: string, staffEmail?: string | null): Promise<{ ok: boolean; error?: string }> {
  const job = await prisma.orbitCreativeJob.findUnique({ where: { id: jobId } })
  if (!job) return { ok: false, error: 'JOB_NOT_FOUND' }
  if (job.status !== 'failed') return { ok: false, error: 'ONLY_FAILED_JOBS_RETRY' }
  if (job.retryCount >= MAX_RETRIES) return { ok: false, error: 'MAX_RETRIES_REACHED' }

  const result = await executeCapability({
    capability: job.capability as CapabilityKind,
    lane:       job.lane === 'LOCAL' ? 'LOCAL' : undefined,
  })
  await prisma.orbitCreativeJob.update({
    where: { id: jobId },
    data: {
      retryCount:    job.retryCount + 1,
      status:        result.ok ? (result.async ? 'processing' : 'completed') : 'failed',
      provider:      result.provider ?? job.provider,
      modelKey:      result.modelKey ?? job.modelKey,
      providerJobId: result.providerJobId ?? null,
      outputUrl:     result.outputUrl ?? null,
      error:         result.error ?? null,
    },
  }).catch(() => {})
  await audit('Creative OS Retry', `job=${jobId} attempt=${job.retryCount + 1} ok=${result.ok}`, staffEmail)
  return { ok: result.ok, error: result.error }
}

/**
 * Campaign Media handoff: register a completed output as an OrbitMedia row
 * so the existing Campaign Media / Buffer publishing flows can use it.
 */
export async function handoffToCampaignMedia(jobId: string): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  const job = await prisma.orbitCreativeJob.findUnique({ where: { id: jobId } })
  if (!job?.outputUrl || job.status !== 'completed') return { ok: false, error: 'JOB_NOT_COMPLETED' }

  const media = await prisma.orbitMedia.create({
    data: {
      source:           'generated',
      storagePath:      `creative-os/${job.id}`,
      publicUrl:        job.outputUrl,
      format:           '1080x1350',
      mediaType:        job.capability.includes('video') || job.capability === 'clip' || job.capability === 'motion' ? 'video' : 'image',
      altText:          `Creative OS ${job.capability}`,
      costUsd:          job.costUsd ?? 0,
      campaignId:       job.campaignId,
      provider:         job.provider,
      model:            job.modelKey,
      generationStatus: 'completed',
    },
    select: { id: true },
  }).catch((e: unknown) => { console.error('[creative-os] handoff failed:', e); return null })

  if (!media) return { ok: false, error: 'MEDIA_CREATE_FAILED' }
  await prisma.orbitCreativeJob.update({ where: { id: jobId }, data: { outputMediaId: media.id } }).catch(() => {})
  return { ok: true, mediaId: media.id }
}
