'use client'

import { useState, useEffect } from 'react'
import { useParams }           from 'next/navigation'

interface GroupMemberResult {
  member_id:         string
  name:              string
  individual_score:  number
  risk_level:        'low' | 'medium' | 'high'
  red_flags:         string[]
  remediation_steps: string[]
  needs_cover_letter: boolean
}

interface ChecklistItem {
  item:         string
  applies_to:   string
  deadline_note: string
}

interface GroupVisaAnalysis {
  group_risk_rating:    'low' | 'medium' | 'high'
  group_risk_summary:   string
  members:              GroupMemberResult[]
  weakest_member_id:    string
  application_strategy: 'joint' | 'staggered'
  strategy_reason:      string
  group_checklist:      ChecklistItem[]
  disclaimer:           string
}

const RISK_CONFIG = {
  low:    { bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400',  badge: 'bg-green-500/20',  label: 'Low Risk' },
  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400',  badge: 'bg-amber-500/20',  label: 'Medium Risk' },
  high:   { bg: 'bg-red-500/10',   border: 'border-red-500/20',   text: 'text-red-400',    badge: 'bg-red-500/20',    label: 'High Risk' },
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-sm font-bold w-8 text-right ${
        score >= 70 ? 'text-green-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'
      }`}>{score}</span>
    </div>
  )
}

function CoverLetterModal({ sessionId, memberId, memberName, onClose }: {
  sessionId: string; memberId: string; memberName: string; onClose: () => void
}) {
  const [letter,    setLetter]    = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [copying,   setCopying]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/group/${sessionId}/visa/cover-letter/${memberId}`, { method: 'POST' })
      .then(r => r.json())
      .then(d => { setLetter(d.letter ?? null); if (d.error) setError(d.error); setLoading(false) })
      .catch(() => { setError('Failed to generate letter'); setLoading(false) })
  }, [sessionId, memberId])

  async function copyLetter() {
    if (!letter) return
    await navigator.clipboard.writeText(letter)
    setCopying(true)
    setTimeout(() => setCopying(false), 2000)
  }

  function downloadLetter() {
    if (!letter) return
    const blob = new Blob([letter], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `cover-letter-${memberName.toLowerCase().replace(/\s+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-4 top-12 bottom-12 max-w-2xl mx-auto z-50 bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-[#0B1F3A] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold">Cover Letter — {memberName}</h2>
            <p className="text-white/40 text-xs mt-0.5">AI-generated · review before sending</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {letter && (
            <pre className="whitespace-pre-wrap font-mono text-sm text-[#0B1F3A]/80 leading-relaxed">{letter}</pre>
          )}
        </div>

        {letter && (
          <div className="p-4 border-t border-[#0B1F3A]/8 flex gap-3 flex-shrink-0">
            <button onClick={copyLetter}
              className="flex-1 py-3 rounded-xl border border-[#0B1F3A]/15 text-[#0B1F3A] font-semibold text-sm hover:bg-[#F5F2EE] transition">
              {copying ? '✓ Copied!' : '📋 Copy letter'}
            </button>
            <button onClick={downloadLetter}
              className="flex-1 py-3 rounded-xl bg-[#0B1F3A] text-white font-semibold text-sm hover:bg-[#132038] transition">
              ⬇ Download .txt
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default function VisaResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>()

  const [analysis,     setAnalysis]     = useState<GroupVisaAnalysis | null>(null)
  const [sessionInfo,  setSessionInfo]  = useState<{ sessionName: string; visaDestination: string } | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [running,      setRunning]      = useState(false)
  const [coverMember,  setCoverMember]  = useState<{ id: string; name: string } | null>(null)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/group/${sessionId}/result`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setSessionInfo({ sessionName: d.sessionName, visaDestination: d.destination ?? '' })
        if (d.visaAnalysisJson) setAnalysis(d.visaAnalysisJson as GroupVisaAnalysis)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [sessionId])

  async function runAnalysis() {
    setRunning(true)
    setError(null)
    const res  = await fetch(`/api/group/${sessionId}/visa/analyse`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Analysis failed'); setRunning(false); return }
    setAnalysis(data.analysis as GroupVisaAnalysis)
    setRunning(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>
  )

  if (error && !analysis) return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-[#0B1F3A]/60">{error}</p>
      </div>
    </div>
  )

  const riskCfg = analysis ? RISK_CONFIG[analysis.group_risk_rating] : null

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      {/* Header */}
      <div className="bg-[#0B1F3A] px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1 mb-3">
            <span className="text-[#C9A84C] text-xs font-bold">🛂 GROUP VISA RISK</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{sessionInfo?.sessionName}</h1>
          {sessionInfo?.visaDestination && (
            <p className="text-white/40 text-sm mt-1">Destination: {sessionInfo.visaDestination}</p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* No analysis yet */}
        {!analysis && (
          <div className="text-center py-10">
            <p className="text-4xl mb-4">🔍</p>
            <h2 className="text-[#0B1F3A] font-bold text-lg mb-2">Run group visa analysis</h2>
            <p className="text-[#0B1F3A]/50 text-sm mb-6">
              All members must have submitted their visa profiles first.
            </p>
            <button onClick={runAnalysis} disabled={running}
              className="px-6 py-3 rounded-xl bg-[#0B1F3A] text-white font-semibold hover:bg-[#132038] transition disabled:opacity-50 flex items-center gap-2 mx-auto">
              {running ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Analysing…</> : 'Run group visa analysis'}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {analysis && riskCfg && (
          <>
            {/* Group risk rating banner */}
            <div className={`rounded-2xl p-5 border ${riskCfg.bg} ${riskCfg.border}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[#0B1F3A]/60 text-xs font-bold uppercase tracking-wider">Group risk rating</p>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${riskCfg.badge} ${riskCfg.text}`}>
                  {riskCfg.label}
                </span>
              </div>
              <p className="text-[#0B1F3A] text-sm">{analysis.group_risk_summary}</p>
            </div>

            {/* Application strategy */}
            <div className="bg-white rounded-2xl p-5 border border-[#0B1F3A]/5">
              <p className="text-[#0B1F3A]/40 text-xs font-bold uppercase tracking-wider mb-2">Recommended strategy</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{analysis.application_strategy === 'joint' ? '🤝' : '📅'}</span>
                <span className="text-[#0B1F3A] font-bold capitalize">{analysis.application_strategy} application</span>
              </div>
              <p className="text-[#0B1F3A]/60 text-sm">{analysis.strategy_reason}</p>
            </div>

            {/* Member rows */}
            <div className="space-y-4">
              <p className="text-[#0B1F3A]/40 text-xs font-bold uppercase tracking-wider">Individual assessments</p>
              {analysis.members.map(m => {
                const cfg         = RISK_CONFIG[m.risk_level]
                const isWeakest   = m.member_id === analysis.weakest_member_id
                return (
                  <div key={m.member_id} className={`bg-white rounded-2xl border overflow-hidden ${
                    isWeakest ? 'border-red-300 shadow-md shadow-red-100' : 'border-[#0B1F3A]/5'
                  }`}>
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0B1F3A]">{m.name}</span>
                          {isWeakest && (
                            <span className="text-xs bg-red-50 text-red-500 border border-red-200 rounded-lg px-2 py-0.5 font-semibold">
                              Needs attention
                            </span>
                          )}
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${cfg.badge} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </div>

                      <ScoreBar score={m.individual_score} />

                      {m.red_flags.length > 0 && (
                        <div className="mt-3">
                          <p className="text-red-500 text-xs font-semibold mb-1">Red flags</p>
                          {m.red_flags.map((f, i) => (
                            <p key={i} className="text-[#0B1F3A]/60 text-xs flex items-start gap-1.5">
                              <span className="text-red-400 flex-shrink-0">•</span>{f}
                            </p>
                          ))}
                        </div>
                      )}

                      {m.remediation_steps.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[#0B1F3A]/40 text-xs font-semibold mb-1">Steps to take</p>
                          {m.remediation_steps.map((s, i) => (
                            <p key={i} className="text-[#0B1F3A]/60 text-xs flex items-start gap-1.5">
                              <span className="text-[#C9A84C] flex-shrink-0">→</span>{s}
                            </p>
                          ))}
                        </div>
                      )}

                      {m.needs_cover_letter && (
                        <button
                          onClick={() => setCoverMember({ id: m.member_id, name: m.name })}
                          className="mt-3 w-full py-2 rounded-xl bg-[#C9A84C]/10 border border-[#C9A84C]/30 text-[#C9A84C] text-xs font-semibold hover:bg-[#C9A84C]/20 transition">
                          📝 Generate cover letter for {m.name}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Group checklist */}
            {analysis.group_checklist.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-[#0B1F3A]/5">
                <p className="text-[#0B1F3A]/40 text-xs font-bold uppercase tracking-wider mb-3">Group checklist</p>
                <div className="space-y-3">
                  {analysis.group_checklist.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded border border-[#0B1F3A]/15 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[#0B1F3A]/80 text-sm">{item.item}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.applies_to !== 'all' && (
                            <span className="text-[10px] bg-[#C9A84C]/10 text-[#C9A84C] rounded-md px-1.5 py-0.5">
                              {analysis.members.find(m => m.member_id === item.applies_to)?.name ?? item.applies_to}
                            </span>
                          )}
                          {item.applies_to === 'all' && (
                            <span className="text-[10px] bg-[#0B1F3A]/5 text-[#0B1F3A]/50 rounded-md px-1.5 py-0.5">All members</span>
                          )}
                          <span className="text-[10px] text-[#0B1F3A]/30">{item.deadline_note}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-800 text-xs font-semibold mb-1">⚠ Disclaimer</p>
              <p className="text-amber-700 text-xs leading-relaxed">{analysis.disclaimer}</p>
              {sessionInfo?.visaDestination && (
                <p className="text-amber-600 text-xs mt-2">
                  Verify requirements at the official embassy for{' '}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent(sessionInfo.visaDestination + ' embassy visa requirements official')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="underline font-medium">
                    {sessionInfo.visaDestination}
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Cover letter modal */}
      {coverMember && (
        <CoverLetterModal
          sessionId={sessionId}
          memberId={coverMember.id}
          memberName={coverMember.name}
          onClose={() => setCoverMember(null)}
        />
      )}
    </div>
  )
}
