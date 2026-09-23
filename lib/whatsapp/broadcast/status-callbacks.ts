/**
 * WhatsApp Broadcast V1 — Meta delivery-status callback handling.
 *
 * Lives in its own module so the extension to
 * app/api/webhooks/whatsapp/route.ts is a few lines rather than a rewrite:
 * the existing inbound-message behaviour, the existing signature check and
 * the existing `read` → Supabase `messages.read_at` update are all
 * untouched, and this runs ALONGSIDE them.
 *
 * ── WHY THIS DOES NOT REGRESS THE 1:1 PATH ──────────────────────────────
 * The webhook previously acted on `statuses[0]` only, and only when
 * `status === 'read'`. That behaviour is preserved EXACTLY (same Supabase
 * table, same column, same predicate). What is added is:
 *   - iterating ALL statuses in the payload rather than only the first,
 *     for BROADCAST attribution only;
 *   - matching each status's message id against
 *     whatsapp_broadcast_recipients.meta_message_id.
 * A message id that belongs to a 1:1 reply simply matches no recipient
 * row, so nothing happens — the two paths cannot collide because a wamid
 * is globally unique and a given wamid is either a broadcast send or it is
 * not.
 *
 * ── OUT-OF-ORDER CALLBACKS ──────────────────────────────────────────────
 * Meta redelivers callbacks and does not guarantee ordering; a `delivered`
 * routinely lands after a `read`. Every update below is a conditional
 * updateMany gated on the CURRENT status, so a stale callback matches zero
 * rows and is silently ignored rather than walking a recipient backwards.
 */

import prisma from '@/lib/db'
import { isForwardProgress } from './lifecycle'
import { recomputeBroadcastCounts } from './processor'

/** The Meta status values we act on. */
export type MetaStatusValue = 'sent' | 'delivered' | 'read' | 'failed'

export interface MetaStatusEvent {
  id: string
  status: string
  timestamp?: string
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>
}

const STATUS_MAP: Record<MetaStatusValue, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
}

function isHandled(v: string): v is MetaStatusValue {
  return v === 'sent' || v === 'delivered' || v === 'read' || v === 'failed'
}

/** Meta timestamps are seconds-since-epoch strings. */
function parseTimestamp(ts: string | undefined, fallback: Date): Date {
  if (!ts) return fallback
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return new Date(n * 1000)
}

export interface CallbackResult {
  matched: number
  applied: number
  broadcastsTouched: string[]
}

/**
 * Apply a batch of Meta status callbacks to broadcast recipient rows.
 *
 * Returns quietly (matched: 0) for any id that is not a broadcast send —
 * which is every 1:1 Inbox reply. Never throws: the webhook must keep
 * returning 200 or Meta floods the endpoint with retries.
 */
export async function applyBroadcastStatusCallbacks(
  statuses: MetaStatusEvent[],
  now: Date = new Date(),
): Promise<CallbackResult> {
  const result: CallbackResult = { matched: 0, applied: 0, broadcastsTouched: [] }

  const handled = statuses.filter(s => s && typeof s.id === 'string' && isHandled(s.status))
  if (handled.length === 0) return result

  let rows: Array<{ id: string; broadcastId: string; status: string; metaMessageId: string | null }>
  try {
    rows = await prisma.whatsAppBroadcastRecipient.findMany({
      where: { metaMessageId: { in: handled.map(s => s.id) } },
      select: { id: true, broadcastId: true, status: true, metaMessageId: true },
    })
  } catch (e) {
    console.warn('[wa-webhook] broadcast status lookup failed:', (e as Error)?.message)
    return result
  }
  if (rows.length === 0) return result

  const byMessageId = new Map(rows.map(r => [r.metaMessageId as string, r]))
  const touched = new Set<string>()

  for (const event of handled) {
    const row = byMessageId.get(event.id)
    if (!row) continue
    result.matched += 1

    const next = STATUS_MAP[event.status as MetaStatusValue]
    const at = parseTimestamp(event.timestamp, now)

    try {
      if (next === 'FAILED') {
        const err = event.errors?.[0]
        // A failure is authoritative from any non-terminal state.
        const res = await prisma.whatsAppBroadcastRecipient.updateMany({
          where: { id: row.id, status: { in: ['SENDING', 'SENT', 'DELIVERED'] } },
          data: {
            status: 'FAILED',
            failedAt: at,
            failureCode: err?.code !== undefined ? String(err.code) : 'META_FAILED',
            failureReason: (err?.error_data?.details ?? err?.message ?? err?.title ?? 'Meta reported failure').slice(0, 300),
          },
        })
        result.applied += res.count
        if (res.count > 0) touched.add(row.broadcastId)
        continue
      }

      // Forward progress only — a stale/duplicate callback is a no-op.
      if (!isForwardProgress(row.status, next)) continue

      const timestampField =
        next === 'SENT' ? { sentAt: at } : next === 'DELIVERED' ? { deliveredAt: at } : { readAt: at }

      // Conditional on the status we read, so two concurrent webhook
      // deliveries cannot both apply the same transition.
      const res = await prisma.whatsAppBroadcastRecipient.updateMany({
        where: { id: row.id, status: row.status },
        data: { status: next, ...timestampField },
      })
      result.applied += res.count
      if (res.count > 0) {
        touched.add(row.broadcastId)
        row.status = next // keep the local view honest for repeats in this batch
      }
    } catch (e) {
      console.warn('[wa-webhook] broadcast status update failed:', (e as Error)?.message)
    }
  }

  // Counters are RECOMPUTED from the rows (never incremented), so a
  // redelivered callback cannot inflate them.
  for (const broadcastId of touched) {
    try {
      await recomputeBroadcastCounts(broadcastId)
      result.broadcastsTouched.push(broadcastId)
    } catch (e) {
      console.warn('[wa-webhook] broadcast count recompute failed:', (e as Error)?.message)
    }
  }

  return result
}

// ── WhatsApp Broadcast V1.2.1: Twilio delivery-status callback handling ────
//
// Twilio POSTs ONE status per request (unlike Meta's batched array), to
// app/api/webhooks/twilio-whatsapp/broadcast-status/route.ts, which does
// signature verification and form-parsing (mirroring the proven shell of
// the existing app/api/webhooks/twilio-whatsapp/status/route.ts) and then
// calls this function with the parsed MessageSid/MessageStatus/error
// fields. The RECIPIENT UPDATE LOGIC below reuses the exact same
// forward-progress + recompute-counts discipline as
// applyBroadcastStatusCallbacks() above, adapted to match by
// providerMessageId (Twilio's SID) instead of metaMessageId, and to
// Twilio's lowercase status vocabulary.

/** The Twilio WhatsApp status values we act on. */
export type TwilioStatusValue = 'sent' | 'delivered' | 'read' | 'failed' | 'undelivered'

function isHandledTwilioStatus(v: string): v is TwilioStatusValue {
  return v === 'sent' || v === 'delivered' || v === 'read' || v === 'failed' || v === 'undelivered'
}

const TWILIO_STATUS_MAP: Record<TwilioStatusValue, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
  // Twilio's 'undelivered' has no separate recipient status in this
  // schema — it means the same thing operationally as 'failed' (the
  // message did not reach the recipient) and is recorded as FAILED with
  // its own real error code/reason preserved, never silently merged away.
  undelivered: 'FAILED',
}

export interface ApplyTwilioStatusResult {
  matched: boolean
  applied: boolean
  broadcastId: string | null
}

/**
 * Apply ONE Twilio status callback to the matching broadcast recipient
 * row. Returns quietly (matched: false) for a MessageSid that belongs to
 * no broadcast recipient — every visa-thread and chat-drawer Twilio send
 * uses a different SID space, so this can never collide with them.
 * Never throws: the webhook must keep returning 200/TwiML or Twilio
 * floods the endpoint with retries. Idempotent/replay-safe: a redelivered
 * identical callback finds the row already at or past that status and the
 * conditional updateMany matches zero rows.
 */
export async function applyTwilioBroadcastStatusCallback(event: {
  messageSid: string
  status: string
  errorCode?: string | null
  errorMessage?: string | null
  now?: Date
}): Promise<ApplyTwilioStatusResult> {
  const now = event.now ?? new Date()
  if (!isHandledTwilioStatus(event.status)) return { matched: false, applied: false, broadcastId: null }

  let row: { id: string; broadcastId: string; status: string } | null
  try {
    row = await prisma.whatsAppBroadcastRecipient.findUnique({
      where: { providerMessageId: event.messageSid },
      select: { id: true, broadcastId: true, status: true },
    })
  } catch (e) {
    console.warn('[twilio-broadcast-status] lookup failed:', (e as Error)?.message)
    return { matched: false, applied: false, broadcastId: null }
  }
  if (!row) return { matched: false, applied: false, broadcastId: null }

  const next = TWILIO_STATUS_MAP[event.status as TwilioStatusValue]
  let applied = false

  try {
    if (next === 'FAILED') {
      // A failure is authoritative from any non-terminal state — same
      // exclusion set as the Meta version.
      const res = await prisma.whatsAppBroadcastRecipient.updateMany({
        where: { id: row.id, status: { in: ['SENDING', 'SENT', 'DELIVERED'] } },
        data: {
          status: 'FAILED',
          failedAt: now,
          failureCode: event.errorCode ?? 'TWILIO_FAILED',
          failureReason: (event.errorMessage ?? 'Twilio reported failure').slice(0, 300),
        },
      })
      applied = res.count > 0
    } else if (isForwardProgress(row.status, next)) {
      const timestampField =
        next === 'SENT' ? { sentAt: now } : next === 'DELIVERED' ? { deliveredAt: now } : { readAt: now }
      // Conditional on the status we read, so two concurrent webhook
      // deliveries (or a replay) cannot both apply the same transition.
      const res = await prisma.whatsAppBroadcastRecipient.updateMany({
        where: { id: row.id, status: row.status },
        data: { status: next, ...timestampField },
      })
      applied = res.count > 0
    }
    // else: not forward progress (stale/duplicate/out-of-order callback) — a silent no-op.
  } catch (e) {
    console.warn('[twilio-broadcast-status] update failed:', (e as Error)?.message)
    return { matched: true, applied: false, broadcastId: row.broadcastId }
  }

  if (applied) {
    try {
      await recomputeBroadcastCounts(row.broadcastId)
    } catch (e) {
      console.warn('[twilio-broadcast-status] count recompute failed:', (e as Error)?.message)
    }
  }

  return { matched: true, applied, broadcastId: row.broadcastId }
}
