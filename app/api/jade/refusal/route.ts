// app/api/jade/refusal/route.ts
// Visa Rejection Recovery Engine (Feature 12)
// Accepts: multipart/form-data { image: File } or JSON { url: string }

import { NextRequest, NextResponse } from 'next/server'
import { analyseRefusalLetter } from '@/lib/jade/intelligence-v2'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

const ALLOWED_IMG = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || ''

    let imageBase64: string
    let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('image') as File | null
      if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })
      if (!ALLOWED_IMG.includes(file.type))
        return NextResponse.json({ error: 'Unsupported image type. Send JPEG, PNG, WebP, or GIF.' }, { status: 400 })
      if (file.size > 5 * 1024 * 1024)
        return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
      imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
      mediaType   = file.type as typeof mediaType
    } else {
      // JSON with { url } — fetch from Chatwoot CDN
      const body = await req.json()
      if (!body.url) return NextResponse.json({ error: 'Provide image file or url' }, { status: 400 })
      const res = await fetch(body.url)
      if (!res.ok) return NextResponse.json({ error: `Failed to fetch image: ${res.status}` }, { status: 400 })
      const mt = res.headers.get('content-type') || 'image/jpeg'
      if (!ALLOWED_IMG.includes(mt))
        return NextResponse.json({ error: `Unsupported image type from URL: ${mt}` }, { status: 400 })
      imageBase64 = Buffer.from(await res.arrayBuffer()).toString('base64')
      mediaType   = mt as typeof mediaType
    }

    const analysis = await analyseRefusalLetter(imageBase64, mediaType)
    return NextResponse.json({ ok: true, analysis })
  } catch (e: any) {
    console.error('[jade/refusal]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
