/**
 * WhatsApp Broadcast V1 — campaign detail.
 *
 * Every number returned is computed from the whatsapp_broadcast_recipients
 * rows at request time (a groupBy), never read from a stored counter that
 * could have drifted. There are no placeholder or estimated figures
 * anywhere in this response.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { maskNumber } from '@/lib/whatsapp/broadcast/audience'
import { DISPATCHED_STATUSES, SKIPPED_STATUSES } from '@/lib/whatsapp/broadcast/lifecycle'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const broadcast = await prisma.whatsAppBroadcast.findUnique({ where: { id: params.id } })
  if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  const groups = await prisma.whatsAppBroadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId: params.id },
    _count: { _all: true },
  })
  const by = (s: string) => groups.find(g => g.status === s)?._count._all ?? 0

  const counts = {
    total: groups.reduce((n, g) => n + g._count._all, 0),
    queued: by('QUEUED'),
    sending: by('SENDING'),
    sent: by('SENT'),
    delivered: by('DELIVERED'),
    read: by('READ'),
    failed: by('FAILED'),
    skippedOptOut: by('SKIPPED_OPT_OUT'),
    skippedNoConsent: by('SKIPPED_NO_CONSENT'),
    skippedInvalidNumber: by('SKIPPED_INVALID_NUMBER'),
  }
  const dispatched = DISPATCHED_STATUSES.reduce((n, s) => n + by(s), 0)
  const skipped = SKIPPED_STATUSES.reduce((n, s) => n + by(s), 0)
  // 'delivered' in the product sense includes anything that got at least
  // as far as DELIVERED — a READ message was necessarily delivered.
  const deliveredOrBetter = counts.delivered + counts.read

  // Real failure reasons, grouped — no invented categories.
  const failureGroups = await prisma.whatsAppBroadcastRecipient.groupBy({
    by: ['failureCode'],
    where: { broadcastId: params.id, status: 'FAILED' },
    _count: { _all: true },
  })
  const failureSamples = await prisma.whatsAppBroadcastRecipient.findMany({
    where: { broadcastId: params.id, status: 'FAILED' },
    select: { failureCode: true, failureReason: true, normalizedNumber: true },
    take: 20,
  })

  return NextResponse.json({
    broadcast,
    counts: { ...counts, dispatched, skipped, deliveredOrBetter },
    rates: {
      // Percentages of what was actually DISPATCHED — not of the whole
      // matched audience, which would flatter the numbers.
      deliveryPct: dispatched > 0 ? Math.round((deliveredOrBetter / dispatched) * 1000) / 10 : 0,
      readPct: dispatched > 0 ? Math.round((counts.read / dispatched) * 1000) / 10 : 0,
      failurePct: counts.total > 0 ? Math.round((counts.failed / counts.total) * 1000) / 10 : 0,
    },
    failureReasons: failureGroups
      .map(g => ({
        code: g.failureCode ?? 'UNKNOWN',
        count: g._count._all,
        example:
          failureSamples.find(s => (s.failureCode ?? 'UNKNOWN') === (g.failureCode ?? 'UNKNOWN'))?.failureReason ?? null,
      }))
      .sort((a, b) => b.count - a.count),
    failureSamples: failureSamples.map(s => ({
      maskedNumber: maskNumber(s.normalizedNumber),
      code: s.failureCode,
      reason: s.failureReason,
    })),
  })
}
