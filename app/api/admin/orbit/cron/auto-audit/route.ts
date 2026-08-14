/**
 * Orbit auto-audit cron handler.
 * Vercel calls GET /api/admin/orbit/cron/auto-audit on schedule.
 * Creates and triggers an audit if the site hasn't been audited recently.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { notifyAuditComplete } from '@/lib/orbit/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FREQUENCY_DAYS: Record<string, number> = {
  daily:      1,
  weekly:     7,
  fortnightly: 14,
  monthly:    30,
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  if (!settings?.siteUrl) {
    return NextResponse.json({ skipped: true, reason: 'No siteUrl configured in Orbit Settings' })
  }

  const daysNeeded = FREQUENCY_DAYS[settings.publishingFrequency] ?? 7

  // Find the most recent completed audit
  const lastAudit = await prisma.orbitAudit.findFirst({
    where: { status: 'complete' },
    orderBy: { completedAt: 'desc' },
  })

  if (lastAudit?.completedAt) {
    const daysSince = (Date.now() - lastAudit.completedAt.getTime()) / 86_400_000
    if (daysSince < daysNeeded) {
      return NextResponse.json({
        skipped: true,
        reason: `Last audit ${daysSince.toFixed(1)}d ago — next due in ${(daysNeeded - daysSince).toFixed(1)}d`,
      })
    }
  }

  // Create a new audit record
  const audit = await prisma.orbitAudit.create({
    data: { siteUrl: settings.siteUrl, status: 'queued', triggeredBy: 'cron:auto-audit' },
  })

  // Trigger the audit processor (same route as manual runs)
  const processUrl = `${settings.siteUrl}/api/admin/orbit/audits/${audit.id}/process`
  try {
    const res = await fetch(processUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    })

    if (!res.ok) {
      const msg = await res.text()
      await prisma.orbitAudit.update({
        where: { id: audit.id },
        data: { status: 'failed', error: `Processor ${res.status}: ${msg.slice(0, 200)}` },
      })
      return NextResponse.json({ error: 'Audit processor failed', auditId: audit.id }, { status: 500 })
    }

    // Re-read audit after processing completes
    const updated = await prisma.orbitAudit.findUnique({ where: { id: audit.id } })

    // Email notification
    if (settings.notificationsEmail && updated?.status === 'complete') {
      notifyAuditComplete({
        email: settings.notificationsEmail,
        auditId: audit.id,
        siteUrl: settings.siteUrl,
        score:           updated.score,
        issuesCritical:  updated.issuesCritical,
        issuesHigh:      updated.issuesHigh,
        issuesMedium:    updated.issuesMedium,
        issuesLow:       updated.issuesLow,
      })
    }

    return NextResponse.json({ triggered: true, auditId: audit.id, status: updated?.status })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.orbitAudit.update({
      where: { id: audit.id },
      data: { status: 'failed', error: msg },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
