/** POST /api/jade/voice — transcribe + understand a WhatsApp/Instagram voice note */
import { NextRequest, NextResponse } from 'next/server'
import { analyseVoiceNote } from '@/lib/jade/intelligence-v2'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('audio') as File | null
    if (!file) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

    const audioBuffer = Buffer.from(await file.arrayBuffer())
    const result = await analyseVoiceNote(audioBuffer, file.type || 'audio/ogg')

    if (!result) return NextResponse.json({ error: 'Could not process audio' }, { status: 422 })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
