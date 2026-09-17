import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { computeReadinessForUser } from '@/lib/intelligence/readiness'
import { recordCaseEvent } from '@/lib/intelligence/case-events'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const riskBand = searchParams.get('riskBand')

  const where: Record<string, string> = {}
  if (userId) where.userId = userId
  if (riskBand) where.riskBand = riskBand

  const scores = await prisma.clientRiskScore.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ scores })
}

/**
 * INT-3: APPLICATION READINESS — fully deterministic and explainable.
 * The randomized placeholder scorer is gone; every number below is
 * computed from case evidence with the formula documented in
 * lib/intelligence/readiness.ts, and every dimension carries its
 * evidence and issues. Dimensions without data are excluded, never
 * defaulted. This is an internal readiness indicator — NOT a visa
 * approval probability, and it is never presented as one.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  try {
    const result = await computeReadinessForUser(userId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 })
    const r = result.readiness

    // Deterministic payment reliability from actual payment history (the
    // one dimension the old scorer computed honestly — kept, but with no
    // fabricated floor when there is no history).
    const payments = await prisma.portalPayment.findMany({ where: { userId }, select: { status: true } })
    const paymentReliability = payments.length > 0
      ? Math.round((payments.filter(p => p.status === 'completed' || p.status === 'succeeded').length / payments.length) * 100)
      : null

    const dim = (key: string) => r.dimensions.find(d => d.key === key)?.score ?? null
    const scored = [
      dim('identityConsistency'), dim('documentCompleteness'),
      dim('financialConsistency'), dim('financialFunding'),
      dim('travelConsistency'), dim('employmentEvidence'),
      paymentReliability,
    ].filter((s): s is number => s != null)
    const overallScore = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 0
    const riskBand = scored.length === 0 ? 'insufficient_data'
      : overallScore >= 80 ? 'green' : overallScore >= 60 ? 'yellow' : overallScore >= 40 ? 'orange' : 'red'

    const score = await prisma.clientRiskScore.upsert({
      where: { userId },
      update: {
        applicationQuality:  dim('identityConsistency') ?? 0,
        documentReliability: dim('documentCompleteness') ?? 0,
        paymentReliability:  paymentReliability ?? 0,
        communicationScore:  0,   // no communication instrumentation yet — never invented
        visaSuccessRate:     dim('financialFunding') ?? 0,
        overallScore, riskBand,
        notes: JSON.stringify(r).slice(0, 8000),
        updatedAt: new Date(),
      },
      create: {
        userId,
        applicationQuality:  dim('identityConsistency') ?? 0,
        documentReliability: dim('documentCompleteness') ?? 0,
        paymentReliability:  paymentReliability ?? 0,
        communicationScore:  0,
        visaSuccessRate:     dim('financialFunding') ?? 0,
        overallScore, riskBand,
        notes: JSON.stringify(r).slice(0, 8000),
      },
    })

    await recordCaseEvent({
      applicationId: result.applicationId,
      eventType: 'readiness_run',
      actor: session.email ?? 'admin',
      refType: 'ClientRiskScore', refId: score.id,
      summary: `Readiness ${r.overall ?? '—'}/100 across ${r.dimensionsScored} scored dimension${r.dimensionsScored === 1 ? '' : 's'}`,
      metadata: { overall: r.overall, dimensionsScored: r.dimensionsScored, version: r.version },
    })

    return NextResponse.json({ score, readiness: r, paymentReliability })
  } catch (e) {
    console.error('[cris]', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
    return NextResponse.json({ error: 'Readiness computation failed. Please try again.' }, { status: 500 })
  }
}
