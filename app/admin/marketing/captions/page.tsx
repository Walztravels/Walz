'use client'

import { useState } from 'react'
import { Sparkles, Copy, CalendarPlus, Loader2, CheckCircle, ChevronDown } from 'lucide-react'

type Caption = {
  variation:    number
  hook:         string
  caption:      string
  hashtags:     string
  bestTime:     string
  storyVersion: string
}

const CONTENT_TYPES = [
  { value: 'visa_tip',      label: '📋 Visa Tip'          },
  { value: 'flight_deal',   label: '✈️ Flight Deal'        },
  { value: 'client_win',    label: '🎉 Client Win'         },
  { value: 'tour_promo',    label: '🌍 Tour Promo'         },
  { value: 'jade_ai',       label: '🤖 Jade AI Feature'   },
  { value: 'general',       label: '📣 General Post'       },
]

const TARGET_MARKETS = [
  { value: 'all',      label: 'All Audiences'        },
  { value: 'uk_ng',    label: 'Nigerians in UK'      },
  { value: 'ca_gh',    label: 'Ghanaians in Canada'  },
  { value: 'uae',      label: 'Diaspora in UAE'      },
  { value: 'japa',     label: 'Japa Travellers'      },
]

const PLATFORMS = [
  { value: 'instagram', label: '📸 Instagram' },
  { value: 'facebook',  label: '📘 Facebook'  },
  { value: 'both',      label: '📱 Both'      },
]

const TONES = [
  { value: 'standard',    label: 'Standard'     },
  { value: 'urgent',      label: '🔥 Urgent'    },
  { value: 'celebratory', label: '🎉 Celebrate'  },
  { value: 'educational', label: '📚 Educational'},
  { value: 'conversational', label: '💬 Conversational' },
]

export default function CaptionsPage() {
  const [contentType,  setContentType]  = useState('visa_tip')
  const [targetMarket, setTargetMarket] = useState('all')
  const [platform,     setPlatform]     = useState('instagram')
  const [tone,         setTone]         = useState('standard')
  const [details,      setDetails]      = useState('')
  const [loading,      setLoading]      = useState(false)
  const [captions,     setCaptions]     = useState<Caption[]>([])
  const [error,        setError]        = useState('')
  const [copied,       setCopied]       = useState<number | null>(null)

  const [scheduleFor, setScheduleFor]   = useState<{ [k: number]: string }>({})
  const [scheduling,  setScheduling]    = useState<number | null>(null)
  const [scheduled,   setScheduled]     = useState<Set<number>>(new Set())

  async function generate() {
    setLoading(true)
    setError('')
    setCaptions([])
    try {
      const res = await fetch('/api/admin/marketing/generate-caption', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contentType, targetMarket, platform, tone, details }),
      })
      const data = await res.json() as { captions?: Caption[]; error?: string }
      if (data.error) throw new Error(data.error)
      setCaptions(data.captions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function copyCaption(c: Caption, idx: number) {
    const text = `${c.hook}\n\n${c.caption}\n\n${c.hashtags}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  async function scheduleCaption(c: Caption, idx: number) {
    const dt = scheduleFor[idx]
    if (!dt) return
    setScheduling(idx)
    try {
      await fetch('/api/admin/marketing/posts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          platform,
          postType:    'feed',
          caption:     `${c.hook}\n\n${c.caption}`,
          hashtags:    c.hashtags,
          scheduledAt: new Date(dt).toISOString(),
        }),
      })
      setScheduled(prev => new Set([...prev, idx]))
    } finally {
      setScheduling(null)
    }
  }

  const statusBadge = (v: string, selected: string, onClick: () => void, label: string) => (
    <button
      key={v}
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
        selected === v
          ? 'bg-amber-500 text-white border-amber-500'
          : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400 hover:text-amber-600'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Caption Generator</h1>
          <p className="text-sm text-gray-500">Jade writes 3 variations in your brand voice</p>
        </div>
      </div>

      {/* Input form */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">

        {/* Content type */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Content Type</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(({ value, label }) =>
              statusBadge(value, contentType, () => setContentType(value), label)
            )}
          </div>
        </div>

        {/* Target market */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Target Market</label>
          <div className="flex flex-wrap gap-2">
            {TARGET_MARKETS.map(({ value, label }) =>
              statusBadge(value, targetMarket, () => setTargetMarket(value), label)
            )}
          </div>
        </div>

        {/* Platform + Tone row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Platform</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(({ value, label }) =>
                statusBadge(value, platform, () => setPlatform(value), label)
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tone</label>
            <div className="relative">
              <select
                value={tone}
                onChange={e => setTone(e.target.value)}
                className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 pr-8"
              >
                {TONES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Details */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Details / Brief <span className="text-gray-400 normal-case font-normal">(route, price, name, story…)</span>
          </label>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            rows={4}
            placeholder="e.g. Client Amara from Birmingham got her UK visit visa approved this morning. She's visiting family. Wanted to share the win."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={loading || !details.trim()}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-100 disabled:text-gray-400 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Jade is writing…</>
            : <><Sparkles className="w-4 h-4" /> Generate 3 Captions</>
          }
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>

      {/* Caption results */}
      {captions.length > 0 && (
        <div className="space-y-4">
          {captions.map((c, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                  Variation {c.variation}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyCaption(c, idx)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition"
                  >
                    {copied === idx
                      ? <><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Copied!</>
                      : <><Copy className="w-3.5 h-3.5" /> Copy</>
                    }
                  </button>
                </div>
              </div>

              {/* Caption content */}
              <div className="p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hook</p>
                  <p className="text-sm font-semibold text-gray-900">{c.hook}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{c.caption}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hashtags</p>
                  <p className="text-xs text-amber-600 leading-relaxed">{c.hashtags}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Best Time</p>
                    <p className="text-xs text-gray-600">{c.bestTime}</p>
                  </div>
                </div>
                {c.storyVersion && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Story Version</p>
                    <p className="text-xs text-gray-600">{c.storyVersion}</p>
                  </div>
                )}

                {/* Schedule row */}
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <input
                    type="datetime-local"
                    value={scheduleFor[idx] ?? ''}
                    onChange={e => setScheduleFor(prev => ({ ...prev, [idx]: e.target.value }))}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                  />
                  <button
                    onClick={() => void scheduleCaption(c, idx)}
                    disabled={!scheduleFor[idx] || scheduling === idx || scheduled.has(idx)}
                    className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 bg-[#0B1F3A] text-white rounded-lg hover:bg-[#152d55] disabled:bg-gray-100 disabled:text-gray-400 transition"
                  >
                    {scheduling === idx
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : scheduled.has(idx)
                      ? <><CheckCircle className="w-3.5 h-3.5 text-green-400" /> Scheduled</>
                      : <><CalendarPlus className="w-3.5 h-3.5" /> Schedule</>
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
