'use client'
import { useRef, useState } from 'react'
import { Search, Settings, Trash2, X } from 'lucide-react'
import { CWConversation, AdminProfile } from '../types'
import { ConversationItem } from './ConversationItem'
import { cn } from '@/lib/utils'

type Tab = 'all' | 'mine' | 'unassigned' | 'resolved'

interface Props {
  conversations: CWConversation[]
  selected: CWConversation | null
  tab: Tab
  profile: AdminProfile | null
  canViewAll?: boolean
  onSelect: (conv: CWConversation) => void
  onTabChange: (tab: Tab) => void
  onOpenSettings: () => void
  onDelete?: (convId: number) => void
  /**
   * Honest counts only: all/mine/unassigned are counts over the LOADED payload
   * (200-cap, RBAC-thinned) — list counts, not global totals. `resolved` is
   * null until an authoritative count exists (UX-5); a null count renders NO
   * badge rather than a wrong number.
   */
  counts: { all: number; mine: number; unassigned: number; resolved: number | null }
  /** The list request failed — an empty list must read as a failure, not an empty inbox. */
  loadFailed?: boolean
  onRetry?: () => void
  /** Initial list load in flight — an empty list shows skeleton rows, not "empty". */
  loading?: boolean
}

const SKELETON_ROWS = [0, 1, 2, 3, 4]

/**
 * INBOX UX-3 — the conversation rail.
 * Premium dark navy surface (tokenized: bg-walz-navy + walz-gold accents,
 * white/5 hairlines — no hex literals, no amber).
 * Responsive contract: ≤767px the rail is the full-width list view
 * (page-owned mobileView mechanism, untouched here); 768–1023px (tablet) the
 * rail sits at the page's fixed md width beside the conversation — 2 panes,
 * no ClientInfo (existing architecture, ClientInfo appears at lg).
 */
export function ConversationList({
  conversations, selected, tab, profile, canViewAll = false, onSelect, onTabChange, onOpenSettings, onDelete, counts,
  loadFailed = false, onRetry, loading = false,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const tablistRef = useRef<HTMLDivElement>(null)
  const listBodyRef = useRef<HTMLDivElement>(null)

  // Client-side search over the LOADED rows only (name + last-message preview).
  // Honest scope: it filters what is on screen, it does not query the server —
  // server-backed search is a UX-5 item.
  const displayed = (conversations || []).filter(c => {
    const name = c.meta?.sender?.name?.toLowerCase() ?? ''
    const preview = c.messages?.[0]?.content?.toLowerCase() ?? ''
    return name.includes(search.trim().toLowerCase()) || preview.includes(search.trim().toLowerCase())
  })

  const TABS: { key: Tab; label: string }[] = [
    ...(canViewAll ? [{ key: 'all' as Tab, label: 'All' }] : []),
    { key: 'mine',       label: 'Mine'       },
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'resolved',   label: 'Resolved'   },
  ]

  // Arrow left/right moves focus between queue pills (tablist semantics).
  function handleTabKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const pills = Array.from(
      tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    )
    if (pills.length === 0) return
    const idx = pills.indexOf(document.activeElement as HTMLButtonElement)
    e.preventDefault()
    const next = e.key === 'ArrowRight'
      ? Math.min(idx + 1, pills.length - 1)
      : Math.max(idx - 1, 0)
    pills[next]?.focus()
  }

  // ArrowUp/ArrowDown moves focus between conversation cards; Enter/Space
  // selects via the native button.
  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const cards = Array.from(
      listBodyRef.current?.querySelectorAll<HTMLButtonElement>('[data-conv-card]') ?? [],
    )
    if (cards.length === 0) return
    const idx = cards.indexOf(document.activeElement as HTMLButtonElement)
    e.preventDefault()
    const next = e.key === 'ArrowDown'
      ? Math.min(idx + 1, cards.length - 1)
      : Math.max(idx - 1, 0)
    cards[next]?.focus()
  }

  return (
    <div className="w-full flex flex-col bg-walz-navy border-r border-white/5 h-full">
      {/* Header — compact eyebrow + settings */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-walz-gold uppercase tracking-widest">Inbox</p>
          {profile && (
            <p className="text-[10px] text-white/50 mt-0.5 truncate">{profile.name}</p>
          )}
        </div>
        {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
          <button
            onClick={onOpenSettings}
            aria-label="Inbox settings"
            className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search — client-side filter over loaded rows */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations"
            className="flex-1 min-w-0 bg-transparent text-xs text-white placeholder-white/30 outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="p-1.5 -m-1 flex-shrink-0 rounded text-white/50 hover:text-white transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Queue pills — horizontally scrollable, never wrap at 390px */}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Conversation queues"
        onKeyDown={handleTabKeyDown}
        className="flex gap-1.5 px-3 py-2 overflow-x-auto whitespace-nowrap border-b border-white/5"
      >
        {TABS.map(t => {
          const active = tab === t.key
          const n = counts[t.key]
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(t.key)}
              className={cn(
                'shrink-0 rounded-full px-3 min-h-[32px] py-1 text-[11px] font-semibold transition-colors touch-manipulation',
                active
                  ? 'bg-walz-gold/15 text-walz-gold border border-walz-gold/30'
                  : 'text-white/50 border border-white/10 hover:text-white/80',
              )}
            >
              {t.label}
              {/* null count = no authoritative number — render NO badge */}
              {n != null && n > 0 && (
                <span className="ml-1.5 text-[10px] opacity-70">{n}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Conversation list body.
          State priority (incident pin: failure BEFORE empty):
          failure → loading skeletons → search-empty → genuine per-tab empty. */}
      <div ref={listBodyRef} onKeyDown={handleCardKeyDown} className="flex-1 overflow-y-auto">
        {displayed.length === 0 ? (
          loadFailed ? (
            <div className="py-12 text-center text-xs">
              <p className="text-red-300">Could not load conversations.</p>
              <button onClick={() => onRetry?.()} className="mt-2 underline font-semibold text-white/60 hover:text-white">Retry</button>
            </div>
          ) : loading ? (
            // Static skeleton blocks; pulse only when the user allows motion.
            <div aria-hidden="true">
              {SKELETON_ROWS.map(i => (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5 border-b border-white/5 motion-safe:animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
                  <div className="flex-1 min-w-0 pt-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-white/10" />
                    <div className="h-2.5 w-full rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : search.trim() ? (
            <div className="py-12 text-center text-white/50 text-xs">
              No conversations match your search.
            </div>
          ) : (
            // Genuine per-queue empty — 'all' keeps the incident-pinned substring,
            // and every literal sits AFTER the failure branch in this source.
            <div className="py-12 text-center text-white/50 text-xs">
              {tab === 'mine'       ? 'No conversations assigned to you.'
              : tab === 'unassigned' ? 'No unassigned conversations.'
              : tab === 'resolved'   ? 'No resolved conversations.'
              :                        'No conversations yet.'}
            </div>
          )
        ) : (
          displayed.map(conv => (
            <div key={conv.id} className="relative group">
              <ConversationItem
                conv={conv}
                selected={selected?.id === conv.id}
                onClick={() => { setConfirmDelete(null); onSelect(conv) }}
              />
              {onDelete && confirmDelete === conv.id ? (
                <div className="absolute inset-0 bg-red-900/90 flex items-center justify-center gap-2 z-10">
                  <span className="text-xs text-white">Delete?</span>
                  <button
                    onClick={() => { onDelete(conv.id); setConfirmDelete(null) }}
                    className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
                  >Yes</button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs bg-white/20 text-white px-2 py-0.5 rounded hover:bg-white/30"
                  >No</button>
                </div>
              ) : onDelete && (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(conv.id) }}
                  className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-white/50 hover:text-red-400 hover:bg-red-400/10"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
