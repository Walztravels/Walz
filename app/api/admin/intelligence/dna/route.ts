import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { computeFinancialDna, loadFinancialInputs } from '@/lib/intelligence/financial-dna'
import { recordCaseEvent } from '@/lib/intelligence/case-events'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const records = await prisma.clientFinancialDNA.findMany({
    where: userId ? { userId } : {},
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json({ records })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  try {
    // Evidence-based aggregation over the EXISTING Bank Statement Analyzer
    // results — no re-analysis, no model call, no placeholder scores.
    const inputs = await loadFinancialInputs(userId)
    if (inputs.visaApps.length === 0 && inputs.snapshots.length === 0) {
      return NextResponse.json({ error: 'No applications or stored bank analyses exist for this client yet.' }, { status: 404 })
    }
    const dna = await computeFinancialDna({
      declaredIncomeRaw: inputs.declaredIncomeRaw,
      snapshots: inputs.snapshots,
      tripCost:  inputs.tripCost,
    })

    const latestBalance  = dna.closingBalance.value
    const latestCurrency = 'currency' in dna.closingBalance ? dna.closingBalance.currency : null
    const rowValues = {
      analysisCount:   dna.snapshotsUsed,
      // Legacy placeholder score columns are retired — zero, never faked.
      averageScore: 0, peakScore: 0, lowestScore: 0, scoreDelta: 0,
      balanceDelta:    dna.balanceTrend.deltaPct ?? 0,
      latestBalance:   latestBalance ?? 0,
      latestCurrency:  latestCurrency ?? 'NGN',
      latestStatus:    inputs.snapshots[0]?.status ?? 'unknown',
      provenTraveller: inputs.successCount > 0,
      successCount:    inputs.successCount,
      // The real evidence-attributed output lives here.
      scoreHistory:    dna as unknown as Prisma.InputJsonValue,
    }
    const record = await prisma.clientFinancialDNA.upsert({
      where:  { userId },
      update: rowValues,
      create: { userId, ...rowValues },
    })

    if (inputs.latestApplicationId) {
      await recordCaseEvent({
        applicationId: inputs.latestApplicationId,
        eventType: 'financial_dna_run',
        actor: session.email ?? 'admin',
        refType: 'ClientFinancialDNA', refId: record.id,
        summary: `Financial DNA computed from ${dna.snapshotsUsed} stored analysis/analyses — ${dna.reviewItems.length} review item${dna.reviewItems.length === 1 ? '' : 's'}`,
        metadata: { snapshotsUsed: dna.snapshotsUsed, reviewItems: dna.reviewItems.length, version: dna.version },
      })
    }

    return NextResponse.json({ record, dna })
  } catch (e) {
    console.error('[financial-dna]', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
    return NextResponse.json({ error: 'Financial DNA computation failed. Please try again.' }, { status: 500 })
  }
}
