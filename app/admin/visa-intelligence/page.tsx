'use client'

import { useState, useEffect } from 'react'
import {
  Globe, Search, Edit, Save, X, AlertTriangle, CheckCircle,
  Loader2, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'

interface Portal {
  destinationIso2: string; countryName: string; flagEmoji: string | null; region: string | null
  walzFeeUsd: number; walzFeeNgn: number; govtFeeUsd: number; govtFeeAmount: number; govtFeeCurrency: string
  processingDaysMin: number; processingDaysMax: number; maxStayDays: number; validityDays: number
  singleOrMultiple: string; requiredDocuments: string[]; jadeTips: string | null
  commonRefusals: string[]; advisoryLevel: number; portalUrl: string | null
}

interface Advisory {
  destinationIso2: string; advisoryLevel: number; advisoryText: string | null; message: string | null
}

const ADVISORY_LABELS = ['', 'Normal precautions', 'Exercise caution', 'Reconsider travel', 'Do not travel']
const ADVISORY_COLORS = ['', 'text-green-600', 'text-amber-600', 'text-orange-600', 'text-red-600']

function AdvisoryPill({ level }: { level: number }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
      level === 1 ? 'bg-green-100 text-green-700' :
      level === 2 ? 'bg-amber-100 text-amber-700' :
      level === 3 ? 'bg-orange-100 text-orange-700' :
      'bg-red-100 text-red-700'
    }`}>
      L{level}
    </span>
  )
}

export default function VisaIntelligencePage() {
  const [portals, setPortals]     = useState<Portal[]>([])
  const [advisories, setAdvisories] = useState<Advisory[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'portals' | 'advisories'>('portals')
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState<string | null>(null)
  const [editData, setEditData]   = useState<Partial<Portal>>({})
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState<string | null>(null)
  const [expanded, setExpanded]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/visa-intelligence')
      .then(r => r.json())
      .then(d => { setPortals(d.portals ?? []); setAdvisories(d.advisories ?? []) })
      .finally(() => setLoading(false))
  }, [])

  async function savePortal(iso2: string) {
    setSaving(true)
    const res = await fetch('/api/admin/visa-intelligence', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'portal', iso2, ...editData }),
    })
    if (res.ok) {
      setPortals(prev => prev.map(p => p.destinationIso2 === iso2 ? { ...p, ...editData } : p))
      setSaved(iso2)
      setTimeout(() => setSaved(null), 2000)
    }
    setEditing(null)
    setSaving(false)
  }

  async function saveAdvisory(iso2: string, level: number, message: string) {
    await fetch('/api/admin/visa-intelligence', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'advisory', iso2, advisoryLevel: level, message }),
    })
    setAdvisories(prev => prev.map(a => a.destinationIso2 === iso2 ? { ...a, advisoryLevel: level, message } : a))
  }

  const filteredPortals = portals.filter(p =>
    p.countryName.toLowerCase().includes(search.toLowerCase()) ||
    p.destinationIso2.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
    </div>
  )

  const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C]'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-[#C9A84C]" />
            <div>
              <h1 className="text-xl font-bold text-[#0B1F3A]">Visa Intelligence Admin</h1>
              <p className="text-sm text-gray-400">{portals.length} destinations · {advisories.length} advisories</p>
            </div>
          </div>
          <a href="/visa-hub" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors">
            View Live Hub →
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-100">
          {(['portals', 'advisories'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                tab === t ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>
              {t === 'portals' ? `Country Portals (${portals.length})` : `Travel Advisories (${advisories.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 max-w-5xl">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search countries…"
            className="w-full pl-10 pr-4 h-10 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] bg-white" />
        </div>

        {/* Portals tab */}
        {tab === 'portals' && (
          <div className="space-y-3">
            {filteredPortals.map(p => (
              <div key={p.destinationIso2} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Row header */}
                <div className="flex items-center gap-3 px-5 py-3">
                  <span className="text-2xl">{p.flagEmoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#0B1F3A] text-sm">{p.countryName}</span>
                      <span className="text-xs text-gray-400 font-mono">{p.destinationIso2}</span>
                      <AdvisoryPill level={p.advisoryLevel} />
                      {saved === p.destinationIso2 && (
                        <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Saved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span>${p.walzFeeUsd} Walz fee</span>
                      <span>{p.processingDaysMin}–{p.processingDaysMax} days</span>
                      <span>{p.maxStayDays} days stay</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditing(p.destinationIso2); setEditData(p); setExpanded(p.destinationIso2) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-semibold text-[#0B1F3A] rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </button>
                    <button onClick={() => setExpanded(v => v === p.destinationIso2 ? null : p.destinationIso2)}
                      className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400">
                      {expanded === p.destinationIso2 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Edit/expand panel */}
                {expanded === p.destinationIso2 && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                    {editing === p.destinationIso2 ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Walz Fee USD</label>
                            <input type="number" className={INPUT} value={editData.walzFeeUsd ?? 0}
                              onChange={e => setEditData(d => ({ ...d, walzFeeUsd: +e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Walz Fee NGN</label>
                            <input type="number" className={INPUT} value={editData.walzFeeNgn ?? 0}
                              onChange={e => setEditData(d => ({ ...d, walzFeeNgn: +e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Processing Min</label>
                            <input type="number" className={INPUT} value={editData.processingDaysMin ?? 1}
                              onChange={e => setEditData(d => ({ ...d, processingDaysMin: +e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Processing Max</label>
                            <input type="number" className={INPUT} value={editData.processingDaysMax ?? 30}
                              onChange={e => setEditData(d => ({ ...d, processingDaysMax: +e.target.value }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Max Stay Days</label>
                            <input type="number" className={INPUT} value={editData.maxStayDays ?? 30}
                              onChange={e => setEditData(d => ({ ...d, maxStayDays: +e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Advisory Level</label>
                            <select className={INPUT + ' bg-white'} value={editData.advisoryLevel ?? 1}
                              onChange={e => setEditData(d => ({ ...d, advisoryLevel: +e.target.value }))}>
                              <option value={1}>1 — Normal</option>
                              <option value={2}>2 — Caution</option>
                              <option value={3}>3 — Reconsider</option>
                              <option value={4}>4 — Do not travel</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Entry Type</label>
                            <select className={INPUT + ' bg-white'} value={editData.singleOrMultiple ?? 'single'}
                              onChange={e => setEditData(d => ({ ...d, singleOrMultiple: e.target.value }))}>
                              <option value="single">Single</option>
                              <option value="double">Double</option>
                              <option value="multiple">Multiple</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Jade Tips</label>
                          <textarea rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] resize-none"
                            value={editData.jadeTips ?? ''}
                            onChange={e => setEditData(d => ({ ...d, jadeTips: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Portal URL</label>
                          <input className={INPUT} value={editData.portalUrl ?? ''}
                            onChange={e => setEditData(d => ({ ...d, portalUrl: e.target.value }))} />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => savePortal(p.destinationIso2)} disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-lg hover:bg-[#b8943d] transition-colors disabled:opacity-50">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save Changes
                          </button>
                          <button onClick={() => { setEditing(null); setExpanded(null) }}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50">
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm text-gray-600">
                        {p.jadeTips && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Jade Tips</p>
                            <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border border-gray-100">{p.jadeTips}</p>
                          </div>
                        )}
                        {p.requiredDocuments.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Required Documents</p>
                            <ul className="space-y-1">
                              {p.requiredDocuments.map((d, i) => <li key={i} className="text-xs text-gray-500">• {d}</li>)}
                            </ul>
                          </div>
                        )}
                        {p.commonRefusals.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-500 mb-1 uppercase tracking-wide">Common Refusals</p>
                            <ul className="space-y-1">
                              {p.commonRefusals.map((r, i) => <li key={i} className="text-xs text-red-500">⚠ {r}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Advisories tab */}
        {tab === 'advisories' && (
          <div className="space-y-3">
            {advisories
              .filter(a => a.destinationIso2.toLowerCase().includes(search.toLowerCase()))
              .map(a => (
              <div key={a.destinationIso2} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-[#0B1F3A] w-10">{a.destinationIso2}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <select
                        defaultValue={a.advisoryLevel}
                        onChange={e => {
                          const level = +e.target.value
                          saveAdvisory(a.destinationIso2, level, a.message ?? '')
                        }}
                        className="h-8 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#C9A84C] bg-white"
                      >
                        <option value={1}>Level 1 — Normal</option>
                        <option value={2}>Level 2 — Caution</option>
                        <option value={3}>Level 3 — Reconsider</option>
                        <option value={4}>Level 4 — Do not travel</option>
                      </select>
                      <AdvisoryPill level={a.advisoryLevel} />
                    </div>
                    {a.message && <p className="text-xs text-gray-400 mt-1">{a.message}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
