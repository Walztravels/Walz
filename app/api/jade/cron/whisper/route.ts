/** GET /api/jade/cron/whisper — intelligent re-engagement sweep (every 3h) */
import { NextResponse } from 'next/server'
import { runWhisperSweep } from '@/lib/jade/intelligence-v2'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorizsd' }, { status: 401 })
  try {
    const result = await runWhisperSweep()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
