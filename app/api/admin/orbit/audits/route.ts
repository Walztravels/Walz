import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { prisma } from '@/lib/db'

const SUPER_ADMIN = 'super_admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const audits = await prisma.orbitAudit.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, siteUrl: true, status: true, score: true,
      pagesTotal: true, pagesDone: true,
      issuesCritical: true, issuesHigh: true, issuesMedium: true, issuesLow: true,
      triggeredBy: true, createdAt: true, startedAt: true, completedAt: true, error: true,
    },
  })

  return NextResponse.json({ audits })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== SUPER_ADMIN) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const settings = await prisma.orbitSettings.findUnique({ where: { id: 'singleton' } })
  const siteUrl = (body.siteUrl as string | undefined) ?? settings?.siteUrl ?? 'https://www.walztravels.com'

  const audit = await prisma.orbitAudit.create({
    data: { siteUrl, triggeredBy: session.email },
  })

  await prisma.orbitAuditLog.create({
    data: {
      auditId: audit.id,
      action: 'audit_created',
      actor: session.email,
      detail: { siteUrl },
    },
  })

  // Kick off the background process (fire-and-forget — client polls for status)
  // Uses the CRON_SECRET bearer token so middleware lets it through without a cookie
  const processUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'}/api/admin/orbit/audits/${audit.id}/process`
  fetch(processUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET ?? ''}` },
  }).catch(() => { /* non-fatal — client can manually retry */ })

  return NextResponse.json({ auditId: audit.id }, { status: 201 })
}
