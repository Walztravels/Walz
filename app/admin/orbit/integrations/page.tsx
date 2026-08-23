'use client'

import { useEffect, useState } from 'react'

const BUFFER_PLATFORMS = [
  { key: 'instagram',      label: 'Instagram' },
  { key: 'facebook',       label: 'Meta (Facebook)' },
  { key: 'linkedin',       label: 'LinkedIn' },
  { key: 'twitter',        label: 'X (Twitter)' },
  { key: 'tiktok',         label: 'TikTok' },
  { key: 'googlebusiness', label: 'Google Business' },
]

interface Settings {
  bufferToken: string; bufferConnected: boolean
  bufferChannels: Record<string, string>
  seApiKey: string; seConnected: boolean
  gscJson: string; gscSiteUrl: string; gscConnected: boolean
}

export default function IntegrationsPage() {
  const [settings, setSettings] = useState<Settings>({
    bufferToken: '', bufferConnected: false,
    bufferChannels: {},
    seApiKey: '', seConnected: false,
    gscJson: '', gscSiteUrl: '', gscConnected: false,
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState<string | null>(null)
  const [error, setError]       = useState('')

  async function load() {
    const res = await fetch('/api/admin/orbit/settings')
    const data = await res.json()
    if (data.settings) {
      setSettings({
        bufferToken:     data.settings.bufferToken     ?? '',
        bufferConnected: data.settings.bufferConnected ?? false,
        bufferChannels:  data.settings.bufferChannels  ?? {},
        seApiKey:        data.settings.seApiKey        ?? '',
        seConnected:     data.settings.seConnected     ?? false,
        gscJson:         data.settings.gscJson         ?? '',
        gscSiteUrl:      data.settings.gscSiteUrl      ?? '',
        gscConnected:    data.settings.gscConnected    ?? false,
      })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function save(key: string, payload: Record<string, unknown>) {
    setSaving(true); setSaved(null); setError('')
    try {
      const res = await fetch('/api/admin/orbit/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationKey: key, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSaved(key)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setSaving(false) }
  }

  if (loading) return <div className="py-12 text-center text-gray-500 text-sm">Loading…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-sm text-gray-400 mt-1">Connect external services for content publishing and keyword tracking</p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* Buffer */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Buffer</p>
            <p className="text-xs text-gray-500 mt-0.5">Publish social media posts from Orbit Schedule</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${settings.bufferConnected ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
            {settings.bufferConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">API Token</label>
          <input
            type="password"
            value={settings.bufferToken}
            onChange={e => setSettings(p => ({ ...p, bufferToken: e.target.value }))}
            placeholder="••••••••"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-600 mt-1">Get your token from publish.buffer.com/settings/api</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-2">Channel IDs <span className="text-gray-600">(from Buffer → Channels → each channel URL)</span></p>
          <div className="space-y-2">
            {BUFFER_PLATFORMS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-36 flex-shrink-0">{label}</span>
                <input
                  type="text"
                  value={settings.bufferChannels[key] ?? ''}
                  onChange={e => setSettings(p => ({
                    ...p,
                    bufferChannels: { ...p.bufferChannels, [key]: e.target.value },
                  }))}
                  placeholder="Channel ID"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => save('buffer', { bufferToken: settings.bufferToken, bufferChannels: settings.bufferChannels })}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved === 'buffer' ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* SE Ranking */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">SE Ranking</p>
            <p className="text-xs text-gray-500 mt-0.5">Competitor snapshots and keyword research</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${settings.seConnected ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
            {settings.seConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">API Key</label>
          <input
            type="password"
            value={settings.seApiKey}
            onChange={e => setSettings(p => ({ ...p, seApiKey: e.target.value }))}
            placeholder="••••••••"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-600 mt-1">Find your key in SE Ranking → Account → API</p>
        </div>
        <button
          onClick={() => save('se_ranking', { seApiKey: settings.seApiKey })}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved === 'se_ranking' ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* Google Search Console */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Google Search Console</p>
            <p className="text-xs text-gray-500 mt-0.5">Import keyword rankings and sync search analytics</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${settings.gscConnected ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
            {settings.gscConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Site URL</label>
            <input
              type="text"
              value={settings.gscSiteUrl}
              onChange={e => setSettings(p => ({ ...p, gscSiteUrl: e.target.value }))}
              placeholder="https://www.walztravels.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Service Account JSON</label>
            <textarea
              value={settings.gscJson}
              onChange={e => setSettings(p => ({ ...p, gscJson: e.target.value }))}
              rows={5}
              placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  ...\n}'}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
            <p className="text-xs text-gray-600 mt-1">
              Create a service account in Google Cloud Console, grant it Search Console access, then paste the JSON key here.
              API credentials are stored server-side and never exposed to the browser.
            </p>
          </div>
        </div>
        <button
          onClick={() => save('gsc', { gscJson: settings.gscJson, gscSiteUrl: settings.gscSiteUrl })}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : saved === 'gsc' ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* GA4 / Meta Ads / Google Ads — coming soon */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 opacity-60">
        <p className="text-sm font-semibold text-gray-400">Google Analytics 4, Meta Ads, Google Ads</p>
        <p className="text-xs text-gray-600 mt-1">Coming soon. Once connected, analytics data will appear in the Analytics dashboard.</p>
      </div>
    </div>
  )
}
