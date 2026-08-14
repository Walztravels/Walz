'use client'

import { useEffect, useState } from 'react'

const AUTOMATION_LEVELS = [
  { value: 'research_only',     label: 'Research only', description: 'Orbit collects data and surfaces insights. No drafts generated.' },
  { value: 'generate_drafts',   label: 'Generate drafts', description: 'Orbit generates draft content for human review. Nothing publishes without approval. (Default)' },
  { value: 'generate_and_fix',  label: 'Generate drafts and recommended fixes', description: 'Also generates SEO fix recommendations. Approval required before any change is applied.' },
  { value: 'publish_approved',  label: 'Publish approved content only', description: 'Approved items are scheduled for publishing. Requires explicit approval on every item.' },
]

const PUBLISHING_FREQUENCIES = ['daily', 'weekly', 'fortnightly', 'monthly']

function TagInput({ label, value, onChange, placeholder }: {
  label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string
}) {
  const [input, setInput] = useState('')
  function add() {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setInput('')
  }
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 mb-2">
        {value.map((v) => (
          <span key={v} className="bg-indigo-900 text-indigo-200 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            {v}
            <button onClick={() => onChange(value.filter((x) => x !== v))} className="hover:text-white">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder ?? 'Type and press Enter'}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button onClick={add} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded transition-colors">Add</button>
      </div>
    </div>
  )
}

export default function OrbitSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/orbit/settings')
      .then(r => r.json())
      .then(d => setSettings(d.settings ?? {}))
      .catch(() => setSettings({}))
  }, [])

  function set(key: string, value: unknown) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    if (!settings) return
    setSaving(true); setError(null); setSaved(false)
    try {
      // Don't re-send the masked token placeholder back to the server
      const payload = { ...settings }
      if (payload.bufferAccessToken === '••••••••') delete payload.bufferAccessToken
      const res = await fetch('/api/admin/orbit/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setSettings(data.settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>

  const s = settings

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Orbit Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Site identity, brand, automation, and content rules</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </div>

      {error && <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Site */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white mb-1">Site & Brand</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Site URL</label>
          <input value={(s.siteUrl as string) ?? ''} onChange={e => set('siteUrl', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Brand Name</label>
            <input value={(s.brandName as string) ?? ''} onChange={e => set('brandName', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title Suffix</label>
            <input value={(s.brandSuffix as string) ?? ''} onChange={e => set('brandSuffix', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Brand Voice</label>
          <textarea rows={3} value={(s.brandVoice as string) ?? ''} onChange={e => set('brandVoice', e.target.value)}
            placeholder="e.g. Professional, warm, trustworthy. Focused on value and expertise. Never alarmist."
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
        </div>
      </section>

      {/* Audience & Market */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white mb-1">Audience & Market</h2>
        <TagInput label="Target Countries" value={(s.targetCountries as string[]) ?? []} onChange={v => set('targetCountries', v)} placeholder="e.g. UK, Nigeria, Ghana" />
        <TagInput label="Target Languages" value={(s.targetLanguages as string[]) ?? []} onChange={v => set('targetLanguages', v)} placeholder="e.g. English, French" />
        <TagInput label="Target Audiences" value={(s.targetAudiences as string[]) ?? []} onChange={v => set('targetAudiences', v)} placeholder="e.g. Diaspora, Church groups, Students" />
        <TagInput label="Services Offered" value={(s.services as string[]) ?? []} onChange={v => set('services', v)} placeholder="e.g. Flights, Visa, Group Travel, eSIM" />
        <TagInput label="Priority Destinations" value={(s.priorityDestinations as string[]) ?? []} onChange={v => set('priorityDestinations', v)} placeholder="e.g. Dubai, Lagos, Toronto" />
        <TagInput label="Competitors (for gap analysis)" value={(s.competitors as string[]) ?? []} onChange={v => set('competitors', v)} placeholder="e.g. flightcentre.co.uk" />
      </section>

      {/* Content rules */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white mb-1">Content Rules</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Internal Link Rules</label>
          <textarea rows={2} value={(s.internalLinkRules as string) ?? ''} onChange={e => set('internalLinkRules', e.target.value)}
            placeholder="e.g. Always link visa pages from destination guides. Do not link to /old-pages/"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
        </div>
        <TagInput label="Keyword Exclusions" value={(s.keywordExclusions as string[]) ?? []} onChange={v => set('keywordExclusions', v)} placeholder="e.g. cheap, guaranteed" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Publishing Frequency</label>
            <select value={(s.publishingFrequency as string) ?? 'weekly'} onChange={e => set('publishingFrequency', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
              {PUBLISHING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Quality Threshold (%)</label>
            <input type="number" min={0} max={100} value={(s.qualityThreshold as number) ?? 80}
              onChange={e => set('qualityThreshold', parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
      </section>

      {/* Automation */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
        <h2 className="font-semibold text-white mb-1">Automation Level</h2>
        <p className="text-xs text-gray-500 mb-3">Autonomous publishing is never silently enabled. Approval is always required to move content to Published.</p>
        {AUTOMATION_LEVELS.map(level => (
          <label key={level.value} className="flex items-start gap-3 cursor-pointer">
            <input type="radio" name="automationLevel" value={level.value}
              checked={(s.automationLevel as string) === level.value}
              onChange={() => set('automationLevel', level.value)}
              className="mt-1 accent-indigo-500" />
            <div>
              <span className="text-sm text-white font-medium">{level.label}</span>
              <p className="text-xs text-gray-500">{level.description}</p>
            </div>
          </label>
        ))}
      </section>

      {/* Campaign cost controls */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white mb-1">Campaign Cost Controls</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Token cap per campaign (output tokens)</label>
            <input type="number" min={500} max={8000} value={(s.tokenCapPerCampaign as number) ?? 4000}
              onChange={e => set('tokenCapPerCampaign', parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            <p className="text-xs text-gray-600 mt-1">Generation stops and reports if this is hit. 4000 ≈ $0.06/campaign.</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Require approval before publish</label>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={(s.approvalRequired as boolean) ?? true}
                onChange={e => set('approvalRequired', e.target.checked)}
                className="accent-indigo-500 w-4 h-4" />
              <span className="text-sm text-white">Approval required</span>
            </label>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white mb-1">Notifications</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notification email (audit complete, campaign ready for approval)</label>
          <input type="email" value={(s.notificationsEmail as string) ?? ''} onChange={e => set('notificationsEmail', e.target.value)}
            placeholder="e.g. admin@walztravels.com"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
          <p className="text-xs text-gray-600 mt-1">Sent when an audit finishes or a campaign moves to review. Leave blank to disable.</p>
        </div>
      </section>

      {/* Buffer Integration */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-semibold text-white">Buffer Integration</h2>
          <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full">Phase 2</span>
        </div>
        <p className="text-xs text-gray-500">
          Connect Buffer to publish approved campaigns directly from Orbit.
          Get your access token at <span className="text-indigo-400">publish.buffer.com → Settings → API</span>.
        </p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Buffer Access Token</label>
          <input type="password" value={(s.bufferAccessToken as string) ?? ''} onChange={e => set('bufferAccessToken', e.target.value)}
            placeholder="Enter Buffer personal access token"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono" />
          <p className="text-xs text-gray-600 mt-1">Stored encrypted. Never exposed in browser code.</p>
        </div>
        <p className="text-xs text-gray-400 font-medium">Channel IDs (from Buffer → Channels → copy channel ID from URL)</p>
        <div className="grid grid-cols-2 gap-3">
          {(['instagram', 'facebook', 'linkedin', 'twitter'] as const).map(platform => (
            <div key={platform}>
              <label className="block text-xs text-gray-400 mb-1 capitalize">{platform} Channel ID</label>
              <input
                value={((s.bufferChannels as Record<string, string> | undefined)?.[platform]) ?? ''}
                onChange={e => set('bufferChannels', { ...(s.bufferChannels as object ?? {}), [platform]: e.target.value })}
                placeholder={`e.g. 6...${platform.slice(0, 3)}`}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
              />
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end pb-8">
        <button onClick={save} disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-6 py-2 rounded-lg transition-colors">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
