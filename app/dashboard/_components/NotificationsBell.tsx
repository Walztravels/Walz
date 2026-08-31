'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [open, setOpen]                   = useState(false)
  const ref                               = useRef<HTMLDivElement>(null)

  function fetchNotifications() {
    fetch('/api/portal/notifications')
      .then(r => r.json())
      .then(d => {
        setNotifications(d.notifications ?? [])
        setUnreadCount(d.unreadCount ?? 0)
      })
      .catch(() => {})
  }

  function markAllRead() {
    fetch('/api/portal/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
      .then(() => {
        setUnreadCount(0)
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(v => !v); if (!open) fetchNotifications() }}
        className="relative p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-sm text-gray-800">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-amber-500 hover:underline font-medium">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No notifications yet</div>
            ) : notifications.map(n => (
              <div key={n.id} className={`px-4 py-3 border-b border-gray-50 last:border-0 ${!n.read ? 'bg-amber-50' : ''}`}>
                <p className="text-sm font-medium text-gray-800">{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                <p className="text-xs text-gray-400 mt-1.5">
                  {n.createdAt
                    ? new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
