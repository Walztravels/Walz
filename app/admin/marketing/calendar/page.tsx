'use client'

import { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, Sparkles, Loader2, X, Check,
  Calendar, Plus, CheckCircle, XCircle, Send, Trash2, Image, GripVertical,
} from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'
import { TAGS } from '@/lib/marketing-tags'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type MediaItem = {
  id:       string
  filename: string
  url:      string
  tags:     string[]
}

type Post = {
  id:          string
  platform:    string
  postType:    string
  caption:     string
  hashtags:    string
  imageUrls:   string[]
  status:      string
  scheduledAt: string | null
  createdBy:   string
  errorMsg:    string | null
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
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  scheduled:        'Scheduled',
  published:        '✓ Published',
  failed:           '⚠ Failed',
}

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook',  label: 'Facebook'  },
  { value: 'both',      label: 'Both'      },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const ROWS = [
  { label: 'Instagram Feed', platform: 'instagram', postType: 'feed'  },
  { label: 'Facebook Post',  platform: 'facebook',  postType: 'feed'  },
  { label: 'Story',          platform: 'instagram', postType: 'story' },
]

function getWeekStart(d: Date): Date {
  const date = new Date(d)
  const day  = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
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

function toLocalDT(iso: string | null): string {
  if (!iso) return ''
  const d   = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SortableImage({ url, index, onRemove }: { url: string; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: url })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-2 py-1.5 group"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition shrink-0 touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Position badge */}
      <span className="text-[10px] font-bold text-gray-400 w-4 shrink-0 text-center">{index + 1}</span>

      {/* Thumbnail */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Image ${index + 1}`} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-gray-100" />

      {/* URL truncated */}
      <span className="flex-1 min-w-0 text-xs text-gray-500 truncate">{url.split('/').pop()}</span>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 text-gray-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function CalendarPage() {
  const { role }                         = useStaffPermissions()
  const isSuperAdmin                     = role === 'super_admin'

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setEditImageUrls(prev => {
        const oldIdx = prev.indexOf(active.id as string)
        const newIdx = prev.indexOf(over.id as string)
        return arrayMove(prev, oldIdx, newIdx)
      })
    }
  }

  const [weekStart,    setWeekStart]     = useState(() => getWeekStart(new Date()))
  const [posts,        setPosts]         = useState<Post[]>([])
  const [loading,      setLoading]       = useState(true)
  const [generating,   setGenerating]    = useState(false)
  const [genDone,      setGenDone]       = useState(false)
  const [selected,     setSelected]      = useState<Post | null>(null)
  const [saving,       setSaving]        = useState(false)
  const [deleting,     setDeleting]      = useState(false)
  const [rejectionNote,setRejectionNote] = useState('')
  const [publishing,   setPublishing]    = useState<string | null>(null)
  const [publishMsg,   setPublishMsg]    = useState<{ id: string; ok: boolean; text: string } | null>(null)

  const [editCaption,    setEditCaption]    = useState('')
  const [editHashtags,   setEditHashtags]   = useState('')
  const [editPlatform,   setEditPlatform]   = useState('')
  const [editSchedule,   setEditSchedule]   = useState('')
  const [editImageUrls,  setEditImageUrls]  = useState<string[]>([])
  const [newImageUrl,    setNewImageUrl]    = useState('')

  // Media picker
  const [showPicker,   setShowPicker]   = useState(false)
  const [pickerMedia,  setPickerMedia]  = useState<MediaItem[]>([])
  const [pickerLoading,setPickerLoading]= useState(false)
  const [pickerTag,    setPickerTag]    = useState<string>('all')

  const filteredMedia = pickerTag === 'all'
    ? pickerMedia
    : pickerMedia.filter(m => m.tags?.includes(pickerTag))

  function openPicker() {
    setShowPicker(true)
    if (pickerMedia.length === 0) {
      setPickerLoading(true)
      fetch('/api/admin/marketing/media')
        .then(r => r.json())
        .then((d: { media: MediaItem[] }) => { setPickerMedia(d.media ?? []); setPickerLoading(false) })
        .catch(() => setPickerLoading(false))
    }
  }

  const weekEnd = addDays(weekStart, 6)

  useEffect(() => {
    setLoading(true)
    const from = weekStart.toISOString()
    const to   = addDays(weekStart, 7).toISOString()
    fetch(`/api/admin/marketing/posts?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: { posts: Post[] }) => { setPosts(d.posts ?? []); setLoading(false) })
  }, [weekStart])

  function prevWeek() { setWeekStart(w => addDays(w, -7)) }
  function nextWeek() { setWeekStart(w => addDays(w, 7)) }

  async function generateWeek() {
    setGenerating(true)
    setGenDone(false)
    try {
      const res  = await fetch('/api/admin/marketing/generate-week', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ weekStart: weekStart.toISOString() }),
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
    const dayStr = addDays(weekStart, dayOffset).toDateString()
    return posts.find(p =>
      p.scheduledAt &&
      new Date(p.scheduledAt).toDateString() === dayStr &&
      p.platform === platform &&
      p.postType === postType
    )
  }

  function openModal(post: Post) {
    setSelected(post)
    setEditCaption(post.caption)
    setEditHashtags(post.hashtags)
    setEditPlatform(post.platform)
    setEditSchedule(toLocalDT(post.scheduledAt))
    setEditImageUrls(post.imageUrls ?? [])
    setNewImageUrl('')
    setShowPicker(false)
    setRejectionNote('')
  }

  function closeModal() {
    setSelected(null)
    setPublishMsg(null)
  }

  async function savePost() {
    if (!selected) return
    setSaving(true)
    await fetch('/api/admin/marketing/posts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({
        id:          selected.id,
        caption:     editCaption,
        hashtags:    editHashtags,
        imageUrls:   editImageUrls,
        scheduledAt: editSchedule ? new Date(editSchedule).toISOString() : null,
      }),
    })
    setPosts(prev => prev.map(p =>
      p.id === selected.id
        ? { ...p, caption: editCaption, hashtags: editHashtags,
            imageUrls: editImageUrls,
            scheduledAt: editSchedule ? new Date(editSchedule).toISOString() : null }
        : p
    ))
    setSaving(false)
    closeModal()
  }

  async function submitForApproval() {
    if (!selected) return
    setSaving(true)
    await fetch('/api/admin/marketing/posts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({
        id:          selected.id,
        caption:     editCaption,
        hashtags:    editHashtags,
        imageUrls:   editImageUrls,
        scheduledAt: editSchedule ? new Date(editSchedule).toISOString() : null,
        status:      'pending_approval',
      }),
    })
    setPosts(prev => prev.map(p =>
      p.id === selected.id ? { ...p, status: 'pending_approval', caption: editCaption } : p
    ))
    setSaving(false)
    closeModal()
  }

  async function approvePost() {
    if (!selected) return
    setSaving(true)
    await fetch(`/api/admin/marketing/posts/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ status: 'approved' }),
    })
    const nextStatus = selected.scheduledAt ? 'scheduled' : 'approved'
    setPosts(prev => prev.map(p => p.id === selected.id ? { ...p, status: nextStatus } : p))
    setSaving(false)
    closeModal()
  }

  async function rejectPost() {
    if (!selected) return
    setSaving(true)
    await fetch(`/api/admin/marketing/posts/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ status: 'rejected', rejectionNote }),
    })
    setPosts(prev => prev.map(p =>
      p.id === selected.id ? { ...p, status: 'draft', errorMsg: rejectionNote } : p
    ))
    setSaving(false)
    closeModal()
  }

  async function deletePost() {
    if (!selected) return
    if (!confirm('Delete this post? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/admin/marketing/posts/${selected.id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== selected.id))
    setDeleting(false)
    closeModal()
  }

  async function publishNow(postId: string) {
    setPublishing(postId)
    setPublishMsg(null)
    try {
      const res  = await fetch('/api/admin/marketing/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ postId }),
      })
      const data = await res.json() as { success: boolean; error?: string }
      if (data.success) {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'published' } : p))
        setPublishMsg({ id: postId, ok: true, text: 'Published!' })
        if (selected?.id === postId) closeModal()
      } else {
        setPublishMsg({ id: postId, ok: false, text: data.error ?? 'Failed' })
      }
    } finally {
      setPublishing(null)
      setTimeout(() => setPublishMsg(null), 5000)
    }
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
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} className="px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
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
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : genDone  ? <><Check className="w-4 h-4" /> Generated!</>
              :              <><Sparkles className="w-4 h-4" /> Generate Week</>}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <span key={k} className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[k]}`}>{v}</span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-8 border-b border-gray-100">
          <div className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Channel</div>
          {DAYS.map((day, i) => (
            <div key={day} className="px-3 py-3 text-xs font-semibold text-gray-600 text-center border-r border-gray-100 last:border-r-0">
              <div>{day}</div>
              <div className="text-gray-400 font-normal mt-0.5">{fmt(addDays(weekStart, i))}</div>
            </div>
          ))}
        </div>

        {ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-8 border-b border-gray-100 last:border-b-0">
            <div className="px-4 py-4 text-xs font-medium text-gray-500 border-r border-gray-100 flex items-center">{row.label}</div>
            {DAYS.map((_, dayIdx) => {
              const post = getPost(dayIdx, row.platform, row.postType)
              return (
                <div key={dayIdx} className="px-2 py-2 border-r border-gray-100 last:border-r-0 min-h-[96px] flex flex-col gap-1">
                  {loading
                    ? <div className="w-full h-12 bg-gray-50 rounded-lg animate-pulse" />
                    : post
                    ? (
                      <div className="flex flex-col gap-1 h-full">
                        <button
                          onClick={() => openModal(post)}
                          className={`flex-1 w-full text-left rounded-lg border px-2 py-1.5 transition hover:shadow-sm ${STATUS_COLORS[post.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}
                        >
                          <p className="text-[9px] font-bold uppercase tracking-wider">{STATUS_LABELS[post.status] ?? post.status}</p>
                          <p className="text-[10px] leading-tight line-clamp-2 mt-0.5">{post.caption.slice(0, 60)}…</p>
                        </button>

                        {isSuperAdmin && post.status === 'pending_approval' && (
                          <button
                            onClick={() => openModal(post)}
                            className="flex items-center justify-center gap-1 py-1 text-[10px] font-medium bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 rounded-md transition"
                          >
                            <CheckCircle className="w-3 h-3" /> Review
                          </button>
                        )}

                        {isSuperAdmin && (post.status === 'approved' || post.status === 'scheduled') && (
                          <button
                            onClick={() => void publishNow(post.id)}
                            disabled={publishing === post.id}
                            className="flex items-center justify-center gap-1 py-1 text-[10px] font-semibold bg-[#0B1F3A] text-white hover:bg-[#152d55] rounded-md transition disabled:opacity-50"
                          >
                            {publishing === post.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : publishMsg?.id === post.id
                              ? publishMsg.ok ? <><Check className="w-3 h-3" /> Live!</> : <><X className="w-3 h-3" /> Error</>
                              : <><Send className="w-3 h-3" /> Publish</>
                            }
                          </button>
                        )}
                      </div>
                    )
                    : (
                      <button
                        onClick={() => window.location.href = '/admin/marketing/captions'}
                        className="w-full h-full min-h-[60px] rounded-lg border border-dashed border-gray-200 text-gray-300 hover:border-amber-400 hover:text-amber-400 transition flex items-center justify-center text-xs gap-1"
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

      {/* Edit / Review modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900">Edit Post</h2>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isSuperAdmin && (
                  <button
                    onClick={deletePost}
                    disabled={deleting}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete post"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1.5">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">

              {selected.errorMsg && selected.status === 'draft' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-600 mb-1">Feedback from reviewer</p>
                  <p className="text-xs text-red-700">{selected.errorMsg}</p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Caption</label>
                <textarea
                  value={editCaption}
                  onChange={e => setEditCaption(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Hashtags</label>
                <textarea
                  value={editHashtags}
                  onChange={e => setEditHashtags(e.target.value)}
                  rows={2}
                  placeholder="#walztravels #travelagent …"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Platform</label>
                <div className="flex gap-2">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setEditPlatform(p.value)}
                      className={`flex-1 py-2 text-xs font-medium rounded-xl border transition ${
                        editPlatform === p.value
                          ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Schedule</label>
                <input
                  type="datetime-local"
                  value={editSchedule}
                  onChange={e => setEditSchedule(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Images <span className="normal-case font-normal text-gray-400">({editImageUrls.length})</span>
                  </label>
                  <button
                    onClick={openPicker}
                    className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition"
                  >
                    <Image className="w-3.5 h-3.5" /> Pick from library
                  </button>
                </div>

                {/* Sortable image list */}
                {editImageUrls.length > 0 && (
                  <div className="mb-2 space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={editImageUrls} strategy={verticalListSortingStrategy}>
                        {editImageUrls.map((url, idx) => (
                          <SortableImage
                            key={url + idx}
                            url={url}
                            index={idx}
                            onRemove={() => setEditImageUrls(prev => prev.filter((_, i) => i !== idx))}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {/* Add by URL */}
                <div className="flex gap-2">
                  <input
                    value={newImageUrl}
                    onChange={e => setNewImageUrl(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newImageUrl.trim()) {
                        setEditImageUrls(prev => [...prev, newImageUrl.trim()])
                        setNewImageUrl('')
                      }
                    }}
                    placeholder="Paste image URL and press Enter…"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                  <button
                    onClick={() => { if (newImageUrl.trim()) { setEditImageUrls(prev => [...prev, newImageUrl.trim()]); setNewImageUrl('') } }}
                    disabled={!newImageUrl.trim()}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Media picker panel */}
              {showPicker && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
                    <p className="text-xs font-semibold text-amber-700">Media Library</p>
                    <button onClick={() => setShowPicker(false)} className="text-amber-500 hover:text-amber-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Tag filter */}
                  <div className="flex items-center gap-1.5 px-2 pt-2 pb-1.5 flex-wrap border-b border-amber-100 bg-white">
                    {['all', ...TAGS].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setPickerTag(tag)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border capitalize transition ${
                          pickerTag === tag
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-600'
                        }`}
                      >
                        {tag === 'all' ? 'All' : tag}
                      </button>
                    ))}
                  </div>

                  {pickerLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                  ) : filteredMedia.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">
                      {pickerMedia.length === 0 ? 'No images in library' : `No images tagged "${pickerTag}"`}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 p-2 max-h-52 overflow-y-auto">
                      {filteredMedia.map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setEditImageUrls(prev => prev.includes(m.url) ? prev : [...prev, m.url])
                          }}
                          className={`aspect-square rounded-lg overflow-hidden border-2 transition group relative ${
                            editImageUrls.includes(m.url) ? 'border-amber-500' : 'border-transparent hover:border-amber-400'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.url} alt={m.filename} className="w-full h-full object-cover" loading="lazy" />
                          {editImageUrls.includes(m.url) && (
                            <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                              <CheckCircle className="w-5 h-5 text-amber-600 drop-shadow" />
                            </div>
                          )}
                          {m.tags?.length > 0 && (
                            <span className="absolute bottom-0.5 left-0.5 right-0.5 text-[9px] bg-black/50 text-white rounded px-1 py-0.5 truncate text-center">
                              {m.tags[0]}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Approval section — super_admin + pending */}
              {isSuperAdmin && selected.status === 'pending_approval' && (
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Approval Required</p>
                  <div className="flex gap-2">
                    <button
                      onClick={approvePost}
                      disabled={saving}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      onClick={rejectPost}
                      disabled={saving || !rejectionNote.trim()}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white hover:bg-red-50 text-red-500 border border-red-200 font-semibold rounded-xl text-sm transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                  <textarea
                    value={rejectionNote}
                    onChange={e => setRejectionNote(e.target.value)}
                    placeholder="Rejection reason (required to reject — staff will see this)"
                    rows={2}
                    className="w-full border border-amber-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
                  />
                </div>
              )}

              {/* Publish Now — super_admin + approved/scheduled */}
              {isSuperAdmin && (selected.status === 'approved' || selected.status === 'scheduled') && (
                <button
                  onClick={() => void publishNow(selected.id)}
                  disabled={publishing === selected.id}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#0B1F3A] hover:bg-[#152d55] text-white font-semibold rounded-xl text-sm transition disabled:opacity-50"
                >
                  {publishing === selected.id
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</>
                    : <><Send className="w-4 h-4" /> Publish Now to {selected.platform === 'both' ? 'Instagram + Facebook' : selected.platform}</>
                  }
                </button>
              )}
            </div>

            <div className="px-6 pb-5 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition">
                Cancel
              </button>
              <div className="flex gap-2">
                {(selected.status === 'draft' || selected.status === 'failed') && (
                  <button
                    onClick={submitForApproval}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold rounded-xl text-sm transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Submit for Approval
                  </button>
                )}
                <button
                  onClick={savePost}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
