/**
 * Orbit — OpenAI GPT-Image-1 adapter.
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
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import OpenAI from 'openai'
import { getFormatPreset } from './creative-presets'

const MODEL = 'gpt-image-1'

// Approximate cost per image (gpt-image-1, medium quality)
// 1024x1024: ~$0.04, 1024x1536 / 1536x1024: ~$0.08
export const OPENAI_IMAGE_COST: Record<string, number> = {
  '1024x1024': 0.04,
  '1024x1536': 0.08,
  '1536x1024': 0.08,
  auto:        0.04,
}

export function isOpenAIImageConfigured(): boolean {
  return !!(
    process.env.OPENAI_API_KEY &&
    process.env.ORBIT_AI_IMAGE_ENABLED === 'true' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set')
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

// ── Storage upload ────────────────────────────────────────────────────────────

async function uploadToStorage(
  imageBuffer: Buffer,
  mediaId: string,
  ext: string,
): Promise<{ storagePath: string; publicUrl: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const storagePath = `orbit/${mediaId}.${ext}`
  const uploadUrl   = `${supabaseUrl}/storage/v1/object/orbit-media/${storagePath}`

  // Copy into a plain ArrayBuffer for fetch BodyInit compatibility
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
    const body = await upRes.text()
    throw new Error(`Supabase storage upload failed: ${upRes.status} ${body.slice(0, 200)}`)
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

  const response = await client.images.generate({
    model:   MODEL,
    prompt:  opts.prompt,
    n:       1,
    size,
    quality,
    output_format: 'png',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as { data: Array<{ b64_json?: string }> }

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI returned no image data')

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
  prompt:           string
  referenceImageUrl: string  // must be a Supabase storage public URL (our own asset)
  format:           string
  mediaId:          string
  quality?:         'low' | 'medium' | 'high' | 'auto'
}): Promise<{ storagePath: string; publicUrl: string; costUsd: number; width: number; height: number }> {
  const client  = getClient()
  const preset  = getFormatPreset(opts.format)
  const size    = preset.openaiSize
  const quality = opts.quality ?? 'medium'

  // Download reference image from our Supabase storage
  const refRes = await fetch(opts.referenceImageUrl)
  if (!refRes.ok) throw new Error(`Failed to download reference image: ${refRes.status}`)

  const refBuffer  = Buffer.from(await refRes.arrayBuffer())
  const mimeType   = refRes.headers.get('content-type') ?? 'image/jpeg'
  const ext        = mimeType.includes('png') ? 'png' : 'jpeg'

  // Build multipart form — OpenAI edits endpoint
  const { toFile } = await import('openai')
  const imageFile  = await toFile(refBuffer, `reference.${ext}`, { type: mimeType })

  const response = await client.images.edit({
    model:   MODEL,
    image:   imageFile,
    prompt:  opts.prompt,
    n:       1,
    size,
    quality,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as { data: Array<{ b64_json?: string }> }

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI returned no image data from edits endpoint')

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
