// app/api/business/organizations/[id]/referral/route.ts
// Walz Business (Release 2.1) — the ONE explicit allow-listed action for a
// REFERRAL_PARTNER-type organization's members: viewing their OWN referral
// attribution/code/status. Every other agency/corporate surface denies
// REFERRAL_PARTNER organizations outright (see lib/business/org-type-gate.ts
// ::assertAgencyOrCorporateAccess and its explicit deny-list) — this route
// is the allow-list, so it deliberately uses the UNLAYERED
// assertOrgScopedAccess(), not that gate.
//
// KNOWN GAP (documented per the mission brief): ReferralCode
// (app/api/portal/referral/route.ts) is a PERSONAL, User-scoped model (one
// code per User.id) — there is no business-org-scoped referral-attribution
// model in this codebase today. This route surfaces the CALLING USER's own
// personal ReferralCode as a reasonable interim reuse (never creates a
// second parallel referral system), but a true org-scoped "this
// organization's referral status" (e.g. multiple members of one referral
// partner org sharing one attribution) would need a new, narrower
// business-org-scoped variant — NOT built here. Per the mission's explicit
// scope: no commission percentages, payout thresholds, eligibility windows,
// or clawback rules are modeled anywhere in this route.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Deliberately the plain org-scoped check — this IS the allow-listed
  // action for REFERRAL_PARTNER orgs, so it must not be denied by the
  // org-type gate that blocks everything else.
  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const referral = await prisma.referralCode.findUnique({ where: { userId: session.user.id } })

  return NextResponse.json({
    referral: referral ? { code: referral.code, uses: referral.uses } : null,
  })
}
