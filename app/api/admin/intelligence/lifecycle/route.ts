import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { deriveLifecycle } from '@/lib/intelligence/lifecycle'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId      = searchParams.get('userId')
  const cohortLabel = searchParams.get('cohortLabel')

  const predictions = await prisma.clientLifecyclePrediction.findMany({
    where: {
      ...(userId      ? { userId }      : {}),
      ...(cohortLabel ? { cohortLabel } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ predictions })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  // INT-6: deterministic lifecycle STATES from real records. The fixed-
  // multiplier pseudo-predictions (LTV × 2.5, two-valued churn) are gone —
  // speculative columns are zeroed, never fabricated. Note the model's
  // userId constraint means only registered Users are covered; leads and
  // email-only clients are a known limitation.
  try {
    const lifecycle = await deriveLifecycle(userId)
    if (!lifecycle) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const prediction = await prisma.clientLifecyclePrediction.upsert({
      where: { userId },
      update: {
        cohortLabel:        lifecycle.stage,
        nextServiceType:    lifecycle.nextLogicalService,
        churnReason:        lifecycle.outstandingAction,
        lastEngagementDate: lifecycle.lastEngagementDate ? new Date(lifecycle.lastEngagementDate) : null,
        // Speculative metrics retired — zero, never invented.
        predictedLTV: 0, ltv12months: 0, ltv36months: 0,
        churnProbability: 0, referralProbability: 0, upgradeReadiness: 0,
      },
      create: {
        userId,
        cohortLabel:        lifecycle.stage,
        nextServiceType:    lifecycle.nextLogicalService,
        churnReason:        lifecycle.outstandingAction,
        lastEngagementDate: lifecycle.lastEngagementDate ? new Date(lifecycle.lastEngagementDate) : null,
        predictedLTV: 0, ltv12months: 0, ltv36months: 0,
        churnProbability: 0, referralProbability: 0, upgradeReadiness: 0,
      },
    })

    return NextResponse.json({ prediction, lifecycle })
  } catch (e) {
    console.error('[lifecycle]', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
    return NextResponse.json({ error: 'Lifecycle derivation failed. Please try again.' }, { status: 500 })
  }
}
