import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// P1 security hotfix (2026-09-19), Fix 1: this route returned the FULL
// RoutingAgent roster (email, chatwootAgentId, sipAddress, aircallUserId)
// plus live ConversationRoute assignment counts to ANY authenticated staff
// member — no permission check at all. That is the same email→Chatwoot
// identity mapping data the routing-agent mutation exploit needed, gated
// here with the same 'settings_integrations' permission already used by
// app/api/admin/routing/agents/route.ts and its siblings.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const authz = checkInboxPermission(session, 'settings_integrations')
  if (!authz.allowed) {
    console.error('[routing] permission denied for', session.email)
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }

  const supabase = getSupabaseAdmin()

  const [{ data: agents }, { data: activeCounts }, { data: todayCalls }, { data: recentRoutes }] =
    await Promise.all([
      supabase.from('RoutingAgent').select('*').order('isEscalation').order('createdAt'),
      supabase.from('ConversationRoute').select('assignedTo').eq('status', 'active'),
      supabase
        .from('ConversationRoute')
        .select('assignedTo')
        .eq('channel', 'voice')
        .gte('createdAt', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabase
        .from('ConversationRoute')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(20),
    ])

  const openMap: Record<string, number>  = {}
  const callMap: Record<string, number>  = {}

  for (const r of activeCounts ?? []) openMap[r.assignedTo] = (openMap[r.assignedTo] ?? 0) + 1
  for (const r of todayCalls  ?? []) callMap[r.assignedTo]  = (callMap[r.assignedTo]  ?? 0) + 1

  return NextResponse.json({
    agents: (agents ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      openCount:  openMap[a.id as string] ?? 0,
      callsToday: callMap[a.id as string] ?? 0,
    })),
    recentRoutes: recentRoutes ?? [],
  })
}
