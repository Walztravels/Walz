'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Save, Loader2, AlertCircle, Check, RefreshCw, Users, Link } from 'lucide-react'
import { useStaffPermissions } from '@/hooks/useStaffPermissions'

interface RoutingAgent {
  id:              string
  name:            string
  email:           string
  chatwootAgentId: number | null
  role:            string | null
  active:          boolean
}

interface CWAgent {
  id:    number
  name:  string
  email: string
  role:  string
  availability_status: string
}

export default function InboxMappingPage() {
  const { profile } = useStaffPermissions()
  const isSuperAdmin = profile?.role === 'super_admin'

  const [mappings,    setMappings]    = useState<RoutingAgent[]>([])
  const [cwAgents,    setCwAgents]    = useState<CWAgent[]>([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState<string | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)

  // New mapping form
  const [newEmail,    setNewEmail]    = useState('')
  const [newName,     setNewName]     = useState('')
  const [newAgentId,  setNewAgentId]  = useState('')
  const [newRole,     setNewRole]     = useState('agent')
  const [adding,      setAdding]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mapRes, cwRes] = await Promise.all([
        fetch('/api/admin/inbox-mapping'),
        fetch('/api/admin/agents'),
      ])
      const mapData = await mapRes.json()
      const cwData  = await cwRes.json()
      if (Array.isArray(mapData.mappings)) setMappings(mapData.mappings)
      if (Array.isArray(cwData))           setCwAgents(cwData)
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  async function handleAdd() {
    if (!newEmail || !newAgentId) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/inbox-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:          newEmail.toLowerCase().trim(),
          name:           newName || newEmail,
          chatwootAgentId: parseInt(newAgentId),
          role:           newRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to add'); return }
      setMappings(prev => {
        const idx = prev.findIndex(m => m.email === data.mapping.email)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = data.mapping
          return next
        }
        return [...prev, data.mapping]
      })
      setNewEmail(''); setNewName(''); setNewAgentId(''); setNewRole('agent')
      showSuccess('Mapping saved')
    } catch {
      setError('Failed to add mapping')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(email: string) {
    setDeleting(email)
    try {
      const res = await fetch(`/api/admin/inbox-mapping?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to delete'); return }
      setMappings(prev => prev.filter(m => m.email !== email))
      showSuccess('Mapping removed')
    } catch {
      setError('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  // Quick-add from Chatwoot agent
  async function handleQuickAdd(cw: CWAgent) {
    setSaving(String(cw.id))
    try {
      const res = await fetch('/api/admin/inbox-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cw.email, name: cw.name, chatwootAgentId: cw.id, role: cw.role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setMappings(prev => {
        const idx = prev.findIndex(m => m.email === data.mapping.email)
        if (idx >= 0) { const n = [...prev]; n[idx] = data.mapping; return n }
        return [...prev, data.mapping]
      })
      showSuccess(`Mapped ${cw.name}`)
    } catch {
      setError('Failed')
    } finally {
      setSaving(null)
    }
  }

  const mappedEmails = new Set(mappings.map(m => m.email))

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Inbox Agent Mapping</h1>
          <p className="text-sm text-gray-500 mt-1">
            Link staff email addresses to Chatwoot agent IDs so inbox filtering works correctly.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {!isSuperAdmin && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          This page is read-only. Only Super Admins can edit agent mappings.
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2.5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {success}
        </div>
      )}

      {/* Current mappings */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
            <Link className="w-4 h-4 text-[#C9A84C]" />
            Active Mappings
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">{mappings.length}</span>
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-[#C9A84C] animate-spin" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No mappings yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {mappings.map(m => {
              const cwMatch = cwAgents.find(a => a.id === m.chatwootAgentId)
              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-[#0B1F3A] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#C9A84C] text-xs font-bold">{(m.name ?? m.email)[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0B1F3A] truncate">{m.name || m.email}</div>
                    <div className="text-xs text-gray-400 truncate">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="text-gray-400">→</span>
                    <span className="font-mono font-bold text-[#0B1F3A]">#{m.chatwootAgentId}</span>
                    {cwMatch && <span className="text-gray-400">({cwMatch.name})</span>}
                    {!cwMatch && m.chatwootAgentId && <span className="text-orange-500 text-[10px]">not in Chatwoot</span>}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {m.active ? 'active' : 'inactive'}
                  </span>
                  {isSuperAdmin && (
                    <button
                      onClick={() => void handleDelete(m.email)}
                      disabled={deleting === m.email}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === m.email ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Chatwoot agents — quick-link */}
      {cwAgents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#C9A84C]" />
              Chatwoot Agents
              <span className="text-xs text-gray-400 font-normal ml-1">— click to auto-map by email</span>
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {cwAgents.map(cw => {
              const alreadyMapped = mappedEmails.has(cw.email?.toLowerCase())
              return (
                <div key={cw.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sky-600 text-xs font-bold">{cw.name?.[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#0B1F3A] truncate">{cw.name}</div>
                    <div className="text-xs text-gray-400 truncate">{cw.email}</div>
                  </div>
                  <span className="font-mono text-xs text-gray-400">#{cw.id}</span>
                  {alreadyMapped ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">mapped</span>
                  ) : isSuperAdmin ? (
                    <button
                      onClick={() => void handleQuickAdd(cw)}
                      disabled={saving === String(cw.id)}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#0B1F3A] text-white hover:bg-[#0d2345] transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {saving === String(cw.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Map
                    </button>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-bold">unmapped</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manual add form — super admin only */}
      {isSuperAdmin && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#C9A84C]" />
            Manual Add / Override
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Staff Email *</label>
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="name@walztravels.com"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Display Name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Priscilla F."
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Chatwoot Agent ID *</label>
              <div className="flex gap-2 items-center">
                <input
                  value={newAgentId}
                  onChange={e => setNewAgentId(e.target.value)}
                  placeholder="e.g. 5"
                  type="number"
                  className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C]"
                />
                {cwAgents.length > 0 && (
                  <select
                    onChange={e => { const cw = cwAgents.find(a => String(a.id) === e.target.value); if (cw) { setNewAgentId(String(cw.id)); if (!newName) setNewName(cw.name); if (!newEmail) setNewEmail(cw.email) } }}
                    className="h-9 px-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#C9A84C] bg-white"
                  >
                    <option value="">Pick agent</option>
                    {cwAgents.map(a => (
                      <option key={a.id} value={a.id}>{a.name} (#{a.id})</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#C9A84C] bg-white"
              >
                <option value="agent">Agent</option>
                <option value="administrator">Administrator</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newEmail || !newAgentId}
            className="flex items-center gap-2 text-sm px-5 py-2 rounded-lg font-semibold bg-[#C9A84C] hover:bg-[#b8943d] text-[#0B1F3A] transition-colors disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {adding ? 'Saving…' : 'Save Mapping'}
          </button>
        </div>
      )}
    </div>
  )
}
