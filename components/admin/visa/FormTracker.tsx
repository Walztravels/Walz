'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Send, Eye, Clock, CheckCircle, RefreshCw,
  Search, Copy, Check, Loader2, AlertCircle,
} from 'lucide-react'

interface TrackedApp {
  id:              string
  referenceNumber: string
  firstName:       string | null
  lastName:        string | null
  email:           string | null
  destinationIso2: string
  status:          string
  openedAt:        string | null
  startedAt:       string | null
  viewCount:       number
  updatedAt:       string
  tokens: Array<{
    id:          string
    token:       string
    clientEmail: string
    clientName:  string
    used:        boolean
    expiresAt:   string
    createdAt:   string
  }>
}

interface Counts {
  totalSent:      number
  totalOpened:    number
  totalStarted:   number
  totalNotOpened: number
}

const FILTERS = [
  { key: 'all',        label: 'All'         },
  { key: 'not_sent',   label: 'Not Sent'    },
  { key: 'sent',       label: 'Sent'        },
  { key: 'not_opened', label: 'Not Opened'  },
  { key: 'opened',     label: 'Opened'      },
  { key: 'started',    label: 'Started'     },
]

function getFormStatus(app: TrackedApp) {
  if (app.startedAt)           return { label: 'Started',         dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200'   }
  if (app.openedAt)            return { label: 'Opened',          dot: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 border-amber-200'   }
  if (app.tokens.length > 0)   return { label: 'Sent / Unopened', dot: 'bg-red-400',   badge: 'bg-red-50 text-red-700 border-red-200'        }
  return                              { label: 'Not Sent',         dot: 'bg-gray-300',  badge: 'bg-gray-50 text-gray-500 border-gray-200'     }
}

export default function FormTracker() {
  const [apps,     setApps]     = useState<TrackedApp[]>([])
  const [counts,   setCounts]   = useState<Counts | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [sending,  setSending]  = useState<string | null>(null)
  const [copied,   setCopied]   = useState<string | null>(null)
  const [sentOk,   setSentOk]   = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const formBase = typeof window !== 'undefined' ? window.location.origin : 'https://www.walztravels.com'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ filter, search })
      const res    = await fetch(`/api/admin/form-tracker?${params}`)
      const data   = await res.json()
      setApps(data.applications ?? [])
      setCounts(data.counts ?? null)
    } catch {}
    setLoading(false)
  }, [filter, search])

  useEffect(() => { load() }, [load])

  async function resend(app: TrackedApp) {
    setSending(app.id)
    try {
      const res = await fetch('/api/admin/form-tracker', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ applicationId: app.id }),
      })
      if (res.ok) {
        setSentOk(app.id)
        setTimeout(() => setSentOk(null), 3000)
        load()
      }
    } catch {}
    setSending(null)
  }

  function copyLink(token: string, id: string) {
    const link = `${formBase}/visa/apply/${token}`
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const isExpired = (t: string) => new Date(t) < new Date()

  return (
    <div className="space-y-4">

      {/* Stat cards */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Forms Sent',  value: counts.totalSent,       border: 'border-blue-400'  },
            { label: 'Not Opened',  value: counts.totalNotOpened,   border: 'border-red-400'   },
            { label: 'Opened',      value: counts.totalOpened,      border: 'border-amber-400' },
            { label: 'Started',     value: counts.totalStarted,     border: 'border-green-400' },
          ].map(s => (
            <div key={s.label} className={`bg-white rounded-2xl p-4 border-l-4 ${s.border} shadow-sm`}>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-bold text-[#0B1F3A] mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filter === f.key
                  ? 'bg-[#0B1F3A] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, reference…"
            className="w-full pl-9 pr-4 h-9 text-sm border border-gray-200 rounded-xl
              focus:outline-none focus:border-[#C9A84C]" />
        </div>
        <button onClick={load}
          className="text-gray-400 hover:text-[#0B1F3A] transition-colors flex-shrink-0 p-1.5">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Application list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#C9A84C]" />
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
          <p className="text-gray-400">No applications match this filter</p>
        </div>
      ) : (
        <div className="space-y-2">
          {apps.map(app => {
            const st    = getFormStatus(app)
            const tok   = app.tokens[0] ?? null
            const isExp = expanded === app.id

            return (
              <div key={app.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />

                  {/* App info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#0B1F3A] text-sm">
                        {[app.firstName, app.lastName].filter(Boolean).join(' ') || 'Unknown'}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">
                        {app.referenceNumber}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded-full">
                        {app.destinationIso2}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                      {app.email && <span>{app.email}</span>}
                      {app.viewCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {app.viewCount} view{app.viewCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {app.openedAt && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Opened {new Date(app.openedAt).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      {app.startedAt && (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Started {new Date(app.startedAt).toLocaleDateString('en-GB')}
                        </span>
                      )}
                      {tok && !app.openedAt && (
                        <span className="text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Sent {new Date(tok.createdAt).toLocaleDateString('en-GB')} — not opened
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`hidden sm:inline-flex items-center text-[10px] font-bold uppercase
                    tracking-wider px-2.5 py-1.5 rounded-full border flex-shrink-0 ${st.badge}`}>
                    {st.label}
                  </span>

                  {/* Copy link */}
                  {tok && !isExpired(tok.expiresAt) && (
                    <button onClick={() => copyLink(tok.token, tok.id)} title="Copy form link"
                      className="p-2 rounded-xl text-gray-400 hover:text-[#0B1F3A] hover:bg-gray-100 transition-colors">
                      {copied === tok.id
                        ? <Check className="w-4 h-4 text-green-500" />
                        : <Copy className="w-4 h-4" />
                      }
                    </button>
                  )}

                  {/* Send / Resend */}
                  <button onClick={() => resend(app)} disabled={!!sending}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl
                      transition-all disabled:opacity-50 ${
                      sentOk === app.id
                        ? 'bg-green-500 text-white'
                        : tok
                          ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          : 'bg-[#C9A84C] text-[#0B1F3A] hover:bg-[#b8973f]'
                    }`}>
                    {sending === app.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : sentOk === app.id
                        ? <Check className="w-3.5 h-3.5" />
                        : <Send className="w-3.5 h-3.5" />
                    }
                    {sending === app.id ? 'Sending…' : sentOk === app.id ? 'Sent!' : tok ? 'Resend' : 'Send Form'}
                  </button>

                  {/* Expand */}
                  <button onClick={() => setExpanded(isExp ? null : app.id)}
                    className="text-xs text-gray-400 hover:text-[#0B1F3A] px-1 transition-colors">
                    {isExp ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded panel */}
                {isExp && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                    {app.tokens.length === 0 ? (
                      <p className="text-gray-400 text-xs">No form link sent yet.</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Send History ({app.tokens.length})
                        </p>
                        {app.tokens.map((t, i) => (
                          <div key={t.id} className={`flex items-center gap-3 text-xs rounded-xl p-2.5 ${
                            i === 0 ? 'bg-blue-50' : 'bg-gray-50'
                          }`}>
                            <div className="flex-1">
                              <p className="font-semibold text-[#0B1F3A]">Sent to {t.clientEmail}</p>
                              <p className="text-gray-400 mt-0.5">
                                {new Date(t.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                                {' · '}
                                {isExpired(t.expiresAt)
                                  ? <span className="text-red-500">Expired</span>
                                  : <span className="text-green-600">Active</span>
                                }
                              </p>
                            </div>
                            {!isExpired(t.expiresAt) && (
                              <button onClick={() => copyLink(t.token, t.id)}
                                className="text-[#C9A84C] font-semibold flex items-center gap-1 flex-shrink-0">
                                {copied === t.id
                                  ? <><Check className="w-3 h-3" /> Copied</>
                                  : <><Copy className="w-3 h-3" /> Copy</>
                                }
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {(app.openedAt || app.startedAt || app.viewCount > 0) && (
                      <div className="flex gap-2 flex-wrap">
                        {app.openedAt && (
                          <div className="bg-amber-50 rounded-xl p-2.5 flex-1 text-center min-w-[100px]">
                            <p className="text-[10px] font-bold text-amber-600">First Opened</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(app.openedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                        )}
                        {app.startedAt && (
                          <div className="bg-green-50 rounded-xl p-2.5 flex-1 text-center min-w-[100px]">
                            <p className="text-[10px] font-bold text-green-600">Started Filling</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {new Date(app.startedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                        )}
                        {app.viewCount > 0 && (
                          <div className="bg-blue-50 rounded-xl p-2.5 flex-1 text-center min-w-[100px]">
                            <p className="text-[10px] font-bold text-blue-600">Total Views</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">{app.viewCount}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
