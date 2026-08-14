/**
 * Orbit — Replicate / Flux Schnell image generation adapter.
 *
 * Generates background-only travel visuals. Text is never baked into images;
 * the no-text suffix is enforced server-side on every prompt regardless of user input.
 *
 * Required env vars:
 *   REPLICATE_API_TOKEN        — from replicate.com/account/api-tokens
 *   NEXT_PUBLIC_SUPABASE_URL   — already set
 *   SUPABASE_SERVICE_ROLE_KEY  — for storage uploads (Settings → API in Supabase dashboard)
 *
 * Supabase setup (one-time):
 *   Storage → New bucket → Name: "orbit-media" → Public: YES
 *
 * Cost: Flux Schnell is $0.003 per image (flat rate, Replicate billing dashboard).
 */

const REPLICATE_API = 'https://api.replicate.com/v1'
const MODEL        = 'black-forest-labs/flux-schnell'

// Appended to every prompt, regardless of user input. Never remove.
const NO_TEXT_SUFFIX =
  'photographic background only, no text, no words, no lettering, ' +
  'no typography, no watermarks, no logos, no overlays, no captions, ' +
  'no numbers, no signs with readable text'

// Published Flux Schnell flat rate — Replicate does not surface per-prediction
// billing in the API response; record this constant per image.
export const FLUX_COST_USD = 0.003

// ── Formats ──────────────────────────────────────────────────────────────────

export const FLUX_FORMATS = {
  '1080x1920': { w: 1080, h: 1920, label: 'Story / WhatsApp Status', desc: 'Most important for this audience' },
  '1080x1350': { w: 1080, h: 1350, label: 'Instagram Feed', desc: 'Portrait feed post' },
  '1200x628':  { w: 1200, h: 628,  label: 'Facebook Ad', desc: 'Landscape display ad' },
  '1024x1024': { w: 1024, h: 1024, label: 'Square', desc: 'Facebook / Instagram square' },
} as const

export type FluxFormat = keyof typeof FLUX_FORMATS

// ── Connection check ──────────────────────────────────────────────────────────

export function isReplicateConfigured(): boolean {
  return !!(
    process.env.REPLICATE_API_TOKEN &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export function buildPrompt(
  destination: string,
  campaignType: string,
  hint: string,
): string {
  const dest = destination.trim() || 'a travel destination'
  const parts = [
    `Photographic travel scene of ${dest}`,
    hint.trim() || `perfect for a ${campaignType.replace(/_/g, ' ')} campaign`,
    'professional travel photography, high quality, vibrant colours',
    'navy blue and gold accent tones in the composition',
  ]
  return `${parts.join(', ')}. ${NO_TEXT_SUFFIX}.`
}

// ── Replicate prediction ──────────────────────────────────────────────────────

interface Prediction {
  id: string
  status: string
  output?: string[]
  error?: string
  metrics?: { predict_time?: number }
}

async function createPrediction(prompt: string, w: number, h: number): Promise<string> {
  const res = await fetch(`${REPLICATE_API}/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait=5',
    },
    body: JSON.stringify({
      input: {
        prompt,
        width: w,
        height: h,
        num_outputs: 1,
        output_format: 'jpg',
        output_quality: 90,
        num_inference_steps: 4,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Replicate prediction failed: ${res.status} ${body}`)
  }

  const data = await res.json() as Prediction
  return data.id
}

async function pollPrediction(id: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    })
    if (!res.ok) continue
    const data = await res.json() as Prediction
    // Replicate returns output as string or string[] depending on model version
    const url = Array.isArray(data.output) ? data.output[0] : (data.output as unknown as string | undefined)
    if (data.status === 'succeeded' && url) return url
    if (data.status === 'failed') throw new Error(`Replicate prediction failed: ${data.error ?? 'unknown'}`)
  }
  throw new Error('Replicate prediction timed out after 60s')
}

// ── Supabase storage upload ───────────────────────────────────────────────────

async function uploadToStorage(imageUrl: string, mediaId: string): Promise<{ storagePath: string; publicUrl: string }> {
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const storagePath  = `orbit/${mediaId}.jpg`
  const uploadUrl    = `${supabaseUrl}/storage/v1/object/orbit-media/${storagePath}`

  // Download from Replicate (temporary URL, valid ~1h)
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Failed to download image from Replicate: ${imgRes.status}`)
  const imgBuffer = await imgRes.arrayBuffer()

  // Upload to Supabase storage
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: imgBuffer,
  })

  if (!upRes.ok) {
    const body = await upRes.text()
    throw new Error(`Supabase storage upload failed: ${upRes.status} ${body}`)
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/orbit-media/${storagePath}`
  return { storagePath, publicUrl }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenerateResult {
  storagePath: string
  publicUrl: string
  prompt: string
  costUsd: number
}

export async function generateBackground(
  prompt: string,
  format: FluxFormat,
  mediaId: string,
): Promise<GenerateResult> {
  if (!isReplicateConfigured()) {
    throw new Error('Replicate is not configured. Add REPLICATE_API_TOKEN and SUPABASE_SERVICE_ROLE_KEY.')
  }

  const { w, h } = FLUX_FORMATS[format]

  // Create + poll prediction
  const predictionId = await createPrediction(prompt, w, h)
  const replicateUrl = await pollPrediction(predictionId)

  // Persist to Supabase storage
  const { storagePath, publicUrl } = await uploadToStorage(replicateUrl, mediaId)

  return { storagePath, publicUrl, prompt, costUsd: FLUX_COST_USD }
}
