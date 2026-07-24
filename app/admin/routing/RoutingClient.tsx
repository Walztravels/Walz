'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Pencil, Trash2, Phone, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type RoutingAgent = {
  id:               string
  name:             string
  email:            string
  sipAddress?:      string | null
  role?:            string | null
  chatwootAgentId?: number | null
  aircallUserId?:   number | null
  specialisms:      string[]
  active:           boolean
  isEscalation:     boolean
  maxConversations: number
  openCount?:       number
  callsToday?:      number
}

type CwAgent = { id: number; name: string; email: string }
type AcUser  = { id: number; name: string; email: string }

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onToggle,
  onEdit,
  onRemove,
}: {
  agent:    RoutingAgent
  onToggle: () => void
  onEdit:   () => void
  onRemove: () => void
}) {
  const open = agent.openCount ?? 0
  const max  = agent.maxConversations
  const pct  = Math.min(100, Math.round((open / max) * 100))
  const barColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-400' : 'bg-emerald-500'

  return (
    <div className={cn(
      'bg-white rounded-2xl p-5 border shadow-sm',
      agent.isEscalation ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100',
    )}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-[#0B1F3A] flex items-center justify-center text-[#C9A84C] font-bold text-sm flex-shrink-0">
          {agent.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-[#0B1F3A] text-sm leading-tight">{agent.name}</p>
            {agent.isEscalation && (
              <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                Escalation
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 leading-tight mt-0.5 truncate">{agent.email}</p>
        </div>
        <button
          onClick={onToggle}
          className={cn(
            'text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors flex-shrink-0',
            agent.active
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
          )}
        >
          {agent.active ? 'Active' : 'Away'}
        </button>
      </div>

      {!agent.isEscalation && (
        <>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-gray-500">Conversations</span>
            <span className="font-semibold text-[#0B1F3A]">{open}/{max}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
            <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
          </div>
        </>
      )}

      {(agent.specialisms?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.specialisms.slice(0, 5).map((s) => (
            <span key={s} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
          {agent.specialisms.length > 5 && (
            <span className="text-[10px] text-gray-400">+{agent.specialisms.length - 5}</span>
          )}
        </div>
      )}

      {agent.sipAddress && (
        <div className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 rounded-md px-2 py-1 mb-2 font-mono truncate">
          <Phone className="w-3 h-3 flex-shrink-0" />
          {agent.sipAddress}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-3">
        {agent.chatwootAgentId ? (
          <span className="flex items-center gap-0.5">
            <MessageSquare className="w-3 h-3" /> {agent.chatwootAgentId}
          </span>
        ) : (
          <span className="text-gray-300">No Chatwoot ID</span>
        )}
        <span className="text-gray-200">·</span>
        {agent.aircallUserId ? (
          <span className="flex items-center gap-0.5">
            <Phone className="w-3 h-3" /> {agent.aircallUserId}
          </span>
        ) : (
          <span className="text-gray-300">No Aircall</span>
        )}
        {(agent.callsToday ?? 0) > 0 && (
          <>
            <span className="text-gray-200">·</span>
            <span>{agent.callsToday} call{agent.callsToday !== 1 ? 's' : ''} today</span>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#0B1F3A] transition-colors"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button
          onClick={onRemove}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors ml-auto"
        >
          <Trash2 className="w-3 h-3" /> Remove
        </button>
      </div>
    </div>
  )
}

// ── Agent modal ───────────────────────────────────────────────────────────────

function AgentModal({
  agent,
  onClose,
  onSaved,
}: {
  agent?:   Partial<RoutingAgent>
  onClose:  () => void
  onSaved:  () => void
}) {
  const [name,             setName]             = useState(agent?.name ?? '')
  const [email,            setEmail]            = useState(agent?.email ?? '')
  const [sipAddress,       setSipAddress]       = useState(agent?.sipAddress ?? '')
  const [role,             setRole]             = useState(agent?.role ?? '')
  const [cwId,             setCwId]             = useState<number | ''>(agent?.chatwootAgentId ?? '')
  const [acId,             setAcId]             = useState<number | ''>(agent?.aircallUserId ?? '')
  const [specialisms,      setSpecialisms]      = useState<string[]>(agent?.specialisms ?? [])
  const [specInput,        setSpecInput]        = useState('')
  const [maxConv,          setMaxConv]          = useState(agent?.maxConversations ?? 15)
  const [isEscalation,     setIsEscalation]     = useState(agent?.isEscalation ?? false)
  const [active,           setActive]           = useState(agent?.active ?? true)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState('')
  const [cwAgents,         setCwAgents]         = useState<CwAgent[]>([])
  const [acUsers,          setAcUsers]          = useState<AcUser[]>([])
  const [loadingDropdowns, setLoadingDropdowns] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/routing/chatwoot-agents').then(r => r.json()).then(d => setCwAgents(d.agents ?? [])),
      fetch('/api/admin/routing/aircall-users').then(r => r.json()).then(d => setAcUsers(d.users ?? [])),
    ]).finally(() => setLoadingDropdowns(false))
  }, [])

  function addSpecialism() {
    const s = specInput.trim().toLowerCase()
    if (s && !specialisms.includes(s)) setSpecialisms([...specialisms, s])
    setSpecInput('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const body = {
      name: name.trim(),
      email: email.trim(),
      sipAddress: sipAddress.trim() || null,
      role: role.trim() || null,
      chatwootAgentId: cwId !== '' ? Number(cwId) : null,
      aircallUserId:   acId !== '' ? Number(acId) : null,
      specialisms,
      maxConversations: maxConv,
      isEscalation,
      active,
    }

    try {
      const url    = agent?.id ? `/api/admin/routing/agents/${agent.id}` : '/api/admin/routing/agents'
      const method = agent?.id ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data   = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Failed to save'); return }
      onSaved()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-[#0B1F3A]">{agent?.id ? 'Edit Agent' : 'Add Agent'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Name *</span>
              <input required value={name} onChange={e => setName(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Email *</span>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">SIP Address <span className="text-gray-400 font-normal">(for Zoiper / physical phone)</span></span>
            <input value={sipAddress} onChange={e => setSipAddress(e.target.value)}
              placeholder="e.g. gloryn@walzteam.sip.twilio.com"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
            <p className="text-[10px] text-gray-400 mt-0.5">Without sip: prefix. Leave blank for browser-only agents.</p>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Role</span>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Visa Specialist"
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                Chatwoot Agent
                {loadingDropdowns && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
              </span>
              <select value={cwAgents.some(a => a.id === cwId) ? cwId : ''} onChange={e => setCwId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50">
                <option value="">— not linked —</option>
                {cwAgents.map(a => <option key={a.id} value={a.id}>{a.name} (#{a.id})</option>)}
              </select>
              <input
                type="number"
                placeholder="or enter Chatwoot ID manually"
                value={cwId}
                onChange={e => setCwId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 placeholder:text-gray-300"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">
                Aircall User
                {loadingDropdowns && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
              </span>
              <select value={acId} onChange={e => setAcId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50">
                <option value="">— not linked —</option>
                {acUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Specialisms</span>
            <div className="mt-1 min-h-[44px] border border-gray-200 rounded-lg p-2 flex flex-wrap gap-1 focus-within:ring-2 focus-within:ring-[#C9A84C]/50">
              {specialisms.map(s => (
                <span key={s} className="inline-flex items-center gap-0.5 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded">
                  {s}
                  <button type="button" onClick={() => setSpecialisms(specialisms.filter(x => x !== s))}
                    className="text-blue-400 hover:text-blue-700">×</button>
                </span>
              ))}
              <input
                value={specInput}
                onChange={e => setSpecInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSpecialism() } }}
                onBlur={addSpecialism}
                placeholder={specialisms.length === 0 ? 'Type keyword, press Enter…' : ''}
                className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Examples: visa, flight, hotel, schengen, passport
            </p>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Max Conversations</span>
              <input type="number" min={1} max={100} value={maxConv} onChange={e => setMaxConv(Number(e.target.value))}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50" />
            </label>
            <div>
              <span className="text-xs font-medium text-gray-600 block mb-2">Options</span>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-1.5">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#C9A84C]" />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={isEscalation} onChange={e => setIsEscalation(e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-500" />
                Escalation contact
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} type="button"
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#0B1F3A] text-[#C9A84C] text-sm font-bold hover:bg-[#0B1F3A]/90 flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

export function RoutingPageClient({ initialAgents }: { initialAgents: RoutingAgent[] }) {
  const router                         = useRouter()
  const [, startTransition]            = useTransition()
  const [agents, setAgents]            = useState<RoutingAgent[]>(initialAgents)
  const [modalAgent, setModalAgent]    = useState<Partial<RoutingAgent> | null>(null)
  const [showModal, setShowModal]      = useState(false)

  // Fetch from API on mount — guards against empty server-side pre-render
  useEffect(() => {
    fetch('/api/admin/routing/agents')
      .then(r => r.json())
      .then((d: { agents?: RoutingAgent[] }) => { if (d.agents?.length) setAgents(d.agents) })
      .catch(() => {})
  }, [])

  function refresh() {
    startTransition(() => router.refresh())
    fetch('/api/admin/routing/agents').then(r => r.json())
      .then((d: { agents?: RoutingAgent[] }) => { if (d.agents) setAgents(d.agents) })
      .catch(() => {})
  }

  async function toggleAgent(id: string) {
    await fetch(`/api/admin/routing/agents/${id}/toggle`, { method: 'POST' })
    setAgents(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))
  }

  async function removeAgent(id: string) {
    if (!confirm('Remove this agent from the routing pool?')) return
    await fetch(`/api/admin/routing/agents/${id}`, { method: 'DELETE' })
    refresh()
  }

  const pool       = agents.filter(a => !a.isEscalation)
  const escalation = agents.filter(a =>  a.isEscalation)

  return (
    <>
      {/* Routing Pool */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide">Routing Pool</h2>
            <p className="text-xs text-gray-400 mt-0.5">Chats and calls are distributed among these agents</p>
          </div>
          <button
            onClick={() => { setModalAgent({}); setShowModal(true) }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0B1F3A] text-[#C9A84C] text-xs font-bold rounded-xl hover:bg-[#0B1F3A]/90"
          >
            <Plus className="w-3.5 h-3.5" /> Add Agent
          </button>
        </div>

        {pool.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
            No agents yet. Add your first agent to start routing.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pool.map(a => (
              <AgentCard key={a.id} agent={a}
                onToggle={() => toggleAgent(a.id)}
                onEdit={() => { setModalAgent(a); setShowModal(true) }}
                onRemove={() => removeAgent(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Escalation Contacts */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide">Escalation Contacts</h2>
            <p className="text-xs text-gray-400 mt-0.5">Notified when no agents are available or a call is missed</p>
          </div>
          <button
            onClick={() => { setModalAgent({ isEscalation: true }); setShowModal(true) }}
            className="flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        {escalation.length === 0 ? (
          <div className="bg-amber-50/40 rounded-2xl border border-dashed border-amber-200 p-8 text-center text-amber-600/60 text-sm">
            No escalation contacts. Add Micheal or another manager here.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {escalation.map(a => (
              <AgentCard key={a.id} agent={a}
                onToggle={() => toggleAgent(a.id)}
                onEdit={() => { setModalAgent(a); setShowModal(true) }}
                onRemove={() => removeAgent(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <AgentModal
          agent={modalAgent ?? undefined}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </>
  )
}
