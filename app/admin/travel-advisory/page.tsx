'use client'
import { useState, useEffect } from 'react'
import { Pencil, Loader2, Check, AlertTriangle } from 'lucide-react'

interface Advisory {
  destinationIso2: string
  advisoryLevel: number
  advisoryText: string | null
  message: string | null
  cachedAt: string
}

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Safe',    color: 'bg-green-100 text-green-700' },
  2: { label: 'Caution', color: 'bg-yellow-100 text-yellow-700' },
  3: { label: 'High',    color: 'bg-orange-100 text-orange-700' },
  4: { label: 'Avoid',   color: 'bg-red-100 text-red-700' },
}

export default function TravelAdvisoryPage() {
  const [items,   setItems]   = useState<Advisory[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form,    setForm]    = useState<Partial<Advisory>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [newIso,  setNewIso]  = useState('')

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/admin/travel-advisory')
    const data = await res.json()
    setItems(data.items ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function saveAdvisory(iso2: string) {
    setSaving(true)
    await fetch('/api/admin/travel-advisory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationIso2: iso2, ...form }),
    })
    setSaving(false); setEditing(null); setShowAdd(false); setForm({}); setNewIso(''); load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Travel Advisories</h1>
          <p className="text-gray-400 text-sm mt-0.5">Advisory levels shown on visa destination pages</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditing(null); setForm({ advisoryLevel: 1 }) }}
          className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4" /> Add Advisory
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
          <p className="font-bold text-[#0B1F3A] text-sm">New Advisory</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Country ISO2 Code</label>
              <input value={newIso} onChange={e => setNewIso(e.target.value.toUpperCase())}
                placeholder="GB, US, NG…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Level</label>
              <select value={form.advisoryLevel ?? 1}
                onChange={e => setForm(p => ({ ...p, advisoryLevel: parseInt(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]">
                {[1, 2, 3, 4].map(n => (
                  <option key={n} value={n}>{n} — {LEVEL_LABELS[n].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Advisory Text (shown on visa page)</label>
            <textarea value={form.advisoryText ?? ''}
              onChange={e => setForm(p => ({ ...p, advisoryText: e.target.value }))}
              rows={2} placeholder="Brief advisory description…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Internal Notes</label>
            <textarea value={form.message ?? ''}
              onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setForm({}) }}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
            <button onClick={() => saveAdvisory(newIso)} disabled={!newIso || saving}
              className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <AlertTriangle className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">No advisories yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Country</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase">Level</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase hidden md:table-cell">Advisory</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase hidden sm:table-cell">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <>
                  <tr key={item.destinationIso2} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-[#0B1F3A] text-sm">{item.destinationIso2}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${LEVEL_LABELS[item.advisoryLevel]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                        {item.advisoryLevel} — {LEVEL_LABELS[item.advisoryLevel]?.label ?? 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell max-w-xs truncate">
                      {item.advisoryText ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">
                      {new Date(item.cachedAt).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEditing(item.destinationIso2); setForm({ ...item }); setShowAdd(false) }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0B1F3A]">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  {editing === item.destinationIso2 && (
                    <tr key={`${item.destinationIso2}-edit`}>
                      <td colSpan={5} className="px-4 pb-4">
                        <div className="space-y-3 bg-[#F5F0E8] rounded-2xl p-4">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Level</label>
                            <select value={form.advisoryLevel ?? 1}
                              onChange={e => setForm(p => ({ ...p, advisoryLevel: parseInt(e.target.value) }))}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]">
                              {[1, 2, 3, 4].map(n => (
                                <option key={n} value={n}>{n} — {LEVEL_LABELS[n].label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Advisory Text</label>
                            <textarea value={form.advisoryText ?? ''}
                              onChange={e => setForm(p => ({ ...p, advisoryText: e.target.value }))}
                              rows={2}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Internal Notes</label>
                            <textarea value={form.message ?? ''}
                              onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                              rows={2}
                              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C] resize-none" />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setEditing(null); setForm({}) }}
                              className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
                            <button onClick={() => saveAdvisory(item.destinationIso2)} disabled={saving}
                              className="flex items-center gap-2 bg-[#C9A84C] text-[#0B1F3A] font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-60">
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              Save
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
