'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CWConversation, CWMessage, CWAgent, AdminProfile, EMAIL_TO_AGENT } from './types'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ClientInfo } from './components/ClientInfo'
import { StaffModal } from './components/StaffModal'

type Tab = 'all' | 'mine' | 'unassigned' | 'resolved'

// ── Notification sound ────────────────────────────────────────────────────────
function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.connect(g); g.connect(ctx.destination)
    osc.frequency.value = 880
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25)
    osc.start(); osc.stop(ctx.currentTime + 0.25)
  } catch { /* non-fatal */ }
}

interface Toast { id: number; msg: string }

export default function InboxPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [profile,    setProfile]    = useState<AdminProfile | null>(null)
  const [convs,      setConvs]      = useState<CWConversation[]>([])
  const [allPayload, setAllPayload] = useState<CWConversation[]>([])
  const [metaCounts, setMetaCounts] = useState({ all: 0, mine: 0, unassigned: 0 })
  const [selected,   setSelected]   = useState<CWConversation | null>(null)
  const [messages,   setMessages]   = useState<CWMessage[]>([])
  const [agents,     setAgents]     = useState<CWAgent[]>([])
  const [tab,        setTab]        = useState<Tab>('all')
  const [loading,    setLoading]    = useState(true)
  const [showStaff,  setShowStaff]  = useState(false)
  const [toasts,     setToasts]     = useState<Toast[]>([])

  const prevConvIdsRef = useRef<Set<number>>(new Set())
  const selectedRef    = useRef<CWConversation | null>(null)
  selectedRef.current  = selected

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadProfile() {
      try {
        const res  = await fetch('/api/admin/me')
        if (!res.ok) { router.push('/admin/login'); return }
        const data = await res.json() as { email?: string; name?: string }
        if (!data.email) { router.push('/admin/login'); return }
        const mapped = EMAIL_TO_AGENT[data.email]
        setProfile({
          email:           data.email,
          name:            data.name ?? data.email,
          role:            mapped?.role ?? 'agent',
          chatwootAgentId: mapped?.id ?? 0,
        })
      } catch {
        router.push('/admin/login')
      }
    }
    loadProfile()
  }, [router])

  // ── Load agents ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/agents').then(r => r.json()).then((data: unknown) => {
      if (Array.isArray(data)) setAgents(data as CWAgent[])
    }).catch(() => {})
  }, [])

  // ── Fetch conversations ─────────────────────────────────────────────────────
  const fetchConvs = useCallback(async (showLoad = false) => {
    if (showLoad) setLoading(true)
    try {
      // Always fetch the full open/resolved list — filter client-side per tab
      const status = tab === 'resolved' ? 'resolved' : 'open'
      const res = await fetch(`/api/admin/conversations?status=${status}`)
      if (!res.ok) return

      // API route unwraps Chatwoot envelope → response is { meta, payload }
      const json = await res.json()
      const conversations: CWConversation[] = json?.payload || json?.data?.payload || []
      const meta = json?.meta || json?.data?.meta

      // Update tab counts from Chatwoot meta
      setMetaCounts({
        all:        meta?.all_count        ?? conversations.length,
        mine:       meta?.mine_count       ?? conversations.filter(c => (c.meta?.assignee ?? c.assignee)?.id === profile?.chatwootAgentId).length,
        unassigned: meta?.unassigned_count ?? conversations.filter(c => !c.meta?.assignee && !c.assignee).length,
      })

      // Client-side tab filtering
      let filtered = conversations
      if (tab === 'mine') {
        filtered = conversations.filter(c =>
          (c.meta?.assignee ?? c.assignee)?.id === profile?.chatwootAgentId
        )
      } else if (tab === 'unassigned') {
        filtered = conversations.filter(c => !c.meta?.assignee && !c.assignee)
      }

      // Agent role: only own conversations (guard: chatwootAgentId must be > 0)
      if (profile?.role === 'agent' && profile.chatwootAgentId > 0) {
        filtered = filtered.filter(c =>
          (c.meta?.assignee ?? c.assignee)?.id === profile.chatwootAgentId
        )
      }

      // New conversation detection → toast + beep
      const newIds = new Set(conversations.map(c => c.id))
      if (prevConvIdsRef.current.size > 0) {
        conversations.forEach(c => {
          if (!prevConvIdsRef.current.has(c.id)) {
            addToast(`New message from ${c.meta?.sender?.name ?? 'Unknown'}`)
            beep()
          }
        })
      }
      prevConvIdsRef.current = newIds

      setAllPayload(conversations)
      setConvs(Array.isArray(filtered) ? filtered : [])

      // Auto-select from ?lead= URL param on first load
      const urlId = searchParams.get('lead')
      if (urlId && conversations.length > 0 && !selectedRef.current) {
        const match = conversations.find(c => String(c.id) === urlId)
        if (match) doSelectConv(match)
      }

      // Keep selected conv data fresh
      if (selectedRef.current) {
        const updated = conversations.find(c => c.id === selectedRef.current!.id)
        if (updated) setSelected(updated)
      }
    } finally {
      if (showLoad) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile])

  // ── Fetch messages ──────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (id: number) => {
    const res  = await fetch(`/api/admin/conversations/${id}/messages`)
    const json = await res.json()
    const msgs: CWMessage[] = json?.payload || json?.data?.payload || []
    setMessages(msgs.sort((a, b) => a.created_at - b.created_at))
  }, [])

  // ── Polling ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    fetchConvs(true)
    const t = setInterval(() => {
      fetchConvs()
      if (selectedRef.current) fetchMessages(selectedRef.current.id)
    }, 5000)
    return () => clearInterval(t)
  }, [profile, fetchConvs, fetchMessages])

  useEffect(() => {
    if (!profile) return
    fetchConvs(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Browser tab title ───────────────────────────────────────────────────────
  useEffect(() => {
    const total = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0)
    document.title = total > 0
      ? `(${total}) Admin Inbox | Walz Travels`
      : 'Admin Inbox | Walz Travels'
    return () => { document.title = 'Admin Inbox | Walz Travels' }
  }, [convs])

  // ── Counts ──────────────────────────────────────────────────────────────────
  const counts = {
    all:        metaCounts.all,
    mine:       metaCounts.mine,
    unassigned: metaCounts.unassigned,
    resolved:   tab === 'resolved' ? convs.length : allPayload.filter(c => c.status === 'resolved').length,
  }

  // ── Select ──────────────────────────────────────────────────────────────────
  function doSelectConv(conv: CWConversation) {
    setSelected(conv)
    setMessages([])
    fetchMessages(conv.id)
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSend(content: string, isPrivate: boolean) {
    if (!selected) return
    await fetch(`/api/admin/conversations/${selected.id}/reply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, private: isPrivate }),
    })
    await fetchMessages(selected.id)
  }

  async function handleAssign(agentId: number) {
    if (!selected) return
    await fetch(`/api/admin/conversations/${selected.id}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee_id: agentId }),
    })
    await fetchConvs()
  }

  async function handleResolve() {
    if (!selected) return
    await fetch(`/api/admin/conversations/${selected.id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    })
    setSelected(p => p ? { ...p, status: 'resolved' } : p)
    await fetchConvs()
  }

  async function handleReopen() {
    if (!selected) return
    await fetch(`/api/admin/conversations/${selected.id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    })
    setSelected(p => p ? { ...p, status: 'open' } : p)
    await fetchConvs()
  }

  async function handleAddAgent(name: string, email: string, role: string) {
    const res = await fetch('/api/admin/agents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    })
    if (!res.ok) throw new Error('Failed to invite agent')
    const res2 = await fetch('/api/admin/agents')
    const data = await res2.json() as CWAgent[]
    if (Array.isArray(data)) setAgents(data)
  }

  function addToast(msg: string) {
    const id = Date.now()
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!profile && loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0B1F3A] text-white/40 text-sm">
        Loading inbox...
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#0B1F3A] overflow-hidden">

      <ConversationList
        conversations={convs}
        selected={selected}
        tab={tab}
        profile={profile}
        counts={counts}
        onSelect={doSelectConv}
        onTabChange={setTab}
        onOpenSettings={() => setShowStaff(true)}
      />

      {selected ? (
        <ChatWindow
          conv={selected}
          messages={messages}
          agents={agents}
          onSend={handleSend}
          onAssign={handleAssign}
          onResolve={handleResolve}
          onReopen={handleReopen}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-white/20">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-sm">Select a conversation to start</p>
        </div>
      )}

      {selected && (
        <ClientInfo
          conv={selected}
          agents={agents}
          onAssign={handleAssign}
          onResolve={handleResolve}
          onReopen={handleReopen}
        />
      )}

      {showStaff && (
        <StaffModal
          agents={agents}
          onClose={() => setShowStaff(false)}
          onAdd={handleAddAgent}
          onSwitch={() => {}}
        />
      )}

      <div className="fixed bottom-4 right-4 space-y-2 z-50 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-semibold shadow-lg">
            {t.msg}
          </div>
        ))}
      </div>

    </div>
  )
}
