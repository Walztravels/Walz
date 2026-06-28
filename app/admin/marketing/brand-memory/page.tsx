'use client'

import { useState, useEffect, useRef } from 'react'
import { Save, Plus, Trash2, Brain, Loader2, CheckCircle } from 'lucide-react'

type Audience = { id: string; name: string; description: string }
type Template = { id: string; name: string; structure: string }

type BrandMemory = {
  toneOfVoice:     string
  targetAudiences: Audience[]
  hashtags:        string[]
  themes:          string[]
  templates:       Template[]
}

function useSaveStatus() {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const markSaving = () => {
    setStatus('saving')
    clearTimeout(timerRef.current)
  }
  const markSaved = () => {
    setStatus('saved')
    timerRef.current = setTimeout(() => setStatus('idle'), 2500)
  }
  return { status, markSaving, markSaved }
}

export default function BrandMemoryPage() {
  const [memory,  setMemory]  = useState<BrandMemory | null>(null)
  const [loading, setLoading] = useState(true)
  const { status, markSaving, markSaved } = useSaveStatus()

  // Editable strings
  const [toneOfVoice, setToneOfVoice] = useState('')
  const [audiences,   setAudiences]   = useState<Audience[]>([])
  const [hashtags,    setHashtags]    = useState<string[]>([])
  const [themes,      setThemes]      = useState<string[]>([])
  const [templates,   setTemplates]   = useState<Template[]>([])
  const [hashInput,   setHashInput]   = useState('')
  const [themeInput,  setThemeInput]  = useState('')

  useEffect(() => {
    fetch('/api/admin/marketing/brand-memory')
      .then(r => r.json())
      .then((d: { memory: BrandMemory }) => {
        setMemory(d.memory)
        setToneOfVoice(d.memory.toneOfVoice)
        setAudiences(d.memory.targetAudiences ?? [])
        setHashtags(d.memory.hashtags ?? [])
        setThemes(d.memory.themes ?? [])
        setTemplates(d.memory.templates ?? [])
        setLoading(false)
      })
  }, [])

  async function save(patch: Partial<BrandMemory>) {
    markSaving()
    await fetch('/api/admin/marketing/brand-memory', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    markSaved()
  }

  const addHashtag = () => {
    const tag = hashInput.trim().replace(/^#*/, '#')
    if (!tag || hashtags.includes(tag)) return
    const next = [...hashtags, tag]
    setHashtags(next)
    setHashInput('')
    void save({ hashtags: next })
  }

  const removeHashtag = (t: string) => {
    const next = hashtags.filter(h => h !== t)
    setHashtags(next)
    void save({ hashtags: next })
  }

  const addTheme = () => {
    const t = themeInput.trim()
    if (!t) return
    const next = [...themes, t]
    setThemes(next)
    setThemeInput('')
    void save({ themes: next })
  }

  const removeTheme = (t: string) => {
    const next = themes.filter(x => x !== t)
    setThemes(next)
    void save({ themes: next })
  }

  const addAudience = () => {
    const next: Audience[] = [...audiences, { id: Date.now().toString(), name: '', description: '' }]
    setAudiences(next)
  }

  const updateAudience = (id: string, field: 'name' | 'description', val: string) => {
    const next = audiences.map(a => a.id === id ? { ...a, [field]: val } : a)
    setAudiences(next)
  }

  const removeAudience = (id: string) => {
    const next = audiences.filter(a => a.id !== id)
    setAudiences(next)
    void save({ targetAudiences: next })
  }

  const addTemplate = () => {
    const next: Template[] = [...templates, { id: Date.now().toString(), name: '', structure: '' }]
    setTemplates(next)
  }

  const updateTemplate = (id: string, field: 'name' | 'structure', val: string) => {
    const next = templates.map(t => t.id === id ? { ...t, [field]: val } : t)
    setTemplates(next)
  }

  const removeTemplate = (id: string) => {
    const next = templates.filter(t => t.id !== id)
    setTemplates(next)
    void save({ templates: next })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading brand memory…
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Brand Memory</h1>
            <p className="text-sm text-gray-500">Jade uses these settings when generating social content</p>
          </div>
        </div>
        {status !== 'idle' && (
          <div className="flex items-center gap-1.5 text-sm">
            {status === 'saving'
              ? <><Loader2 className="w-4 h-4 animate-spin text-gray-400" /><span className="text-gray-400">Saving…</span></>
              : <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-green-600 font-medium">Saved</span></>
            }
          </div>
        )}
      </div>

      {/* Tone of Voice */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Tone of Voice</h2>
        <p className="text-xs text-gray-400 mb-3">How Jade should write captions. Be specific — include phrases to use and avoid.</p>
        <textarea
          value={toneOfVoice}
          onChange={e => setToneOfVoice(e.target.value)}
          onBlur={() => void save({ toneOfVoice })}
          rows={6}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
          placeholder="Describe the brand voice…"
        />
      </section>

      {/* Target Audiences */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800">Target Audiences</h2>
            <p className="text-xs text-gray-400 mt-0.5">Who we write content for</p>
          </div>
          <button
            onClick={addAudience}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Audience
          </button>
        </div>
        <div className="space-y-3">
          {audiences.map(a => (
            <div key={a.id} className="flex gap-3 items-start group">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input
                  value={a.name}
                  onChange={e => updateAudience(a.id, 'name', e.target.value)}
                  onBlur={() => void save({ targetAudiences: audiences })}
                  placeholder="Audience name"
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
                <input
                  value={a.description}
                  onChange={e => updateAudience(a.id, 'description', e.target.value)}
                  onBlur={() => void save({ targetAudiences: audiences })}
                  placeholder="Description"
                  className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
              </div>
              <button onClick={() => removeAudience(a.id)} className="mt-2 text-gray-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Hashtags */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Brand Hashtags</h2>
        <p className="text-xs text-gray-400 mb-3">Jade picks 8–12 from this list per post</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {hashtags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium"
            >
              {tag}
              <button onClick={() => removeHashtag(tag)} className="hover:text-red-500 transition ml-0.5">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={hashInput}
            onChange={e => setHashInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addHashtag()}
            placeholder="#YourHashtag"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          />
          <button
            onClick={addHashtag}
            className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition"
          >
            Add
          </button>
        </div>
      </section>

      {/* Themes */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-1">Brand Themes</h2>
        <p className="text-xs text-gray-400 mb-3">Key messages Jade weaves into content</p>
        <div className="space-y-2 mb-3">
          {themes.map(t => (
            <div key={t} className="flex items-center gap-2 group">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-700">{t}</span>
              <button onClick={() => removeTheme(t)} className="text-gray-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={themeInput}
            onChange={e => setThemeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTheme()}
            placeholder="Add a brand theme…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          />
          <button
            onClick={addTheme}
            className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition"
          >
            Add
          </button>
        </div>
      </section>

      {/* Post Templates */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800">Post Templates</h2>
            <p className="text-xs text-gray-400 mt-0.5">Reusable structures for common post types</p>
          </div>
          <button
            onClick={addTemplate}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Template
          </button>
        </div>
        <div className="space-y-4">
          {templates.map(t => (
            <div key={t.id} className="border border-gray-100 rounded-xl p-4 group">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={t.name}
                  onChange={e => updateTemplate(t.id, 'name', e.target.value)}
                  onBlur={() => void save({ templates })}
                  placeholder="Template name"
                  className="flex-1 text-sm font-medium border-b border-transparent hover:border-gray-200 focus:border-amber-400 focus:outline-none py-0.5 bg-transparent"
                />
                <button onClick={() => removeTemplate(t.id)} className="text-gray-300 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={t.structure}
                onChange={e => updateTemplate(t.id, 'structure', e.target.value)}
                onBlur={() => void save({ templates })}
                rows={3}
                placeholder="Post structure with [placeholders] in brackets…"
                className="w-full text-xs text-gray-500 border border-gray-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={() => void save({ toneOfVoice, targetAudiences: audiences, hashtags, themes, templates })}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition text-sm"
        >
          <Save className="w-4 h-4" />
          Save All Changes
        </button>
      </div>
    </div>
  )
}
