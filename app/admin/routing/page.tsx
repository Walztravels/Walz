import { Suspense } from 'react'
import { getAdminSession } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { RoutingPageClient } from './RoutingClient'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Routing — Walz Admin' }

type RouteRow = {
  id:                     string
  chatwootConversationId: string
  assignedToName:         string | null
  channel:                string | null
  routingReason:          string | null
  messagePreview:         string | null
  status:                 string
  assignedAt:             string
}

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  round_robin:         { label: 'Round robin',    color: 'bg-gray-100 text-gray-600'      },
  previously_routed:   { label: 'Returning',      color: 'bg-purple-100 text-purple-700'  },
  known_caller:        { label: 'Known caller',   color: 'bg-indigo-100 text-indigo-700'  },
  no_agents_escalated: { label: 'Escalated',      color: 'bg-amber-100 text-amber-700'    },
  whatsapp_channel:    { label: 'WhatsApp',       color: 'bg-green-100 text-green-700'    },
}

function reasonBadge(reason: string | null) {
  const r = reason ?? ''
  if (r.startsWith('specialism:')) {
    const kw = r.split(':')[1]
    return { label: `Keyword: ${kw}`, color: 'bg-blue-100 text-blue-700' }
  }
  return REASON_LABELS[r] ?? { label: r || '—', color: 'bg-gray-100 text-gray-500' }
}

const CHANNEL_LABELS: Record<string, string> = {
  voice:     'Call',
  whatsapp:  'WhatsApp',
  instagram: 'Instagram',
  web:       'Web',
  email:     'Email',
}

async function RoutingContent() {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  const supabase = getSupabaseAdmin()

  const [{ data: agents }, { data: activeCounts }, { data: todayCalls }, { data: recentRoutes }] =
    await Promise.all([
      supabase.from('RoutingAgent').select('*').order('isEscalation').order('createdAt'),
      supabase.from('ConversationRoute').select('assignedTo').eq('status', 'active'),
      supabase.from('ConversationRoute').select('assignedTo').eq('channel', 'voice')
        .gte('assignedAt', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabase.from('ConversationRoute').select('*').order('assignedAt', { ascending: false }).limit(25),
    ])

  const openMap: Record<string, number> = {}
  const callMap: Record<string, number> = {}
  for (const r of activeCounts ?? []) openMap[r.assignedTo] = (openMap[r.assignedTo] ?? 0) + 1
  for (const r of todayCalls  ?? []) callMap[r.assignedTo]  = (callMap[r.assignedTo]  ?? 0) + 1

  const hydratedAgents = (agents ?? []).map((a: Record<string, unknown>) => ({
    ...a,
    openCount:  openMap[a.id as string] ?? 0,
    callsToday: callMap[a.id as string] ?? 0,
  }))

  const routes = (recentRoutes ?? []) as RouteRow[]

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Conversation Routing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage who receives incoming chats and calls. All agent data is live from the database.
        </p>
      </div>

      {/* Dynamic agent management UI */}
      <RoutingPageClient initialAgents={hydratedAgents as Parameters<typeof RoutingPageClient>[0]['initialAgents']} />

      {/* How routing works */}
      <section className="mb-10">
        <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide mb-4">How Routing Works</h2>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <ol className="space-y-3 text-sm text-gray-600">
            {[
              ['1', 'blue', 'Specialism match', "If the message contains a keyword in an agent's specialism list, route to them."],
              ['2', 'blue', 'WhatsApp channel', "If the conversation is from WhatsApp and an agent has 'whatsapp' specialism, route to them."],
              ['3', 'blue', 'Round robin',      'Otherwise, the agent with the lowest queue position gets the next conversation. Position persists across serverless restarts.'],
              ['!', 'amber', 'Escalation',      'If no active pool agents are available, routes to escalation contacts and logs the event.'],
            ].map(([num, color, title, desc]) => (
              <li key={title} className="flex gap-3">
                <span className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  color === 'blue'  && 'bg-blue-50 text-blue-600',
                  color === 'amber' && 'bg-amber-50 text-amber-600',
                )}>
                  {num}
                </span>
                <span>
                  <strong className="text-[#0B1F3A]">{title}</strong> — {desc}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Recent routing log */}
      <section>
        <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide mb-4">Recent Routing Activity</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {routes.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-12">
              No routing activity yet. Routing begins automatically on the next inbound message.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {routes.map((r) => {
                const { label, color } = reasonBadge(r.routingReason)
                return (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', {
                      'bg-emerald-400': r.status === 'active',
                      'bg-gray-300':    r.status === 'completed',
                      'bg-red-400':     r.status === 'missed',
                      'bg-amber-400':   r.status === 'voicemail' || r.status === 'escalated',
                      'bg-gray-200':    !['active','completed','missed','voicemail','escalated'].includes(r.status),
                    })} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#0B1F3A] font-medium leading-tight truncate">
                        {r.messagePreview ?? r.chatwootConversationId}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        → {r.assignedToName ?? '—'} ·{' '}
                        {CHANNEL_LABELS[r.channel ?? ''] ?? r.channel ?? 'unknown'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', color)}>
                        {label}
                      </span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', {
                        'bg-emerald-50 text-emerald-700': r.status === 'active',
                        'bg-gray-100 text-gray-500':      r.status === 'completed',
                        'bg-red-50 text-red-600':         r.status === 'missed',
                        'bg-amber-50 text-amber-700':     r.status === 'voicemail' || r.status === 'escalated',
                        'bg-gray-100 text-gray-400':      !['active','completed','missed','voicemail','escalated'].includes(r.status),
                      })}>
                        {r.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense>
      <RoutingContent />
    </Suspense>
  )
}
