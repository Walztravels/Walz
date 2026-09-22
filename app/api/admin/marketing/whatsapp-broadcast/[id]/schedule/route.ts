/**
 * WhatsApp Broadcast V1 — approve & queue (or schedule) a campaign.
 *
 * THIS IS THE ONLY HUMAN SEND ACTION IN THE FEATURE, and it does not send
 * anything: it resolves the audience, WRITES THE SNAPSHOT, and moves the
 * broadcast to QUEUED or SCHEDULED. The cron processor does the dispatch,
 * minutes later, from the rows written here.
 *
 * ── THE SNAPSHOT ────────────────────────────────────────────────────────
 * Creating the whatsapp_broadcast_recipients rows IS the snapshot. After
 * this request returns, nothing in the system re-queries Lead or
 * WhatsAppConsent for this broadcast ever again — the processor's scan
 * predicate is `broadcastId` + `status: 'QUEUED'` over existing rows only.
 * So a lead created, edited, opted out or granted consent AFTER approval
 * can neither join nor leave an already-approved campaign. The only way
 * to change an approved audience is to cancel and start again.
 *
 * ── DOUBLE-SUBMIT ───────────────────────────────────────────────────────
 * Three independent guards:
 *   1. canScheduleBroadcast() rejects anything already past READY;
 *   2. the status flip out of DRAFT/READY is a conditional updateMany
 *      whose affected count is checked, so of two racing requests only
 *      one proceeds to write rows;
 *   3. UNIQUE(broadcast_id, normalized_number) in Postgres makes a
 *      duplicate recipient physically impossible even if 1 and 2 were
 *      both somehow defeated. createMany({ skipDuplicates: true }) makes
 *      that a no-op rather than a 500.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireBroadcastAccess } from '@/lib/whatsapp/broadcast/rbac'
import { parseTargetFilter, resolveAudience } from '@/lib/whatsapp/broadcast/audience'
import { validateTemplateDefinition } from '@/lib/whatsapp/broadcast/template'
import { canScheduleBroadcast, SCHEDULABLE_FROM } from '@/lib/whatsapp/broadcast/lifecycle'
import { getWhatsAppReadiness } from '@/lib/whatsapp/config'

export const dynamic = 'force-dynamic'

/** Refuse absurd campaigns outright rather than half-writing one. */
const MAX_APPROVED_RECIPIENTS = 5000

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireBroadcastAccess()
  if (!access.ok) return access.response

  let body: { mode?: 'send' | 'schedule'; scheduledAt?: string; confirmedCount?: number }
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }
  const mode = body.mode === 'schedule' ? 'schedule' : 'send'

  const broadcast = await prisma.whatsAppBroadcast.findUnique({ where: { id: params.id } })
  if (!broadcast) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })

  // ── Guard 1: lifecycle. ────────────────────────────────────────────────
  if (!canScheduleBroadcast(broadcast.status)) {
    return NextResponse.json(
      {
        error: `This broadcast is already ${broadcast.status} and cannot be queued again.`,
        allowedFrom: SCHEDULABLE_FROM,
      },
      { status: 409 },
    )
  }

  // ── Server-side send capability. Never a client-side env check. ───────
  const readiness = getWhatsAppReadiness()
  if (!readiness.canSend) {
    return NextResponse.json(
      { error: 'WhatsApp sending is not configured on the server.', missing: readiness.missing },
      { status: 503 },
    )
  }

  // ── Template is MANDATORY before anything is queued. No fallback. ─────
  const templateValidation = validateTemplateDefinition({
    name: broadcast.templateName,
    language: broadcast.templateLanguage,
    params: broadcast.templateParams,
  })
  if (!templateValidation.ok) {
    return NextResponse.json(
      {
        error: 'This broadcast cannot be sent: its Meta template is missing or invalid.',
        details: templateValidation.errors,
        // Said plainly so nobody expects a graceful degradation.
        note: 'Broadcasts are only ever sent as approved Meta templates. There is no free-text fallback.',
      },
      { status: 422 },
    )
  }
  const template = templateValidation.definition!

  let scheduledAt: Date | null = null
  if (mode === 'schedule') {
    const raw = body.scheduledAt ?? (broadcast.scheduledAt ? broadcast.scheduledAt.toISOString() : null)
    if (!raw) return NextResponse.json({ error: 'A scheduled time is required.' }, { status: 400 })
    scheduledAt = new Date(raw)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Scheduled time is not a valid date.' }, { status: 400 })
    }
    if (scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future.' }, { status: 400 })
    }
  }

  // ── Resolve the audience FRESH, right now. ────────────────────────────
  const filter = parseTargetFilter(broadcast.targetFilter)
  const { breakdown, recipients } = await resolveAudience({ filter, template })

  if (breakdown.finalSendCount === 0) {
    return NextResponse.json(
      {
        error: 'No recipient in this audience has recorded WhatsApp marketing consent, so there is nobody to send to.',
        breakdown,
      },
      { status: 422 },
    )
  }
  if (breakdown.finalSendCount > MAX_APPROVED_RECIPIENTS) {
    return NextResponse.json(
      { error: `This audience resolves to ${breakdown.finalSendCount} recipients, above the ${MAX_APPROVED_RECIPIENTS} safety limit.` },
      { status: 422 },
    )
  }

  // ── The confirmation screen's number must still be the truth. ─────────
  // Re-computed here, server-side; if the data moved between the
  // confirmation screen and this request, the operator is told rather than
  // silently sending to a different set of people.
  if (typeof body.confirmedCount === 'number' && body.confirmedCount !== breakdown.finalSendCount) {
    return NextResponse.json(
      {
        error: 'The audience changed since you confirmed. Review the new figures and confirm again.',
        confirmedCount: body.confirmedCount,
        currentCount: breakdown.finalSendCount,
        breakdown,
      },
      { status: 409 },
    )
  }

  const now = new Date()
  const nextStatus = mode === 'schedule' ? 'SCHEDULED' : 'QUEUED'

  // ── Guard 2: atomic status claim. Only one request may proceed. ───────
  const claimed = await prisma.whatsAppBroadcast.updateMany({
    where: { id: broadcast.id, status: { in: [...SCHEDULABLE_FROM] } },
    data: {
      status: nextStatus,
      scheduledAt,
      snapshotAt: now,
      approvedBy: access.session.email,
      audienceSnapshot: breakdown as unknown as object,
      queuedAt: mode === 'send' ? now : null,
    },
  })
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: 'This broadcast was queued by another request a moment ago.' },
      { status: 409 },
    )
  }

  // ── Write the snapshot rows. Guard 3 (the DB unique index) backs this. ─
  try {
    await prisma.whatsAppBroadcastRecipient.createMany({
      data: recipients.map(r => ({
        broadcastId: broadcast.id,
        leadId: r.leadId,
        normalizedNumber: r.normalizedNumber,
        waId: r.waId,
        templateParamsSnapshot: r.templateParamsSnapshot as unknown as object,
        status: r.status,
        queuedAt: r.status === 'QUEUED' ? now : null,
      })),
      skipDuplicates: true,
    })
  } catch (e) {
    // Roll the broadcast back so it is editable again rather than stuck in
    // a queued state with a partial snapshot.
    await prisma.whatsAppBroadcast.updateMany({
      where: { id: broadcast.id, status: nextStatus },
      data: { status: 'READY', queuedAt: null, snapshotAt: null, audienceSnapshot: undefined },
    })
    console.error('[wa-broadcast/schedule] snapshot write failed:', (e as Error)?.message)
    return NextResponse.json({ error: 'Could not write the recipient snapshot. Nothing was queued.' }, { status: 500 })
  }

  const updated = await prisma.whatsAppBroadcast.update({
    where: { id: broadcast.id },
    data: {
      recipientCount: recipients.length,
      skippedCount: recipients.filter(r => r.status.startsWith('SKIPPED_')).length,
      failedCount: recipients.filter(r => r.status === 'FAILED').length,
    },
  })

  console.info(
    `[wa-broadcast/schedule] id=${broadcast.id} mode=${mode} matched=${breakdown.totalMatched} ` +
    `eligible=${breakdown.eligible} skipped=${breakdown.optedOut + breakdown.missingConsent + breakdown.invalidNumber}`,
  )

  return NextResponse.json({ broadcast: updated, breakdown })
}
