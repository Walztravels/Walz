'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

interface VisaService {
  id: string; country: string; flag: string | null; visaType: string; processingTime: string
  fee: number; currency: string; requirements: string; imageUrl: string | null; active: boolean
}

const EMPTY: Omit<VisaService, 'id'> = {
  country: '', flag: '', visaType: 'Tourist', processingTime: '', fee: 0, currency: 'GBP',
  requirements: '[]', imageUrl: '', active: true,
}

export default function VisaPage() {
  const [services, setServices] = useState<VisaService[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<VisaService> | null>(null)
  const [saving, setSaving] = useState(false)
  const [reqInput, setReqInput] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/visa')
    setServices((await res.json()) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openModal(svc?: VisaService) {
    const target = svc ?? EMPTY
    setModal(target)
    const reqs = JSON.parse(target.requirements || '[]') as string[]
    setReqInput(reqs.join('\n'))
  }

  async function save() {
    setSaving(true)
    const reqs = reqInput.split('\n').map((r) => r.trim()).filter(Boolean)
    const payload = { ...modal, requirements: JSON.stringify(reqs), fee: Number(modal?.fee ?? 0) }
    await fetch('/api/admin/visa', {
      method: modal?.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    await load()
    setModal(null)
    setSaving(false)
  }

  async function deleteService(id: string) {
    if (!confirm('Delete this visa service?')) return
    await fetch('/api/admin/visa', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Visa Services</h1>
          <p className="text-gray-500 text-sm mt-1">Manage visa service listings, processing times and fees.</p>
        </div>
        <button onClick={() => openModal()} className="flex items-center gap-2 bg-[#C9A84C] hover:bg-[#d4b45f] text-[#0B1F3A] font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus className="w-4 h-4" /> Add Visa Service
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              {['Country', 'Visa Type', 'Processing Time', 'Fee', 'Status', 'Actions'].map((h) => (
                <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading…</td></tr>
            ) : services.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No visa services yet.</td></tr>
            ) : services.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-6 py-4 font-semibold text-[#0B1F3A]">{s.flag && <span className="mr-2">{s.flag}</span>}{s.country}</td>
                <td className="px-6 py-4 text-gray-600">{s.visaType}</td>
                <td className="px-6 py-4 text-gray-600">{s.processingTime}</td>
                <td className="px-6 py-4 font-bold text-[#C9A84C]">
                  {new Intl.NumberFormat('en-GB', { style: 'currency', currency: s.currency }).format(s.fee)}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.active ? 'Active' : 'Hidden'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openModal(s)} className="p-1.5 text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 rounded-lg transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteService(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-[#0B1F3A]">{modal.id ? 'Edit Visa Service' : 'New Visa Service'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Country *</label>
                  <input value={modal.country ?? ''} onChange={(e) => setModal({ ...modal, country: e.target.value })} placeholder="e.g. United Arab Emirates" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Flag Emoji</label>
                  <input value={modal.flag ?? ''} onChange={(e) => setModal({ ...modal, flag: e.target.value })} placeholder="🇦🇪" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Visa Type *</label>
                  <input value={modal.visaType ?? ''} onChange={(e) => setModal({ ...modal, visaType: e.target.value })} placeholder="Tourist / Business / Transit" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Processing Time *</label>
                  <input value={modal.processingTime ?? ''} onChange={(e) => setModal({ ...modal, processingTime: e.target.value })} placeholder="e.g. 3-5 working days" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Service Fee *</label>
                  <input type="number" value={modal.fee ?? 0} onChange={(e) => setModal({ ...modal, fee: Number(e.target.value) })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <select value={modal.currency ?? 'GBP'} onChange={(e) => setModal({ ...modal, currency: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C]">
                    {['GBP', 'USD', 'EUR', 'NGN', 'AED'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Requirements (one per line)</label>
                <textarea
                  value={reqInput}
                  onChange={(e) => setReqInput(e.target.value)}
                  rows={4}
                  placeholder="Valid passport&#10;Bank statements (3 months)&#10;Travel insurance"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#C9A84C] resize-none"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={modal.active ?? true} onChange={(e) => setModal({ ...modal, active: e.target.checked })} className="w-4 h-4 accent-[#C9A84C]" />
                <span className="text-sm text-gray-700">Show on website</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={save} disabled={saving} className="flex-1 bg-[#0B1F3A] hover:bg-[#1a3358] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Service'}
              </button>
              <button onClick={() => setModal(null)} className="px-6 border border-gray-200 hover:bg-gray-50 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
