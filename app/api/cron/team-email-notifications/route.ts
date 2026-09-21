/**
 * Walz Team Hub V1.1 — staff email notification cron.
 *
 * Runs every 5 minutes (vercel.json `crons`). Drains due
 * team_email_notification_candidates into batched, cooldown-respecting,
 * re-validated emails — see lib/team/email-processor.ts for the full
 * algorithm and its idempotency guarantees.
 *
 * Auth is the identical Bearer CRON_SECRET check every other cron route in
 * this codebase uses (see app/api/cron/activity-reconciliation/route.ts) —
 * fail-closed when CRON_SECRET is unset.
 */

export const maxDuration = 60
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { processTeamEmailNotifications } from '@/lib/team/email-processor'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await processTeamEmailNotifications()
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    // Never 500 loudly with internals — the tick is retried on the next
    // schedule and every candidate it didn't resolve is still PENDING.
    console.error('[team/email-cron] tick failed:', (e as Error)?.message)
    return NextResponse.json({ ok: false, error: 'Team Hub email tick failed' }, { status: 500 })
  }
}
