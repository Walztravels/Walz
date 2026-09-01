/**
 * Orbit — OpenAI GPT-Image-2 adapter.
 *
 * Server-side only. NEVER import from client components.
 * OPENAI_API_KEY must never be exposed to the browser.
 *
 * Supports:
 *   - text-to-image generation
 *   - image editing with reference image
 *
 * Gated by ORBIT_AI_IMAGE_ENABLED=true (default: false).
 *
 * Required env vars:
 *   OPENAI_API_KEY
 *   ORBIT_AI_IMAGE_ENABLED=true
 *   NEXT_PUBLIC_SUPABASE_URL          (required at upload time)
 *   SUPABASE_SERVICE_ROLE_KEY         (required at upload time)
 *
 * Optional env vars:
 *   ORBIT_OPENAI_IMAGE_MODEL  — defaults to 'gpt-image-2'; set to override without code changes
 */

import OpenAI from 'openai'
import { getFormatPreset } from './creative-presets'

// ── Error types ───────────────────────────────────────────────────────────────

export type OrbitImageErrorCode =
  | 'FEATURE_DISABLED'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'MODEL_NOT_AVAILABLE'
  | 'BILLING_OR_QUOTA'
  | 'RATE_LIMIT'
  | 'OPENAI_REQUEST_FAILED'
  | 'STORAGE_UPLOAD_FAILED'
  | 'STORAGE_NOT_CONFIGURED'

export class OrbitImageError extends Error {
  readonly code:       OrbitImageErrorCode
  readonly httpStatus: number | undefined

  constructor(message: string, code: OrbitImageErrorCode, httpStatus?: number) {
    super(message)
    this.name       = 'OrbitImageError'
    this.code       = code
    this.httpStatus = httpStatus
  }
}

// ── Model ─────────────────────────────────────────────────────────────────────

// Read at call time so env var changes take effect without rebuild.
export function getOpenAIImageModel(): string {
  return process.env.ORBIT_OPENAI_IMAGE_MODEL ?? 'gpt-image-2'
}

// Approximate cost per image (gpt-image-2, medium quality)
export const OPENAI_IMAGE_COST: Record<string, number> = {
  '1024x1024': 0.04,
  '1024x1536': 0.08,
  '1536x1024': 0.08,
  auto:        0.04,
}

// ── Provider detection ────────────────────────────────────────────────────────

/**
 * True when OpenAI image generation is enabled and the API key is present.
 *
 * USE THIS for UI capability flags and health indicators.
 * Does NOT require Supabase credentials — those are storage infrastructure
 * and are checked at upload time.
 */
export function isOpenAIImageEnabled(): boolean {
  return !!(
    process.env.ORBIT_AI_IMAGE_ENABLED === 'true' &&
    process.env.OPENAI_API_KEY
  )
}

/**
 * @deprecated Alias of isOpenAIImageEnabled().
 * Kept for call-site compat; Supabase is checked at upload time instead.
 */
export function isOpenAIImageConfigured(): boolean {
  return isOpenAIImageEnabled()
}

// ── OpenAI client ─────────────────────────────────────────────────────────────

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new OrbitImageError('OPENAI_API_KEY is not set', 'MISSING_API_KEY')
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// ── Error normalisation ────────────────────────────────────────────────────────

function normaliseOpenAIError(err: unknown): OrbitImageError {
  // OpenAI SDK ≥4 throws OpenAI.APIError
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0
    const code   = (err as { code?: string }).code ?? ''
    const type   = err.type ?? ''

    if (status === 401 || code === 'invalid_api_key') {
      return new OrbitImageError(
        'OpenAI API key is invalid or has been revoked.',
        'INVALID_API_KEY', status,
      )
    }
    if (status === 403 || code === 'billing_not_active' || type === 'insufficient_quota') {
      return new OrbitImageError(
        'OpenAI billing is not active or quota is exhausted.',
        'BILLING_OR_QUOTA', status,
      )
    }
    if (status === 429 || type === 'rate_limit_exceeded') {
      return new OrbitImageError(
        'OpenAI rate limit reached. Retry in a moment.',
        'RATE_LIMIT', status,
      )
    }
    if (status === 404 || code === 'model_not_found') {
      return new OrbitImageError(
        `OpenAI model "${getOpenAIImageModel()}" is not available for this API key/project.`,
        'MODEL_NOT_AVAILABLE', status,
      )
    }
    return new OrbitImageError(
      `OpenAI request failed (${status}): ${err.message.slice(0, 200)}`,
      'OPENAI_REQUEST_FAILED', status,
    )
  }

  if (err instanceof OrbitImageError) return err
  if (err instanceof Error) {
    return new OrbitImageError(err.message.slice(0, 300), 'OPENAI_REQUEST_FAILED')
  }
  return new OrbitImageError(String(err).slice(0, 300), 'OPENAI_REQUEST_FAILED')
}

// ── Storage upload ────────────────────────────────────────────────────────────

async function uploadToStorage(
  imageBuffer: Buffer,
  mediaId:     string,
  ext:         string,
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new OrbitImageError(
      'Supabase storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      'STORAGE_NOT_CONFIGURED',
    )
  }

  const storagePath = `orbit/${mediaId}.${ext}`
  const uploadUrl   = `${supabaseUrl}/storage/v1/object/orbit-media/${storagePath}`

  const body: ArrayBuffer = imageBuffer.buffer instanceof SharedArrayBuffer
    ? new Uint8Array(imageBuffer).buffer
    : imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength)

  const upRes = await fetch(uploadUrl, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${serviceKey}`,
      'Content-Type': `image/${ext}`,
      'x-upsert':     'true',
    },
    body,
  })

  if (!upRes.ok) {
    const errBody = await upRes.text()
    throw new OrbitImageError(
      `Supabase storage upload failed (${upRes.status}): ${errBody.slice(0, 150)}`,
      'STORAGE_UPLOAD_FAILED',
    )
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/orbit-media/${storagePath}`
  return { storagePath, publicUrl }
}

// ── Text-to-image ─────────────────────────────────────────────────────────────

export async function generateOpenAIImage(opts: {
  prompt:     string
  format:     string
  mediaId:    string
  quality?:   'low' | 'medium' | 'high' | 'auto'
}): Promise<{ storagePath: string; publicUrl: string; costUsd: number; width: number; height: number }> {
  const client  = getClient()
  const preset  = getFormatPreset(opts.format)
  const size    = preset.openaiSize
  const quality = opts.quality ?? 'medium'

  let response: { data: Array<{ b64_json?: string }> }
  try {
    response = await client.images.generate({
      model:   getOpenAIImageModel(),
      prompt:  opts.prompt,
      n:       1,
      size,
      quality,
      output_format: 'png',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as { data: Array<{ b64_json?: string }> }
  } catch (err) {
    throw normaliseOpenAIError(err)
  }

  const b64 = response.data?.[0]?.b64_json
  if (!b64) {
    throw new OrbitImageError('OpenAI returned no image data', 'OPENAI_REQUEST_FAILED')
  }

  const buffer = Buffer.from(b64, 'base64')
  const { storagePath, publicUrl } = await uploadToStorage(buffer, opts.mediaId, 'png')

  const [w, h] = size === 'auto' ? [1024, 1024] : size.split('x').map(Number)

  return {
    storagePath,
    publicUrl,
    costUsd: OPENAI_IMAGE_COST[size] ?? 0.04,
    width:   w,
    height:  h,
  }
}

// ── Image editing with reference ──────────────────────────────────────────────
//
// Reference images must be staff-uploaded marketing assets only.
// NEVER pass private customer documents (passports, tickets, IDs) to OpenAI.

export async function editOpenAIImage(opts: {
  prompt:            string
  referenceImageUrl: string  // must be a Supabase storage public URL (our own asset)
  format:            string
  mediaId:           string
  quality?:          'low' | 'medium' | 'high' | 'auto'
}): Promise<{ storagePath: string; publicUrl: string; costUsd: number; width: number; height: number }> {
  const client  = getClient()
  const preset  = getFormatPreset(opts.format)
  const size    = preset.openaiSize
  const quality = opts.quality ?? 'medium'

  const refRes = await fetch(opts.referenceImageUrl)
  if (!refRes.ok) {
    throw new OrbitImageError(
      `Failed to download reference image: ${refRes.status}`,
      'OPENAI_REQUEST_FAILED',
    )
  }

  const refBuffer  = Buffer.from(await refRes.arrayBuffer())
  const mimeType   = refRes.headers.get('content-type') ?? 'image/jpeg'
  const ext        = mimeType.includes('png') ? 'png' : 'jpeg'

  const { toFile } = await import('openai')
  const imageFile  = await toFile(refBuffer, `reference.${ext}`, { type: mimeType })

  let response: { data: Array<{ b64_json?: string }> }
  try {
    response = await client.images.edit({
      model:   getOpenAIImageModel(),
      image:   imageFile,
      prompt:  opts.prompt,
      n:       1,
      size,
      quality,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as { data: Array<{ b64_json?: string }> }
  } catch (err) {
    throw normaliseOpenAIError(err)
  }

  const b64 = response.data?.[0]?.b64_json
  if (!b64) {
    throw new OrbitImageError('OpenAI returned no image data from edits endpoint', 'OPENAI_REQUEST_FAILED')
  }

  const buffer = Buffer.from(b64, 'base64')
  const { storagePath, publicUrl } = await uploadToStorage(buffer, opts.mediaId, 'png')

  const [w, h] = size === 'auto' ? [1024, 1024] : size.split('x').map(Number)

  return {
    storagePath,
    publicUrl,
    costUsd: OPENAI_IMAGE_COST[size] ?? 0.08,
    width:   w,
    height:  h,
  }
}

// ── Optional SDK connectivity test (health check only) ────────────────────────
// Calls models.retrieve() — free, no generation. Returns sanitized result.

export async function testOpenAIConnectivity(): Promise<{
  reachable:  boolean
  model:      string
  accessible: boolean
  errorCode?: string
  errorType?: string
}> {
  const model = getOpenAIImageModel()
  try {
    const client = getClient()
    // models.retrieve is free — confirms key validity and project model access
    await client.models.retrieve(model)
    return { reachable: true, model, accessible: true }
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const code   = (err as { code?: string }).code
      const type   = err.type
      return {
        reachable:  err.status !== undefined,
        model,
        accessible: false,
        errorCode:  code  ?? String(err.status ?? 'unknown'),
        errorType:  type  ?? 'api_error',
      }
    }
    return { reachable: false, model, accessible: false, errorCode: 'network_error' }
  }
}
