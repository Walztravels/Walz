// app/api/jade/cron/whisper/route.ts
// Jade Whisper re-engagement cron — every 3 hours (Feature 13)

import { NextRequest, NextResponse } from 'next/server'
import { processWhisperQueue } from '@/lib/jade/intelligence-v2'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processWhisperQueue()
    console.log(`[whisper cron] processed=${result.processed} sent=${result.sent}`)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[whisper cron]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
