'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import {
  Plus, Search, Filter, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, Archive, Eye, Megaphone,
} from 'lucide-react'

type Announcement = {
  id: string
  title: string
  category: string
  summary: string
  audience: string
  priority: string
  status: string
  effectiveDate: string | null
  publishedAt: string | null
  createdAt: string
  author: { name: string }
}

const CATEGORY_LABELS: Record<string, string> = {
  NEW_FEATURE:   'New Feature',
  SYSTEM_UPDATE: 'System Update',
  POLICY:        'Policy',
  SUPPLIER:      'Supplier',
  IMPORTANT:     'Important',
  TRAINING:      'Training',
}

const PRIORITY_STYLES: Record<string, string> = {
  NORMAL: 'bg-blue-500/10 text-blue-300 border border-blue-500/20',
  HIGH:   'bg-amber-500/10 text-amber-300 border border-amber-500/20',
  URGENT: 'bg-red-500/10 text-red-300 border border-red-500/20',
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT:    'bg-gray-500/10 text-gray-400',
  APPROVED: 'bg-amber-500/10 text-amber-300',
  PUBLISHED: 'bg-emerald-500/10 text-emerald-300',
  ARCHIVED: 'bg-gray-500/10 text-gray-500',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function StaffUpdatesPage() {
  const { profile } = useStaffPermissions()
  const router = useRouter()
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin'

  const [items,   setItems]   = useState<Announcement[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [status,  setStatus]  = useState(isAdmin ? 'all' : 'PUBLISHED')
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ status, page: String(page) })
      const res = await fetch(`/api/admin/announcements?${qs}`)
      const data = await res.json()
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [status, page])

  useEffect(() => { load() }, [load])

  const filtered = search
    ? items.filter(i => i.title.toLowerCase().includes(search.toLowerCase()) || i.summary.toLowerCase().includes(search.toLowerCase()))
    : items

  async function changeStatus(id: string, newStatus: string) {
    await fetch(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    load()
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff Updates</h1>
          <p className="text-white/50 text-sm mt-1">
            Walz system updates, new features and internal announcements
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/staff-updates/new"
            className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Announcement
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search announcements…"
            className="w-full pl-9 pr-3 py-2 bg-[#112240] border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C]/50"
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1.5 bg-[#112240] border border-white/10 rounded-xl p-1">
            {['all','DRAFT','APPROVED','PUBLISHED','ARCHIVED'].map(s => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1) }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  status === s
                    ? 'bg-[#C9A84C] text-[#0B1F3A]'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[#112240] rounded-2xl p-5 animate-pulse h-24" />
          ))
        ) : filtered.length === 0 ? (
          <div className="bg-[#112240] rounded-2xl p-12 text-center">
            <Megaphone className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">No announcements found</p>
          </div>
        ) : filtered.map(ann => (
          <div
            key={ann.id}
            className="bg-[#112240] rounded-2xl ring-1 ring-white/5 hover:ring-[#C9A84C]/20 transition-all"
          >
            <div className="flex items-start gap-4 p-5">
              {/* Priority indicator */}
              <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
                ann.priority === 'URGENT' ? 'bg-red-400' :
                ann.priority === 'HIGH'   ? 'bg-amber-400' : 'bg-blue-400'
              }`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-semibold text-[#C9A84C] uppercase tracking-wider">
                    {CATEGORY_LABELS[ann.category] ?? ann.category}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[ann.priority]}`}>
                    {ann.priority}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[ann.status]}`}>
                    {ann.status}
                  </span>
                </div>
                <h3 className="text-white font-semibold text-sm">{ann.title}</h3>
                <p className="text-white/50 text-xs mt-1 line-clamp-2">{ann.summary}</p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-white/30">
                  <span>By {ann.author.name}</span>
                  <span>·</span>
                  <span>{fmt(ann.createdAt)}</span>
                  {ann.effectiveDate && (
                    <>
                      <span>·</span>
                      <span>Effective {fmt(ann.effectiveDate)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {isAdmin && ann.status === 'DRAFT' && (
                  <button
                    onClick={() => changeStatus(ann.id, 'APPROVED')}
                    className="p-1.5 rounded-lg hover:bg-amber-500/10 text-white/40 hover:text-amber-300 transition-colors"
                    title="Approve"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                {isAdmin && ann.status === 'APPROVED' && (
                  <button
                    onClick={() => changeStatus(ann.id, 'PUBLISHED')}
                    className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-white/40 hover:text-emerald-300 transition-colors"
                    title="Publish"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                {isAdmin && ann.status === 'PUBLISHED' && (
                  <button
                    onClick={() => changeStatus(ann.id, 'ARCHIVED')}
                    className="p-1.5 rounded-lg hover:bg-gray-500/10 text-white/40 hover:text-gray-300 transition-colors"
                    title="Archive"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => router.push(`/admin/staff-updates/${ann.id}`)}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > 20 && (
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
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-[#112240] rounded-lg"
            >
              Next
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
