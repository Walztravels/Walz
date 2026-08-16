'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const TYPE_OPTIONS = [
  { value: 'destination_guide',   label: 'Destination Guide' },
  { value: 'itinerary',           label: 'Itinerary' },
  { value: 'flight_content',      label: 'Flight Content' },
  { value: 'hotel_content',       label: 'Hotel Content' },
  { value: 'visa_draft',          label: 'Visa Draft' },
  { value: 'travel_tips',         label: 'Travel Tips' },
  { value: 'comparison',          label: 'Comparison' },
  { value: 'faq',                 label: 'FAQ' },
  { value: 'promotional_landing', label: 'Promotional Landing Page' },
  { value: 'refresh',             label: 'Content Refresh' },
]

function NewBriefForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    title:              '',
    contentType:        'destination_guide',
    primaryKeyword:     searchParams.get('keyword') ?? '',
    supportingKeywords: '',
    intent:             'informational',
    targetUrl:          '',
    metaTitle:          '',
    metaDescription:    '',
    notes:              '',
  })

  function update(k: keyof typeof form, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/orbit/briefs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...form,
          supportingKeywords: form.supportingKeywords.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create brief')
      router.push(`/admin/orbit/content/${data.brief.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">New Content Brief</h1>
        <p className="text-sm text-gray-400 mt-1">AI will generate the full outline, FAQs, and internal links.</p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">Title <span className="text-red-400">*</span></label>
            <input value={form.title} onChange={e => update('title', e.target.value)} required
              placeholder="e.g. Complete Guide to UAE Visa from UK"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Content Type</label>
            <select value={form.contentType} onChange={e => update('contentType', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Search Intent</label>
            <select value={form.intent} onChange={e => update('intent', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="informational">Informational</option>
              <option value="navigational">Navigational</option>
              <option value="transactional">Transactional</option>
              <option value="commercial">Commercial Investigation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Primary Keyword</label>
            <input value={form.primaryKeyword} onChange={e => update('primaryKeyword', e.target.value)}
              placeholder="e.g. UAE visa from UK"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Target URL</label>
            <input value={form.targetUrl} onChange={e => update('targetUrl', e.target.value)}
              placeholder="e.g. /blog/uae-visa-from-uk"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">Supporting Keywords <span className="text-gray-600">(comma-separated)</span></label>
            <input value={form.supportingKeywords} onChange={e => update('supportingKeywords', e.target.value)}
              placeholder="e.g. dubai visa, abu dhabi visa, uae tourist visa"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Meta Title</label>
            <input value={form.metaTitle} onChange={e => update('metaTitle', e.target.value)}
              placeholder="Optional — AI will suggest one"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Meta Description</label>
            <input value={form.metaDescription} onChange={e => update('metaDescription', e.target.value)}
              placeholder="Optional — AI will suggest one"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">Additional Notes</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3}
              placeholder="Any specific angles, tone, audience notes, or constraints for this piece…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
            {saving ? 'Creating…' : 'Create Brief'}
          </button>
          <button type="button" onClick={() => router.back()}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-5 py-2 rounded-lg transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

export default function NewBriefPage() {
  return (
    <Suspense>
      <NewBriefForm />
    </Suspense>
  )
}
