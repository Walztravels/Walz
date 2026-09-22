/**
 * WhatsApp Broadcast V1 — the send cron.
 *
 * Runs every 5 minutes (vercel.json `crons`). Promotes due SCHEDULED
 * campaigns, then drains a bounded batch of QUEUED recipients through
 * Meta's template API — see lib/whatsapp/broadcast/processor.ts for the
 * claim mechanism, rate-limit reasoning and retry/backoff policy.
 *
 * Auth is the identical Bearer CRON_SECRET check every other cron route in
 * this codebase uses (see app/api/cron/team-email-notifications/route.ts)
 * — fail-closed when CRON_SECRET is unset.
 *
 * NOT reachable by Jade, by a browser session, or by any admin route: this
 * is a cron-secret endpoint that only ever dispatches recipient rows a
 * human already approved.
 */

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processWhatsAppBroadcasts } from '@/lib/whatsapp/broadcast/processor'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await processWhatsAppBroadcasts()
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    // Never 500 loudly with internals — the tick is retried on the next
    // schedule and every recipient it did not dispatch is still QUEUED.
    console.error('[wa-broadcast/cron] tick failed:', (e as Error)?.message)
    return NextResponse.json({ ok: false, error: 'WhatsApp broadcast tick failed' }, { status: 500 })
  }
}
