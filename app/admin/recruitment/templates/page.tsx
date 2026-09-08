'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Mail, Plus } from 'lucide-react'

interface Template {
  id: string; key: string; name: string; subject: string; body: string
  isActive: boolean; updatedBy: string | null
}

export default function RecruitmentTemplatesPage() {
  const [templates, setTemplates]   = useState<Template[]>([])
  const [allowedVars, setAllowedVars] = useState<string[]>([])
  const [loading,   setLoading]     = useState(true)
  const [error,     setError]       = useState('')
  const [success,   setSuccess]     = useState('')
  const [busy,      setBusy]        = useState(false)
  const [editing,   setEditing]     = useState<string | null>(null)
  const [draft,     setDraft]       = useState({ name: '', subject: '', body: '' })
  const [creating,  setCreating]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/recruitment/templates')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setTemplates(data.templates ?? [])
      setAllowedVars(data.allowedVars ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  function flash(m: string) { setSuccess(m); setTimeout(() => setSuccess(''), 2500) }

  function startEdit(t: Template) {
    setEditing(t.id); setCreating(false)
    setDraft({ name: t.name, subject: t.subject, body: t.body })
  }
  function startCreate() {
    setCreating(true); setEditing(null)
    setDraft({ name: '', subject: '', body: '' })
  }

  async function save() {
    setBusy(true); setError('')
    const url    = creating ? '/api/admin/recruitment/templates' : `/api/admin/recruitment/templates/${editing}`
    const method = creating ? 'POST' : 'PATCH'
    const res  = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    setEditing(null); setCreating(false)
    flash(creating ? 'Template created' : 'Template saved')
    await load()
  }

  async function toggleActive(t: Template) {
    setBusy(true); setError('')
    const res  = await fetch(`/api/admin/recruitment/templates/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !t.isActive }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Update failed'); return }
    await load()
  }

  const editorOpen = creating || editing !== null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            <Link href="/admin/recruitment" className="hover:underline">Recruitment</Link> › Email Templates
          </p>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Email Templates</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Used when staff email candidates from an application. Sending is always a manual staff action.
          </p>
        </div>
        <button onClick={startCreate}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {error   && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-2.5">{success}</p>}

      {editorOpen && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-[#0B1F3A]">{creating ? 'New template' : 'Edit template'}</h2>
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Template name" aria-label="Template name" maxLength={120}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2" />
          <input value={draft.subject} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))}
            placeholder="Subject" aria-label="Subject" maxLength={200}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2" />
          <textarea value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
            rows={12} maxLength={10000} aria-label="Body"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 font-mono" />
          <p className="text-[11px] text-gray-400">
            Placeholders: {allowedVars.map(v => `{{${v}}}`).join(' · ')}
          </p>
          <div className="flex gap-2">
            <button onClick={() => void save()} disabled={busy || !draft.name.trim() || !draft.subject.trim() || !draft.body.trim()}
              className="text-sm font-bold bg-[#0B1F3A] text-white px-4 py-2 rounded-xl disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => { setEditing(null); setCreating(false) }}
              className="text-sm text-gray-400 hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Mail className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No templates yet. Run the R8 migration to seed defaults, or create one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-[#0B1F3A] text-sm">{t.name}</p>
                  {!t.isActive && <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">inactive</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{t.subject}</p>
              </div>
              <button onClick={() => startEdit(t)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-[#C9A84C] hover:text-[#0B1F3A]">
                Edit
              </button>
              <button onClick={() => void toggleActive(t)} disabled={busy}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-[#C9A84C] hover:text-[#0B1F3A] disabled:opacity-40">
                {t.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
