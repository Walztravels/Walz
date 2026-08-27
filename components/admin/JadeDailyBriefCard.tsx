'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'

type Brief = {
  id: string
  briefDate: string
  motivation: string
  motivationThought: string
  contentJson: {
    announcements?: { id: string; title: string; category: string; priority: string }[]
    urgentCount?: number
  }
  generatedAt: string
}

type BriefResponse = {
  brief: Brief | null
  read: boolean
  notificationId: string | null
}

function formatDate(briefDate: string) {
  const d = new Date(briefDate + 'T12:00:00Z')
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function JadeDailyBriefCard({ staffName }: { staffName: string }) {
  const [data,    setData]    = useState<BriefResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [read,    setRead]    = useState(false)

  useEffect(() => {
    fetch('/api/admin/jade/brief/today')
      .then(r => r.json())
      .then((d: BriefResponse) => {
        setData(d)
        setRead(d.read)
      })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  async function markRead() {
    if (!data?.notificationId || read) return
    setRead(true)
    await fetch(`/api/admin/notifications/${data.notificationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
  }

  if (loading) {
    return (
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-5 animate-pulse h-36" />
    )
  }

  if (!data?.brief) {
    return (
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-[#C9A84C]" />
          <span className="text-xs font-semibold text-[#C9A84C] uppercase tracking-wider">Jade Daily Brief</span>
        </div>
        <p className="text-white/30 text-sm">No brief generated yet today.</p>
      </div>
    )
  }

  const { brief } = data
  const urgentCount = brief.contentJson?.urgentCount ?? 0
  const announcements = brief.contentJson?.announcements ?? []

  return (
    <div className={`bg-[#112240] rounded-2xl ring-1 transition-all ${
      !read ? 'ring-[#C9A84C]/25' : 'ring-white/5'
    }`}>
      <div className="p-5">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9A84C]" />
            <span className="text-xs font-bold text-[#C9A84C] uppercase tracking-wider">Jade Daily Brief</span>
            {!read && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] inline-block" />
            )}
          </div>
          <span className="text-[11px] text-white/30 flex-shrink-0">{formatDate(brief.briefDate)}</span>
        </div>

        {/* Greeting */}
        <p className="text-white/60 text-xs mb-2">
          Good {greeting()}, {staffName.split(' ')[0]}
        </p>

        {/* Motivation */}
        <p className="text-white text-sm font-medium leading-relaxed italic mb-1">
          &ldquo;{brief.motivation}&rdquo;
        </p>
        <p className="text-white/50 text-xs leading-relaxed">
          {brief.motivationThought}
        </p>

        {/* Urgent badge */}
        {urgentCount > 0 && (
          <div className="flex items-center gap-1.5 mt-3 text-red-300 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {urgentCount} urgent {urgentCount === 1 ? 'item' : 'items'} — read the full brief
          </div>
        )}

        {/* Announcement previews */}
        {announcements.length > 0 && (
          <div className="mt-3 space-y-1">
            {announcements.slice(0, 2).map(a => (
              <div key={a.id} className="flex items-center gap-1.5 text-[11px] text-white/40">
                <span className="text-[#C9A84C]/60">🚀</span>
                <span className="truncate">{a.title}</span>
              </div>
            ))}
            {announcements.length > 2 && (
              <p className="text-[11px] text-white/25">+{announcements.length - 2} more updates</p>
            )}
          </div>
        )}

      </div>

      {/* Footer actions */}
      <div className="border-t border-white/5 px-5 py-3 flex items-center justify-between">
        <Link
          href="/admin/jade/briefs"
          onClick={markRead}
          className="flex items-center gap-1 text-xs text-[#C9A84C] hover:text-[#b8943d] font-medium transition-colors"
        >
          Read Full Brief
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
        {read ? (
          <span className="flex items-center gap-1 text-[11px] text-white/25">
            <CheckCircle2 className="w-3 h-3" /> Read
          </span>
        ) : (
          <button
            onClick={markRead}
            className="text-[11px] text-white/25 hover:text-white/50 transition-colors"
          >
            Mark as read
          </button>
        )}
      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
