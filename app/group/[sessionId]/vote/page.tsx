'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface ShortlistItem {
  destination:          string
  country:              string
  fit_score:            number
  why_it_works:         string
  conflicts:            string[]
  estimated_budget_pp:  string
  best_for:             string
}

interface VoteResult {
  destination:  string
  voteCounts:   Record<string, number> | null
  itineraryJson: unknown | null
}

function VoteContent() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const sp            = useSearchParams()
  const memberId      = sp.get('member') ?? ''
  const router        = useRouter()

  const [session,    setSession]    = useState<{ sessionName: string; shortlistJson: { shortlist: ShortlistItem[]; group_notes: string } | null; status: string } | null>(null)
  const [result,     setResult]     = useState<VoteResult | null>(null)
  const [voted,      setVoted]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/group/${sessionId}/result`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setSession({
          sessionName:   d.sessionName,
          shortlistJson: d.shortlistJson as { shortlist: ShortlistItem[]; group_notes: string } | null,
          status:        d.status,
        })
        if (d.status === 'locked') {
          setResult({ destination: d.destination, voteCounts: d.voteCounts, itineraryJson: d.itineraryJson })
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load session'); setLoading(false) })
  }, [sessionId])

  async function handleVote(destination: string) {
    if (!memberId) { setError('Your member link is missing from the URL. Use the link sent to you.'); return }
    setSubmitting(true)
    const res  = await fetch(`/api/group/${sessionId}/vote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ memberId, destination }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Vote failed'); setSubmitting(false); return }
    setVoted(destination)
    if (data.allVoted) {
      setResult({ destination: data.winner, voteCounts: null, itineraryJson: null })
    }
    setSubmitting(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>
  )

  if (error || !session) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-white/70 text-sm">{error ?? 'Session not found'}</p>
      </div>
    </div>
  )

  const shortlist = session.shortlistJson?.shortlist ?? []

  // Results reveal
  if (result && result.voteCounts) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] px-4 py-12">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-6xl mb-4">🏆</p>
          <h1 className="text-white text-3xl font-bold mb-2">{result.destination}!</h1>
          <p className="text-[#C9A84C] font-semibold mb-8">Your group has spoken.</p>
          <div className="bg-white/5 rounded-2xl p-5 text-left mb-6">
            <p className="text-white/40 text-xs font-bold uppercase tracking-wider mb-3">Final vote tally</p>
            {Object.entries(result.voteCounts).sort((a, b) => b[1] - a[1]).map(([dest, count]) => (
              <div key={dest} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <span className="text-white text-sm">{dest}</span>
                <span className={`text-sm font-bold ${dest === result.destination ? 'text-[#C9A84C]' : 'text-white/40'}`}>
                  {count} vote{count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
          <button onClick={() => router.push(`/group/${sessionId}/itinerary`)}
            className="w-full py-4 rounded-2xl bg-[#C9A84C] text-[#0B1F3A] font-bold hover:bg-[#E8C87A] transition-colors">
            View full itinerary →
          </button>
        </div>
      </div>
    )
  }

  // Waiting for all votes (current member has voted)
  if (voted) {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-6xl mb-4">⏳</p>
          <h1 className="text-white text-xl font-bold mb-2">Vote submitted!</h1>
          <p className="text-white/50 text-sm">
            You voted for <span className="text-[#C9A84C] font-semibold">{voted}</span>.
            Waiting for other members to vote…
          </p>
          <p className="text-white/20 text-xs mt-4">Results shown when everyone has voted.</p>
        </div>
      </div>
    )
  }

  if (session.status === 'collecting') {
    return (
      <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">⏳</p>
          <h1 className="text-white text-xl font-bold mb-2">Collecting preferences…</h1>
          <p className="text-white/50 text-sm">Voting opens once all members have submitted and the AI has synthesised options.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0B1F3A] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1.5 mb-4">
            <span className="text-[#C9A84C] text-xs font-bold">✈ {session.sessionName}</span>
          </div>
          <h1 className="text-white text-2xl font-bold">Vote for your destination</h1>
          <p className="text-white/40 text-sm mt-1">Jade AI synthesised 3 options based on everyone's preferences.</p>
        </div>

        {/* Group notes */}
        {session.shortlistJson?.group_notes && (
          <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-2xl p-4 mb-6">
            <p className="text-[#C9A84C] text-xs font-bold mb-1">🤖 Jade's group notes</p>
            <p className="text-white/70 text-sm">{session.shortlistJson.group_notes}</p>
          </div>
        )}

        {/* Destination cards */}
        <div className="space-y-4">
          {shortlist.map((item) => (
            <div key={item.destination} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-white font-bold text-lg">{item.destination}</h2>
                    <p className="text-white/40 text-sm">{item.country}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[#C9A84C] font-bold text-2xl">{item.fit_score}</div>
                    <div className="text-white/30 text-xs">fit score</div>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-3 mb-3">
                  <p className="text-white/60 text-sm">{item.why_it_works}</p>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-xs bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20 rounded-lg px-2 py-1">
                    {item.estimated_budget_pp}
                  </span>
                  <span className="text-xs bg-white/5 text-white/50 border border-white/10 rounded-lg px-2 py-1">
                    {item.best_for}
                  </span>
                </div>

                {item.conflicts.length > 0 && (
                  <div className="mb-3">
                    {item.conflicts.map((c, i) => (
                      <p key={i} className="text-amber-400/70 text-xs flex items-start gap-1">
                        <span>⚠</span>{c}
                      </p>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => handleVote(item.destination)}
                  disabled={submitting || !!voted}
                  className="w-full py-3 rounded-xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm hover:bg-[#E8C87A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Vote for {item.destination}
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" /></div>}>
      <VoteContent />
    </Suspense>
  )
}
