/**
 * Orbit — Canva Connect API adapter.
 * Uses the Canva Connect REST API (OAuth2 client credentials) to create
 * designs from a saved brand template with editable text layers.
 *
 * Required env vars:
 *   CANVA_CLIENT_ID       — from Canva Developer Portal
 *   CANVA_CLIENT_SECRET   — from Canva Developer Portal
 *   CANVA_BRAND_TEMPLATE_ID — ID of the saved brand template in Canva
 *
 * Brand palette enforced in the template (not here):
 *   Navy  #0B1F3A  (background)
 *   Gold  #C9A84C  (accent — one per asset)
 *   Cream #F5F0E8  (body text)
 */

const CANVA_API_BASE = 'https://api.canva.com/rest/v1'

// ── Format definitions ────────────────────────────────────────────────────────

export const CANVA_FORMATS = {
  square_1024:    { label: 'Square',               w: 1024, h: 1024,  desc: 'Facebook/Instagram square post' },
  feed_1080x1350: { label: 'Portrait Feed',         w: 1080, h: 1350,  desc: 'Instagram portrait feed' },
  story_1080x1920:{ label: 'Story / WhatsApp Status', w: 1080, h: 1920, desc: 'WhatsApp Status, Instagram Story (most important for this audience)' },
  ad_1200x628:    { label: 'Landscape Ad',          w: 1200, h: 628,   desc: 'Facebook/Google display ad' },
} as const

export type CanvaFormat = keyof typeof CANVA_FORMATS

// ── Text layer inputs ─────────────────────────────────────────────────────────

export interface TextLayers {
  headline: string
  subheadline?: string
  cta?: string
  destination?: string
  offer?: string
}

// ── Connection check ──────────────────────────────────────────────────────────

export function isCanvaConfigured(): boolean {
  return !!(
    process.env.CANVA_CLIENT_ID &&
    process.env.CANVA_CLIENT_SECRET &&
    process.env.CANVA_BRAND_TEMPLATE_ID
  )
}

// ── Token cache ───────────────────────────────────────────────────────────────

let _token: string | null = null
let _tokenExpiry = 0

async function getCanvaToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry) return _token

  const res = await fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CANVA_CLIENT_ID!,
      client_secret: process.env.CANVA_CLIENT_SECRET!,
      scope: 'design:content:write design:content:read',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Canva auth failed: ${res.status} ${body}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  _token = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000
  return _token
}

// ── Design creation ───────────────────────────────────────────────────────────

export interface DesignResult {
  designId: string
  editUrl: string
}

export async function createDesignFromTemplate(
  textLayers: TextLayers,
  format: CanvaFormat,
): Promise<DesignResult> {
  if (!isCanvaConfigured()) {
    throw new Error('Canva is not configured. Add CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and CANVA_BRAND_TEMPLATE_ID to environment variables.')
  }

  const token = await getCanvaToken()
  const templateId = process.env.CANVA_BRAND_TEMPLATE_ID!

  // Build the autofill data for each text layer
  // Layer names must match what's set in the Canva brand template
  const data: Array<{ name: string; type: 'text'; text: string }> = []
  if (textLayers.headline)    data.push({ name: 'headline',    type: 'text', text: textLayers.headline })
  if (textLayers.subheadline) data.push({ name: 'subheadline', type: 'text', text: textLayers.subheadline })
  if (textLayers.cta)         data.push({ name: 'cta',         type: 'text', text: textLayers.cta })
  if (textLayers.destination) data.push({ name: 'destination', type: 'text', text: textLayers.destination })
  if (textLayers.offer)       data.push({ name: 'offer',       type: 'text', text: textLayers.offer })

  const res = await fetch(`${CANVA_API_BASE}/autofills`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand_template_id: templateId,
      title: `Orbit — ${textLayers.headline?.slice(0, 40) ?? format}`,
      data,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Canva design creation failed: ${res.status} ${body}`)
  }

  const result = await res.json() as { job: { id: string } }
  const jobId = result.job?.id

  // Poll for job completion (up to 30s)
  const designId = await pollAutofillJob(token, jobId)

  const editUrl = `https://www.canva.com/design/${designId}/edit`
  return { designId, editUrl }
}

async function pollAutofillJob(token: string, jobId: string): Promise<string> {
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${CANVA_API_BASE}/autofills/${jobId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) continue
    const data = await res.json() as { job: { status: string; result?: { design?: { id: string } } } }
    if (data.job.status === 'success') {
      const id = data.job.result?.design?.id
      if (id) return id
    }
    if (data.job.status === 'failed') throw new Error('Canva autofill job failed')
  }
  throw new Error('Canva autofill job timed out after 30s')
}

// ── Export to image ───────────────────────────────────────────────────────────

export interface ExportResult {
  exportUrl: string
}

export async function exportDesign(designId: string): Promise<ExportResult> {
  if (!isCanvaConfigured()) throw new Error('Canva not configured')

  const token = await getCanvaToken()

  const res = await fetch(`${CANVA_API_BASE}/exports`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      design_id: designId,
      format: 'png',
      export_quality: 'pro',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Canva export failed: ${res.status} ${body}`)
  }

  const result = await res.json() as { job: { id: string } }
  const jobId = result.job?.id

  const exportUrl = await pollExportJob(token, jobId)
  return { exportUrl }
}

async function pollExportJob(token: string, jobId: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const res = await fetch(`${CANVA_API_BASE}/exports/${jobId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) continue
    const data = await res.json() as { job: { status: string; urls?: string[] } }
    if (data.job.status === 'success' && data.job.urls?.[0]) return data.job.urls[0]
    if (data.job.status === 'failed') throw new Error('Canva export job failed')
  }
  throw new Error('Canva export timed out after 40s')
}
