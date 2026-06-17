'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Send, RefreshCw, Copy, Check,
  ChevronDown, ChevronUp, Loader2, ClipboardList,
  Clock, CheckCircle2, MailOpen, AlertCircle,
} from 'lucide-react'

interface TokenRecord {
  id:        string
  token:     string
  used:      boolean
  expiresAt: string
  createdAt: string
}

interface AppRow {
  id:           string
  clientName:   string
  clientEmail:  string
  referenceNo:  string | null
  destination:  string | null
  status:       string
  createdAt:    string
  formStatus:   'not_sent' | 'sent' | 'started'
  latestToken:  TokenRecord | null
  tokenHistory: TokenRecord[]
}

interface Stats {
  totalSent:    number
  totalNotSent: number
  totalStarted: number
  totalIgnored: number
}

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  not_sent: { label: 'Not Sent',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600'    },
  sent:     { label: 'Sent',       dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700'   },
  started:  { label: 'Started',    dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700'   },
}

const TABS = [
  { key: '',         label: 'All'        },
  { key: 'not_sent', label: 'Not Sent'   },
  { key: 'sent',     label: 'Sent'       },
  { key: 'started',  label: 'Started'    },
]

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.walztravels.com'

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function isExpired(s: string) {
  return new Date(s) < new Date()
}

export default function FormTrackerPage() {
  const [items,   setItems]   = useState<AppRow[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [tab,     setTab]     = useState('')
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)

  const [sending,   setSending]   = useState<string | null>(null)
  const [copied,    setCopied]    = useState<string | null>(null)
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (tab)    qs.set('status', tab)
    if (search) qs.set('search', search)
    qs.set('page', String(p))

    const res  = await fetch(`/api/admin/form-tracker?${qs}`)
    const data = await res.json()
    setItems(data.items  ?? [])
    setStats(data.stats  ?? null)
    setTotal(data.total  ?? 0)
    setPage(p)
    setLoading(false)
  }, [tab, search])

  useEffect(() => { load(1) }, [load])

  async function sendForm(app: AppRow, isResend: boolean) {
    setSending(app.id)
    try {
      const res = await fetch('/api/admin/form-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: app.id, resend: isResend }),
      })
      if (res.ok) {
        await load(page)
      } else {
        const d = await res.json()
        alert(d.error ?? 'Failed to send')
      }
    } catch {
      alert('Network error')
    }
    setSending(null)
  }

  async function copyLink(token: string, id: string) {
    const link = `${SITE}/visa-form/${token}`
    await navigator.clipboard.writeText(link).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const hasMore = page * 50 < total

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0B1F3A] flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-[#C9A84C]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Form Tracker</h1>
          <p className="text-sm text-gray-500">Track visa application forms sent to clients</p>
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Forms Sent"
            value={stats.totalSent}
            icon={<Send className="w-4 h-4" />}
            color="text-blue-600 bg-blue-50"
          />
          <StatCard
            label="Not Sent"
            value={stats.totalNotSent}
            icon={<AlertCircle className="w-4 h-4" />}
            color="text-gray-600 bg-gray-100"
          />
          <StatCard
            label="Started"
            value={stats.totalStarted}
            icon={<CheckCircle2 className="w-4 h-4" />}
            color="text-green-600 bg-green-50"
          />
          <StatCard
            label="Sent / Ignored"
            value={stats.totalIgnored}
            icon={<MailOpen className="w-4 h-4" />}
            color="text-amber-600 bg-amber-50"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Tabs */}
          <div className="flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t.key
                    ? 'bg-[#0B1F3A] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search by name, email, ref, destination…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40 focus:border-[#C9A84C]"
            />
          </div>

          <button
            onClick={() => load(page)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-[#C9A84C]" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ClipboardList className="w-10 h-10 mb-3 opacity-40" />
            <p className="font-medium">No applications found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map(app => {
              const meta   = STATUS_META[app.formStatus]
              const isOpen = expanded.has(app.id)
              const busy   = sending === app.id

              return (
                <div key={app.id}>
                  {/* Main row */}
                  <div className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-[#0B1F3A] text-sm truncate">
                          {app.clientName}
                        </span>
                        {app.referenceNo && (
                          <span className="text-xs text-gray-400 font-mono">#{app.referenceNo}</span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
                        <span className="text-xs text-gray-400 truncate">{app.clientEmail}</span>
                        {app.destination && (
                          <span className="text-xs text-gray-500 font-medium">{app.destination}</span>
                        )}
                        {app.latestToken && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Sent {fmtDate(app.latestToken.createdAt)}
                            {isExpired(app.latestToken.expiresAt) && (
                              <span className="text-red-400 font-semibold">(expired)</span>
                            )}
                          </span>
                        )}
                        {app.latestToken?.used && (
                          <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Started
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Copy link */}
                      {app.latestToken && (
                        <button
                          onClick={() => copyLink(app.latestToken!.token, app.latestToken!.id)}
                          title="Copy form link"
                          className="p-2 text-gray-400 hover:text-[#C9A84C] hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          {copied === app.latestToken.id
                            ? <Check className="w-4 h-4 text-green-500" />
                            : <Copy className="w-4 h-4" />
                          }
                        </button>
                      )}

                      {/* Send / Resend */}
                      <button
                        onClick={() => sendForm(app, app.formStatus !== 'not_sent')}
                        disabled={busy}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                          app.formStatus === 'not_sent'
                            ? 'bg-[#0B1F3A] hover:bg-[#162d52] text-white'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {busy
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />
                        }
                        {app.formStatus === 'not_sent' ? 'Send' : 'Resend'}
                      </button>

                      {/* Expand history */}
                      {app.tokenHistory.length > 0 && (
                        <button
                          onClick={() => toggleExpand(app.id)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title={isOpen ? 'Hide history' : 'Show history'}
                        >
                          {isOpen
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Token history panel */}
                  {isOpen && app.tokenHistory.length > 0 && (
                    <div className="bg-gray-50 border-t border-gray-100 px-5 py-3 space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Send History ({app.tokenHistory.length})
                      </p>
                      {app.tokenHistory.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-3 text-xs text-gray-600">
                          <span className="text-gray-400 w-5 text-right">{i + 1}.</span>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            t.used ? 'bg-green-500' : isExpired(t.expiresAt) ? 'bg-red-400' : 'bg-amber-400'
                          }`} />
                          <span className="flex-1">
                            Sent {fmtDateTime(t.createdAt)}
                          </span>
                          <span className={`font-semibold ${
                            t.used ? 'text-green-600' :
                            isExpired(t.expiresAt) ? 'text-red-400' :
                            'text-amber-600'
                          }`}>
                            {t.used ? 'Started' : isExpired(t.expiresAt) ? 'Expired' : 'Pending'}
                          </span>
                          <span className="text-gray-400">
                            Expires {fmtDate(t.expiresAt)}
                          </span>
                          {!t.used && !isExpired(t.expiresAt) && (
                            <button
                              onClick={() => copyLink(t.token, t.id)}
                              className="text-gray-400 hover:text-[#C9A84C] ml-1"
                              title="Copy link"
                            >
                              {copied === t.id
                                ? <Check className="w-3.5 h-3.5 text-green-500" />
                                : <Copy className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {(hasMore || page > 1) && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <button
                onClick={() => load(page - 1)}
                className="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 font-medium"
              >
                Previous
              </button>
            )}
            {hasMore && (
              <button
                onClick={() => load(page + 1)}
                className="px-4 py-2 bg-[#0B1F3A] text-white rounded-xl hover:bg-[#162d52] font-medium"
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, icon, color,
}: {
  label: string
  value: number
  icon:  React.ReactNode
  color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`p-1.5 rounded-lg ${color}`}>{icon}</span>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#0B1F3A]">{value.toLocaleString()}</p>
    </div>
  )
}
