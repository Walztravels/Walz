'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Loader2, X, Check, Calendar, Plus } from 'lucide-react'

type Post = {
  id:          string
  platform:    string
  postType:    string
  caption:     string
  hashtags:    string
  status:      string
  scheduledAt: string | null
  createdBy:   string
}

const STATUS_COLORS: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-600 border-gray-200',
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  approved:         'bg-blue-50 text-blue-700 border-blue-200',
  scheduled:        'bg-green-50 text-green-700 border-green-200',
  published:        'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed:           'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  draft:            'Draft',
  pending_approval: 'Pending',
  approved:         'Approved',
  scheduled:        'Scheduled',
  published:        '✓ Published',
  failed:           '⚠ Failed',
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROWS = [
  { label: 'Instagram Feed', platform: 'instagram', postType: 'feed'  },
  { label: 'Facebook Post',  platform: 'facebook',  postType: 'feed'  },
  { label: 'Story',          platform: 'instagram', postType: 'story' },
]

function getWeekStart(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmt(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function CalendarPage() {
  const [weekStart,   setWeekStart]   = useState(() => getWeekStart(new Date()))
  const [posts,       setPosts]       = useState<Post[]>([])
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [genDone,     setGenDone]     = useState(false)
  const [selected,    setSelected]    = useState<Post | null>(null)
  const [editStatus,  setEditStatus]  = useState('')
  const [saving,      setSaving]      = useState(false)

  const weekEnd = addDays(weekStart, 6)

  useEffect(() => {
    setLoading(true)
    const from = weekStart.toISOString()
    const to   = addDays(weekStart, 7).toISOString()
    fetch(`/api/admin/marketing/posts?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: { posts: Post[] }) => {
        setPosts(d.posts ?? [])
        setLoading(false)
      })
  }, [weekStart])

  function prevWeek() { setWeekStart(w => addDays(w, -7)) }
  function nextWeek() { setWeekStart(w => addDays(w, 7)) }

  async function generateWeek() {
    setGenerating(true)
    setGenDone(false)
    try {
      const res = await fetch('/api/admin/marketing/generate-week', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weekStart: weekStart.toISOString() }),
      })
      const data = await res.json() as { posts: Post[] }
      setPosts(prev => [...prev, ...(data.posts ?? [])])
      setGenDone(true)
      setTimeout(() => setGenDone(false), 3000)
    } finally {
      setGenerating(false)
    }
  }

  function getPost(dayOffset: number, platform: string, postType: string): Post | undefined {
    const day = addDays(weekStart, dayOffset)
    const dayStr = day.toDateString()
    return posts.find(p => {
      if (!p.scheduledAt) return false
      return new Date(p.scheduledAt).toDateString() === dayStr
        && p.platform === platform
        && p.postType === postType
    })
  }

  async function saveStatus() {
    if (!selected) return
    setSaving(true)
    await fetch('/api/admin/marketing/posts', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: selected.id, status: editStatus }),
    })
    setPosts(prev => prev.map(p => p.id === selected.id ? { ...p, status: editStatus } : p))
    setSaving(false)
    setSelected(null)
  }

  return (
    <div className="space-y-4 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Content Calendar</h1>
            <p className="text-sm text-gray-500">{fmt(weekStart)} – {fmt(weekEnd)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={prevWeek} className="p-2 hover:bg-gray-50 transition text-gray-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekStart(getWeekStart(new Date()))}
              className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
            >
              This Week
            </button>
            <button onClick={nextWeek} className="p-2 hover:bg-gray-50 transition text-gray-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={generateWeek}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-100 disabled:text-gray-400 text-white font-semibold rounded-xl transition text-sm"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : genDone
              ? <><Check className="w-4 h-4" /> Generated!</>
              : <><Sparkles className="w-4 h-4" /> Generate Week</>
            }
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <span key={k} className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[k]}`}>{v}</span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-gray-100">
          <div className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">
            Channel
          </div>
          {DAYS.map((day, i) => (
            <div key={day} className="px-3 py-3 text-xs font-semibold text-gray-600 text-center border-r border-gray-100 last:border-r-0">
              <div>{day}</div>
              <div className="text-gray-400 font-normal mt-0.5">{fmt(addDays(weekStart, i))}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-8 border-b border-gray-100 last:border-b-0">
            <div className="px-4 py-4 text-xs font-medium text-gray-500 border-r border-gray-100 flex items-center">
              {row.label}
            </div>
            {DAYS.map((_, dayIdx) => {
              const post = getPost(dayIdx, row.platform, row.postType)
              return (
                <div
                  key={dayIdx}
                  className="px-2 py-3 border-r border-gray-100 last:border-r-0 min-h-[90px] flex items-start"
                >
                  {loading
                    ? <div className="w-full h-12 bg-gray-50 rounded-lg animate-pulse" />
                    : post
                    ? (
                      <button
                        onClick={() => { setSelected(post); setEditStatus(post.status) }}
                        className={`w-full text-left rounded-lg border px-2 py-2 transition hover:shadow-sm ${STATUS_COLORS[post.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1">
                          {STATUS_LABELS[post.status] ?? post.status}
                        </p>
                        <p className="text-xs leading-tight line-clamp-3">{post.caption.slice(0, 80)}…</p>
                      </button>
                    )
                    : (
                      <button
                        onClick={() => window.location.href = '/admin/marketing/captions'}
                        className="w-full h-12 rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-amber-400 hover:text-amber-400 transition flex items-center justify-center text-xs gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    )
                  }
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Edit Post</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selected.caption}</p>
              </div>
              {selected.hashtags && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Hashtags</p>
                  <p className="text-xs text-amber-600">{selected.hashtags}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setEditStatus(k)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                        editStatus === k
                          ? STATUS_COLORS[k]
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                Cancel
              </button>
              <button
                onClick={saveStatus}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
