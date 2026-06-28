'use client'

import { useEffect, useState, useCallback } from 'react'
import { Users, Copy, Plus, Loader2, Check, X, ExternalLink } from 'lucide-react'

type HiveMember = {
  id:          string
  slotNumber:  number
  firstName:   string
  lastName:    string
  isSubmitted: boolean
  submittedAt: string | null
}

type HiveSession = {
  id:             string
  slug:           string
  groupName:      string
  visaType:       string
  destination:    string
  travelDate:     string | null
  memberCount:    number
  status:         string
  analysisResult: string | null
  createdAt:      string
  members:        HiveMember[]
}

type AnalysisResult = {
  overallProbability:      number
  groupRiskLevel:          string
  groupSummary:            string
  strongestMember:         string
  memberNeedingMostPrep:   string
  members:                 { name: string; slotNumber: number; approvalProbability: number; riskLevel: string; strengths: string[]; riskFactors: string[]; recommendations: string[] }[]
  documentsAllMustProvide: string[]
  groupConcerns:           string[]
  submissionStrategy:      string
  walzRecommendation:      string
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  collecting: { label: 'Collecting',  cls: 'bg-amber-100 text-amber-700'  },
  complete:   { label: 'Ready',       cls: 'bg-blue-100 text-blue-700'    },
  analysing:  { label: 'Analysing…',  cls: 'bg-purple-100 text-purple-700' },
  done:       { label: 'Done',        cls: 'bg-green-100 text-green-700'  },
}

const VISA_TYPES = [
  'UK Visitor Visa', 'UK Student Visa', 'UK Work Visa',
  'Schengen Visa', 'USA Visa', 'Canada Visitor Visa',
  'Canada Study Permit', 'UAE Visa', 'Australia Visa', 'Other',
]

const DESTINATIONS = [
  'United Kingdom', 'Schengen Area', 'United States', 'Canada',
  'United Arab Emirates', 'Australia', 'Nigeria', 'Ghana', 'South Africa', 'Other',
]

export default function GroupHivePage() {
  const [sessions, setSessions]           = useState<HiveSession[]>([])
  const [loading, setLoading]             = useState(true)
  const [showModal, setShowModal]         = useState(false)
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [copiedSlug, setCopiedSlug]       = useState<string | null>(null)
  const [analysing, setAnalysing]         = useState<string | null>(null)
  const [analyseError, setAnalyseError]   = useState<string | null>(null)

  const [form, setForm] = useState({
    groupName: '', visaType: 'UK Visitor Visa', destination: 'United Kingdom',
    travelDate: '', memberCount: 5,
  })
  const [creating, setCreating]   = useState(false)
  const [created, setCreated]     = useState<{ slug: string; shareUrl: string } | null>(null)

  const fetchSessions = useCallback(async () => {
    const res  = await fetch('/api/admin/group-hive')
    const data = await res.json() as { sessions: HiveSession[] }
    setSessions(data.sessions ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const copyLink = (slug: string) => {
    const url = `https://www.walztravels.com/group-visa/hive/${slug}`
    navigator.clipboard.writeText(url)
    setCopiedSlug(slug)
    setTimeout(() => setCopiedSlug(null), 2000)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    const res  = await fetch('/api/admin/group-hive', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    const data = await res.json() as { session: HiveSession; shareUrl: string }
    setCreating(false)
    if (res.ok) {
      setCreated({ slug: data.session.slug, shareUrl: data.shareUrl })
      await fetchSessions()
    }
  }

  const handleAnalyse = async (id: string) => {
    setAnalysing(id)
    setAnalyseError(null)
    const res  = await fetch(`/api/admin/group-hive/${id}/analyse`, { method: 'POST' })
    const data = await res.json() as { error?: string }
    setAnalysing(null)
    if (!res.ok) {
      setAnalyseError(data.error ?? 'Analysis failed')
    } else {
      await fetchSessions()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this hive session? This cannot be undone.')) return
    await fetch(`/api/admin/group-hive/${id}`, { method: 'DELETE' })
    if (selectedId === id) setSelectedId(null)
    await fetchSessions()
  }

  const selectedSession = sessions.find(s => s.id === selectedId)

  const shareUrl = (slug: string) => `https://www.walztravels.com/group-visa/hive/${slug}`
  const waText   = (s: HiveSession) =>
    `Hi! Please fill in your visa details here so we can process the group application together: ${shareUrl(s.slug)}%0A(takes 2 minutes%2C travel: ${s.travelDate ?? 'TBC'})`

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Group Visa Hive</h1>
          <p className="text-sm text-gray-500 mt-0.5">One shared link per group — members fill their own details</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setCreated(null) }}
          className="flex items-center gap-2 bg-[#0B1F3A] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0B1F3A]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Hive
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session list */}
        <div className="space-y-3">
          {sessions.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="text-4xl mb-3">🐝</div>
              <p className="text-gray-500 text-sm">No hive sessions yet. Create one to get started.</p>
            </div>
          )}
          {sessions.map(s => {
            const submittedCount = s.members.filter(m => m.isSubmitted).length
            const allDone        = submittedCount >= s.memberCount
            const badge          = STATUS_BADGE[s.status] ?? { label: s.status, cls: 'bg-gray-100 text-gray-600' }
            const isAnalysing    = analysing === s.id

            return (
              <div
                key={s.id}
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                className={`bg-white rounded-2xl border transition-all cursor-pointer ${selectedId === s.id ? 'border-amber-400 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#0B1F3A] truncate">{s.groupName}</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{s.visaType} · {s.destination}</p>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-semibold text-[#0B1F3A] shrink-0">
                      <Users className="w-3.5 h-3.5 text-gray-400" />
                      {submittedCount}/{s.memberCount}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${allDone ? 'bg-green-400' : 'bg-amber-400'}`}
                      style={{ width: `${Math.round((submittedCount / s.memberCount) * 100)}%` }}
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      onClick={e => { e.stopPropagation(); copyLink(s.slug) }}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {copiedSlug === s.slug ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      {copiedSlug === s.slug ? 'Copied!' : 'Copy link'}
                    </button>

                    <a
                      onClick={e => e.stopPropagation()}
                      href={`https://wa.me/?text=${waText(s)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-medium text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      📱 WhatsApp
                    </a>

                    {(s.status === 'collecting' || s.status === 'complete') && (
                      <button
                        onClick={e => { e.stopPropagation(); if (allDone) handleAnalyse(s.id) }}
                        disabled={!allDone || isAnalysing}
                        title={!allDone ? `Waiting for ${s.memberCount - submittedCount} more member${s.memberCount - submittedCount !== 1 ? 's' : ''}` : 'Generate AI analysis'}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          allDone && !isAnalysing
                            ? 'bg-amber-400 text-[#0B1F3A] hover:bg-amber-500'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {isAnalysing ? <Loader2 className="w-3 h-3 animate-spin" /> : '⚡'}
                        {isAnalysing ? 'Analysing…' : allDone ? 'Generate Analysis' : `Waiting for ${s.memberCount - submittedCount} more`}
                      </button>
                    )}

                    {s.status === 'done' && (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                        ✅ Analysis ready
                      </span>
                    )}

                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                      className="ml-auto text-xs text-red-400 hover:text-red-600 transition-colors p-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {analyseError && analysing === null && s.id === selectedId && (
                    <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">{analyseError}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail panel */}
        <div>
          {!selectedSession && (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
              Select a session to view member details
            </div>
          )}

          {selectedSession && (() => {
            const submittedCount = selectedSession.members.filter(m => m.isSubmitted).length
            const analysis: AnalysisResult | null = selectedSession.analysisResult
              ? JSON.parse(selectedSession.analysisResult) as AnalysisResult
              : null

            return (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-[#0B1F3A]">{selectedSession.groupName}</h2>
                      <p className="text-xs text-gray-500">{selectedSession.visaType} · {selectedSession.destination}</p>
                    </div>
                    <a
                      href={shareUrl(selectedSession.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-amber-600 hover:underline"
                    >
                      View shared link <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => copyLink(selectedSession.slug)}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {copiedSlug === selectedSession.slug ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      {copiedSlug === selectedSession.slug ? 'Copied!' : 'Copy link'}
                    </button>
                    <span className="text-xs text-gray-400">{submittedCount}/{selectedSession.memberCount} submitted</span>
                  </div>
                </div>

                {/* Member slots */}
                <div className="divide-y divide-gray-100">
                  {selectedSession.members.map(m => (
                    <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${m.isSubmitted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {m.isSubmitted ? '✓' : m.slotNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        {m.isSubmitted ? (
                          <>
                            <span className="text-sm font-semibold text-[#0B1F3A]">{m.firstName} {m.lastName}</span>
                            {m.submittedAt && (
                              <span className="ml-2 text-xs text-gray-400">
                                submitted {new Date(m.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Slot {m.slotNumber} — waiting…</span>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.isSubmitted ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                        {m.isSubmitted ? 'Submitted' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Analysis */}
                {analysis && (
                  <div className="border-t border-gray-100 px-5 py-5 space-y-4">
                    <h3 className="font-bold text-[#0B1F3A] text-sm">AI Analysis</h3>

                    <div className="flex items-center gap-4">
                      <div className="text-3xl font-black text-[#0B1F3A]">{analysis.overallProbability}%</div>
                      <div>
                        <p className="text-xs font-semibold text-gray-600">Group approval probability</p>
                        <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${
                          analysis.groupRiskLevel === 'low'    ? 'bg-green-100 text-green-700' :
                          analysis.groupRiskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>{analysis.groupRiskLevel} risk</span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-600">{analysis.groupSummary}</p>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-green-50 rounded-xl p-3">
                        <p className="font-semibold text-green-700 mb-1">Strongest member</p>
                        <p className="text-green-800">{analysis.strongestMember}</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-3">
                        <p className="font-semibold text-amber-700 mb-1">Needs most prep</p>
                        <p className="text-amber-800">{analysis.memberNeedingMostPrep}</p>
                      </div>
                    </div>

                    {analysis.members.map((m, i) => (
                      <div key={i} className="border border-gray-100 rounded-xl p-4 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#0B1F3A]">{m.name}</span>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${
                              m.riskLevel === 'low' ? 'bg-green-100 text-green-700' :
                              m.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{m.riskLevel}</span>
                            <span className="font-bold text-[#0B1F3A]">{m.approvalProbability}%</span>
                          </div>
                        </div>
                        {m.strengths.length > 0 && (
                          <div>
                            <p className="font-medium text-gray-500 mb-1">Strengths</p>
                            <ul className="space-y-0.5">{m.strengths.map((s, j) => <li key={j} className="text-gray-600">✓ {s}</li>)}</ul>
                          </div>
                        )}
                        {m.riskFactors.length > 0 && (
                          <div>
                            <p className="font-medium text-gray-500 mb-1">Risk factors</p>
                            <ul className="space-y-0.5">{m.riskFactors.map((r, j) => <li key={j} className="text-red-600">⚠ {r}</li>)}</ul>
                          </div>
                        )}
                        {m.recommendations.length > 0 && (
                          <div>
                            <p className="font-medium text-gray-500 mb-1">Recommendations</p>
                            <ul className="space-y-0.5">{m.recommendations.map((r, j) => <li key={j} className="text-blue-600">→ {r}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    ))}

                    {analysis.documentsAllMustProvide.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[#0B1F3A] mb-2">Documents all members must provide</p>
                        <ul className="text-xs text-gray-600 space-y-1">
                          {analysis.documentsAllMustProvide.map((d, i) => <li key={i}>• {d}</li>)}
                        </ul>
                      </div>
                    )}

                    {analysis.submissionStrategy && (
                      <div className="bg-blue-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Submission strategy</p>
                        <p className="text-xs text-blue-800">{analysis.submissionStrategy}</p>
                      </div>
                    )}

                    {analysis.walzRecommendation && (
                      <div className="bg-amber-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-700 mb-1">Walz Travels recommendation</p>
                        <p className="text-xs text-amber-800">{analysis.walzRecommendation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* New Hive Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-[#0B1F3A]">Create Group Hive</h2>
              <button onClick={() => { setShowModal(false); setCreated(null) }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {created ? (
              <div className="p-6 text-center space-y-4">
                <div className="text-4xl">✅</div>
                <h3 className="font-bold text-[#0B1F3A]">Group Hive Created!</h3>
                <p className="text-sm text-gray-500">Share this ONE link with your group:</p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-mono font-semibold text-[#0B1F3A] break-all">{created.shareUrl}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { navigator.clipboard.writeText(created.shareUrl); setCopiedSlug(created.slug); setTimeout(() => setCopiedSlug(null), 2000) }}
                    className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-sm font-semibold text-[#0B1F3A] py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    {copiedSlug === created.slug ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    Copy
                  </button>
                  <a
                    href={`https://wa.me/?text=Hi! Please fill in your visa details here: ${created.shareUrl} (takes 2 minutes)`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-green-600 transition-colors"
                  >
                    📱 Share on WhatsApp
                  </a>
                </div>
                <p className="text-xs text-gray-400">Each person opens the link and submits their own details.</p>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Group Name *</label>
                  <input
                    required
                    value={form.groupName}
                    onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                    placeholder="e.g. Smith Family"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Visa Type *</label>
                  <select
                    value={form.visaType}
                    onChange={e => setForm(f => ({ ...f, visaType: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  >
                    {VISA_TYPES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Destination *</label>
                  <select
                    value={form.destination}
                    onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                  >
                    {DESTINATIONS.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Travel Date</label>
                    <input
                      type="date"
                      value={form.travelDate}
                      onChange={e => setForm(f => ({ ...f, travelDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Group Size *</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      required
                      value={form.memberCount}
                      onChange={e => setForm(f => ({ ...f, memberCount: parseInt(e.target.value) || 1 }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full bg-[#0B1F3A] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#0B1F3A]/90 transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create & Get Link'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
