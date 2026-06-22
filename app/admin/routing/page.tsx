import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { AGENTS, isAgentActive, getRoundRobinIndex } from '@/lib/agent-roster'
import { AgentStatusCards } from './RoutingClient'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function reasonLabel(reason: string): { label: string; color: string } {
  if (reason.startsWith('specialism:'))
    return { label: `Keyword: ${reason.split(':')[1]}`, color: 'bg-blue-100 text-blue-700' }
  if (reason === 'whatsapp_channel')
    return { label: 'WhatsApp channel',                color: 'bg-green-100 text-green-700' }
  if (reason === 'round_robin')
    return { label: 'Round-robin',                     color: 'bg-gray-100 text-gray-600' }
  if (reason === 'previously_routed')
    return { label: 'Re-confirmed',                    color: 'bg-purple-100 text-purple-700' }
  return { label: reason, color: 'bg-gray-100 text-gray-600' }
}

export default async function RoutingPage() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const supabase = getSupabaseAdmin()

  // Active conversation counts per agent
  const { data: activeCounts } = await supabase
    .from('ConversationRoute')
    .select('assignedTo')
    .eq('status', 'active')

  const countMap: Record<string, number> = {}
  for (const row of activeCounts ?? []) {
    countMap[row.assignedTo] = (countMap[row.assignedTo] ?? 0) + 1
  }

  // Recent count (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentCounts } = await supabase
    .from('ConversationRoute')
    .select('assignedTo')
    .gte('createdAt', since)

  const recentMap: Record<string, number> = {}
  for (const row of recentCounts ?? []) {
    recentMap[row.assignedTo] = (recentMap[row.assignedTo] ?? 0) + 1
  }

  // Recent routing log
  type RouteRow = {
    id: string
    chatwootConversationId: string
    assignedToName: string
    routingReason: string | null
    messagePreview: string | null
    createdAt: string
    channel: string | null
  }
  const { data: recentRoutes } = await supabase
    .from('ConversationRoute')
    .select('id,chatwootConversationId,assignedToName,routingReason,messagePreview,createdAt,channel')
    .order('createdAt', { ascending: false })
    .limit(20)

  const agentCards = AGENTS.map((a) => ({
    id:               a.id,
    name:             a.name,
    email:            a.email,
    active:           isAgentActive(a.id),
    openCount:        countMap[a.id] ?? 0,
    maxConversations: a.maxConversations,
    recentCount:      recentMap[a.id] ?? 0,
    specialisms:      a.specialisms,
  }))

  const rrPosition = getRoundRobinIndex()
  const activeAgents = AGENTS.filter((a) => isAgentActive(a.id))

  return (
    <div className="max-w-5xl">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Conversation Routing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Auto-assignment rules and live conversation distribution
        </p>
      </div>

      {/* ── Section A: Agent load ─────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide mb-4">
          Agent Load
        </h2>
        <AgentStatusCards agents={agentCards} />
      </section>

      {/* ── Section B: Routing rules ──────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide mb-4">
          Routing Rules
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Visa rule */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#C9A84C] font-bold text-base">1</span>
              <p className="font-semibold text-[#0B1F3A] text-sm">Visa &amp; Documents</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
              Keywords: visa, passport, schengen, embassy, documents, immigration, biometric
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500">Assigned to</span>
              <span className="bg-[#0B1F3A] text-[#C9A84C] text-[10px] font-bold px-2 py-0.5 rounded-full">
                Glory
              </span>
            </div>
          </div>

          {/* Flights rule */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#C9A84C] font-bold text-base">2</span>
              <p className="font-semibold text-[#0B1F3A] text-sm">Flights &amp; Bookings</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
              Keywords: flight, book, fly, ticket, airline, PNR, business class
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500">Assigned to</span>
              <span className="bg-[#0B1F3A] text-[#C9A84C] text-[10px] font-bold px-2 py-0.5 rounded-full">
                Micheal
              </span>
            </div>
          </div>

          {/* WhatsApp rule */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#C9A84C] font-bold text-base">3</span>
              <p className="font-semibold text-[#0B1F3A] text-sm">WhatsApp Channel</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
              All conversations arriving via the WhatsApp channel
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500">Assigned to</span>
              <span className="bg-[#0B1F3A] text-[#C9A84C] text-[10px] font-bold px-2 py-0.5 rounded-full">
                Anita
              </span>
            </div>
          </div>

          {/* Round-robin rule */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[#C9A84C] font-bold text-base">4</span>
              <p className="font-semibold text-[#0B1F3A] text-sm">Everything Else</p>
            </div>
            <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
              Round-robin across all active agents
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500">Position</span>
              <span className="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {activeAgents.length > 0
                  ? `${activeAgents[rrPosition % activeAgents.length]?.name ?? '—'} is next`
                  : 'No active agents'}
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* ── Section C: Recent routing log ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide mb-4">
          Recent Routing Log
        </h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {!recentRoutes || recentRoutes.length === 0 ? (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">
              No conversations routed yet. Routing begins automatically on the next inbound message.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left font-medium">Conversation</th>
                    <th className="px-5 py-3 text-left font-medium">Agent</th>
                    <th className="px-5 py-3 text-left font-medium">Reason</th>
                    <th className="px-5 py-3 text-left font-medium hidden md:table-cell">Preview</th>
                    <th className="px-5 py-3 text-left font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(recentRoutes as RouteRow[]).map((r) => {
                    const { label, color } = reasonLabel(r.routingReason ?? '')
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3">
                          <a
                            href={`https://chat.walztravels.com/app/accounts/1/conversations/${r.chatwootConversationId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-[#0B1F3A] hover:text-[#C9A84C] transition-colors"
                          >
                            #{r.chatwootConversationId}
                          </a>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-semibold text-[#0B1F3A]">
                            {r.assignedToName}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', color)}>
                            {label}
                          </span>
                        </td>
                        <td className="px-5 py-3 hidden md:table-cell max-w-[200px]">
                          <p className="text-xs text-gray-400 truncate">
                            {r.messagePreview ?? '—'}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-[11px] text-gray-400">
                            {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
