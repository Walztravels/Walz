'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, MessageSquare, VolumeX, Volume2, Users,
  RefreshCw, Loader2, Clock, CheckCircle, AlertCircle,
  ArrowUpRight,
} from 'lucide-react'

interface Stats {
  totalActive:   number
  totalSilenced: number
  totalSessions: number
  handedOver:    number
}

interface SilencedLead {
  id:               string
  name:             string
  email:            string | null
  whatsapp:         string | null
  platform:         string | null
  source:           string
  last_message:     string | null
  last_message_at:  string | null
  jade_active:      boolean
  jade_silenced_at: string | null
  jade_resumed_at:  string | null
  assigned_to:      string | null
  service:          string
  status:           string
}

interface ActiveLead {
  id:              string
  name:            string
  platform:        string | null
  source:          string
  last_message_at: string | null
  service:         string
  status:          string
}

interface JadeSession {
  id:                       string
  chatwoot_conversation_id: string
  contact_id:               string | null
  intent:                   string | null
  handover_at:              string | null
  resumed_at:               string | null
  created_at:               string
  updated_at:               string
}

function fmt(date: string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtRelative(date: string | null) {
  if (!date) return '—'
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PLATFORM_COLOR: Record<string, string> = {
  WhatsApp:  'bg-green-100 text-green-700',
  Instagram: 'bg-pink-100 text-pink-700',
  Facebook:  'bg-blue-100 text-blue-700',
  Website:   'bg-purple-100 text-purple-700',
}

function PlatformBadge({ platform }: { platform: string | null }) {
  const cls = PLATFORM_COLOR[platform ?? ''] ?? 'bg-gray-100 text-gray-500'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>
      {platform ?? 'Unknown'}
    </span>
  )
}

export default function JadeOversightPage() {
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [silenced, setSilenced] = useState<SilencedLead[]>([])
  const [active,   setActive]   = useState<ActiveLead[]>([])
  const [sessions, setSessions] = useState<JadeSession[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'silenced' | 'active' | 'sessions'>('silenced')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/jade-sessions')
      const data = await res.json()
      setStats(data.stats       ?? null)
      setSilenced(data.silencedLeads ?? [])
      setActive(data.activeLeads     ?? [])
      setSessions(data.recentSessions ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const TABS = [
    { key: 'silenced' as const, label: 'Silenced',         count: silenced.length },
    { key: 'active'   as const, label: 'Jade Active',      count: active.length   },
    { key: 'sessions' as const, label: 'Chatwoot Sessions',count: sessions.length },
  ]

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#C9A84C]" />
            Jade Oversight
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Monitor Jade AI across all customer conversations
          </p>
        </div>
        <button onClick={load}
          className="p-2 text-gray-400 hover:text-[#0B1F3A] transition-colors rounded-xl hover:bg-gray-100">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Jade Active',    value: stats.totalActive,   icon: Bot,            color: 'border-green-400',  bg: 'bg-green-50',  text: 'text-green-700'  },
            { label: 'Silenced',       value: stats.totalSilenced, icon: VolumeX,        color: 'border-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700'  },
            { label: 'Chat Sessions',  value: stats.totalSessions, icon: MessageSquare,  color: 'border-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700'   },
            { label: 'Handed to Human',value: stats.handedOver,    icon: Users,          color: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-700' },
          ].map(({ label, value, icon: Icon, color, bg, text }) => (
            <div key={label} className={`bg-white rounded-2xl p-4 border-l-4 ${color} shadow-sm`}>
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${text}`} />
              </div>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold text-[#0B1F3A] mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? 'text-[#0B1F3A] border-b-2 border-[#C9A84C]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}>
              {t.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-[#C9A84C]/20 text-[#0B1F3A]' : 'bg-gray-100 text-gray-400'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
          </div>
        ) : (
          <div className="divide-y divide-gray-50">

            {/* Silenced tab */}
            {tab === 'silenced' && (
              silenced.length === 0 ? (
                <div className="py-16 text-center">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">No silenced conversations</p>
                  <p className="text-gray-300 text-sm mt-1">Jade is running freely on all active leads</p>
                </div>
              ) : (
                silenced.map(lead => (
                  <div key={lead.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <VolumeX className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#0B1F3A] text-sm">{lead.name}</span>
                        <PlatformBadge platform={lead.platform} />
                        <span className="text-[10px] text-gray-400">{lead.service}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                        {lead.email   && <span>{lead.email}</span>}
                        {lead.whatsapp && <span>{lead.whatsapp}</span>}
                        {lead.assigned_to && (
                          <span className="text-blue-500">Assigned: {lead.assigned_to}</span>
                        )}
                      </div>
                      {lead.last_message && (
                        <p className="text-xs text-gray-400 truncate mt-0.5 max-w-md">{lead.last_message}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                        <VolumeX className="w-3 h-3" />
                        Silenced
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {fmtRelative(lead.jade_silenced_at)}
                      </p>
                      {lead.jade_resumed_at && (
                        <p className="text-[10px] text-green-500 mt-0.5">
                          Resumed {fmtRelative(lead.jade_resumed_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )
            )}

            {/* Active tab */}
            {tab === 'active' && (
              active.length === 0 ? (
                <div className="py-16 text-center">
                  <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">No active Jade conversations</p>
                </div>
              ) : (
                active.map(lead => (
                  <div key={lead.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#0B1F3A] text-sm">{lead.name}</span>
                        <PlatformBadge platform={lead.platform} />
                        <span className="text-[10px] text-gray-400">{lead.service}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Last active {fmtRelative(lead.last_message_at)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full
                      ${lead.status === 'New' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {lead.status}
                    </span>
                  </div>
                ))
              )
            )}

            {/* Sessions tab */}
            {tab === 'sessions' && (
              sessions.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">No Chatwoot sessions yet</p>
                </div>
              ) : (
                sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                          Conv #{s.chatwoot_conversation_id}
                        </span>
                        {s.intent && (
                          <span className="bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                            {s.intent}
                          </span>
                        )}
                        {s.handover_at && (
                          <span className="bg-amber-50 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" /> Handed over
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Started {fmt(s.created_at)}
                        </span>
                        <span>Updated {fmtRelative(s.updated_at)}</span>
                      </div>
                    </div>
                    <a
                      href={`https://chat.walztravels.com/app/accounts/1/conversations/${s.chatwoot_conversation_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#C9A84C] hover:text-[#b8973f] flex items-center gap-1 text-xs font-semibold flex-shrink-0">
                      View <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </div>
                ))
              )
            )}

          </div>
        )}
      </div>

      {/* Info note */}
      <p className="text-xs text-gray-400 text-center">
        Jade auto-resumes 30 minutes after a human agent sends a message.
        Silenced conversations will appear here until Jade is re-activated.
      </p>

    </div>
  )
}
