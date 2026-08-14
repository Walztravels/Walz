import { NextRequest, NextResponse } from 'next/server'
import { runAudit } from '@/lib/orbit/audit-runner'
import { prisma } from '@/lib/db'
import { notifyAuditComplete } from '@/lib/orbit/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Middleware already validated the Bearer token matches CRON_SECRET.
  // Double-check here for defence in depth.
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runAudit(params.id)

    // Send email notification if configured (non-blocking)
    const [audit, settings] = await Promise.all([
      prisma.orbitAudit.findUnique({ where: { id: params.id } }),
      prisma.orbitSettings.findUnique({ where: { id: 'singleton' } }),
    ])
    if (settings?.notificationsEmail && audit?.status === 'complete') {
      notifyAuditComplete({
        email:          settings.notificationsEmail,
        auditId:        params.id,
        siteUrl:        audit.siteUrl,
        score:          audit.score,
        issuesCritical: audit.issuesCritical,
        issuesHigh:     audit.issuesHigh,
        issuesMedium:   audit.issuesMedium,
        issuesLow:      audit.issuesLow,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
