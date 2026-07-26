/** POST /api/jade/visa-score — honest visa approval probability */
import { NextRequest, NextResponse } from 'next/server'
import { calculateVisaProbability } from '@/lib/jade/intelligence-v2'
import type { VisaApplicantProfile } from '@/lib/jade/intelligence-v2'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<VisaApplicantProfile>
    if (!body.destination || !body.nationality) {
      return NextResponse.json({ error: 'nationality and destination requirsd' }, { status: 400 })
    }

    const profile: VisaApplicantProfile = {
      nationality:        body.nationality,
      destination:        body.destination,
      purposeOfVisit:     body.purposeOfVisit ?? 'tourism',
      employmentStatus:   body.employmentStatus ?? 'employed',
      incomeCurrency:     body.incomeCurrency ?? 'NGN',
      monthsOfBankHistory: body.monthsOfBankHistory ?? 6,
      averageBalanceLocal: body.averageBalanceLocal ?? 0,
      intendedStayDays:   body.intendedStayDays ?? 14,
      propertyOwned:      body.propertyOwned ?? false,
      marriedWithFamily:  body.marriedWithFamily ?? false,
      previousRefusals:   body.previousRefusals ?? 0,
      previousTravel:     body.previousTravel ?? [],
      hasSponsor:         body.hasSponsor ?? false,
      sponsorRelation:    body.sponsorRelation,
    }

    return NextResponse.json(calculateVisaProbability(profile))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
