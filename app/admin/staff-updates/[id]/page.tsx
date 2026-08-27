'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, ExternalLink, CheckCircle2, Eye, Archive, Edit2,
  Loader2, Calendar, Users, AlertTriangle,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

type Announcement = {
  id: string; title: string; category: string; summary: string
  detail: string; whatToDo: string | null; effectiveDate: string | null
  relevantUrl: string | null; audience: string; priority: string
  status: string; publishedAt: string | null; createdAt: string
  author: { name: string; email: string }
}

const STATUS_CHIP: Record<string,string> = {
  DRAFT:     'bg-gray-500/10 text-gray-400 border-gray-500/20',
  APPROVED:  'bg-amber-500/10 text-amber-300 border-amber-500/20',
  PUBLISHED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  ARCHIVED:  'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AnnouncementDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const { profile } = useStaffPermissions()
  const isAdmin  = profile?.role === 'super_admin' || profile?.role === 'admin'

  const [ann,     setAnn]     = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch(`/api/admin/announcements/${id}`)
      .then(r => r.json())
      .then(d => setAnn(d.announcement ?? null))
      .finally(() => setLoading(false))
  }, [id])

  async function changeStatus(newStatus: string) {
    if (!ann) return
    setSaving(true)
    const res = await fetch(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const d = await res.json()
    setAnn(d.announcement)
    setSaving(false)
  }

  if (loading) return <div className="animate-pulse h-64 bg-[#112240] rounded-2xl" />
  if (!ann)    return <div className="text-white/40 text-center py-20">Announcement not found</div>

  return (
    <div className="max-w-2xl space-y-6">

      <Link href="/admin/staff-updates" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-sm transition-colors">
        <ChevronLeft className="w-4 h-4" />
        Staff Updates
      </Link>

      {/* Header card */}
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[#C9A84C] text-[11px] font-bold uppercase tracking-wider">
                {ann.category.replace(/_/g, ' ')}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_CHIP[ann.status]}`}>
                {ann.status}
              </span>
              {ann.priority !== 'NORMAL' && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  ann.priority === 'URGENT' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {ann.priority}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white">{ann.title}</h1>
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {saving && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
              {ann.status === 'DRAFT' && (
                <button onClick={() => changeStatus('APPROVED')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
              )}
              {ann.status === 'APPROVED' && (
                <button onClick={() => changeStatus('PUBLISHED')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                  <Eye className="w-3.5 h-3.5" /> Publish
                </button>
              )}
              {ann.status === 'PUBLISHED' && (
                <button onClick={() => changeStatus('ARCHIVED')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 transition-colors">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              )}
            </div>
          )}
        </div>

        <p className="text-white/70 text-sm leading-relaxed">{ann.summary}</p>

        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/5 text-xs text-white/40">
          <div>
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">By</span>
            {ann.author.name}
          </div>
          <div>
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">Published</span>
            {fmt(ann.publishedAt)}
          </div>
          <div>
            <span className="block text-white/25 uppercase tracking-wider mb-0.5">Effective</span>
            {fmt(ann.effectiveDate)}
          </div>
        </div>
      </div>

      {/* Full explanation */}
      <div className="bg-[#112240] rounded-2xl ring-1 ring-white/5 p-6 space-y-3">
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Full Explanation</h2>
        <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{ann.detail}</p>
      </div>

      {/* What to do */}
      {ann.whatToDo && (
        <div className="bg-[#112240] rounded-2xl ring-1 ring-[#C9A84C]/20 p-6 space-y-3">
          <h2 className="text-xs font-semibold text-[#C9A84C]/80 uppercase tracking-wider">What You Need to Do</h2>
          <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{ann.whatToDo}</p>
        </div>
      )}

      {/* Source link */}
      {ann.relevantUrl && (
        <a
          href={ann.relevantUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#112240] rounded-2xl ring-1 ring-white/5 p-4 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ExternalLink className="w-4 h-4 text-[#C9A84C]" />
          View Documentation / Source
        </a>
      )}

    </div>
  )
}
