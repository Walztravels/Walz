import { NextRequest, NextResponse } from 'next/server'
import { extractDocumentData } from '@/lib/jade/intelligence'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ error: 'Unsupported image type. Send JPEG, PNG, WebP, or GIF.' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: 'Image too large. Max 5MB.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const data = await extractDocumentData(
      base64,
      file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
    )
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[jade/vision]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
