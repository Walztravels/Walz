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

// ── Data ──────────────────────────────────────────────────────────────────────

const DESTINATIONS = [
  { name: 'London',      flag: '🇬🇧', region: 'Europe'      },
  { name: 'Paris',       flag: '🇫🇷', region: 'Europe'      },
  { name: 'Barcelona',   flag: '🇪🇸', region: 'Europe'      },
  { name: 'Rome',        flag: '🇮🇹', region: 'Europe'      },
  { name: 'Amsterdam',   flag: '🇳🇱', region: 'Europe'      },
  { name: 'Dubai',       flag: '🇦🇪', region: 'Middle East' },
  { name: 'Accra',       flag: '🇬🇭', region: 'Africa'      },
  { name: 'Nairobi',     flag: '🇰🇪', region: 'Africa'      },
  { name: 'Cape Town',   flag: '🇿🇦', region: 'Africa'      },
  { name: 'Marrakech',   flag: '🇲🇦', region: 'Africa'      },
  { name: 'New York',    flag: '🗽',   region: 'Americas'    },
  { name: 'Toronto',     flag: '🇨🇦', region: 'Americas'    },
  { name: 'Miami',       flag: '🇺🇸', region: 'Americas'    },
  { name: 'Tokyo',       flag: '🇯🇵', region: 'Asia'        },
  { name: 'Singapore',   flag: '🇸🇬', region: 'Asia'        },
  { name: 'Bali',        flag: '🇮🇩', region: 'Asia'        },
]

const REGIONS = ['Europe', 'Middle East', 'Africa', 'Americas', 'Asia']

const PASSPORT_OPTIONS = [
  'Nigerian', 'Ghanaian', 'Kenyan', 'South African', 'Zimbabwean',
  'Ethiopian', 'British', 'Canadian', 'American', 'Indian', 'Other',
]

const BUDGET_OPTIONS = [
  { value: 'under-500',  label: 'Under £500'       },
  { value: '500-1000',   label: '£500 – £1,000'    },
  { value: '1000-2000',  label: '£1,000 – £2,000'  },
  { value: '2000-plus',  label: '£2,000+'           },
]

const VIBE_OPTIONS = [
  { value: 'beach',     label: '🏖 Beach & Relax'   },
  { value: 'city',      label: '🏙 City & Culture'   },
  { value: 'adventure', label: '🌿 Adventure'         },
  { value: 'food',      label: '🍽 Food & Nightlife'  },
  { value: 'shopping',  label: '🛍 Shopping'           },
  { value: 'arts',      label: '🎭 Arts & History'    },
]

const DURATION_OPTIONS = [
  { value: 'weekend', label: 'Weekend (2–3 days)'     },
  { value: 'short',   label: 'Short break (4–5 days)' },
  { value: 'week',    label: 'Full week (7 days)'      },
  { value: '2weeks',  label: '2 weeks+'                },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const { token } = useParams<{ token: string }>()
  const router    = useRouter()

  const [info,           setInfo]           = useState<SessionInfo | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const [memberName,     setMemberName]     = useState('')
  const [flyingFrom,     setFlyingFrom]     = useState('')
  const [passport,       setPassport]       = useState('')
  const [selectedDests,  setSelectedDests]  = useState<string[]>([])
  const [customDest,     setCustomDest]     = useState('')
  const [vibe,           setVibe]           = useState('')
  const [budget,         setBudget]         = useState('')
  const [duration,       setDuration]       = useState('')

  useEffect(() => {
    fetch(`/api/public/group/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else {
          setInfo(d)
          const defaultName = d.memberName ?? ''
          setMemberName(defaultName.startsWith('Person ') ? '' : defaultName)
        }
        setLoading(false)
      })
      .catch(() => { setError('Failed to load session'); setLoading(false) })
  }, [token])

  function toggleDest(dest: string) {
    setSelectedDests(prev => {
      if (prev.includes(dest)) return prev.filter(d => d !== dest)
      if (prev.length >= 3)    return prev
      return [...prev, dest]
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
    if (!duration)                 { setError('Select a trip duration.'); return }
    setError(null)
    setSubmitting(true)

    const preferences = {
      name:                (memberName.trim() || info?.memberName || ''),
      flyingFrom:          flyingFrom.trim(),
      passportNationality: passport,
      destinations:        selectedDests,
      vibe,
      budget,
      duration,
    }

    try {
      const res  = await fetch(`/api/public/group/${token}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(preferences),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); setSubmitting(false); return }
      router.push(`/group/join/${token}/waiting`)
    } catch {
      setError('Network error — please try again')
      setSubmitting(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────

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
        <h1 className="text-white text-xl font-bold mb-2">You&apos;re in!</h1>
        <p className="text-white/50 text-sm mb-4">
          Your preferences for <strong className="text-white">{info.sessionName}</strong> are saved. Jade will reveal the destination once everyone submits.
        </p>
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: info.totalMembers }).map((_, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < info.submitted ? 'bg-[#C9A84C]' : 'bg-white/20'}`} />
          ))}
        </div>
        <p className="text-white/30 text-xs mt-2">{info.submitted} of {info.totalMembers} submitted</p>
      </div>
    </div>
  )

  if (info?.sessionStatus === 'locked' && !info.hasSubmitted) return (
    <div className="min-h-screen bg-[#0B1F3A] flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <p className="text-4xl mb-4">🔒</p>
        <h1 className="text-white text-xl font-bold mb-2">Trip is being planned</h1>
        <p className="text-white/50 text-sm">Your group&apos;s itinerary is being crafted by Jade AI.</p>
      </div>
    </div>
  )

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0B1F3A]">
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-3 py-1.5 mb-4">
            <span className="text-[#C9A84C] text-xs font-bold tracking-widest">✈ GROUP PLANNER</span>
          </div>
          <h1 className="text-white text-2xl font-bold">{info?.sessionName}</h1>
          <p className="text-white/40 text-sm mt-1">Your answers are private — Jade picks the best destination for everyone.</p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: info?.totalMembers ?? 0 }).map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full ${i < (info?.submitted ?? 0) ? 'bg-[#C9A84C]' : 'bg-white/20'}`} />
              ))}
            </div>
            <p className="text-white/30 text-xs">{info?.submitted}/{info?.totalMembers} submitted</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* 1 · Name */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">
              👤 Your name <span className="text-white/30 font-normal text-sm">(optional)</span>
            </h2>
            <input type="text" value={memberName} onChange={e => setMemberName(e.target.value)}
              placeholder={info?.memberName ?? 'Your name'} maxLength={40}
              className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>

          {/* 2 · Flying from */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-3">✈ Where are you flying from?</h2>
            <input type="text" value={flyingFrom} onChange={e => setFlyingFrom(e.target.value)}
              placeholder="e.g. Lagos, Nigeria · London, UK · New York, USA" maxLength={60}
              className="w-full bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#C9A84C]" />
          </div>

          {/* 3 · Passport */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">🛂 Passport nationality</h2>
            <div className="grid grid-cols-2 gap-2">
              {PASSPORT_OPTIONS.map(p => (
                <button key={p} type="button" onClick={() => setPassport(p === passport ? '' : p)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-left ${
                    passport === p
                      ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 4 · Destinations */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-1">🌍 Where do you want to go?</h2>
            <p className="text-white/30 text-xs mb-4">Pick up to 3 in order of preference</p>

            {selectedDests.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedDests.map((d, i) => (
                  <span key={d} className="flex items-center gap-1.5 bg-[#C9A84C] text-[#0B1F3A] rounded-lg px-3 py-1.5 text-sm font-bold">
                    <span className="text-[#0B1F3A]/50 text-xs">#{i + 1}</span>
                    {DESTINATIONS.find(x => x.name === d)?.flag ?? ''} {d}
                    <button type="button" onClick={() => toggleDest(d)} className="text-[#0B1F3A]/50 hover:text-[#0B1F3A] ml-0.5 text-base leading-none">×</button>
                  </span>
                ))}
              </div>
            )}

            {REGIONS.map(region => {
              const dests = DESTINATIONS.filter(d => d.region === region)
              return (
                <div key={region} className="mb-4 last:mb-0">
                  <p className="text-white/25 text-[10px] font-bold uppercase tracking-wider mb-2">{region}</p>
                  <div className="flex flex-wrap gap-2">
                    {dests.map(dest => {
                      const idx    = selectedDests.indexOf(dest.name)
                      const picked = idx !== -1
                      const maxed  = selectedDests.length >= 3 && !picked
                      return (
                        <button key={dest.name} type="button" onClick={() => toggleDest(dest.name)} disabled={maxed}
                          className={`relative flex items-center gap-1.5 py-2 px-3 rounded-xl text-sm font-semibold border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                            picked
                              ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
                              : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                          }`}>
                          {picked && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C9A84C] text-[#0B1F3A] rounded-full text-[9px] font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                          )}
                          <span>{dest.flag}</span>
                          <span>{dest.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {selectedDests.length < 3 && (
              <div className="flex gap-2 mt-3">
                <input type="text" placeholder="Another city…" value={customDest}
                  onChange={e => setCustomDest(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomDest())}
                  className="flex-1 bg-white/10 border border-white/10 text-white placeholder-white/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C9A84C]" />
                <button type="button" onClick={addCustomDest}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/20 transition">
                  Add
                </button>
              </div>
            )}
          </div>

          {/* 5 · Vibe */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">🎯 Trip vibe</h2>
            <div className="grid grid-cols-2 gap-3">
              {VIBE_OPTIONS.map(v => (
                <button key={v.value} type="button" onClick={() => setVibe(v.value === vibe ? '' : v.value)}
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

          {/* 6 · Budget */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">💰 Budget per person</h2>
            <div className="grid grid-cols-2 gap-3">
              {BUDGET_OPTIONS.map(b => (
                <button key={b.value} type="button" onClick={() => setBudget(b.value === budget ? '' : b.value)}
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

          {/* 7 · Duration */}
          <div className="bg-white/5 rounded-2xl p-5">
            <h2 className="text-white font-semibold mb-4">📅 Trip duration</h2>
            <div className="grid grid-cols-2 gap-3">
              {DURATION_OPTIONS.map(d => (
                <button key={d.value} type="button" onClick={() => setDuration(d.value === duration ? '' : d.value)}
                  className={`py-3 px-3 rounded-xl text-sm font-semibold border transition-all ${
                    duration === d.value
                      ? 'bg-[#C9A84C]/20 border-[#C9A84C] text-[#C9A84C]'
                      : 'bg-white/5 border-white/10 text-white/60 hover:border-white/30'
                  }`}>
                  {d.label}
                </button>
              ))}
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
              : '✓ Submit my preferences'}
          </button>

          <p className="text-white/20 text-[11px] text-center pb-8">
            Your choices are private — Jade AI finds the destination your whole group will love.
          </p>
        </form>
      </div>
    </div>
  )
}
