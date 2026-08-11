'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string
  itinerary_id: string
  title: string
  description: string | null
  owner: string | null
  due_date: string | null
  priority: string
  status: string
  category: string | null
  client_visible: boolean
  auto_generated: boolean
  created_at: string
  updated_at: string
}

interface ItinSummary {
  destination: string
  startDate: string | null
  endDate: string | null
  numberOfTravellers: number
  visaRequired?: boolean
}

interface TasksTabProps {
  itinId: string
  itinSummary: ItinSummary
}

// ─── Helpers / config ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  high:   { label: 'High',   className: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
  medium: { label: 'Medium', className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  low:    { label: 'Low',    className: 'bg-white/10 text-white/50 border border-white/10' },
}

const STATUS_CONFIG: Record<string, { label: string; next: string; className: string }> = {
  pending:     { label: 'Pending',     next: 'in_progress', className: 'bg-white/10 text-white/60' },
  in_progress: { label: 'In Progress', next: 'done',        className: 'bg-blue-500/20 text-blue-400' },
  done:        { label: 'Done',        next: 'pending',     className: 'bg-green-500/20 text-green-400' },
}

const CATEGORY_EMOJI: Record<string, string> = {
  flight:    '✈️',
  hotel:     '🏨',
  visa:      '🛂',
  document:  '📄',
  transfer:  '🚗',
  esim:      '📱',
  payment:   '💳',
  follow_up: '👋',
}

const CATEGORIES = Object.keys(CATEGORY_EMOJI)
const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const STATUSES   = ['pending', 'in_progress', 'done']

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = {
  title: '',
  category: '',
  priority: 'medium',
  due_date: '',
  owner: '',
  description: '',
  client_visible: false,
}

type TaskForm = typeof EMPTY_FORM

// ─── Component ────────────────────────────────────────────────────────────────

export default function TasksTab({ itinId, itinSummary }: TasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<TaskForm>(EMPTY_FORM)

  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const BASE = `/api/admin/itineraries/${itinId}/tasks`

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(BASE)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setTasks(json.tasks ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [BASE])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // ── Auto-generate ──────────────────────────────────────────────────────────

  async function handleAutoGenerate() {
    try {
      setGenerating(true)
      setError(null)
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoGenerate: true, itinSummary }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Auto-generate failed')
      }
      await fetchTasks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Auto-generate failed')
    } finally {
      setGenerating(false)
    }
  }

  // ── Add task ──────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.title.trim()) return
    try {
      setSaving(true)
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to create task')
      }
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      await fetchTasks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create task')
    } finally {
      setSaving(false)
    }
  }

  // ── Status toggle ─────────────────────────────────────────────────────────

  async function toggleStatus(task: Task) {
    const next = STATUS_CONFIG[task.status]?.next ?? 'pending'
    try {
      const res = await fetch(BASE, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, status: next }),
      })
      if (!res.ok) throw new Error('Failed to update status')
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(taskId: string) {
    try {
      setDeletingId(taskId)
      const res = await fetch(BASE, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      if (!res.ok) throw new Error('Failed to delete task')
      setConfirmDelete(null)
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete task')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Filtering & summary ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterCategory !== 'all' && t.category !== filterCategory) return false
      return true
    })
  }, [tasks, filterStatus, filterCategory])

  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const overdueCount = tasks.filter(t => t.status !== 'done' && isOverdue(t.due_date)).length

  // Group filtered tasks by status
  const byStatus = useMemo(() => {
    const groups: Record<string, Task[]> = { pending: [], in_progress: [], done: [] }
    for (const t of filtered) {
      if (groups[t.status]) groups[t.status].push(t)
      else groups['pending'].push(t)
    }
    return groups
  }, [filtered])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm">
          <span className="text-white/60">Pending:</span>
          <span className="font-semibold text-white">{pendingCount}</span>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm">
            <span className="text-red-400">⚠ Overdue:</span>
            <span className="font-semibold text-red-400">{overdueCount}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleAutoGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-400/20 disabled:opacity-60"
          >
            {generating ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Generating…
              </>
            ) : (
              '✨ Auto-generate Tasks'
            )}
          </button>
          <button
            onClick={() => { setShowAddForm(v => !v); setError(null) }}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0B1F3A] transition hover:bg-amber-300"
          >
            {showAddForm ? '✕ Cancel' : '+ Add Task'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <TaskFormPanel
          form={addForm}
          onChange={setAddForm}
          onSubmit={handleAdd}
          onCancel={() => { setShowAddForm(false); setAddForm(EMPTY_FORM) }}
          saving={saving}
        />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {['all', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                filterStatus === s
                  ? 'bg-amber-400 text-[#0B1F3A]'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0B1F3A] px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-amber-400/40"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {CATEGORY_EMOJI[c]} {c.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-white/40">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading tasks…
        </div>
      )}

      {/* Empty */}
      {!loading && tasks.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
          <div className="mb-2 text-4xl">📋</div>
          <p className="text-white/40">No tasks yet.</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button onClick={handleAutoGenerate} className="text-sm text-amber-400 hover:underline">
              Auto-generate tasks
            </button>
            <span className="text-white/20">or</span>
            <button onClick={() => setShowAddForm(true)} className="text-sm text-amber-400 hover:underline">
              Add manually
            </button>
          </div>
        </div>
      )}

      {/* Grouped task lists */}
      {!loading && (
        <div className="space-y-6">
          {STATUSES.map(status => {
            const group = byStatus[status]
            if (group.length === 0 && filterStatus !== 'all' && filterStatus !== status) return null
            return (
              <div key={status}>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/40">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${STATUS_CONFIG[status]?.className ?? ''}`}>
                    {STATUS_CONFIG[status]?.label ?? status}
                  </span>
                  <span>{group.length}</span>
                </h4>

                {group.length === 0 ? (
                  <p className="text-sm text-white/20 pl-1">No tasks.</p>
                ) : (
                  <div className="space-y-2">
                    {group.map(task => {
                      const overdue = isOverdue(task.due_date) && task.status !== 'done'
                      const pConfig = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
                      const sConfig = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending

                      return (
                        <div
                          key={task.id}
                          className={`rounded-xl border p-4 transition ${
                            task.status === 'done'
                              ? 'border-white/5 bg-white/[0.02] opacity-60'
                              : 'border-white/10 bg-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {task.category && (
                                  <span className="text-base">
                                    {CATEGORY_EMOJI[task.category] ?? '📌'}
                                  </span>
                                )}
                                <span className={`font-medium text-white ${task.status === 'done' ? 'line-through' : ''}`}>
                                  {task.title}
                                </span>
                                {task.auto_generated && (
                                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-white/30">
                                    auto
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs ${pConfig.className}`}>
                                  {pConfig.label}
                                </span>
                                {task.category && (
                                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/50 capitalize">
                                    {task.category.replace(/_/g, ' ')}
                                  </span>
                                )}
                                {task.due_date && (
                                  <span className={`text-xs ${overdue ? 'text-red-400 font-semibold' : 'text-white/40'}`}>
                                    {overdue ? '⚠ ' : ''}{formatDate(task.due_date)}
                                  </span>
                                )}
                                {task.owner && (
                                  <span className="text-xs text-white/30">→ {task.owner}</span>
                                )}
                              </div>

                              {task.description && (
                                <p className="mt-2 text-xs text-white/40 line-clamp-2">{task.description}</p>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                onClick={() => toggleStatus(task)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-80 ${sConfig.className}`}
                              >
                                {sConfig.label} →
                              </button>
                              {confirmDelete === task.id ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    disabled={deletingId === task.id}
                                    onClick={() => handleDelete(task.id)}
                                    className="rounded-lg bg-red-500/20 px-2 py-1 text-xs text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                                  >
                                    {deletingId === task.id ? '…' : 'Yes'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="text-xs text-white/30 hover:text-white"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(task.id)}
                                  className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-red-400/60 transition hover:border-red-500/30 hover:text-red-400"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Add task form panel ──────────────────────────────────────────────────────

function TaskFormPanel({
  form,
  onChange,
  onSubmit,
  onCancel,
  saving,
}: {
  form: TaskForm
  onChange: (f: TaskForm) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  saving: boolean
}) {
  function field<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    onChange({ ...form, [key]: value })
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/30'
  const labelClass = 'mb-1 block text-xs font-medium text-white/60'

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-amber-400/20 bg-white/5 p-5 space-y-4"
    >
      <h4 className="font-semibold text-white">New Task</h4>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Title *</label>
          <input
            required
            value={form.title}
            onChange={e => field('title', e.target.value)}
            placeholder="Task title"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <select
            value={form.category}
            onChange={e => field('category', e.target.value)}
            className={inputClass + ' bg-[#0B1F3A]'}
          >
            <option value="">— Select category —</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {CATEGORY_EMOJI[c]} {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Priority</label>
          <select
            value={form.priority}
            onChange={e => field('priority', e.target.value)}
            className={inputClass + ' bg-[#0B1F3A]'}
          >
            {PRIORITIES.map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Due Date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={e => field('due_date', e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Owner / Assignee</label>
          <input
            value={form.owner}
            onChange={e => field('owner', e.target.value)}
            placeholder="Staff name or role"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelClass}>Description / Notes</label>
          <textarea
            value={form.description}
            onChange={e => field('description', e.target.value)}
            rows={2}
            placeholder="Optional details…"
            className={inputClass + ' resize-none'}
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            id="client_visible_check"
            type="checkbox"
            checked={form.client_visible}
            onChange={e => field('client_visible', e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5 accent-amber-400"
          />
          <label htmlFor="client_visible_check" className="text-sm text-white/70 cursor-pointer">
            Visible to client
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-[#0B1F3A] hover:bg-amber-300 disabled:opacity-60 transition"
        >
          {saving ? 'Saving…' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-5 py-2 text-sm text-white/60 hover:text-white transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
