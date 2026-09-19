import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { botChatwootOrNull, logChatwootUnconfigured } from '@/lib/chatwoot/config'
import { runSlaEscalationSweep } from '@/lib/inbox/sla-escalation'

export const dynamic = 'force-dynamic'

// SLA Escalation System (INBOX-SLA-1) — additive, staged (30/60/90/120min)
// staff notifications driven off real Chatwoot message history, independent
// of the 30-minute private-note logic below. Runs on every invocation of
// this route regardless of which branch the legacy logic below takes (an
// empty `stale` bucket, or Chatwoot being unconfigured, must not skip the
// 60/90/120-minute stages for conversations the legacy bucket isn't
// currently looking at). Never allowed to affect the legacy response.
async function runSlaSweepSafely(): Promise<Awaited<ReturnType<typeof runSlaEscalationSweep>> | null> {
  try {
    return await runSlaEscalationSweep()
  } catch (e) {
    console.error('[cron:sla-escalation] Sweep failed:', e)
    return null
  }
}

export async function GET(req: NextRequest) {
  // Vercel cron authorization
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = getSupabaseAdmin()
  const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // Conversations that have been active for > 30 minutes
  const { data: stale } = await supabase
    .from('ConversationRoute')
    .select('id, chatwootConversationId, assignedToName, assignedAt, messagePreview')
    .eq('status', 'active')
    .lt('assignedAt', threshold)

  if (!stale?.length) {
    const sla = await runSlaSweepSafely()
    return NextResponse.json({ escalated: 0, sla })
  }

  const cw = botChatwootOrNull()
  if (!cw) {
    logChatwootUnconfigured('routing-escalation')
    const sla = await runSlaSweepSafely()
    return NextResponse.json({ ok: false, error: 'Chatwoot not configured', sla }, { status: 503 })
  }
  const chatwootBase  = process.env.CHATWOOT_BASE_URL   ?? 'https://chat.walztravels.com'
  const chatwootToken = cw.token
  const accountId     = cw.accountId

  let escalated = 0

  for (const route of stale) {
    try {
      // Add private note in Chatwoot — historical/visible evidence that the
      // 30-minute threshold was crossed. Preserved as-is.
      await fetch(
        `${chatwootBase}/api/v1/accounts/${accountId}/conversations/${route.chatwootConversationId}/messages`,
        {
          method:  'POST',
          headers: { api_access_token: chatwootToken, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            content:       `⚠️ Escalation: This conversation has been unattended for over 30 minutes. Originally assigned to ${route.assignedToName}.`,
            message_type:  2, // private note
            private:       true,
          }),
        },
      ).catch(() => {})

      // POLICY (approved 2026-09-18): automatic reassignment/takeover at 30
      // minutes is DISABLED. This block previously reassigned the Chatwoot
      // conversation to the first isAutoAssignable() escalation agent —
      // that transferred ownership away from the originally-assigned agent,
      // which conflicts with the approved SLA policy (notify-only through
      // 30/60/90/120 minutes; reassignment is a separate, not-yet-approved
      // policy). Ownership must NOT change here. isAutoAssignable() and the
      // Michael/Jade non-routable protection remain fully intact and in use
      // elsewhere (lib/conversation-router.ts for normal routing,
      // lib/inbox/sla-escalation.ts for SLA notification recipients) — this
      // route simply no longer calls the Chatwoot /assignments endpoint.
      //
      // Notification of the assigned agent/manager/escalation group at
      // 30/60/90/120 minutes is now handled by runSlaSweepSafely() below
      // (lib/inbox/sla-escalation.ts), which sends real staff notifications
      // without ever mutating Chatwoot's assignee or ConversationRoute's
      // assignedTo/assignedToName.

      escalated++
    } catch (e) {
      console.error('[cron:escalation] Error processing route:', route.id, e)
    }
  }

  // Bulk mark as escalated
  const ids = stale.map(r => r.id)
  await supabase
    .from('ConversationRoute')
    .update({ status: 'escalated' })
    .in('id', ids)

  console.log(`[cron:escalation] Escalated ${escalated}/${stale.length} conversations`)

  const sla = await runSlaSweepSafely()
  return NextResponse.json({ escalated, total: stale.length, sla })
}
