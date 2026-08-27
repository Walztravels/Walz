'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Check, Archive, Star, Filter, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

type Notif = {
  id: string
  category: string
  title: string
  body: string
  read: boolean
  important: boolean
  archived: boolean
  sourceId: string | null
  sourceType: string | null
  createdAt: string
}

const CAT_STYLES: Record<string, { icon: string; color: string }> = {
  JADE_BRIEF: { icon: '✨', color: 'text-[#C9A84C]' },
  SYSTEM:     { icon: '⚙️', color: 'text-blue-300' },
  VISA:       { icon: '🛂', color: 'text-emerald-300' },
  TRAVEL:     { icon: '🌍', color: 'text-sky-300' },
  BOOKING:    { icon: '📋', color: 'text-violet-300' },
  SUPPLIER:   { icon: '🔗', color: 'text-orange-300' },
  MANAGEMENT: { icon: '👔', color: 'text-pink-300' },
}

const FILTERS = [
  { value: 'unread',    label: 'Unread' },
  { value: 'all',       label: 'All' },
  { value: 'important', label: 'Starred' },
  { value: 'archived',  label: 'Archived' },
]

const CATEGORIES = ['all', 'JADE_BRIEF', 'SYSTEM', 'VISA', 'TRAVEL', 'BOOKING', 'SUPPLIER', 'MANAGEMENT']

export default function NotificationsPage() {
  const [items,    setItems]    = useState<Notif[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('unread')
  const [category, setCategory] = useState('all')
  const [page,     setPage]     = useState(1)
  const [marking,  setMarking]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams({ filter, category, page: String(page), limit: '25' })
    const res = await fetch(`/api/admin/notifications?${qs}`)
    const d = await res.json()
    setItems(d.items ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [filter, category, page])

  useEffect(() => { load() }, [load])

  async function markRead(id: string) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    await fetch(`/api/admin/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
  }

  async function toggleImportant(id: string, current: boolean) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, important: !current } : n))
    await fetch(`/api/admin/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ important: !current }),
    })
  }

  async function archiveItem(id: string) {
    setItems(prev => prev.filter(n => n.id !== id))
    setTotal(t => t - 1)
    await fetch(`/api/admin/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
  }

  async function markAllRead() {
    setMarking(true)
    await fetch('/api/admin/notifications/mark-all-read', { method: 'POST' })
    await load()
    setMarking(false)
  }

  function sourceLink(n: Notif): string | null {
    if (n.sourceType === 'announcement' && n.sourceId) return `/admin/staff-updates/${n.sourceId}`
    if (n.sourceType === 'brief') return '/admin/jade/briefs'
    return null
  }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-[#C9A84C]" />
            Notifications
          </h1>
          <p className="text-white/40 text-sm mt-1">
            {total} notification{total !== 1 ? 's' : ''}
            {filter === 'unread' ? ' unread' : ''}
          </p>
        </div>
        {filter === 'unread' && total > 0 && (
          <button
            onClick={markAllRead}
            disabled={marking}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-[#112240] border border-white/10 hover:border-white/20 text-white/60 hover:text-white transition-colors"
          >
            {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Mark all read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 bg-[#112240] border border-white/10 rounded-xl p-1">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1) }}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.value ? 'bg-[#C9A84C] text-[#0B1F3A]' : 'text-white/50 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => { setCategory(c); setPage(1) }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                category === c
                  ? 'bg-white/10 text-white'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {c === 'all' ? 'All Categories' : c.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-[#112240] rounded-2xl h-20 animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="bg-[#112240] rounded-2xl p-12 text-center">
            <Bell className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">
              {filter === 'unread' ? 'All caught up — no unread notifications' : 'No notifications'}
            </p>
          </div>
        ) : items.map(n => {
          const cat   = CAT_STYLES[n.category] ?? { icon: '📌', color: 'text-white/40' }
          const link  = sourceLink(n)
          const Inner = (
            <div
              key={n.id}
              className={`bg-[#112240] rounded-2xl ring-1 ring-white/5 p-4 transition-all ${
                !n.read ? 'ring-[#C9A84C]/15' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Category icon */}
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-base">
                  {cat.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0" />}
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cat.color}`}>
                      {n.category.replace('_',' ')}
                    </span>
                    <span className="text-[10px] text-white/25 ml-auto">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className={`text-sm font-medium ${n.read ? 'text-white/70' : 'text-white'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{n.body}</p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={e => { e.preventDefault(); toggleImportant(n.id, n.important) }}
                    className={`p-1 rounded-lg transition-colors ${
                      n.important ? 'text-[#C9A84C]' : 'text-white/20 hover:text-white/50'
                    }`}
                    title={n.important ? 'Unstar' : 'Star'}
                  >
                    <Star className="w-3.5 h-3.5" fill={n.important ? 'currentColor' : 'none'} />
                  </button>
                  {!n.read && (
                    <button
                      onClick={e => { e.preventDefault(); markRead(n.id) }}
                      className="p-1 rounded-lg text-white/20 hover:text-emerald-300 transition-colors"
                      title="Mark read"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.preventDefault(); archiveItem(n.id) }}
                    className="p-1 rounded-lg text-white/20 hover:text-white/50 transition-colors"
                    title="Archive"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )

          return link ? (
            <Link key={n.id} href={link} onClick={() => markRead(n.id)}>
              {Inner}
            </Link>
          ) : (
            <div key={n.id} onClick={() => !n.read && markRead(n.id)}>
              {Inner}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center justify-between text-sm text-white/40">
          <span>{total} total</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 bg-[#112240] rounded-lg disabled:opacity-30"
            >
              Previous
            </button>
            <button
              disabled={page * 25 >= total}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-[#112240] rounded-lg disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
