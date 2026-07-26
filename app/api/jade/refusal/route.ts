/** POST /api/jade/refusal — read a visa refusal notice and build recovery strategy */
import { NextRequest, NextResponse } from 'next/server'
import { analyseRefusalLetter } from '@/lib/jade/intelligence-v2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const strategy = await analyseRefusalLetter(base64, (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif')

    if (!strategy) return NextResponse.json({ error: 'Could not read refusal notice' }, { status: 422 })
    return NextResponse.json(strategy)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
