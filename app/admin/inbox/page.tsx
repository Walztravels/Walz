'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CWConversation, CWMessage, CWAgent, AdminProfile } from './types'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ClientInfo, LinkedAppSummary } from './components/ClientInfo'
import { InboxJadeCopilot } from './components/InboxJadeCopilot'
import { ApplicationLookupDrawer } from '@/components/admin/ApplicationLookupDrawer'
import { StaffModal } from './components/StaffModal'
import { DetailsDrawer } from './components/DetailsDrawer'
import { PaymentRequestDrawer } from './components/PaymentRequestDrawer'
import { CreateQuoteDrawer } from './components/CreateQuoteDrawer'
import { ClientIdentityDrawer } from './components/ClientIdentityDrawer'
import { VisaFormDrawer } from './components/VisaFormDrawer'
import { ItineraryRequestDrawer } from './components/ItineraryRequestDrawer'
import { ComposerDraftProvider, useComposerDraft } from './ComposerDraftContext'
import { useInboxScreens, applyInert } from './useInboxScreens'
import { sortPage, mergeLatest, prependOlder, oldestCursor } from '@/lib/inbox/message-history'

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
  // UX-2: the composer draft provider wraps everything — OUTSIDE the pinned
  // data-inbox-fullbleed root — so ReplyBox (pinned JSX line, no new props)
  // and the Staff Jade copilot can talk through the ref-based context.
  return (
    <ComposerDraftProvider>
      <InboxPageInner />
    </ComposerDraftProvider>
  )
}

function InboxPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [profile,    setProfile]    = useState<AdminProfile | null>(null)
  const [convs,      setConvs]      = useState<CWConversation[]>([])
  const [metaCounts, setMetaCounts] = useState({ all: 0, mine: 0, unassigned: 0 })
  const [selected,   setSelected]   = useState<CWConversation | null>(null)
  const [showAppLookup, setShowAppLookup] = useState(false)
  // UX-4.1B — Request Payment drawer (Client Action Centre)
  const [paymentOpen, setPaymentOpen] = useState(false)
  // UX-4.2 — Create Quote drawer (Client Action Centre)
  const [quoteOpen, setQuoteOpen] = useState(false)
  // UX-4.1C — Find/Create client identity drawer (Client Action Centre)
  const [identityDrawer, setIdentityDrawer] = useState<{ mode: 'find' | 'create' } | null>(null)
  // UX-4.3 — Visa Form drawer (Client Action Centre)
  const [visaFormOpen, setVisaFormOpen] = useState(false)
  // UX-4.4 — Itinerary Request drawer (Client Action Centre)
  const [itineraryRequestOpen, setItineraryRequestOpen] = useState(false)
  const [identityRefreshToken, setIdentityRefreshToken] = useState(0)
  const [messages,   setMessages]   = useState<CWMessage[]>([])
  const [agents,     setAgents]     = useState<CWAgent[]>([])
  const [tab,        setTab]        = useState<Tab>('mine')
  const [loading,    setLoading]    = useState(true)
  const [showStaff,  setShowStaff]  = useState(false)
  const [toasts,     setToasts]     = useState<Toast[]>([])

  // ── UX-4: screen-state navigation (below md) ────────────────────────────────
  // The hook owns screen ('list' | 'chat'), the client-details overlay flag,
  // URL/history sync (?c=<convId> + popstate) and list scroll restoration.
  // Both panes stay MOUNTED at every width — below md the off screen slides
  // away with a transform, so the list scroll position and ChatWindow's
  // message scroller survive round trips.
  const screens = useInboxScreens({
    onNavigateToConv: (convId) => {
      // popstate landed on ?c=<convId> — select WITHOUT pushing history.
      // Same conversation still selected → keep messages + scroller untouched.
      if (selectedRef.current?.id === convId) return true
      const conv = convsRef.current.find(c => c.id === convId)
      if (!conv) return false
      applyConvSelection(conv)
      return true
    },
  })
  const listColRef = useRef<HTMLDivElement | null>(null)
  const chatColRef = useRef<HTMLDivElement | null>(null)
  // Below-md detection — aria-hidden/inert must never touch the md+ layout,
  // where both panes are genuinely visible side by side.
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  const hideList = isPhone && screens.screen === 'chat'
  const hideChat = isPhone && screens.screen === 'list'
  useEffect(() => {
    applyInert(listColRef.current, hideList)
    applyInert(chatColRef.current, hideChat)
  }, [hideList, hideChat])

  // ── UX-2: conversation-experience state ─────────────────────────────────────
  // Staff Jade copilot panel (stub this release) — opened from ReplyBox via the
  // composer draft context; while open on desktop it takes the ClientInfo slot.
  const [copilotOpen, setCopilotOpen] = useState(false)
  const { registerCopilotOpener } = useComposerDraft()
  useEffect(() => {
    registerCopilotOpener(() => setCopilotOpen(true))
  }, [registerCopilotOpener])
  // UX-4: any screen change closes the copilot sheet and the details drawer
  // (the hook already closes the drawer; the copilot lives here) and moves
  // focus below md — into the conversation region on enter, back to the
  // selected conversation card on return.
  const prevScreenRef = useRef(screens.screen)
  useEffect(() => {
    if (prevScreenRef.current === screens.screen) return
    prevScreenRef.current = screens.screen
    setCopilotOpen(false)
    setPaymentOpen(false)   // UX-4.1B: overlays never survive a screen change
    setQuoteOpen(false)     // UX-4.2: same discipline
    setIdentityDrawer(null) // UX-4.1C: same discipline
    setVisaFormOpen(false)  // UX-4.3: same discipline
    setItineraryRequestOpen(false)  // UX-4.4: same discipline
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const target = screens.screen
    requestAnimationFrame(() => {
      if (target === 'chat') {
        // First button in the conversation region is ChatWindow's back button.
        const region = chatColRef.current
        const backBtn = region?.querySelector<HTMLElement>('button')
        ;(backBtn ?? region)?.focus()
      } else {
        const cards = Array.from(listColRef.current?.querySelectorAll<HTMLElement>('[data-conv-card]') ?? [])
        const idx = convsRef.current.findIndex(c => c.id === selectedRef.current?.id)
        ;(cards[idx] ?? cards[0])?.focus()
      }
    })
  }, [screens.screen])
  // Session-only conversation→application linkage (no persistence in v1):
  // set when a lookup verification succeeds, keyed by conversation id.
  const [linkedApp, setLinkedApp] = useState<(LinkedAppSummary & { convId: number }) | null>(null)

  const prevConvIdsRef    = useRef<Set<number>>(new Set())
  const selectedRef       = useRef<CWConversation | null>(null)
  selectedRef.current     = selected
  const convsRef          = useRef<CWConversation[]>([])
  convsRef.current        = convs
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
        // P1 hotfix (2026-09-19), Fix 6: this used to look up a hardcoded
        // EMAIL_TO_AGENT map (app/admin/inbox/types.ts) as a fallback for
        // role/chatwootAgentId. That map was never a security boundary —
        // every real permission check reads session.permissions server-side
        // (lib/inbox/authz.ts) or profile.permissions.* client-side, never
        // this display role — but it was stale/inaccurate for any
        // admin-tier staff member outside its 5-email list. Trusting the
        // server's own role field directly is strictly more accurate than
        // the hardcoded guess it replaces.
        const effectiveRole: AdminProfile['role'] =
          data.role === 'super_admin' ? 'super_admin' : data.role === 'admin' ? 'admin' : 'agent'
        const perms = data.permissions ?? {}
        setProfile({
          email:           data.email,
          name:            data.name ?? data.email,
          role:            effectiveRole,
          chatwootAgentId: 0,
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
      // Priority: DB mapping (RoutingAgent) > live Chatwoot agent email match
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
      // 401 = session expired (12h JWT) — the middleware rejects before the
      // route runs. That is not a provider failure: send staff to login
      // instead of an unwinnable Retry loop (incident 2026-09-18).
      if (res.status === 401) { router.push('/admin/login'); return }
      if (!res.ok) {
        // P1 hotfix (2026-09-19): surface the SERVER's actual message —
        // a permission-scoped rejection (403) now reads differently from a
        // genuine provider outage (502/503) instead of both collapsing into
        // one undifferentiated "Could not load conversations. Retry." string.
        const d = await res.json().catch(() => ({} as Record<string, string>))
        console.error('[inbox] conversations list failed', res.status, d?.error)
        setConvsError(d.error || 'Could not load conversations. Please try again.')
        return
      }
      setConvsError(null)

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

      // RBAC (P1 hotfix, 2026-09-19): staff without inbox_view_all see Mine
      // only — the server already scopes the payload this way (Fix 4); this
      // client-side pass is defence-in-depth, not the security boundary.
      // Unassigned conversations are deliberately EXCLUDED here now — they
      // are no longer part of the ordinary-staff list queue.
      const canViewAll = profile?.role === 'super_admin' || profile?.permissions?.inbox_view_all === true
      if (!canViewAll && profile) {
        filtered = filtered.filter(c => {
          const assignee = c.meta?.assignee ?? c.assignee
          return !!assignee && profile.chatwootAgentId > 0 && assignee.id === profile.chatwootAgentId
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

      // Auto-select from the URL on first load — legacy ?lead= (back-compat)
      // or the canonical UX-4 ?c= param (reload / deep link on a conversation)
      const urlId = searchParams.get('lead') ?? searchParams.get('c')
      if (urlId && conversations.length > 0 && !selectedRef.current) {
        const match = conversations.find(c => String(c.id) === urlId)
        if (match) doSelectConv(match)
      }

      // Keep selected conv data fresh — preserve the zeroed unread_count
      if (selectedRef.current) {
        const updated = conversations.find(c => c.id === selectedRef.current!.id)
        if (updated) setSelected({ ...updated, unread_count: 0 })
      }
    } catch {
      setConvsError('Could not load conversations. Please try again.')
    } finally {
      if (showLoad) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profile])

  // ── Fetch messages (history-aware) ──────────────────────────────────────────
  // Initial open: latest page, history state reset. Polling MERGES the
  // latest page into what's loaded (never replaces — replacing dropped
  // previously loaded older pages and forced the viewport to the bottom
  // on every poll). Upward scroll loads older pages via the `before`
  // cursor with duplicates dropped.
  const [history, setHistory] = useState<{ loadingOlder: boolean; olderError: boolean; beginning: boolean }>({
    loadingOlder: false, olderError: false, beginning: false,
  })
  // Failure visibility (INBOX-0S.3): a failed load must look like a failure,
  // never like an empty conversation or an empty inbox.
  const [msgLoadError, setMsgLoadError] = useState(false)
  // P1 hotfix (2026-09-19): holds the server's actual error message (null =
  // no failure) instead of a plain boolean, so permission-denial and
  // provider-outage failures render distinct text. Still truthy/falsy-safe
  // everywhere it's used as a flag (`convsError &&`, `loadFailed={convsError}`).
  const [convsError, setConvsError]     = useState<string | null>(null)
  const loadingOlderRef = useRef(false)

  const fetchPage = useCallback(async (id: number, before?: number): Promise<CWMessage[]> => {
    const qs   = before ? `?before=${before}` : ''
    const res  = await fetch(`/api/admin/conversations/${id}/messages${qs}`)
    if (res.status === 401) { router.push('/admin/login'); throw new Error('session expired') }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return (json?.payload || json?.data?.payload || []) as CWMessage[]
  }, [])

  const fetchMessages = useCallback(async (id: number) => {
    try {
      const page = await fetchPage(id)
      setMessages(sortPage(page))
      setHistory({ loadingOlder: false, olderError: false, beginning: page.length === 0 })
      setMsgLoadError(false)
    } catch {
      // Show the failure instead of an empty conversation; polling retries too.
      setMsgLoadError(true)
    }
  }, [fetchPage])

  /** Poll refresh: merge new messages, keep loaded history intact. */
  const refreshMessages = useCallback(async (id: number) => {
    try {
      const page = await fetchPage(id)
      setMessages(prev => mergeLatest(prev, sortPage(page)).merged)
      setMsgLoadError(false)
    } catch { /* transient poll failure — next tick retries */ }
  }, [fetchPage])

  /** Load the previous page of the conversation (upward scroll). */
  const loadOlderMessages = useCallback(async () => {
    const conv = selectedRef.current
    if (!conv || loadingOlderRef.current) return
    const cursor = oldestCursor(messagesRef.current)
    if (!cursor) return
    loadingOlderRef.current = true
    setHistory(h => ({ ...h, loadingOlder: true, olderError: false }))
    try {
      const page = await fetchPage(conv.id, cursor)
      const { merged, added } = prependOlder(messagesRef.current, sortPage(page))
      setMessages(merged)
      setHistory({ loadingOlder: false, olderError: false, beginning: added === 0 })
    } catch {
      setHistory(h => ({ ...h, loadingOlder: false, olderError: true }))
    } finally {
      loadingOlderRef.current = false
    }
  }, [fetchPage])
  const messagesRef = useRef<CWMessage[]>([])
  messagesRef.current = messages

  // ── Polling ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    fetchConvs(true)
    const t = setInterval(() => {
      fetchConvs()
      if (selectedRef.current) refreshMessages(selectedRef.current.id)
    }, 5000)
    return () => clearInterval(t)
  }, [profile, fetchConvs, refreshMessages])

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
    resolved:   null, // authoritative resolved count is a UX-5 item — null renders no pill badge
  }

  // ── Select ──────────────────────────────────────────────────────────────────
  /** Selection state only — shared by user selection AND popstate navigation
   *  (which must never push history again). */
  function applyConvSelection(conv: CWConversation) {
    setSelected(conv)
    setMessages([])
    fetchMessages(conv.id)
    // UX-2: session linkage and the mobile client panel are per-conversation.
    setLinkedApp(prev => (prev && prev.convId === conv.id ? prev : null))
    // UX-4.1B/4.2: action drawers are per-conversation too — a conversation
    // switch (click OR browser Back) must never leave one open against the
    // new conversation (identity-confusion class).
    setPaymentOpen(false)
    setQuoteOpen(false)
    setIdentityDrawer(null)
    setVisaFormOpen(false)
    setItineraryRequestOpen(false)
    // Mark as read — suppress the badge for this conversation on every future poll
    // until Chatwoot itself confirms unread_count = 0. Persisted so refresh survives.
    manuallyReadIdsRef.current.add(conv.id)
    syncReadIds()
    if ((conv.unread_count ?? 0) > 0) {
      setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
    }
    fetch(`/api/admin/conversations/${conv.id}/read`, { method: 'POST' }).catch(() => {})
  }

  function doSelectConv(conv: CWConversation) {
    applyConvSelection(conv)
    // UX-4: pushState ?c=<convId> + screen → chat (closes the details drawer).
    screens.selectConversation(conv.id)
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function handleSend(content: string, isPrivate: boolean, file?: File): Promise<boolean> {
    if (!selected) return false
    let res: Response
    if (file) {
      const form = new FormData()
      if (content) form.append('content', content)
      form.append('private', String(isPrivate))
      form.append('file', file, file.name)
      res = await fetch(`/api/admin/conversations/${selected.id}/reply`, { method: 'POST', body: form })
    } else {
      res = await fetch(`/api/admin/conversations/${selected.id}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, private: isPrivate }),
      })
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as Record<string, string>
      addToast(d.error ?? `Send failed (${res.status})`)
      return false
    }
    await fetchMessages(selected.id)
    return true
  }

  async function handleAssign(agentId: number) {
    if (!selected) return
    const res = await fetch(`/api/admin/conversations/${selected.id}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee_id: agentId }),
    }).catch(() => null)
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) as Record<string, string> : {}
      addToast(d.error ?? 'Could not assign the conversation. Please try again.')
      return
    }
    await fetchConvs()
  }

  async function handleResolve() {
    if (!selected) return
    const res = await fetch(`/api/admin/conversations/${selected.id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    }).catch(() => null)
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) as Record<string, string> : {}
      addToast(d.error ?? 'Could not resolve the conversation. Please try again.')
      return
    }
    // Status updates only after Chatwoot confirms — no optimistic flip.
    setSelected(p => p ? { ...p, status: 'resolved' } : p)
    await fetchConvs()
  }

  async function handleReopen() {
    if (!selected) return
    const res = await fetch(`/api/admin/conversations/${selected.id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    }).catch(() => null)
    if (!res || !res.ok) {
      const d = res ? await res.json().catch(() => ({})) as Record<string, string> : {}
      addToast(d.error ?? 'Could not reopen the conversation. Please try again.')
      return
    }
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

  // ── UX-2 derived state ──────────────────────────────────────────────────────
  // Copilot context: last 12 messages, skipping private notes and activity
  // rows; client vs agent role from message_type.
  const recentMessages = messages
    .filter(m => !m.private && m.message_type !== 2)
    .slice(-12)
    .map(m => ({
      role: m.message_type === 0 ? ('client' as const) : ('agent' as const),
      text: m.content?.slice(0, 400) ?? '',
    }))
  const activeLinkedApp: LinkedAppSummary | null =
    selected && linkedApp && linkedApp.convId === selected.id ? linkedApp : null

  // ── Render ──────────────────────────────────────────────────────────────────
  // UX-1 viewport ownership: [data-inbox-fullbleed] makes the admin shell's
  // <main> drop its padding/scroll (globals.css), so this page owns the box
  // between AdminHeader and the mobile bottom nav. The root is h-full inside
  // that correctly-sized box; the pre-auth screen below renders before the
  // shell hands over the box, so it sizes itself against the dynamic viewport.
  if (!profile && loading) {
    return (
      <div data-inbox-fullbleed className="flex items-center justify-center h-full max-h-[100dvh] bg-walz-off-white text-walz-muted-strong text-sm">
        Loading inbox...
      </div>
    )
  }

  return (
    <div data-inbox-fullbleed className="flex h-full bg-walz-off-white overflow-hidden relative">

      {/* Conversation list — left panel on desktop (side-by-side unchanged).
          Below md it is a full-size SCREEN that stays MOUNTED and slides away
          (motion-safe transform, never display:none), so its scroll position
          and DOM survive round trips; the off screen is aria-hidden + inert.
          Keeps its dark navy surface this release (dark rail + light canvas). */}
      <div
        ref={el => {
          listColRef.current = el
          screens.registerListScroller(el?.querySelector<HTMLElement>('.overflow-y-auto') ?? null)
        }}
        aria-hidden={hideList || undefined}
        className={`
          flex-shrink-0 flex flex-col min-h-0 w-full md:w-72 xl:w-80
          max-md:absolute max-md:inset-0 motion-safe:max-md:transition-transform motion-safe:max-md:duration-200
          ${screens.screen === 'list' ? 'max-md:translate-x-0' : 'max-md:translate-x-[-100%]'}
        `}>
        {convsError && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-red-500/15 border-b border-red-500/30 text-[11px] text-red-200">
            <span>{convsError}</span>
            <button onClick={() => fetchConvs(true)} className="underline font-semibold">Retry</button>
          </div>
        )}
        <ConversationList
          loadFailed={convsError}
          onRetry={() => fetchConvs(true)}
          loading={loading}
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

      {/* Chat window — flex-1 on desktop; a mounted sliding screen below md
          (same transform contract as the list — ChatWindow's message scroller
          keeps its position because the pane never unmounts or display:nones). */}
      <div
        ref={chatColRef}
        aria-hidden={hideChat || undefined}
        tabIndex={-1}
        className={`
          flex-1 flex flex-col min-h-0 min-w-0
          max-md:absolute max-md:inset-0 motion-safe:max-md:transition-transform motion-safe:max-md:duration-200
          ${screens.screen === 'chat' ? 'max-md:translate-x-0' : 'max-md:translate-x-[100%]'}
        `}>
        {selected ? (
          <div className="flex-1 flex flex-col relative min-h-0 min-w-0">
            {/* UX-2: the floating Application Lookup pill is gone — the lookup
                now opens from the header ••• menu and the ClientInfo
                APPLICATION section. */}
            <ChatWindow
              conv={selected}
              messages={messages}
              agents={agents}
              onSend={handleSend}
              onAssign={handleAssign}
              onResolve={handleResolve}
              onReopen={handleReopen}
              onBack={screens.back}
              onLoadOlder={loadOlderMessages}
              loadingOlder={history.loadingOlder}
              olderError={history.olderError}
              beginningReached={history.beginning}
              loadError={msgLoadError}
              onRetryLoad={() => selected && fetchMessages(selected.id)}
              onOpenLookup={() => setShowAppLookup(true)}
              onOpenClientPanel={screens.openDetails}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-walz-muted-strong">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-sm">Select a conversation to start</p>
          </div>
        )}
      </div>

      {/* Secure Application Lookup drawer — stays inside the Inbox */}
      {showAppLookup && (
        <ApplicationLookupDrawer
          conversationId={selected ? String(selected.id) : undefined}
          onClose={() => setShowAppLookup(false)}
          onVerified={summary => {
            const conv = selectedRef.current
            if (conv) setLinkedApp({ convId: conv.id, ...summary })
          }}
        />
      )}

      {/* Client info — hidden on mobile, visible on large screens only.
          While the copilot is open on desktop, the copilot panel takes this
          slot so the conversation keeps its width. */}
      {selected && !copilotOpen && (
        <div className="hidden lg:flex min-h-0">
          <ClientInfo
            conv={selected}
            agents={agents}
            onAssign={handleAssign}
            onResolve={handleResolve}
            onReopen={handleReopen}
            linkedApp={activeLinkedApp}
            onOpenLookup={() => setShowAppLookup(true)}
            onOpenPaymentRequest={() => setPaymentOpen(true)}
            onOpenVisaForm={() => setVisaFormOpen(true)}
            onOpenItineraryRequest={() => setItineraryRequestOpen(true)}
            onOpenClientIdentity={mode => setIdentityDrawer({ mode })}
            identityRefreshToken={identityRefreshToken}
            onOpenCreateQuote={() => setQuoteOpen(true)}
          />
        </div>
      )}

      {/* Staff Jade copilot — stub panel this release (desktop peer panel /
          mobile bottom sheet live inside the component) */}
      <InboxJadeCopilot
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        conversationId={selected?.id ?? null}
        channel={selected ? (selected.channel ?? selected.meta?.channel ?? 'Web').replace('Channel::', '') : ''}
        contactName={selected?.meta?.sender?.name ?? ''}
        contactEmail={selected?.meta?.sender?.email}
        contactPhone={selected?.meta?.sender?.phone_number}
        recentMessages={recentMessages}
      />

      {/* Client details — UX-4 DetailsDrawer (right-side slide-in below lg,
          drawer z-layer, scrim + Esc + focus restore) replaces the UX-2
          full-screen overlay for BOTH tablet (md–lg) and mobile. Same open
          triggers: header ••• 'Client details'. Desktop lg+ keeps the rail. */}
      {screens.detailsOpen && selected && (
        <DetailsDrawer open onClose={screens.closeDetails} title="Client details">
          <ClientInfo
            variant="overlay"
            conv={selected}
            agents={agents}
            onAssign={handleAssign}
            onResolve={handleResolve}
            onReopen={handleReopen}
            linkedApp={activeLinkedApp}
            onOpenLookup={() => { screens.closeDetails(); setShowAppLookup(true) }}
            onOpenPaymentRequest={() => { screens.closeDetails(); setPaymentOpen(true) }}
            onOpenVisaForm={() => { screens.closeDetails(); setVisaFormOpen(true) }}
            onOpenItineraryRequest={() => { screens.closeDetails(); setItineraryRequestOpen(true) }}
            onOpenCreateQuote={() => { screens.closeDetails(); setQuoteOpen(true) }}
            onOpenClientIdentity={mode => { screens.closeDetails(); setIdentityDrawer({ mode }) }}
            identityRefreshToken={identityRefreshToken}
          />
        </DetailsDrawer>
      )}

      {/* Request Payment — UX-4.1B Client Action Centre. Generation never
          sends; 'Send to client' goes through the EXISTING composer send
          path (handleSend), never a second messaging pipeline. */}
      {selected && (
        <PaymentRequestDrawer
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          conversationId={selected.id}
          onSendMessage={text => handleSend(text, false)}
        />
      )}

      {/* Create Quote — UX-4.2 Client Action Centre. Same discipline as
          Request Payment: creation never sends; explicit Send only, via
          the EXISTING composer send path. */}
      {selected && (
        <CreateQuoteDrawer
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          conversationId={selected.id}
          onSendMessage={text => handleSend(text, false)}
        />
      )}

      {/* Client identity — UX-4.1C Find/Create, extending the same
          ConversationClientLink surface as UX-4.1A's Application Lookup. */}
      {selected && identityDrawer && (
        <ClientIdentityDrawer
          open
          initialMode={identityDrawer.mode}
          onClose={() => setIdentityDrawer(null)}
          conversationId={selected.id}
          onLinked={() => setIdentityRefreshToken(t => t + 1)}
        />
      )}

      {/* Visa Form — UX-4.3 Client Action Centre. Generation never sends;
          'Send to client' goes through the EXISTING composer send path. */}
      {selected && (
        <VisaFormDrawer
          open={visaFormOpen}
          onClose={() => setVisaFormOpen(false)}
          conversationId={selected.id}
          onSendMessage={text => handleSend(text, false)}
        />
      )}

      {/* Itinerary Request — UX-4.4 Client Action Centre. Generation never
          sends; 'Send to client' goes through the EXISTING composer send
          path. Conversion into an Itinerary happens in the existing admin
          Trip Requests / itinerary planner — never in this drawer. */}
      {selected && (
        <ItineraryRequestDrawer
          open={itineraryRequestOpen}
          onClose={() => setItineraryRequestOpen(false)}
          conversationId={selected.id}
          onSendMessage={text => handleSend(text, false)}
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

      {/* Toasts — z-[80] = Z_INDEX.toast (lib/admin/chrome.ts) */}
      <div className="fixed bottom-4 right-4 space-y-2 z-[80] pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="px-4 py-2.5 rounded-xl bg-walz-gold text-walz-deep-navy text-sm font-semibold shadow-lg">
            {t.msg}
          </div>
        ))}
      </div>

    </div>
  )
}
