import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { AGENTS, isAgentActive, getRoundRobinIndex } from '@/lib/agent-roster'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  // Active conversation counts per agent
  const { data: counts } = await supabase
    .from('ConversationRoute')
    .select('assignedTo')
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of counts ?? []) {
    countMap[row.assignedTo] = (countMap[row.assignedTo] ?? 0) + 1
  }

  // Recent assignment counts (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('ConversationRoute')
    .select('assignedTo')
    .gte('createdAt', since)

  const recentMap: Record<string, number> = {}
  for (const row of recent ?? []) {
    recentMap[row.assignedTo] = (recentMap[row.assignedTo] ?? 0) + 1
  }

  // Recent routes log
  const { data: recentRoutes } = await supabase
    .from('ConversationRoute')
    .select('*')
    .order('createdAt', { ascending: false })
    .limit(20)

  const agents = AGENTS.map((a) => ({
    id:               a.id,
    name:             a.name,
    email:            a.email,
    role:             a.role,
    active:           isAgentActive(a.id),
    maxConversations: a.maxConversations,
    openCount:        countMap[a.id] ?? 0,
    recentCount:      recentMap[a.id] ?? 0,
    specialisms:      a.specialisms,
  }))

  return NextResponse.json({
    agents,
    recentRoutes: recentRoutes ?? [],
    roundRobinPosition: getRoundRobinIndex(),
  })
}
