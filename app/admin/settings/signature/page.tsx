'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, CheckCircle, AlertCircle, Mail, Plus, X, RefreshCw } from 'lucide-react'

interface Settings {
  logoUrl:      string
  accentColor:  string
  brandColor:   string
  officeCities: string[]
  footerNote:   string
}

const DEFAULTS: Settings = {
  logoUrl:      'https://www.walztravels.com/walz-logo.png',
  accentColor:  '#C9A84C',
  brandColor:   '#0B1F3A',
  officeCities: ['London', 'Toronto', 'Dubai', 'Lagos', 'Accra'],
  footerNote:   '',
}

export default function SignatureSettingsPage() {
  const [form,    setForm]    = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [preview, setPreview] = useState('')
  const [newCity, setNewCity] = useState('')
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load current settings ────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/signature-settings')
      const data = await res.json()
      setForm({
        logoUrl:      data.logoUrl      ?? DEFAULTS.logoUrl,
        accentColor:  data.accentColor  ?? DEFAULTS.accentColor,
        brandColor:   data.brandColor   ?? DEFAULTS.brandColor,
        officeCities: data.officeCities ?? DEFAULTS.officeCities,
        footerNote:   data.footerNote   ?? DEFAULTS.footerNote,
      })
    } catch {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Live preview — debounced, calls the actual render endpoint ───────────────

  const refreshPreview = useCallback((current: Settings) => {
    if (previewDebounce.current) clearTimeout(previewDebounce.current)
    previewDebounce.current = setTimeout(async () => {
      const params = new URLSearchParams({
        logoUrl:      current.logoUrl,
        accentColor:  current.accentColor,
        brandColor:   current.brandColor,
        officeCities: current.officeCities.join(','),
        footerNote:   current.footerNote,
      })
      try {
        const res = await fetch(`/api/admin/signature-settings/preview?${params}`)
        const html = await res.text()
        setPreview(html)
      } catch { /* silent */ }
    }, 300)
  }, [])

  useEffect(() => {
    if (!loading) refreshPreview(form)
  }, [form, loading, refreshPreview])

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true); setSaved(false); setError(null)
    try {
      const res = await fetch('/api/admin/signature-settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── City list helpers ─────────────────────────────────────────────────────────

  function addCity() {
    const city = newCity.trim()
    if (!city || form.officeCities.includes(city)) return
    setForm(f => ({ ...f, officeCities: [...f.officeCities, city] }))
    setNewCity('')
  }

  function removeCity(city: string) {
    setForm(f => ({ ...f, officeCities: f.officeCities.filter(c => c !== city) }))
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0B1F3A]/8 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Mail className="w-5 h-5 text-[#0B1F3A]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Email Signature</h1>
          <p className="text-gray-500 text-sm mt-1">
            Brand settings applied to every outbound Email Hub message. Changes go live on the next sent email — no deploy needed.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-[#C9A84C] rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="flex gap-8">

          {/* ── Left: form ─────────────────────────────────────────────────── */}
          <div className="flex-1 space-y-5 min-w-0">

            {/* Logo */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-[#0B1F3A] text-sm mb-4">Logo</h2>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Logo URL</label>
              <input
                type="url"
                value={form.logoUrl}
                onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://www.walztravels.com/walz-logo.png"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30 transition-colors font-mono"
              />
              <p className="text-gray-400 text-[11px] mt-1">Must be a publicly accessible HTTPS URL. Displayed at 56×56 px.</p>
            </div>

            {/* Colors */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-[#0B1F3A] text-sm mb-4">Brand Colors</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Accent color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.accentColor}
                      onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={form.accentColor}
                      onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30 font-mono"
                    />
                  </div>
                  <p className="text-gray-400 text-[11px] mt-1">Gold bar, links, website URL</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Brand color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={form.brandColor}
                      onChange={e => setForm(f => ({ ...f, brandColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={form.brandColor}
                      onChange={e => setForm(f => ({ ...f, brandColor: e.target.value }))}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30 font-mono"
                    />
                  </div>
                  <p className="text-gray-400 text-[11px] mt-1">Name, contact links, borders</p>
                </div>
              </div>
            </div>

            {/* Office cities */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-[#0B1F3A] text-sm mb-4">Office Cities</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {form.officeCities.map(city => (
                  <span key={city} className="flex items-center gap-1.5 bg-[#0B1F3A]/8 text-[#0B1F3A] text-xs font-medium px-3 py-1.5 rounded-full">
                    {city}
                    <button
                      onClick={() => removeCity(city)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCity}
                  onChange={e => setNewCity(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCity())}
                  placeholder="Add city…"
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30"
                />
                <button
                  onClick={addCity}
                  disabled={!newCity.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#0B1F3A] text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#1a3358] transition-colors"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Footer note */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-[#0B1F3A] text-sm mb-1">Footer Note</h2>
              <p className="text-gray-400 text-xs mb-4">Optional legal / registration line shown below the office list. Leave blank to hide.</p>
              <input
                type="text"
                value={form.footerNote}
                onChange={e => setForm(f => ({ ...f, footerNote: e.target.value }))}
                placeholder="e.g. Walz Travels Ltd. Registered in England & Wales, No. 123456"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-[#0B1F3A] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/30"
              />
            </div>

            {/* Error / Save */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center gap-4 pb-8">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#0B1F3A] hover:bg-[#1a3358] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {saving
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />
                }
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              {saved && (
                <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Saved — next sent email will use these settings.
                </div>
              )}
            </div>
          </div>

          {/* ── Right: live preview ───────────────────────────────────────── */}
          <div className="w-80 shrink-0">
            <div className="sticky top-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Live Preview</p>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
                {preview ? (
                  <div
                    // This is admin-authored HTML (your own signature template), not user content
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: preview }}
                    className="min-w-0"
                  />
                ) : (
                  <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-[#C9A84C] rounded-full animate-spin mr-2" />
                    Loading preview…
                  </div>
                )}
              </div>
              <p className="text-gray-400 text-[11px] mt-2 leading-relaxed">
                Preview updates as you type. Shown with your own name and sending address.
                This is the exact HTML sent in every Email Hub message.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
