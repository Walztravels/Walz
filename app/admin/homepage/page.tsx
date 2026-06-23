'use client'

import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, Save, X, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'

interface Section {
  key: string
  label: string
  desc: string
}

const SECTIONS: Section[] = [
  {
    key: 'hero_slides',
    label: 'Hero Slides',
    desc: '3 rotating scenes — Flights, Visas, Hotels. Each slide has: id, bg (image URL), pill, line1/2/3, sub, cta1Label, cta1Href, cta2Label, cta2Href.',
  },
  {
    key: 'destinations',
    label: 'Featured Destinations',
    desc: '6 destination cards. Each has: city, country, tag, image, flightFrom, hotelFrom, visaFrom.',
  },
]

type ContentMap = Record<string, unknown>
type Status = 'idle' | 'loading' | 'saving' | 'success' | 'error'

export default function HomepageEditorPage() {
  const [content,        setContent]        = useState<ContentMap>({})
  const [loadStatus,     setLoadStatus]     = useState<Status>('loading')
  const [editingKey,     setEditingKey]     = useState<string | null>(null)
  const [editingJson,    setEditingJson]    = useState('')
  const [jsonError,      setJsonError]      = useState<string | null>(null)
  const [saveStatus,     setSaveStatus]     = useState<Status>('idle')

  const load = useCallback(async () => {
    setLoadStatus('loading')
    try {
      const res  = await fetch('/api/admin/homepage')
      const data = await res.json() as { content?: ContentMap; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setContent(data.content ?? {})
      setLoadStatus('idle')
    } catch {
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openEdit(key: string) {
    const current = content[key] ?? (key === 'hero_slides' ? [] : [])
    setEditingJson(JSON.stringify(current, null, 2))
    setJsonError(null)
    setSaveStatus('idle')
    setEditingKey(key)
  }

  function closeEdit() {
    setEditingKey(null)
    setEditingJson('')
    setJsonError(null)
    setSaveStatus('idle')
  }

  async function handleSave() {
    if (!editingKey) return
    let parsed: unknown
    try {
      parsed = JSON.parse(editingJson)
    } catch (err) {
      setJsonError(`Invalid JSON: ${(err as Error).message}`)
      return
    }
    setJsonError(null)
    setSaveStatus('saving')
    try {
      const res = await fetch('/api/admin/homepage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: editingKey, data: parsed }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setContent(prev => ({ ...prev, [editingKey]: parsed }))
      setSaveStatus('success')
      setTimeout(closeEdit, 800)
    } catch (err) {
      setJsonError((err as Error).message)
      setSaveStatus('error')
    }
  }

  const section = SECTIONS.find(s => s.key === editingKey)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-white font-semibold text-xl">Homepage Editor</h1>
          <p className="text-white/40 text-sm mt-1">Changes go live immediately on walztravels.com.</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://www.walztravels.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-amber-400 text-sm hover:text-amber-300 transition-colors"
          >
            View live <ExternalLink size={13} />
          </a>
          <button
            onClick={load}
            disabled={loadStatus === 'loading'}
            className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors disabled:opacity-40"
          >
            <RefreshCw size={13} className={loadStatus === 'loading' ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Load error */}
      {loadStatus === 'error' && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          <AlertCircle size={14} />
          Failed to load homepage content. Make sure the HomepageContent table exists in Supabase.
        </div>
      )}

      {/* Section cards */}
      <div className="space-y-3">
        {SECTIONS.map(s => (
          <div
            key={s.key}
            className="bg-[#112240] rounded-2xl p-5 border border-white/5 flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-white font-semibold">{s.label}</p>
              <p className="text-white/35 text-xs mt-1 leading-relaxed">{s.desc}</p>
              {content[s.key] !== undefined && (
                <p className="text-white/20 text-[10px] mt-2 font-mono">
                  {Array.isArray(content[s.key])
                    ? `${(content[s.key] as unknown[]).length} item(s)`
                    : 'object'}
                </p>
              )}
            </div>
            <button
              onClick={() => openEdit(s.key)}
              disabled={loadStatus === 'loading'}
              className="flex-shrink-0 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20
                px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-40"
            >
              Edit →
            </button>
          </div>
        ))}
      </div>

      {/* JSON editor modal */}
      {editingKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#0d1e35] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div>
                <p className="text-white font-semibold">{section?.label}</p>
                <p className="text-white/35 text-xs mt-0.5">{section?.desc}</p>
              </div>
              <button onClick={closeEdit} className="text-white/40 hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            {/* JSON textarea */}
            <div className="flex-1 overflow-hidden p-4">
              <textarea
                value={editingJson}
                onChange={e => {
                  setEditingJson(e.target.value)
                  setJsonError(null)
                  setSaveStatus('idle')
                }}
                spellCheck={false}
                className="w-full h-full min-h-[380px] bg-[#081629] border border-white/8 rounded-xl
                  p-4 text-white/80 text-xs font-mono leading-relaxed resize-none
                  focus:outline-none focus:border-amber-500/30"
              />
            </div>

            {/* Error */}
            {jsonError && (
              <div className="mx-4 mb-2 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                {jsonError}
              </div>
            )}

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-white/8 flex items-center justify-between">
              <p className="text-white/25 text-xs">Edit raw JSON · changes apply immediately on save</p>
              <div className="flex gap-2">
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveStatus === 'saving' || saveStatus === 'success'}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl transition-all
                    bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saveStatus === 'saving' ? (
                    <><RefreshCw size={13} className="animate-spin" /> Saving…</>
                  ) : saveStatus === 'success' ? (
                    <><CheckCircle2 size={13} /> Saved!</>
                  ) : (
                    <><Save size={13} /> Save Changes</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
