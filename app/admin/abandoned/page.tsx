'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, Plane, FileText, RefreshCw, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface AbandonedSession {
  id:        string
  email:     string | null
  name:      string | null
  type:      string
  step:      string | null
  data:      Record<string, string | number | null>
  emailSent: boolean
  converted: boolean
  createdAt: string
}

const TYPE_META: Record<string, { label: string; icon: typeof Plane; colour: string }> = {
  flight_search:    { label: 'Flight Search',    icon: Plane,     colour: 'bg-blue-100 text-blue-700'    },
  visa_application: { label: 'Visa Application', icon: FileText,  colour: 'bg-purple-100 text-purple-700' },
  booking_checkout: { label: 'Checkout',         icon: Plane,     colour: 'bg-amber-100 text-amber-700'   },
}

function DataBadge({ data }: { data: Record<string, string | number | null> }) {
  const entries = Object.entries(data).filter(([, v]) => v != null && v !== '')
  if (!entries.length) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {entries.map(([k, v]) => (
        <span key={k} className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
          {k}: {String(v)}
        </span>
      ))}
    </div>
  )
}

export default function AbandonedPage() {
  const [sessions,    setSessions]    = useState<AbandonedSession[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      const res  = await fetch(`/api/admin/abandoned?${params}`)
      const data = await res.json() as { sessions?: AbandonedSession[]; total?: number }
      setSessions(data.sessions ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => { load() }, [load])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function markConverted(id: string) {
    await fetch('/api/admin/abandoned', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, converted: true }),
    })
    setSessions(prev => prev.map(s => s.id === id ? { ...s, converted: true } : s))
  }

  const unconverted = sessions.filter(s => !s.converted).length

  return (
    <div className="flex-1 min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">Abandoned Sessions</h1>
            <p className="text-sm text-gray-500 mt-0.5">{unconverted} to follow up · {total} total</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {/* Type filter */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'flight_search', 'visa_application', 'booking_checkout'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${typeFilter === t ? 'bg-[#0B1F3A] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'all' ? 'All' : TYPE_META[t]?.label ?? t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
        ) : sessions.length === 0 ? (
          <div className="py-20 text-center">
            <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No abandoned sessions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(session => {
              const meta      = TYPE_META[session.type] ?? { label: session.type, icon: Mail, colour: 'bg-gray-100 text-gray-600' }
              const Icon      = meta.icon
              const isExpanded = expanded.has(session.id)

              return (
                <div key={session.id}
                  className={`bg-white border rounded-xl transition-colors ${session.converted ? 'border-green-100 opacity-60' : 'border-gray-100'}`}>
                  <div className="flex items-start gap-3 p-4">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.colour}`}>
                      <Icon className="w-4 h-4" strokeWidth={1.5} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[#0B1F3A]">
                          {session.email ?? <span className="text-gray-400 font-normal">No email captured</span>}
                        </p>
                        {session.name && <span className="text-xs text-gray-500">({session.name})</span>}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.colour}`}>{meta.label}</span>
                        {session.emailSent && <span className="text-xs text-blue-600 font-semibold">✉ follow-up sent</span>}
                        {session.converted && <span className="text-xs text-green-600 font-semibold">✅ converted</span>}
                      </div>
                      <DataBadge data={session.data} />
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(session.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {session.step && ` · ${session.step}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!session.converted && session.email && (
                        <a href={`mailto:${session.email}`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white hover:bg-[#162d52] transition-colors">
                          Email
                        </a>
                      )}
                      {!session.converted && (
                        <button onClick={() => markConverted(session.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 transition-colors flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Converted
                        </button>
                      )}
                      <button onClick={() => toggleExpand(session.id)} className="text-gray-400 hover:text-gray-600">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                      <pre className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                        {JSON.stringify(session.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
