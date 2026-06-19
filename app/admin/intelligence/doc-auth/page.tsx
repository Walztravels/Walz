'use client'

import { useState, useEffect, useCallback } from 'react'

type Verdict = 'all' | 'authentic' | 'suspicious' | 'fraudulent'

interface DocCheck {
  id: string
  applicationId: string
  documentType: string
  fileName: string
  verdict: 'authentic' | 'suspicious' | 'fraudulent'
  authenticityScore: number
  stampDetected: boolean
  signatureDetected: boolean
  flags: string[]
  checkedAt: string
}

const DOC_TYPES = ['passport', 'bank_statement', 'payslip', 'employment_letter', 'utility_bill', 'invitation_letter']
const VERDICT_TABS: Verdict[] = ['all', 'authentic', 'suspicious', 'fraudulent']

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

function verdictBadge(verdict: string) {
  const map: Record<string, string> = {
    authentic: 'bg-green-100 text-green-700',
    suspicious: 'bg-yellow-100 text-yellow-700',
    fraudulent: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[verdict] ?? 'bg-gray-100 text-gray-500'}`}>
      {verdict}
    </span>
  )
}

export default function DocAuthPage() {
  const [checks, setChecks] = useState<DocCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [verdictFilter, setVerdictFilter] = useState<Verdict>('all')
  const [form, setForm] = useState({ applicationId: '', documentType: 'passport', fileName: '' })
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/doc-auth')
      const data = await res.json()
      setChecks(data.checks ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runCheck(e: React.FormEvent) {
    e.preventDefault()
    setRunning(true)
    try {
      await fetch('/api/admin/intelligence/doc-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm({ applicationId: '', documentType: 'passport', fileName: '' })
      await load()
    } finally {
      setRunning(false)
    }
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const filtered = verdictFilter === 'all' ? checks : checks.filter(c => c.verdict === verdictFilter)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Document Authenticity Checks</h1>
          <p className="text-sm text-gray-500 mt-1">Forensic AI verification of client documents</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Run Authenticity Check</h2>
        <form onSubmit={runCheck} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Application ID</label>
            <input className={INPUT} placeholder="app_..." value={form.applicationId} onChange={e => set('applicationId', e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Document Type</label>
            <select className={INPUT} value={form.documentType} onChange={e => set('documentType', e.target.value)}>
              {DOC_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">File Name</label>
            <div className="flex gap-2">
              <input className={INPUT} placeholder="e.g. passport_scan.pdf" value={form.fileName} onChange={e => set('fileName', e.target.value)} required />
              <button
                type="submit"
                disabled={running}
                className="h-9 px-4 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#0d2345] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {running ? 'Checking…' : 'Run Check'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {VERDICT_TABS.map(v => (
          <button
            key={v}
            onClick={() => setVerdictFilter(v)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              verdictFilter === v ? 'border-[#C9A84C] text-[#0B1F3A]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No checks found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Application</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Doc Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Verdict</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Signature</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Flags</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Checked At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-xs font-mono text-gray-500 truncate max-w-[120px]">{c.applicationId}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 capitalize">{c.documentType?.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">{verdictBadge(c.verdict)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.authenticityScore >= 80 ? 'bg-green-500' : c.authenticityScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${c.authenticityScore ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{c.authenticityScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.stampDetected
                        ? <span className="text-green-600 text-xs font-semibold">Yes</span>
                        : <span className="text-gray-400 text-xs">No</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {c.signatureDetected
                        ? <span className="text-green-600 text-xs font-semibold">Yes</span>
                        : <span className="text-gray-400 text-xs">No</span>
                      }
                    </td>
                    <td className="px-4 py-3 max-w-[160px]">
                      {c.flags?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {c.flags.slice(0, 2).map((flag, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-xs rounded">{flag}</span>
                          ))}
                          {c.flags.length > 2 && <span className="text-xs text-gray-400">+{c.flags.length - 2}</span>}
                        </div>
                      ) : <span className="text-gray-400 text-xs">None</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(c.checkedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
