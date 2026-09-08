import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { hasRecruitmentPermission, DEFAULT_PIPELINE_STAGES } from '@/lib/recruitment/core'

export const dynamic = 'force-dynamic'

// GET — live recruitment analytics computed from the database. Aggregate
// counts only; no candidate PII leaves this endpoint beyond job funnels.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasRecruitmentPermission(session, 'recruitment.analytics.view')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const [
      totalApplications, totalCandidates, applications30d,
      stageCounts, sourceCounts, jobs, offers, hiredHistory, poolCount,
    ] = await Promise.all([
      prisma.jobApplication.count(),
      prisma.candidate.count(),
      prisma.jobApplication.count({ where: { createdAt: { gte: since30 } } }),
      prisma.jobApplication.groupBy({ by: ['stageKey'], _count: { _all: true } }),
      prisma.jobApplication.groupBy({ by: ['howHeard'], _count: { _all: true } }),
      prisma.jobOpening.findMany({
        where:  { status: { in: ['published', 'paused', 'closed'] } },
        select: { id: true, title: true, status: true },
        orderBy: { sortOrder: 'asc' },
        take: 50,
      }),
      prisma.jobOffer.groupBy({ by: ['status'], _count: { _all: true } }),
      // time-to-hire: application creation → the history entry that moved it to hired
      prisma.applicationStageHistory.findMany({
        where:  { toKey: 'hired' },
        select: { createdAt: true, application: { select: { createdAt: true } } },
        take:   500,
      }),
      prisma.talentPoolEntry.count(),
    ])

    // Per-job funnels (one grouped query, mapped client-side of the DB).
    const perJob = await prisma.jobApplication.groupBy({
      by: ['jobId', 'stageKey'], _count: { _all: true },
    })
    const stageLabel = Object.fromEntries(DEFAULT_PIPELINE_STAGES.map(s => [s.key, s.label]))
    const funnels = jobs.map((job: { id: string; title: string; status: string }) => ({
      jobId: job.id,
      title: job.title,
      status: job.status,
      total: perJob.filter((r: { jobId: string }) => r.jobId === job.id)
        .reduce((s: number, r: { _count: { _all: number } }) => s + r._count._all, 0),
      stages: perJob.filter((r: { jobId: string }) => r.jobId === job.id)
        .map((r: { stageKey: string; _count: { _all: number } }) => ({
          key: r.stageKey, label: stageLabel[r.stageKey] ?? r.stageKey, count: r._count._all,
        })),
    }))

    const hireDays = hiredHistory
      .map((h: { createdAt: Date; application: { createdAt: Date } | null }) =>
        h.application ? (h.createdAt.getTime() - h.application.createdAt.getTime()) / 86_400_000 : null)
      .filter((d: number | null): d is number => d !== null && d >= 0)
    const avgTimeToHireDays = hireDays.length > 0
      ? Math.round(hireDays.reduce((a: number, b: number) => a + b, 0) / hireDays.length)
      : null

    return NextResponse.json({
      totals: {
        applications: totalApplications,
        candidates:   totalCandidates,
        applications30d,
        hired: stageCounts.find((s: { stageKey: string }) => s.stageKey === 'hired')?._count._all ?? 0,
        talentPool: poolCount,
      },
      stages: stageCounts.map((s: { stageKey: string; _count: { _all: number } }) => ({
        key: s.stageKey, label: stageLabel[s.stageKey] ?? s.stageKey, count: s._count._all,
      })),
      sources: sourceCounts
        .map((s: { howHeard: string | null; _count: { _all: number } }) => ({
          source: s.howHeard ?? 'Not stated', count: s._count._all,
        }))
        .sort((a: { count: number }, b: { count: number }) => b.count - a.count)
        .slice(0, 10),
      offers: offers.map((o: { status: string; _count: { _all: number } }) => ({
        status: o.status, count: o._count._all,
      })),
      funnels,
      avgTimeToHireDays,
      hiresMeasured: hireDays.length,
    })
  } catch (err) {
    console.error('[recruitment analytics GET]', err)
    return NextResponse.json({ error: 'Failed to compute analytics' }, { status: 500 })
  }
}
