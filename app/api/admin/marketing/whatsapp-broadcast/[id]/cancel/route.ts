/**
 * WhatsApp Broadcast V1 — cancel a scheduled / queued campaign.
 *
 * Cancellable ONLY from SCHEDULED or QUEUED, i.e. strictly before the
 * processor has claimed its first recipient. Once a broadcast is SENDING
 * messages are already on Meta's wire and there is nothing to recall.
 *
 * The cancel is a conditional updateMany, so it races safely against a
 * cron tick: either the cancel wins (the tick then finds the broadcast is
 * no longer QUEUED/SENDING and skips it — see the post-flip re-read in
 * lib/whatsapp/broadcast/processor.ts) or the tick wins and the cancel is
 * refused with a truthful 409.
 *
 * The recipient rows are left intact as the audit record of what WOULD
 * have been sent; their QUEUED status is moved aside so no future tick can
 * pick them up even if the broadcast row were somehow revived.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { canCancelBroadcast, CANCELLABLE_FROM } from '@/lib/whatsapp/broadcast/lifecycle'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  const broadcast = await prisma.whatsAppBroadcast.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  })
  if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  if (!canCancelBroadcast(broadcast.status)) {
    return NextResponse.json(
      {
        error:
          broadcast.status === 'SENDING'
            ? 'This broadcast has already started sending and can no longer be cancelled.'
            : `A broadcast in ${broadcast.status} cannot be cancelled.`,
        allowedFrom: CANCELLABLE_FROM,
      },
      { status: 409 },
    )
  }

  const now = new Date()
  const cancelled = await prisma.whatsAppBroadcast.updateMany({
    where: { id: broadcast.id, status: { in: [...CANCELLABLE_FROM] } },
    data: { status: 'CANCELLED', cancelledAt: now, cancelledBy: access.session.email },
  })
  if (cancelled.count === 0) {
    return NextResponse.json(
      { error: 'The broadcast started sending before the cancellation was applied.' },
      { status: 409 },
    )
  }

  // Belt-and-braces: park every still-queued recipient so no tick can ever
  // claim one, independently of the broadcast row's status.
  const parked = await prisma.whatsAppBroadcastRecipient.updateMany({
    where: { broadcastId: broadcast.id, status: 'QUEUED' },
    data: {
      status: 'FAILED',
      failedAt: now,
      failureCode: 'BROADCAST_CANCELLED',
      failureReason: 'The broadcast was cancelled before this recipient was dispatched.',
    },
  })

  const updated = await prisma.whatsAppBroadcast.findUnique({ where: { id: broadcast.id } })
  return NextResponse.json({ broadcast: updated, cancelledRecipients: parked.count })
}
