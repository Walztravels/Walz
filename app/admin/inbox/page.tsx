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
  const [tab,        setTab]        = useState<Tab>('mine')
  const [loading,    setLoading]    = useState(true)
  const [showStaff,  setShowStaff]  = useState(false)
  const [toasts,     setToasts]     = useState<Toast[]>([])
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')

  const prevConvIdsRef    = useRef<Set<number>>(new Set())
  const selectedRef       = useRef<CWConversation | null>(null)
  selectedRef.current     = selected
  // Track conversations explicitly opened — keep their unread count zeroed
  // until Chatwoot itself confirms unread_count = 0. Persisted to localStorage
  // so a page refresh doesn't re-show badges that were already cleared.
  const manuallyReadIdsRef = useRef<Set<number>>(new Set())

  // Restore read-IDs from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('walz_read_conv_ids')
      if (raw) {
        const ids: number[] = JSON.parse(raw)
        ids.forEach(id => manuallyReadIdsRef.current.add(id))
      }
    } catch { /* non-fatal */ }
  }, [])

  function syncReadIds() {
    try {
      localStorage.setItem(
        'walz_read_conv_ids',
        JSON.stringify([...manuallyReadIdsRef.current]),
      )
    } catch { /* non-fatal */ }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadProfile() {
      try {
        const res  = await fetch('/api/admin/me')
        if (!res.ok) { router.push('/admin/login'); return }
        const data = await res.json() as { email?: string; name?: string; role?: string; permissions?: Record<string, boolean> }
        if (!data.email) { router.push('/admin/login'); return }
        const mapped = EMAIL_TO_AGENT[data.email]
        // Staff DB role wins over EMAIL_TO_AGENT for super_admin detection
        const effectiveRole: AdminProfile['role'] =
          data.role === 'super_admin' ? 'super_admin' : (mapped?.role ?? 'agent')
        const perms = data.permissions ?? {}
        setProfile({
          email:           data.email,
          name:            data.name ?? data.email,
          role:            effectiveRole,
          chatwootAgentId: mapped?.id ?? 0,
          permissions:     perms,
        })
        // Default 'all' tab for managers; stay on 'mine' for everyone else
        const viewAll = data.role === 'super_admin' || perms.inbox_view_all === true
        setTab(viewAll ? 'all' : 'mine')
      } catch {
        router.push('/admin/login')
      }
    }
    loadProfile()
  }, [router])

  // ── Load agents + resolve current user's Chatwoot agent ID ─────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/agents').then(r => r.json()).catch(() => []),
      fetch('/api/admin/inbox-mapping').then(r => r.json()).catch(() => ({ mappings: [] })),
    ]).then(([agentData, mappingData]) => {
      const agentList: CWAgent[] = Array.isArray(agentData) ? agentData : []
      const dbMappings: { email: string; chatwootAgentId: number }[] =
        Array.isArray(mappingData?.mappings) ? mappingData.mappings : []
      setAgents(agentList)
      // Priority: DB mapping > Chatwoot email match > EMAIL_TO_AGENT hardcoded
      setProfile(prev => {
        if (!prev) return prev
        const dbEntry = dbMappings.find(m => m.email?.toLowerCase() === prev.email.toLowerCase())
        if (dbEntry?.chatwootAgentId) return { ...prev, chatwootAgentId: dbEntry.chatwootAgentId }
        const cwMatch = agentList.find(a => a.email?.toLowerCase() === prev.email.toLowerCase())
        if (cwMatch) return { ...prev, chatwootAgentId: cwMatch.id }
        return prev
      })
    })
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

      // Compute counts client-side — meta.mine_count from Chatwoot reflects the
      // admin API token user, not the logged-in staff member, so it's always wrong.
      const myId = profile?.chatwootAgentId ?? 0
      setMetaCounts({
        all:        conversations.length,
        mine:       myId > 0 ? conversations.filter(c => (c.meta?.assignee ?? c.assignee)?.id === myId).length : 0,
        unassigned: conversations.filter(c => !c.meta?.assignee && !c.assignee).length,
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

      // RBAC: staff without inbox_view_all see only their assigned + unassigned conversations
      const canViewAll = profile?.role === 'super_admin' || profile?.permissions?.inbox_view_all === true
      if (!canViewAll && profile) {
        filtered = filtered.filter(c => {
          const assignee = c.meta?.assignee ?? c.assignee
          // show: unassigned OR assigned to this user (by chatwoot agent id)
          return !assignee || (profile.chatwootAgentId > 0 && assignee.id === profile.chatwootAgentId)
        })
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

      // For any conversation the user has opened this session, hold its badge at
      // zero until Chatwoot itself confirms unread_count = 0 on its end.
      // This prevents polling from reinstating the badge after deselection.
      const readIds = manuallyReadIdsRef.current
      let readIdsChanged = false
      conversations.forEach(c => {
        // Server caught up — remove from override set so we stop forcing zero
        if ((c.unread_count ?? 0) === 0 && readIds.has(c.id)) {
          readIds.delete(c.id)
          readIdsChanged = true
        }
      })
      if (readIdsChanged) syncReadIds()
      const displayFiltered = readIds.size > 0
        ? filtered.map(c => readIds.has(c.id) ? { ...c, unread_count: 0 } : c)
        : filtered
      setConvs(Array.isArray(displayFiltered) ? displayFiltered : [])

      // Auto-select from ?lead= URL param on first load
      const urlId = searchParams.get('lead')
      if (urlId && conversations.length > 0 && !selectedRef.current) {
        const match = conversations.find(c => String(c.id) === urlId)
        if (match) doSelectConv(match)
      }

      // Keep selected conv data fresh — preserve the zeroed unread_count
      if (selectedRef.current) {
        const updated = conversations.find(c => c.id === selectedRef.current!.id)
        if (updated) setSelected({ ...updated, unread_count: 0 })
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
    setMobileView('chat')
    // Mark as read — suppress the badge for this conversation on every future poll
    // until Chatwoot itself confirms unread_count = 0. Persisted so refresh survives.
    manuallyReadIdsRef.current.add(conv.id)
    syncReadIds()
    if ((conv.unread_count ?? 0) > 0) {
      setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    }
    fetch(`/api/admin/conversations/${conv.id}/read`, { method: 'POST' }).catch(() => {})
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSend(content: string, isPrivate: boolean, file?: File) {
    if (!selected) return
    if (file) {
      const form = new FormData()
      if (content) form.append('content', content)
      form.append('private', String(isPrivate))
      form.append('file', file, file.name)
      await fetch(`/api/admin/conversations/${selected.id}/reply`, { method: 'POST', body: form })
    } else {
      await fetch(`/api/admin/conversations/${selected.id}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, private: isPrivate }),
      })
    }
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

  async function handleDeleteConv(convId: number) {
    const res = await fetch(`/api/admin/conversations/${convId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      addToast(d.error ?? 'Failed to delete conversation')
      return
    }
    if (selected?.id === convId) setSelected(null)
    setConvs(prev => prev.filter(c => c.id !== convId))
    addToast('Conversation deleted')
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
    <div className="flex h-[100dvh] bg-[#0B1F3A] overflow-hidden">

      {/* Conversation list — full screen on mobile (list view), left panel on desktop */}
      <div className={`
        flex-shrink-0 flex flex-col w-full md:w-64
        ${mobileView === 'list' ? 'flex' : 'hidden'} md:flex
      `}>
        <ConversationList
          conversations={convs}
          selected={selected}
          tab={tab}
          profile={profile}
          canViewAll={profile?.role === 'super_admin' || profile?.permissions?.inbox_view_all === true}
          counts={counts}
          onSelect={doSelectConv}
          onTabChange={setTab}
          onOpenSettings={() => setShowStaff(true)}
          onDelete={profile?.role === 'super_admin' ? handleDeleteConv : undefined}
        />
      </div>

      {/* Chat window — full screen on mobile (chat view), flex-1 on desktop */}
      <div className={`
        flex-1 flex flex-col min-w-0
        ${mobileView === 'chat' ? 'flex' : 'hidden'} md:flex
      `}>
        {selected ? (
          <ChatWindow
            conv={selected}
            messages={messages}
            agents={agents}
            onSend={handleSend}
            onAssign={handleAssign}
            onResolve={handleResolve}
            onReopen={handleReopen}
            onBack={() => setMobileView('list')}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-sm">Select a conversation to start</p>
          </div>
        )}
      </div>

      {/* Client info — hidden on mobile, visible on large screens only */}
      {selected && (
        <div className="hidden lg:flex">
          <ClientInfo
            conv={selected}
            agents={agents}
            onAssign={handleAssign}
            onResolve={handleResolve}
            onReopen={handleReopen}
          />
        </div>
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
