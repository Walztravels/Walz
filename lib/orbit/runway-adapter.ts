/**
 * Orbit — Runway Gen-4 Turbo adapter for image-to-video animation.
 *
 * Server-side only. NEVER import from client components.
 * RUNWAY_API_SECRET must never be exposed to the browser.
 *
 * Gated by ORBIT_RUNWAY_VIDEO_ENABLED=true (default: false).
 *
 * Required env vars:
 *   RUNWAY_API_SECRET
 *   ORBIT_RUNWAY_VIDEO_ENABLED=true
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars:
 *   ORBIT_RUNWAY_MODEL  — defaults to 'gen4_turbo'; set to override without code changes
 *
 * API reference: https://api.dev.runwayml.com/v1
 */

const RUNWAY_BASE    = 'https://api.dev.runwayml.com/v1'
const RUNWAY_VERSION = '2024-11-06'

// Read model at call time. Override via ORBIT_RUNWAY_MODEL (server-side only).
export function getRunwayModel(): string {
  return process.env.ORBIT_RUNWAY_MODEL ?? 'gen4_turbo'
}

// Cost approximation: Gen-4 Turbo ~$0.05/second
export const RUNWAY_COST_PER_SECOND = 0.05

export function isRunwayConfigured(): boolean {
  return !!(
    process.env.RUNWAY_API_SECRET &&
    process.env.ORBIT_RUNWAY_VIDEO_ENABLED === 'true'
  )
}

// Map common aspect ratio strings to Runway's width:height ratio format
export function aspectRatioToRunwayRatio(ar: string): string {
  const map: Record<string, string> = {
    '9:16':  '720:1280',
    '16:9':  '1280:720',
    '1:1':   '768:768',
    '4:5':   '720:900',
  }
  return map[ar] ?? '1280:720'
}

function runwayHeaders(): Record<string, string> {
  if (!process.env.RUNWAY_API_SECRET) throw new Error('RUNWAY_API_SECRET is not set')
  return {
    Authorization:    `Bearer ${process.env.RUNWAY_API_SECRET}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type':   'application/json',
  }
}

// ── Task types ────────────────────────────────────────────────────────────────

export type RunwayStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export interface RunwayTask {
  id:           string
  status:       RunwayStatus
  output?:      string[]    // video URL(s) when SUCCEEDED
  failure?:     string
  failureCode?: string
  progress?:    number      // 0-1 when RUNNING
}

// ── Submit image-to-video job ─────────────────────────────────────────────────

export async function submitRunwayImageToVideo(opts: {
  promptImage: string   // URL to the source image (must be HTTPS, publicly accessible)
  promptText:  string   // motion description
  duration:    5 | 10
  ratio:       string   // e.g. '9:16' → converted to Runway ratio internally
  model?:      string
}): Promise<{ taskId: string }> {
  if (!isRunwayConfigured()) {
    throw new Error('Runway is not configured. Add RUNWAY_API_SECRET and set ORBIT_RUNWAY_VIDEO_ENABLED=true.')
  }

  const body = {
    model:       opts.model ?? getRunwayModel(),
    promptImage: opts.promptImage,
    promptText:  opts.promptText,
    duration:    opts.duration,
    ratio:       aspectRatioToRunwayRatio(opts.ratio),
  }

  const res = await fetch(`${RUNWAY_BASE}/image_to_video`, {
    method:  'POST',
    headers: runwayHeaders(),
    body:    JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Runway API error ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = await res.json() as { id: string; status: string }
  return { taskId: data.id }
}

// ── Poll task status ──────────────────────────────────────────────────────────

export async function pollRunwayTask(taskId: string): Promise<RunwayTask> {
  if (!process.env.RUNWAY_API_SECRET) throw new Error('RUNWAY_API_SECRET is not set')

  const res = await fetch(`${RUNWAY_BASE}/tasks/${taskId}`, {
    headers: runwayHeaders(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Runway task poll error ${res.status}: ${err.slice(0, 200)}`)
  }

  return res.json() as Promise<RunwayTask>
}

// ── Upload completed video to Supabase (for permanent storage) ─────────────────

export async function uploadRunwayVideoToStorage(opts: {
  videoUrl: string
  mediaId:  string
}): Promise<{ storagePath: string; publicUrl: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const storagePath = `orbit/${opts.mediaId}.mp4`
  const uploadUrl   = `${supabaseUrl}/storage/v1/object/orbit-media/${storagePath}`

  // Download from Runway CDN
  const videoRes = await fetch(opts.videoUrl)
  if (!videoRes.ok) throw new Error(`Failed to download Runway video: ${videoRes.status}`)
  const videoBuffer = await videoRes.arrayBuffer()

  // Upload to Supabase
  const upRes = await fetch(uploadUrl, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${serviceKey}`,
      'Content-Type': 'video/mp4',
      'x-upsert':     'true',
    },
    body: videoBuffer,
  })

  if (!upRes.ok) {
    const body = await upRes.text()
    throw new Error(`Supabase storage upload failed: ${upRes.status} ${body.slice(0, 200)}`)
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/orbit-media/${storagePath}`
  return { storagePath, publicUrl }
}
