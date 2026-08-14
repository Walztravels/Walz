'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const PLATFORMS = ['Meta (Facebook)', 'Instagram', 'Google Ads', 'LinkedIn', 'X (Twitter)', 'Email', 'WhatsApp', 'TikTok']
const TONES = ['professional', 'friendly', 'urgent', 'inspirational', 'informative', 'conversational']
const OBJECTIVES = [
  'Promote flight deals',
  'Promote visa services',
  'Promote group/church travel',
  'Promote tour packages',
  'Promote eSIM plans',
  'Promote holiday packages',
  'Seasonal promotion',
  'Brand awareness',
  'Other',
]

export default function NewCampaignPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    objective: '',
    destination: '',
    audience: '',
    country: 'UK',
    platforms: [] as string[],
    tone: 'professional',
    promotionDetails: '',
    cta: '',
    landingPage: 'https://www.walztravels.com',
    startDate: '',
    endDate: '',
  })

  function set(key: string, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function togglePlatform(p: string) {
    setForm(prev => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter(x => x !== p)
        : [...prev.platforms, p],
    }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.objective) { setError('Objective is required'); return }
    if (form.platforms.length === 0) { setError('Select at least one platform'); return }

    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/admin/orbit/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')
      router.push(`/admin/orbit/campaigns/${data.campaignId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/orbit/campaigns" className="text-gray-500 hover:text-white text-sm">← Campaigns</Link>
        <h1 className="text-2xl font-bold text-white">New Campaign</h1>
      </div>

      {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Campaign Brief</h2>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Objective *</label>
            <select value={form.objective} onChange={e => set('objective', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="">Select objective…</option>
              {OBJECTIVES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Destination / Offer</label>
              <input value={form.destination} onChange={e => set('destination', e.target.value)}
                placeholder="e.g. Dubai, Lagos, eSIM Africa"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Audience Location</label>
              <input value={form.country} onChange={e => set('country', e.target.value)}
                placeholder="e.g. UK"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Target Audience</label>
            <input value={form.audience} onChange={e => set('audience', e.target.value)}
              placeholder="e.g. UK-based Nigerian diaspora, church group leaders"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Tone</label>
            <select value={form.tone} onChange={e => set('tone', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {TONES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Promotion Details</label>
            <textarea rows={3} value={form.promotionDetails} onChange={e => set('promotionDetails', e.target.value)}
              placeholder="e.g. January sale — 15% off group bookings over 10 people. Valid until 31 Jan."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Call to Action</label>
              <input value={form.cta} onChange={e => set('cta', e.target.value)}
                placeholder="e.g. Book Now, Get a Quote"
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Landing Page</label>
              <input value={form.landingPage} onChange={e => set('landingPage', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Campaign Start</label>
              <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Campaign End</label>
              <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-white">Platforms *</h2>
          <p className="text-xs text-gray-500">Content will be generated for all selected platforms in one API call.</p>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map(p => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.platforms.includes(p)} onChange={() => togglePlatform(p)}
                  className="accent-indigo-500 w-4 h-4" />
                <span className="text-sm text-gray-300">{p}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
            {saving ? 'Creating…' : 'Create Campaign'}
          </button>
          <Link href="/admin/orbit/campaigns"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium px-6 py-2 rounded-lg transition-colors">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
