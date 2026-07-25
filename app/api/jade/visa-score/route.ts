// app/api/jade/visa-score/route.ts
// Visa Approval Probability Engine — public endpoint (Feature 8)
// Powers both Jade tool calls and a future public visa calculator page

import { NextRequest, NextResponse } from 'next/server'
import { assessVisaProbability, saveVisaAssessment } from '@/lib/jade/intelligence-v2'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const required = ['nationality', 'destination', 'employmentStatus', 'intendedStayDays', 'averageBalanceLocal', 'incomeCurrency', 'monthsOfBankHistory']
    for (const field of required) {
      if (body[field] === undefined || body[field] === null) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }

    const input = {
      nationality:         String(body.nationality),
      destination:         String(body.destination),
      employmentStatus:    body.employmentStatus as any,
      intendedStayDays:    Number(body.intendedStayDays),
      averageBalanceLocal: Number(body.averageBalanceLocal),
      incomeCurrency:      String(body.incomeCurrency),
      monthsOfBankHistory: Number(body.monthsOfBankHistory),
      propertyOwned:       body.propertyOwned ?? undefined,
      marriedWithFamily:   body.marriedWithFamily ?? undefined,
      previousRefusals:    body.previousRefusals ?? 0,
      previousTravel:      Array.isArray(body.previousTravel) ? body.previousTravel : [],
      hasSponsor:          body.hasSponsor ?? undefined,
      sponsorRelation:     body.sponsorRelation ?? undefined,
      purposeOfVisit:      body.purposeOfVisit ?? undefined,
      conversationId:      body.conversationId ?? undefined,
    }

    const assessment = assessVisaProbability(input)
    await saveVisaAssessment(assessment, input).catch(() => {})

    return NextResponse.json({ ok: true, assessment })
  } catch (e: any) {
    console.error('[jade/visa-score]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
