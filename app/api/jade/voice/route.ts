// app/api/jade/voice/route.ts
// Voice note transcription + intent analysis (Feature 9)
// Accepts: multipart/form-data { audio: File } or JSON { url: string }

import { NextRequest, NextResponse } from 'next/server'
import { analyseVoiceNote } from '@/lib/jade/intelligence-v2'

export const maxDuration = 45
export const dynamic = 'force-dynamic'

const ALLOWED_AUDIO = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/x-m4a']

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || ''

    let audioBuffer: Buffer
    let mimeType: string

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('audio') as File | null
      if (!file) return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
      if (!ALLOWED_AUDIO.includes(file.type))
        return NextResponse.json({ error: `Unsupported audio type: ${file.type}` }, { status: 400 })
      if (file.size > 25 * 1024 * 1024)
        return NextResponse.json({ error: 'Audio too large (max 25MB)' }, { status: 400 })
      audioBuffer = Buffer.from(await file.arrayBuffer())
      mimeType = file.type
    } else {
      // JSON with { url } — fetch from Chatwoot CDN
      const body = await req.json()
      if (!body.url) return NextResponse.json({ error: 'Provide audio file or url' }, { status: 400 })
      const res = await fetch(body.url)
      if (!res.ok) return NextResponse.json({ error: `Failed to fetch audio: ${res.status}` }, { status: 400 })
      mimeType = res.headers.get('content-type') || 'audio/ogg'
      audioBuffer = Buffer.from(await res.arrayBuffer())
    }

    const analysis = await analyseVoiceNote(audioBuffer, mimeType)

    return NextResponse.json({ ok: true, transcript: analysis.transcript, analysis })
  } catch (e: any) {
    console.error('[jade/voice]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
