'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface SessionInfo {
  sessionId:     string
  sessionName:   string
  memberName:    string
  memberId:      string
  hasSubmitted:  boolean
  totalMembers:  number
  submitted:     number
  sessionStatus: string
}

const POPULAR_DESTINATIONS = [
  'Dubai', 'London', 'Paris', 'Bali',
  'New York', 'Tokyo', 'Lagos', 'Accra',
  'Amsterdam', 'Barcelona', 'Istanbul', 'Cape Town',
]

const BUDGET_OPTIONS = [
  { value: 'under-500',   label: 'Under £500' },
  { value: '500-1000',    label: '£500–£1,000' },
  { value: '1000-2000',   label: '£1,000–£2,000' },
  { value: '2000-plus',   label: '£2,000+' },
]

const VIBE_OPTIONS = [
  { value: 'beach',     label: '🏖 Beach & Relaxation' },
  { value: 'city',      label: '🏙 City & Culture' },
  { value: 'adventure', label: '🌿 Adventure & Nature' },
  { value: 'food',      label: '🍽 Food & Nightlife' },
]

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router    = useRouter()

  const [info,       setInfo]       = useState<SessionInfo | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Form state
  const [memberName,     setMemberName]     = useState('')
  const [selectedDests,  setSelectedDests]  = useState<string[]>([])
  const [customDest,     setCustomDest]     = useState('')
  const [budget,         setBudget]         = useState('')
  const [vibe,           setVibe]           = useState('')
  const [durationDays,   setDurationDays]   = useState(7)

  useEffect(() => {
    fetch(`/api/public/group/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setInfo(d)
          setMemberName(d.memberName?.startsWith('Person ') ? '' : (d.memberName ?? ''))
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load session'); setLoading(false) })
  }, [token])

  function toggleDest(dest: string) {
    setSelectedDests(prev => {
      if (prev.includes(dest)) return prev.filter(d => d !== dest)
      if (prev.length < 3)    return [...prev, dest]
      return prev
    })
  }

  function addCustomDest() {
    const d = customDest.trim()
    if (d && !selectedDests.includes(d) && selectedDests.length < 3) {
      setSelectedDests(prev => [...prev, d])
      setCustomDest('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedDests.length < 1) { setError('Pick at least one destination.'); return }
    if (!budget)                   { setError('Select a budget range.'); return }
    if (!vibe)                     { setError('Select a trip vibe.'); return }
    setError(null)
    setSubmitting(true)

    const preferences = {
      name:         memberName.trim() || info?.memberName || '',
      destinations: selectedDests,
      budget,
      vibe,
      durationDays,
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
          You've already shared your preferences for{' '}
          <strong className="text-white">{info.sessionName}</strong>.
        </p>
        <div className="mt-5 flex justify-center gap-1">
          {Array.from({ length: info.totalMembers }).map((_, i) => (
            <div key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i < info.submitted ? 'bg-[#C9A84C]' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
        <p className="text-white/30 text-xs mt-2">
          {info.submitted} of {info.totalMembers} members submitted
        </p>
      </div>
    </div>
  )

  if (info?.sessionStatus === 'locked' && !info.hasSubmitted) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-4xl mb-4">🔒</p>
        <h1 className="text-white text-xl font-bold mb-2">Trip is being planned</h1>
        <p className="text-white/50 text-sm">
          The group has already submitted and the itinerary is being generated.
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
            Share your preferences privately — others can&apos;t see your answers.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: info?.totalMembers ?? 0 }).map((_, i) => (
                <div key={i}
                  className={`w-2 h-2 rounded-full ${i < (info?.submitted ?? 0) ? 'bg-[#C9A84C]' : 'bg-white/20'}`}
                />
              ))}
            </div>
            <p className="text-white/40 text-xs">{info?.submitted}/{info?.totalMembers} submitted</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Name */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">👤 Your name <span className="text-white/30 font-normal text-sm">(optional)</span></h2>
            <input
              type="text"
              value={memberName}
              onChange={e => setMemberName(e.target.value)}
              placeholder={info?.memberName ?? 'Your name'}
              maxLength={40}
              className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]"
            />
          </div>

          {/* Destination picks */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">🌍 Where do you want to go?</h2>
            <p className="text-white/30 text-xs mb-4">
              Pick up to 3 destinations (in order of preference)
            </p>

            {/* Selected order */}
            {selectedDests.length > 0 && (
              <div className="flex gap-2 mb-4 flex-wrap">
                {selectedDests.map((d, i) => (
                  <span key={d}
                    className="flex items-center gap-1.5 bg-[#C9A84C] text-[#0B1F3A] rounded-lg px-3 py-1.5 text-sm font-bold">
                    <span className="text-[#0B1F3A]/50 text-xs">#{i + 1}</span>
                    {d}
                    <button type="button" onClick={() => toggleDest(d)}
                      className="text-[#0B1F3A]/50 hover:text-[#0B1F3A] ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Pills */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {POPULAR_DESTINATIONS.map(dest => {
                const idx     = selectedDests.indexOf(dest)
                const picked  = idx !== -1
                const maxed   = selectedDests.length >= 3 && !picked
                return (
                  <button
                    key={dest}
                    type="button"
                    onClick={() => toggleDest(dest)}
                    disabled={maxed}
                    className={`relative py-2 px-1 rounded-xl text-xs font-semibold border transition-all text-center disabled:opacity-30 disabled:cursor-not-allowed ${
                      picked
                        ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
                        : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    {picked && (
                      <span className="absolute top-0.5 right-1 text-[9px] text-[#C9A84C]/70 font-bold">
                        #{idx + 1}
                      </span>
                    )}
                    {dest}
                  </button>
                )
              })}
            </div>

            {/* Custom destination */}
            {selectedDests.length < 3 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Another destination…"
                  value={customDest}
                  onChange={e => setCustomDest(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomDest())}
                  className="flex-1 bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]"
                />
                <button type="button" onClick={addCustomDest}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition">
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Budget */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">💰 Budget per person</h2>
            <div className="grid grid-cols-2 gap-3">
              {BUDGET_OPTIONS.map(b => (
                <button key={b.value} type="button" onClick={() => setBudget(b.value)}
                  className={`py-3 px-3 rounded-xl text-sm font-semibold border transition-all ${
                    budget === b.value
                      ? 'bg-[#C9A84C] border-[#C9A84C] text-[#0B1F3A]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                  }`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trip vibe */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">🎯 Trip vibe</h2>
            <div className="grid grid-cols-2 gap-3">
              {VIBE_OPTIONS.map(v => (
                <button key={v.value} type="button" onClick={() => setVibe(v.value)}
                  className={`py-3 px-3 rounded-xl text-sm font-semibold border transition-all text-left ${
                    vibe === v.value
                      ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Trip length */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">📅 How many days?</h2>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setDurationDays(n => Math.max(3, n - 1))}
                className="w-10 h-10 rounded-full border border-white/15 text-white/50 text-xl font-bold flex items-center justify-center hover:border-[#C9A84C] hover:text-[#C9A84C] transition">
                −
              </button>
              <div className="flex-1 text-center">
                <span className="text-white font-bold text-3xl">{durationDays}</span>
                <p className="text-white/30 text-[10px] mt-0.5">days</p>
              </div>
              <button type="button" onClick={() => setDurationDays(n => Math.min(21, n + 1))}
                className="w-10 h-10 rounded-full border border-white/15 text-white/50 text-xl font-bold flex items-center justify-center hover:border-[#C9A84C] hover:text-[#C9A84C] transition">
                +
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-4 rounded-2xl bg-[#C9A84C] text-[#0B1F3A] font-bold text-base hover:bg-[#E8C87A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting
              ? <><div className="w-4 h-4 rounded-full border-2 border-[#0B1F3A]/30 border-t-[#0B1F3A] animate-spin" /> Saving…</>
              : '✓ Submit my preferences'
            }
          </button>

          <p className="text-white/20 text-[11px] text-center">
            Your choices are private — Jade AI will find the destination your whole group will love.
          </p>
        </form>
      </div>
    </div>
  )
}
