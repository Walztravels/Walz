'use client'

import { useState, useEffect, useCallback } from 'react'

interface Conversation {
  id: string
  channel: string
  intent: string
  sentiment: 'positive' | 'negative' | 'neutral'
  sentimentScore: number
  competitorMention: boolean
  competitorName?: string | null
  promiseMade: boolean
  language: string
  keyTopics: string[]
  processedAt: string
}

const CHANNELS = ['whatsapp', 'email', 'phone', 'instagram', 'website_chat']

const SENTIMENT_BADGE: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  negative: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-500',
}

const INPUT = 'w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white'

export default function ConversationPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCompetitor, setFilterCompetitor] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    leadId: '',
    userId: '',
    staffId: '',
    channel: 'whatsapp',
    messages: '',
    intent: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/intelligence/conversation')
      const data = await res.json()
      setConversations(data.conversations ?? data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function analyseConversation(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const messages = form.messages.split('\n').filter(m => m.trim())
      await fetch('/api/admin/intelligence/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, messages }),
      })
      setShowForm(false)
      setForm({ leadId: '', userId: '', staffId: '', channel: 'whatsapp', messages: '', intent: '' })
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const filtered = filterCompetitor ? conversations.filter(c => c.competitorMention) : conversations

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Conversation Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">Sentiment, intent, and promise tracking across all channels</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Competitor Mentions Only</span>
            <button
              type="button"
              onClick={() => setFilterCompetitor(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${filterCompetitor ? 'bg-[#C9A84C]' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${filterCompetitor ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0B1F3A] text-white text-sm font-semibold rounded-xl hover:bg-[#0d2345] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Analyse Conversation
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#0B1F3A] mb-4">Analyse Conversation</h2>
          <form onSubmit={analyseConversation} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Lead ID (optional)</label>
                <input className={INPUT} placeholder="lead_..." value={form.leadId} onChange={e => set('leadId', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">User ID (optional)</label>
                <input className={INPUT} placeholder="clxyz..." value={form.userId} onChange={e => set('userId', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Staff ID</label>
                <input className={INPUT} placeholder="staff_..." value={form.staffId} onChange={e => set('staffId', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Channel</label>
                <select className={INPUT} value={form.channel} onChange={e => set('channel', e.target.value)}>
                  {CHANNELS.map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Intent</label>
              <input className={INPUT} placeholder="e.g. visa enquiry, booking, complaint..." value={form.intent} onChange={e => set('intent', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Messages (one per line)</label>
              <textarea
                rows={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] resize-none font-mono"
                placeholder={"Client: Hello, I need a UK visa...\nStaff: Sure, I can help with that..."}
                value={form.messages}
                onChange={e => set('messages', e.target.value)}
                required
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-[#C9A84C] text-[#0B1F3A] font-bold text-sm rounded-lg hover:bg-[#b8943d] disabled:opacity-50 transition-colors">
                {submitting ? 'Analysing…' : 'Analyse'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-6 h-6 border-2 border-[#C9A84C] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">
            {filterCompetitor ? 'No competitor mentions found.' : 'No conversations analysed yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Intent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sentiment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Competitor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Promise</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Language</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Topics</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Processed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="text-xs font-semibold text-[#0B1F3A] bg-[#0B1F3A]/5 px-2 py-0.5 rounded capitalize">
                        {c.channel?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[120px] truncate">{c.intent}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${SENTIMENT_BADGE[c.sentiment] ?? 'bg-gray-100 text-gray-500'}`}>
                        {c.sentiment}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">{c.sentimentScore?.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {c.competitorMention ? (
                        <div>
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Yes</span>
                          {c.competitorName && <div className="text-xs text-red-500 mt-0.5">{c.competitorName}</div>}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.promiseMade
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Yes</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.language}</td>
                    <td className="px-4 py-3 max-w-[160px]">
                      <div className="flex flex-wrap gap-1">
                        {c.keyTopics?.slice(0, 3).map((t, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">{t}</span>
                        ))}
                        {(c.keyTopics?.length ?? 0) > 3 && <span className="text-xs text-gray-400">+{c.keyTopics.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(c.processedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
