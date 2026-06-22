'use client'

import { useState, useEffect } from 'react'

interface JadeConversation {
  id:        string
  sessionId: string
  userEmail: string
  role:      string
  content:   string
  createdAt: string
}

interface OversightStats {
  totalConversations: number
  activeToday:        number
  avgResponseTime:    number
  escalations:        number
}

export default function JadeOversightPage() {
  const [stats,   setStats]   = useState<OversightStats | null>(null)
  const [logs,    setLogs]    = useState<JadeConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<'all' | 'escalated' | 'today'>('all')

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/jade/oversight/stats').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/jade/oversight/logs').then(r => r.ok ? r.json() : { logs: [] }),
    ]).then(([s, l]) => {
      if (s) setStats(s)
      setLogs(l.logs ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-2 border-blue-600/30 border-t-blue-600 animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jade AI Oversight</h1>
        <p className="text-sm text-gray-500 mt-1">Monitor Jade AI conversations and escalation events</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total conversations', value: stats?.totalConversations ?? '—', icon: '💬' },
          { label: 'Active today',        value: stats?.activeToday        ?? '—', icon: '📈' },
          { label: 'Avg response (s)',    value: stats?.avgResponseTime    ?? '—', icon: '⚡' },
          { label: 'Escalations',         value: stats?.escalations        ?? '—', icon: '🔔' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-400 font-medium">{item.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
              </div>
              <span className="text-2xl">{item.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'today', 'escalated'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-[#0B1F3A] text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Conversation log */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Conversation Log</h2>
        </div>

        {logs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-4xl mb-3">🤖</p>
            <p className="text-gray-500 text-sm">No conversation logs available yet.</p>
            <p className="text-gray-400 text-xs mt-1">Jade AI conversations will appear here once users start chatting.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        log.role === 'assistant'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {log.role === 'assistant' ? 'Jade AI' : 'User'}
                      </span>
                      <span className="text-xs text-gray-400">{log.userEmail}</span>
                    </div>
                    <p className="text-sm text-gray-700 truncate">{log.content}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(log.createdAt).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Jade AI oversight data is for internal monitoring only. All conversations are subject to Walz Travels privacy policy.
      </p>
    </div>
  )
}
