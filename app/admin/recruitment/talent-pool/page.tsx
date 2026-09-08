'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, Star, Mail } from 'lucide-react'

interface Entry { id: string; candidateId: string; addedBy: string; reason: string | null; createdAt: string }
interface CandidateRef { id: string; firstName: string; lastName: string; email: string; country: string | null }

export default function TalentPoolPage() {
  const [entries,    setEntries]    = useState<Entry[]>([])
  const [candidates, setCandidates] = useState<CandidateRef[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [busy,       setBusy]       = useState(false)
  const [search,     setSearch]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/recruitment/talent-pool')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setEntries(data.entries ?? [])
      setCandidates(data.candidates ?? [])
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function remove(candidateId: string, name: string) {
    if (!confirm(`Remove ${name} from the talent pool? Use this also when a candidate asks not to be contacted.`)) return
    setBusy(true); setError('')
    const res  = await fetch('/api/admin/recruitment/talent-pool', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Remove failed'); return }
    await load()
  }

  const byId = Object.fromEntries(candidates.map(c => [c.id, c]))
  const rows = entries
    .map(e => ({ entry: e, candidate: byId[e.candidateId] }))
    .filter(r => r.candidate)
    .filter(r => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      const c = r.candidate!
      return `${c.firstName} ${c.lastName} ${c.email} ${r.entry.reason ?? ''}`.toLowerCase().includes(q)
    })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400 mb-1">
          <Link href="/admin/recruitment" className="hover:underline">Recruitment</Link> › Talent Pool
        </p>
        <h1 className="text-2xl font-bold text-[#0B1F3A]">Talent Pool</h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Candidates kept in view for future roles. Add from a candidate profile; remove on request.
        </p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>}

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search name, email or reason…" aria-label="Search talent pool"
        className="w-full max-w-md text-sm border border-gray-200 rounded-xl px-4 py-2.5 bg-white" />

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <Star className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">{entries.length === 0 ? 'The talent pool is empty. Add candidates from their profile page.' : 'No matches for your search.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(({ entry, candidate }) => (
            <div key={entry.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/admin/recruitment/candidates/${candidate!.id}`}
                  className="font-bold text-[#0B1F3A] text-sm hover:underline">
                  {candidate!.firstName} {candidate!.lastName}
                </Link>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{candidate!.email}</span>
                  {candidate!.country && <span>{candidate!.country}</span>}
                  <span>added {new Date(entry.createdAt).toLocaleDateString('en-GB')} by {entry.addedBy}</span>
                </div>
                {entry.reason && <p className="text-xs text-gray-500 mt-1">{entry.reason}</p>}
              </div>
              <button onClick={() => void remove(candidate!.id, `${candidate!.firstName} ${candidate!.lastName}`)} disabled={busy}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-200 disabled:opacity-40">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
