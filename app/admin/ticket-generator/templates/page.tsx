'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, Save, RefreshCw, Plus, Eye, EyeOff,
  Plane, Hotel, MapIcon, Car, FileText, Package2, CheckCircle
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string; template_name: string; template_type: string
  template_html: string; is_active: boolean; is_default: boolean
  created_at: string; updated_at: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  flight:   <Plane    className="w-4 h-4" />,
  hotel:    <Hotel    className="w-4 h-4" />,
  tour:     <MapIcon  className="w-4 h-4" />,
  transfer: <Car      className="w-4 h-4" />,
  visa:     <FileText className="w-4 h-4" />,
  package:  <Package2 className="w-4 h-4" />,
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  flight:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  hotel:    { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  tour:     { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  transfer: { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
  visa:     { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
  package:  { bg: '#FFF7ED', text: '#92400E', border: '#C9A84C' },
}

const TYPE_LABELS: Record<string, string> = {
  flight: 'Flight Ticket', hotel: 'Hotel Voucher', tour: 'Tour Confirmation',
  transfer: 'Transfer Voucher', visa: 'Visa Appointment', package: 'Holiday Package',
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Template | null>(null)
  const [editHtml, setEditHtml] = useState('')
  const [editName, setEditName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ticket-generator/templates')
      const data = await res.json()
      setTemplates(data.templates ?? [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function selectTemplate(t: Template) {
    setSelected(t)
    setEditHtml(t.template_html)
    setEditName(t.template_name)
    setEditActive(t.is_active)
    setShowPreview(false)
  }

  async function handleSave() {
    if (!selected) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/ticket-generator/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          template_html: editHtml,
          template_name: editName,
          is_active: editActive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setToast({ type: 'success', msg: 'Template saved successfully.' })
      setTemplates(prev => prev.map(t => t.id === selected.id
        ? { ...t, template_html: editHtml, template_name: editName, is_active: editActive }
        : t
      ))
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to save' })
    } finally {
      setIsSaving(false)
    }
  }

  // Group by type
  const grouped: Record<string, Template[]> = {}
  for (const t of templates) {
    if (!grouped[t.template_type]) grouped[t.template_type] = []
    grouped[t.template_type].push(t)
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/ticket-generator" className="p-1.5 rounded-lg hover:bg-gray-100 transition">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-lg font-black text-[#0B1F3A]">Ticket Templates</h1>
            <p className="text-xs text-gray-500 mt-0.5">Customise the HTML email templates for each ticket type</p>
          </div>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — template list */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-gray-400">No templates found.</p>
              <p className="text-xs text-gray-400 mt-1">Run DB setup to create default templates.</p>
              <Link href="/admin/ticket-generator"
                className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-bold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#0f2a4a] transition">
                <Plus className="w-3 h-3" /> Go to Generator
              </Link>
            </div>
          ) : (
            <div className="p-3 space-y-4">
              {Object.entries(grouped).map(([type, tmps]) => {
                const c = TYPE_COLORS[type] ?? { bg: '#F9FAFB', text: '#374151', border: '#E5E7EB' }
                return (
                  <div key={type}>
                    {/* Type header */}
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                      <div className="p-1 rounded-md" style={{ backgroundColor: c.bg }}>
                        <span style={{ color: c.text }}>{TYPE_ICONS[type]}</span>
                      </div>
                      <span className="text-[11px] font-bold text-[#0B1F3A] uppercase tracking-wider">
                        {TYPE_LABELS[type] ?? type}
                      </span>
                    </div>
                    {/* Templates in this group */}
                    {tmps.map(t => (
                      <button
                        key={t.id}
                        onClick={() => selectTemplate(t)}
                        className={`w-full flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-all border ${
                          selected?.id === t.id
                            ? 'border-[#C9A84C] bg-[#FFFBF0]'
                            : 'border-transparent hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[#0B1F3A] truncate">{t.template_name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {t.is_default && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#C9A84C]/15 text-[#92400E] font-bold">Default</span>
                            )}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                              {t.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        {selected?.id === t.id && <CheckCircle className="w-3.5 h-3.5 text-[#C9A84C] flex-shrink-0 mt-0.5" />}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right — editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <div className="text-5xl mb-4">📝</div>
                <p className="text-sm font-medium">Select a template to edit</p>
                <p className="text-xs mt-1">Choose from the list on the left</p>
              </div>
            </div>
          ) : (
            <>
              {/* Editor header */}
              <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="text-sm font-bold text-[#0B1F3A] border-b border-transparent focus:border-[#C9A84C] focus:outline-none px-1 py-0.5 bg-transparent"
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <div
                      onClick={() => setEditActive(v => !v)}
                      className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${editActive ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${editActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-xs text-gray-500">{editActive ? 'Active' : 'Inactive'}</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {toast && (
                    <span className={`text-xs font-semibold ${toast.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {toast.msg}
                    </span>
                  )}
                  <button
                    onClick={() => setShowPreview(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? 'Hide Preview' : 'Show Preview'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#0f2a4a] transition disabled:opacity-50"
                  >
                    {isSaving ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {isSaving ? 'Saving…' : 'Save Template'}
                  </button>
                </div>
              </div>

              {/* Editor body */}
              <div className={`flex-1 flex overflow-hidden ${showPreview ? 'divide-x divide-gray-200' : ''}`}>
                {/* Code editor */}
                <div className={`${showPreview ? 'w-1/2' : 'w-full'} flex flex-col overflow-hidden`}>
                  <div className="bg-[#1E1E2E] px-4 py-2 flex items-center justify-between flex-shrink-0">
                    <span className="text-[10px] text-gray-400 font-mono">template.html</span>
                    <span className="text-[10px] text-gray-500 font-mono">{editHtml.length.toLocaleString()} chars</span>
                  </div>
                  <textarea
                    value={editHtml}
                    onChange={e => setEditHtml(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full p-4 font-mono text-xs bg-[#1E1E2E] text-[#CDD6F4] resize-none focus:outline-none leading-relaxed"
                    style={{ tabSize: 2 }}
                  />
                </div>

                {/* Preview pane */}
                {showPreview && (
                  <div className="w-1/2 flex flex-col overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 flex-shrink-0">
                      <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">HTML Preview</span>
                    </div>
                    <div className="flex-1 overflow-auto bg-gray-50 p-4">
                      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
                        <iframe
                          srcDoc={editHtml}
                          title="Template preview"
                          className="w-full"
                          style={{ height: '600px', border: 'none' }}
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Info bar */}
              <div className="bg-white border-t border-gray-200 px-5 py-2 flex items-center gap-4 text-[10px] text-gray-400 flex-shrink-0">
                <span>Template ID: <code className="font-mono">{selected.id}</code></span>
                <span>Type: <strong className="text-gray-600">{TYPE_LABELS[selected.template_type] ?? selected.template_type}</strong></span>
                <span>Updated: {new Date(selected.updated_at).toLocaleDateString()}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
