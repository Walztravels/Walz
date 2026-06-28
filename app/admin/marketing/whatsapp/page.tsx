'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Loader2, Sparkles, Send, Clock, CheckCircle, X, ChevronDown } from 'lucide-react'

type Broadcast = {
  id:             string
  name:           string
  message:        string
  mediaUrl:       string | null
  targetFilter:   Record<string, string>
  recipientCount: number
  sentCount:      number
  status:         string
  scheduledAt:    string | null
  sentAt:         string | null
  createdAt:      string
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sending:  'bg-blue-50 text-blue-700',
  sent:     'bg-emerald-50 text-emerald-700',
  failed:   'bg-red-50 text-red-700',
  scheduled:'bg-amber-50 text-amber-700',
}

const COUNTRIES = [
  { value: '', label: 'All Countries' },
  { value: 'NG', label: 'Nigeria' },
  { value: 'GH', label: 'Ghana' },
  { value: 'KE', label: 'Kenya' },
  { value: 'ZA', label: 'South Africa' },
]

const SERVICES = [
  { value: '', label: 'All Services' },
  { value: 'visa',     label: 'Visa'      },
  { value: 'flights',  label: 'Flights'   },
  { value: 'tours',    label: 'Tours'     },
  { value: 'hotels',   label: 'Hotels'    },
]

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WhatsAppPage() {
  const [broadcasts,   setBroadcasts]   = useState<Broadcast[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showNew,      setShowNew]      = useState(false)

  // New broadcast form
  const [name,          setName]         = useState('')
  const [message,       setMessage]      = useState('')
  const [mediaUrl,      setMediaUrl]     = useState('')
  const [filterCountry, setFilterCountry]= useState('')
  const [filterService, setFilterService]= useState('')
  const [scheduledAt,   setScheduledAt]  = useState('')
  const [saving,        setSaving]       = useState(false)
  const [saveMsg,       setSaveMsg]      = useState('')

  // Jade ideas
  const [jadeQ,        setJadeQ]        = useState('')
  const [jadeLoading,  setJadeLoading]  = useState(false)
  const [jadeIdeas,    setJadeIdeas]    = useState('')
  const [showJade,     setShowJade]     = useState(false)

  useEffect(() => {
    fetch('/api/admin/marketing/whatsapp-broadcast')
      .then(r => r.json())
      .then((d: { broadcasts: Broadcast[] }) => { setBroadcasts(d.broadcasts ?? []); setLoading(false) })
  }, [])

  async function askJade() {
    if (!jadeQ.trim()) return
    setJadeLoading(true)
    setJadeIdeas('')
    try {
      const res  = await fetch('/api/admin/marketing/jade-ideas', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: jadeQ }),
      })
      const data = await res.json() as { ideas: string }
      setJadeIdeas(data.ideas ?? '')
    } finally {
      setJadeLoading(false)
    }
  }

  function useIdea(idea: string) {
    setMessage(prev => prev ? prev + '\n\n' + idea : idea)
    setShowJade(false)
    setJadeIdeas('')
    setJadeQ('')
  }

  async function saveBroadcast(status: 'draft' | 'sending') {
    if (!name.trim() || !message.trim()) {
      setSaveMsg('Name and message are required')
      return
    }
    setSaving(true)
    setSaveMsg('')
    try {
      const res  = await fetch('/api/admin/marketing/whatsapp-broadcast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name,
          message,
          mediaUrl:      mediaUrl || undefined,
          targetFilter:  {
            ...(filterCountry && { country: filterCountry }),
            ...(filterService && { service: filterService }),
          },
          scheduledAt:   scheduledAt || undefined,
          status,
        }),
      })
      const data = await res.json() as { broadcast: Broadcast; error?: string }
      if (data.error) throw new Error(data.error)

      if (status === 'sending' && !process.env.NEXT_PUBLIC_WA_TOKEN) {
        setSaveMsg('Saved as draft — WhatsApp API token not yet configured')
        data.broadcast.status = 'draft'
      } else {
        setSaveMsg(status === 'draft' ? 'Saved as draft' : 'Sending…')
      }

      setBroadcasts(prev => [data.broadcast, ...prev])
      setName('')
      setMessage('')
      setMediaUrl('')
      setFilterCountry('')
      setFilterService('')
      setScheduledAt('')
      setShowNew(false)
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Error saving broadcast')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  return (
    <div className="space-y-5 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">WhatsApp Broadcasts</h1>
            <p className="text-sm text-gray-500">Send targeted messages to your client base</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-sm transition"
        >
          <Plus className="w-4 h-4" /> New Broadcast
        </button>
      </div>

      {/* Token warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-amber-700">WhatsApp API Pending</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Add <code className="bg-amber-100 px-1 rounded">WHATSAPP_TOKEN</code> to Vercel env vars to enable sending.
          Broadcasts are saved as drafts until then.
        </p>
      </div>

      {/* New broadcast form */}
      {showNew && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">New Broadcast</h2>
            <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Broadcast Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. UK Visa Reminder — July 2026"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
              />
            </div>

            {/* Target audience */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Target Audience</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <select
                    value={filterCountry}
                    onChange={e => setFilterCountry(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                  >
                    {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={filterService}
                    onChange={e => setFilterService(e.target.value)}
                    className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400/50 pr-8"
                  >
                    {SERVICES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Matching clients will be determined at send time based on bookings and enquiries.
              </p>
            </div>

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Message</label>
                <button
                  onClick={() => setShowJade(!showJade)}
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
                >
                  <Sparkles className="w-3 h-3" /> Ask Jade for ideas
                </button>
              </div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                placeholder={"Hi {name} 👋\n\nGreat news! ..."}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50 resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">Use {'{name}'} to personalise the greeting.</p>
            </div>

            {/* Jade panel */}
            {showJade && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-amber-700">Ask Jade for WhatsApp ideas</p>
                <div className="flex gap-2">
                  <input
                    value={jadeQ}
                    onChange={e => setJadeQ(e.target.value)}
                    placeholder="e.g. Write a WhatsApp blast about summer visa deals…"
                    className="flex-1 border border-amber-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                    onKeyDown={e => e.key === 'Enter' && void askJade()}
                  />
                  <button
                    onClick={askJade}
                    disabled={jadeLoading || !jadeQ.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                  >
                    {jadeLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {jadeIdeas && (
                  <div className="bg-white border border-amber-100 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-gray-700 whitespace-pre-wrap">{jadeIdeas}</p>
                    <button
                      onClick={() => useIdea(jadeIdeas)}
                      className="text-xs font-semibold text-amber-600 hover:text-amber-700"
                    >
                      Use this →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Media URL */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Media URL (optional)</label>
              <input
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
                placeholder="https://… (image or video from Media Library)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
              />
            </div>

            {/* Schedule */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Schedule (optional)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/50"
              />
            </div>

            {saveMsg && <p className="text-sm text-center text-gray-600">{saveMsg}</p>}
          </div>

          <div className="px-5 pb-5 flex gap-2 justify-end border-t border-gray-100 pt-4">
            <button
              onClick={() => void saveBroadcast('draft')}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:border-gray-300 rounded-xl transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Save Draft
            </button>
            {scheduledAt && (
              <button
                onClick={() => void saveBroadcast('sending')}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition disabled:opacity-50"
              >
                <Clock className="w-4 h-4" /> Schedule
              </button>
            )}
            <button
              onClick={() => void saveBroadcast('sending')}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Send Now
            </button>
          </div>
        </div>
      )}

      {/* Past broadcasts */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Past Broadcasts</h2>
        </div>
        {loading
          ? <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
          : broadcasts.length === 0
          ? <div className="py-12 text-center text-gray-400 text-sm">No broadcasts yet</div>
          : (
            <div className="divide-y divide-gray-50">
              {broadcasts.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{b.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{b.message.slice(0, 80)}…</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize shrink-0 ${STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {b.status}
                  </span>
                  {b.sentAt
                    ? (
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> {b.sentCount}/{b.recipientCount}
                        </p>
                        <p className="text-[10px] text-gray-400">{fmtDate(b.sentAt)}</p>
                      </div>
                    )
                    : <p className="text-[11px] text-gray-400 shrink-0">{fmtDate(b.createdAt)}</p>
                  }
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
