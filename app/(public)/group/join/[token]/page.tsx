'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface SessionInfo {
  sessionId:    string
  sessionName:  string
  memberName:   string
  memberId:     string
  hasSubmitted: boolean
  totalMembers: number
  submitted:    number
}

const ACTIVITIES = [
  { id: 'beach',     label: '🏖️ Beach' },
  { id: 'culture',   label: '🏛️ Culture & history' },
  { id: 'nightlife', label: '🎵 Nightlife' },
  { id: 'adventure', label: '🧗 Adventure' },
  { id: 'food',      label: '🍽️ Food & dining' },
  { id: 'shopping',  label: '🛍️ Shopping' },
  { id: 'nature',    label: '🌿 Nature' },
  { id: 'relax',     label: '🧘 Relaxation' },
]

const NATIONALITIES = [
  'Nigerian', 'British', 'American', 'Canadian', 'Ghanaian', 'South African',
  'Kenyan', 'Indian', 'Pakistani', 'Bangladeshi', 'Jamaican', 'Other',
]

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router    = useRouter()

  const [info,       setInfo]       = useState<SessionInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Form state
  const [startDate,       setStartDate]       = useState('')
  const [durationDays,    setDurationDays]    = useState(7)
  const [budget,          setBudget]          = useState<'budget' | 'mid' | 'flexible'>('mid')
  const [activities,      setActivities]      = useState<string[]>([])
  const [dietary,         setDietary]         = useState('')
  const [accessibility,   setAccessibility]   = useState('')
  const [nationality,     setNationality]     = useState('')
  const [visitedCountry,  setVisitedCountry]  = useState('')
  const [visitedList,     setVisitedList]     = useState<string[]>([])

  useEffect(() => {
    fetch(`/api/public/group/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setInfo(d)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load session'); setLoading(false) })
  }, [token])

  function toggleActivity(id: string) {
    setActivities(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  function addCountry() {
    if (visitedCountry.trim() && !visitedList.includes(visitedCountry.trim())) {
      setVisitedList(prev => [...prev, visitedCountry.trim()])
      setVisitedCountry('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activities.length) { setError('Please select at least one activity preference.'); return }
    if (!nationality)        { setError('Please select your passport nationality.'); return }
    setError(null)
    setSubmitting(true)

    const preferences = {
      startDate, durationDays, budget, activities,
      dietary, accessibility, nationality,
      visitedCountries: visitedList,
    }

    const res  = await fetch(`/api/public/group/${token}/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(preferences),
    })
    const data = await res.json()

    if (!res.ok) { setError(data.error ?? 'Submission failed'); setSubmitting(false); return }

    router.push(`/group/join/${token}/waiting`)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-3 border-[#C9A84C]/30 border-t-[#C9A84C] animate-spin" />
    </div>
  )

  if (error && !info) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-4xl mb-4">🔗</p>
        <h1 className="text-white text-xl font-bold mb-2">Link not found</h1>
        <p className="text-white/50 text-sm">{error}</p>
      </div>
    </div>
  )

  if (info?.hasSubmitted) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">✅</p>
        <h1 className="text-white text-xl font-bold mb-2">Already submitted!</h1>
        <p className="text-white/50 text-sm">
          You have already submitted your preferences for <strong className="text-white">{info.sessionName}</strong>.
        </p>
        <p className="text-white/30 text-xs mt-3">
          {info.submitted} of {info.totalMembers} members have submitted.
        </p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0B1F3A]">
      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1.5 mb-4">
            <span className="text-[#C9A84C] text-xs font-bold">✈ GROUP PLANNER</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{info?.sessionName}</h1>
          <p className="text-white/50 text-sm mt-1">
            Hi <strong className="text-white">{info?.memberName}</strong> — share your preferences privately.
            Others can't see your answers.
          </p>
          <div className="mt-3 bg-white/5 rounded-xl px-4 py-2 flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: info?.totalMembers ?? 0 }).map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${i < (info?.submitted ?? 0) ? 'bg-[#C9A84C]' : 'bg-white/20'}`} />
              ))}
            </div>
            <p className="text-white/40 text-xs">{info?.submitted}/{info?.totalMembers} submitted</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Travel dates */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">📅 Travel dates</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/40 text-xs mb-1.5">Flexible start (from)</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              </div>
              <div>
                <label className="block text-white/40 text-xs mb-1.5">Trip length (days)</label>
                <input type="number" min={3} max={30} value={durationDays}
                  onChange={e => setDurationDays(Number(e.target.value))}
                  className="w-full bg-white/10 border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
              </div>
            </div>
          </div>

          {/* Budget */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">💰 Budget per person</h2>
            <div className="grid grid-cols-3 gap-3">
              {(['budget', 'mid', 'flexible'] as const).map(b => (
                <button key={b} type="button" onClick={() => setBudget(b)}
                  className={`py-3 rounded-xl text-sm font-semibold border transition-all ${
                    budget === b
                      ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0B1F3A]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                  }`}>
                  {b === 'budget' ? '💵 Budget' : b === 'mid' ? '💳 Mid-range' : '✨ Flexible'}
                </button>
              ))}
            </div>
          </div>

          {/* Activities */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">🎯 Activity preferences</h2>
            <p className="text-white/30 text-xs mb-4">Select all that interest you</p>
            <div className="grid grid-cols-2 gap-2">
              {ACTIVITIES.map(a => (
                <button key={a.id} type="button" onClick={() => toggleActivity(a.id)}
                  className={`py-2.5 px-3 rounded-xl text-sm text-left border transition-all ${
                    activities.includes(a.id)
                      ? 'bg-[#C9A84C]/20 border-[#C9A84C]/50 text-[#C9A84C]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dietary */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">🥗 Dietary requirements</h2>
            <input
              type="text"
              placeholder="e.g. Halal, vegetarian, nut allergy… (optional)"
              value={dietary}
              onChange={e => setDietary(e.target.value)}
              className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]"
            />
          </div>

          {/* Accessibility */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">♿ Accessibility needs</h2>
            <input
              type="text"
              placeholder="e.g. Wheelchair access, limited walking… (optional)"
              value={accessibility}
              onChange={e => setAccessibility(e.target.value)}
              className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]"
            />
          </div>

          {/* Passport */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">🛂 Passport nationality</h2>
            <select required value={nationality} onChange={e => setNationality(e.target.value)}
              className="w-full bg-white/10 border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C] appearance-none">
              <option value="" disabled>Select nationality</option>
              {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Visited countries */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">🌍 Countries visited (last 3 years)</h2>
            <p className="text-white/30 text-xs mb-3">Optional — helps Claude tailor destination recommendations</p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="e.g. France"
                value={visitedCountry}
                onChange={e => setVisitedCountry(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCountry())}
                className="flex-1 bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
              />
              <button type="button" onClick={addCountry}
                className="px-4 py-2 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition">Add</button>
            </div>
            {visitedList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {visitedList.map(c => (
                  <span key={c} className="flex items-center gap-1.5 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-lg px-3 py-1 text-[#C9A84C] text-xs">
                    {c}
                    <button type="button" onClick={() => setVisitedList(prev => prev.filter(x => x !== c))}
                      className="text-[#C9A84C]/50 hover:text-[#C9A84C]">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded-2xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting ? (
              <><div className="w-4 h-4 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" /> Saving…</>
            ) : '✓ Submit my preferences'}
          </button>
        </form>
      </div>
    </div>
  )
}
