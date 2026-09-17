import { NextRequest, NextResponse } from 'next/server'
import { enabledSources } from '@/lib/embassy-intel/sources'
import { runSource, type SourceRunResult } from '@/lib/embassy-intel/detector'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

/**
 * INT-7 — scheduled embassy-source change detection.
 *
 * Replaces the fake-alert generator: every alert now originates from a
 * DETECTED change on a verified official source, with the source URL,
 * previous/current evidence and affected-case count attached. Fetch
 * failures record snapshot health and never produce an alert; the model
 * only ever summarizes an actual diff.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sources = enabledSources()
  const results: SourceRunResult[] = []
  // Small batches keep worst-case wall time inside maxDuration.
  for (let i = 0; i < sources.length; i += 4) {
    const batch = sources.slice(i, i + 4)
    const settled = await Promise.allSettled(batch.map(s => runSource(s)))
    for (const [j, r] of settled.entries()) {
      results.push(r.status === 'fulfilled'
        ? r.value
        : { sourceId: batch[j].id, status: 0, changed: false, alertsCreated: 0 })
    }
  }

  return NextResponse.json({
    ok: true,
    sources: results.length,
    changed: results.filter(r => r.changed).length,
    alertsCreated: results.reduce((s, r) => s + r.alertsCreated, 0),
    unreachable: results.filter(r => r.status === 0 || r.status >= 400).map(r => r.sourceId),
  })
}
