/**
 * Orbit Creative OS — Local AI service adapter.
 *
 * GPU inference NEVER runs in Vercel. This adapter talks to a separate
 * self-hosted service (e.g. sd.cpp / ComfyUI / Wan2GP behind a thin HTTP
 * wrapper) over an authenticated API. Async job model mirrors the FAL
 * queue conventions used elsewhere in Orbit.
 *
 * Env (server-side only — never exposed to the browser):
 *   ORBIT_LOCAL_AI_URL    e.g. https://gpu.walztravels.internal
 *   ORBIT_LOCAL_AI_TOKEN  bearer token for the service
 *
 * Expected service contract (matches the open-generative-ai local wrapper
 * shape, clean-room):
 *   POST {url}/api/v1/{endpoint}            → { job_id }
 *   GET  {url}/api/v1/jobs/{job_id}         → { status, output_url?, error? }
 *
 * Capabilities the service may implement: sdxl, img2img, inpaint, img2vid,
 * txt2vid, upscale, rembg, vectorize.
 */

export function isLocalAIConfigured(): boolean {
  return !!(process.env.ORBIT_LOCAL_AI_URL?.trim() && process.env.ORBIT_LOCAL_AI_TOKEN?.trim())
}

function base(): string {
  const url = process.env.ORBIT_LOCAL_AI_URL
  if (!url) throw new Error('ORBIT_LOCAL_AI_URL is not set')
  return url.replace(/\/$/, '')
}

function headers(): Record<string, string> {
  const token = process.env.ORBIT_LOCAL_AI_TOKEN
  if (!token) throw new Error('ORBIT_LOCAL_AI_TOKEN is not set')
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export async function submitLocalJob(opts: {
  endpoint: string
  payload:  Record<string, unknown>
}): Promise<{ providerJobId: string }> {
  if (!isLocalAIConfigured()) throw new Error('LOCAL_AI_NOT_CONFIGURED')
  const res = await fetch(`${base()}/api/v1/${opts.endpoint}`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify(opts.payload),
    signal:  AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`LOCAL_AI_SUBMIT_${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { job_id?: string }
  if (!data.job_id) throw new Error('LOCAL_AI_NO_JOB_ID')
  return { providerJobId: data.job_id }
}

export type LocalJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export async function pollLocalJob(providerJobId: string): Promise<{
  status:     LocalJobStatus
  outputUrl?: string
  error?:     string
}> {
  if (!isLocalAIConfigured()) throw new Error('LOCAL_AI_NOT_CONFIGURED')
  const res = await fetch(`${base()}/api/v1/jobs/${encodeURIComponent(providerJobId)}`, {
    headers: headers(),
    cache:   'no-store',
    signal:  AbortSignal.timeout(15_000),
  })
  if (!res.ok) return { status: 'failed', error: `LOCAL_AI_POLL_${res.status}` }
  const data = await res.json() as { status?: string; output_url?: string; error?: string }
  const status: LocalJobStatus =
    data.status === 'completed' ? 'completed' :
    data.status === 'failed'    ? 'failed' :
    data.status === 'processing'? 'processing' : 'queued'
  return { status, outputUrl: data.output_url, error: data.error }
}

/** Quick reachability probe for provider-health surfaces. */
export async function probeLocalAI(): Promise<{ reachable: boolean; error?: string }> {
  if (!isLocalAIConfigured()) return { reachable: false, error: 'not configured' }
  try {
    const res = await fetch(`${base()}/api/v1/health`, {
      headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(5_000),
    })
    return { reachable: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (e) {
    return { reachable: false, error: e instanceof Error ? e.message : 'unreachable' }
  }
}
