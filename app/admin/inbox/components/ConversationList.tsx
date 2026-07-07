'use client'
import { useState } from 'react'
import { Search, Settings, Trash2 } from 'lucide-react'
import { CWConversation, AdminProfile } from '../types'
import { ConversationItem } from './ConversationItem'

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
  counts: { all: number; mine: number; unassigned: number; resolved: number }
}

export function ConversationList({
  conversations, selected, tab, profile, canViewAll = false, onSelect, onTabChange, onOpenSettings, onDelete, counts,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const displayed = (conversations || []).filter(c => {
    const name = c.meta?.sender?.name?.toLowerCase() ?? ''
    const preview = c.messages?.[0]?.content?.toLowerCase() ?? ''
    return name.includes(search.toLowerCase()) || preview.includes(search.toLowerCase())
  })

  const TABS: { key: Tab; label: string }[] = [
    ...(canViewAll ? [{ key: 'all' as Tab, label: 'All' }] : []),
    { key: 'mine',       label: 'Mine'       },
    { key: 'unassigned', label: 'Unassigned' },
    { key: 'resolved',   label: 'Resolved'   },
  ]

  return (
    <div className="w-full flex flex-col bg-[#0d2444] border-r border-white/8 h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-[#C9A84C] uppercase tracking-widest">Inbox</p>
          {profile && (
            <p className="text-[10px] text-white/40 mt-0.5 truncate">{profile.name}</p>
          )}
        </div>
        {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 bg-transparent text-xs text-white placeholder-white/30 outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wide transition-colors relative ${
              tab === t.key ? 'text-[#C9A84C]' : 'text-white/35 hover:text-white/60'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="ml-1 text-[9px] bg-white/10 rounded-full px-1">
                {counts[t.key]}
              </span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C9A84C]" />
            )}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {!displayed || displayed.length === 0 ? (
          <div className="py-12 text-center text-white/25 text-xs">
            No conversations
          </div>
        ) : (
          (displayed || []).map(conv => (
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
                  className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-red-400 hover:bg-red-400/10"
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
