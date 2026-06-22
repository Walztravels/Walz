'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface AgentCardProps {
  id:               string
  name:             string
  email:            string
  active:           boolean
  openCount:        number
  maxConversations: number
  recentCount:      number
  specialisms:      string[]
}

export function AgentStatusCards({ agents }: { agents: AgentCardProps[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {agents.map((agent) => (
        <AgentCard key={agent.id} {...agent} />
      ))}
    </div>
  )
}

function AgentCard(agent: AgentCardProps) {
  const router               = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticActive, setOptimisticActive] = useState(agent.active)

  const pct  = Math.min(100, Math.round((agent.openCount / agent.maxConversations) * 100))
  const barColor =
    pct > 80 ? 'bg-red-500' :
    pct > 50 ? 'bg-amber-400' :
    'bg-emerald-500'

  async function toggleActive() {
    const next = !optimisticActive
    setOptimisticActive(next)
    try {
      await fetch(`/api/admin/routing/agents/${agent.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ active: next }),
      })
      startTransition(() => router.refresh())
    } catch {
      setOptimisticActive(!next) // revert
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#0B1F3A] flex items-center justify-center text-[#C9A84C] font-bold text-sm flex-shrink-0">
            {agent.name[0]}
          </div>
          <div>
            <p className="font-semibold text-[#0B1F3A] text-sm leading-tight">{agent.name}</p>
            <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{agent.email}</p>
          </div>
        </div>

        {/* Active/Away toggle */}
        <button
          onClick={toggleActive}
          disabled={isPending}
          className={cn(
            'text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors flex-shrink-0',
            optimisticActive
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            isPending && 'opacity-60 cursor-wait',
          )}
        >
          {optimisticActive ? 'Active' : 'Away'}
        </button>
      </div>

      {/* Load bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-gray-500">Conversations</span>
          <span className="text-[11px] font-semibold text-[#0B1F3A]">
            {agent.openCount}/{agent.maxConversations}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        {agent.recentCount} routed this week
      </p>
    </div>
  )
}
