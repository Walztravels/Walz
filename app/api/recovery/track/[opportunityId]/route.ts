// Recovery click tracker (Release 3C)
//
// GET /api/recovery/track/[opportunityId]?url=<encoded-target>
//
// Records a server-authoritative recovery_clicked CommercialEvent,
// then redirects to the target URL.
//
// Security:
//   • Target URL must start with the known BASE_URL (allowlist — no open redirect)
//   • Browser MUST NOT fire recovery_recovered or recovery_purchased — those are
//     server-authoritative (Stripe webhook, staff action)
//   • No auth required — link is inside an outbound email

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'
const FALLBACK  = BASE_URL

function isSafeRedirect(url: string): boolean {
  try {
    const parsed = new URL(url)
    const base   = new URL(BASE_URL)
    return parsed.hostname === base.hostname
  } catch {
    return false
  }
}

export async function GET(
  req:    NextRequest,
  { params }: { params: { opportunityId: string } }
) {
  const { opportunityId } = params
  const rawUrl = req.nextUrl.searchParams.get('url') ?? ''
  const targetUrl = isSafeRedirect(rawUrl) ? rawUrl : FALLBACK

  // Record click — best-effort, never blocks the redirect
  if (opportunityId) {
    try {
      const opp = await prisma.recoveryOpportunity.findUnique({
        where:  { id: opportunityId },
        select: { leadId: true, userId: true, type: true, status: true },
      })
      if (opp && !['RECOVERED', 'LOST', 'DISMISSED'].includes(opp.status)) {
        await Promise.all([
          prisma.commercialEvent.create({
            data: {
              event:    'recovery_clicked',
              leadId:   opp.leadId ?? null,
              userId:   opp.userId ?? null,
              metadata: { opportunityId, type: opp.type },
            },
          }),
          prisma.recoveryOpportunity.update({
            where: { id: opportunityId },
            data:  { lastActivityAt: new Date() },
          }),
        ])
      }
    } catch { /* never block redirect for tracking errors */ }
  }

  return NextResponse.redirect(targetUrl, { status: 302 })
}
