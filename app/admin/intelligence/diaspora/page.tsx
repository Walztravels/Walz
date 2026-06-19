'use client'

import { useState, useEffect, useCallback } from 'react'

interface DiasporaRecord {
  id: string
  passportCountry: string
  destinationIso2: string
  bankName: string
  totalApplications: number
  approvals: number
  refusals: number
  approvalRate: number
  avgApprovedBalance: number
  peakMonths: string[]
  trending: boolean
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function DiasporaPage() {
  const [data, setData] = useState<DiasporaRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [passportFilter, setPassportFilter] = useState('')
  const [destinationFilter, setDestinationFilter] = useState('')
  const [form, setForm] = useState({
    passportCountry: '',
    destinationIso2: '',
    bankName: '',
    outcome: 'approved',
  })
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/diaspora')
      const json = await res.json()
      setData(json.records ?? json ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function recordOutcome(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await fetch('/api/admin/intelligence/diaspora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm({ passportCountry: '', destinationIso2: '', bankName: '', outcome: 'approved' })
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const passportCountries = [...new Set(data.map(d => d.passportCountry))].sort()
  const destinations = [...new Set(data.map(d => d.destinationIso2))].sort()

  const filtered = data.filter(d => {
    if (passportFilter && d.passportCountry !== passportFilter) return false
    if (destinationFilter && d.destinationIso2 !== destinationFilter) return false
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Diaspora Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">Approval benchmarks by nationality and bank</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Record Outcome</h2>
        <form onSubmit={recordOutcome} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Passport Country</label>
            <input className={INPUT} placeholder="e.g. Nigeria" value={form.passportCountry} onChange={e => set('passportCountry', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Destination (ISO2)</label>
            <input className={INPUT} placeholder="e.g. GB" value={form.destinationIso2} onChange={e => set('destinationIso2', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Bank Name</label>
            <input className={INPUT} placeholder="e.g. GTBank" value={form.bankName} onChange={e => set('bankName', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Outcome</label>
            <div className="flex gap-2">
              <select className={INPUT} value={form.outcome} onChange={e => set('outcome', e.target.value)}>
                <option value="approved">Approved</option>
                <option value="refused">Refused</option>
              </select>
              <button type="submit" disabled={submitting} className="h-9 px-4 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors whitespace-nowrap">
                {submitting ? 'Saving…' : 'Record'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <select className={INPUT} value={passportFilter} onChange={e => setPassportFilter(e.target.value)}>
            <option value="">All Passport Countries</option>
            {passportCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <select className={INPUT} value={destinationFilter} onChange={e => setDestinationFilter(e.target.value)}>
            <option value="">All Destinations</option>
            {destinations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No diaspora data found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Passport</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Destination</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Approved</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Refused</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Approval Rate</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Balance</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Peak Months</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 font-semibold text-[#0B1F3A] text-xs">{d.passportCountry}</td>
                    <td className="px-4 py-3 text-xs font-bold text-gray-600 uppercase">{d.destinationIso2}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{d.bankName}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{d.totalApplications}</td>
                    <td className="px-4 py-3 text-xs text-green-700 font-semibold">{d.approvals}</td>
                    <td className="px-4 py-3 text-xs text-red-600 font-semibold">{d.refusals}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${d.approvalRate >= 70 ? 'bg-green-500' : d.approvalRate >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${d.approvalRate ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-[#0B1F3A]">{d.approvalRate?.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">£{d.avgApprovedBalance?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{d.peakMonths?.join(', ') ?? '—'}</td>
                    <td className="px-4 py-3">
                      {d.trending
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#C9A84C]/10 text-[#C9A84C]">Trending</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
