'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Check, Archive, Star, ExternalLink, X } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

type Notif = {
  id: string
  category: string
  title: string
  body: string
  read: boolean
  important: boolean
  sourceId: string | null
  sourceType: string | null
  createdAt: string
}

const CAT_ICON: Record<string, string> = {
  JADE_BRIEF: '✨',
  SYSTEM:     '⚙️',
  VISA:       '🛂',
  TRAVEL:     '🌍',
  BOOKING:    '📋',
  SUPPLIER:   '🔗',
  MANAGEMENT: '👔',
}

function sourceLink(n: Notif): string | null {
  if (n.sourceType === 'announcement' && n.sourceId) return `/admin/staff-updates/${n.sourceId}`
  if (n.sourceType === 'brief') return '/admin/jade/briefs'
  return null
}

export function NotificationBell() {
  const [count,    setCount]   = useState(0)
  const [open,     setOpen]    = useState(false)
  const [items,    setItems]   = useState<Notif[]>([])
  const [loading,  setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Poll unread count every 60 seconds
  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function fetchCount() {
    try {
      const res = await fetch('/api/admin/notifications/unread-count', { cache: 'no-store' })
      const d = await res.json()
      setCount(d.count ?? 0)
    } catch {
      // silent fail
    }
  }

  async function openPanel() {
    setOpen(o => !o)
    if (!open) {
      setLoading(true)
      try {
        const res = await fetch('/api/admin/notifications?filter=unread&limit=8')
        const d = await res.json()
        setItems(d.items ?? [])
      } finally {
        setLoading(false)
      }
    }
  }

  async function markRead(id: string) {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setCount(c => Math.max(0, c - 1))
    await fetch(`/api/admin/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
  }

  async function markAllRead() {
    setItems(prev => prev.map(n => ({ ...n, read: true })))
    setCount(0)
    await fetch('/api/admin/notifications/mark-all-read', { method: 'POST' })
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={openPanel}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#C9A84C] text-[#0B1F3A] text-[9px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[#0d1e35] rounded-2xl shadow-2xl ring-1 ring-white/10 z-50 overflow-hidden">

          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#C9A84C]" />
              <span className="text-sm font-semibold text-white">Notifications</span>
              {count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#C9A84C] text-[#0B1F3A] font-bold">
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {count > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] text-white/40 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 border-b border-white/5 animate-pulse">
                  <div className="h-3 bg-white/10 rounded w-3/4 mb-2" />
                  <div className="h-2 bg-white/5 rounded w-full" />
                </div>
              ))
            ) : items.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-white/15 mx-auto mb-2" />
                <p className="text-white/30 text-sm">All caught up</p>
              </div>
            ) : (
              items.map(n => {
                const link = sourceLink(n)
                const content = (
                  <div
                    className={`flex items-start gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                      !n.read ? 'bg-white/2' : ''
                    }`}
                    onClick={() => !n.read && markRead(n.id)}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{CAT_ICON[n.category] ?? '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] flex-shrink-0" />}
                        <p className={`text-xs font-medium truncate ${n.read ? 'text-white/60' : 'text-white'}`}>
                          {n.title}
                        </p>
                      </div>
                      <p className="text-[11px] text-white/35 line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-white/20 mt-1">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                )

                return link ? (
                  <Link key={n.id} href={link} onClick={() => { markRead(n.id); setOpen(false) }}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 py-3 text-xs text-[#C9A84C] hover:text-[#b8943d] font-medium transition-colors border-t border-white/5"
          >
            View all notifications
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  )
}
