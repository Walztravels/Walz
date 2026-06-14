'use client'
import { useState } from 'react'
import { X, UserPlus, Trash2 } from 'lucide-react'
import { CWAgent, initials } from '../types'

interface Props {
  agents:  CWAgent[]
  onClose: () => void
  onAdd:   (name: string, email: string, role: string) => Promise<void>
  onSwitch: () => void // switch to auto-assign tab
}

export function StaffModal({ agents, onClose, onAdd, onSwitch }: Props) {
  const [tab,      setTab]      = useState<'team' | 'auto'>('team')
  const [adding,   setAdding]   = useState(false)
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [role,     setRole]     = useState('agent')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function handleAdd() {
    if (!name.trim() || !email.trim()) return
    setSaving(true)
    setError('')
    try {
      await onAdd(name.trim(), email.trim(), role)
      setName(''); setEmail(''); setRole('agent')
      setAdding(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] bg-[#0d2444] rounded-2xl border border-white/10 shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="text-sm font-bold text-white">Team Settings</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-white/40 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/8 px-5">
          {(['team', 'auto'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2.5 px-3 text-xs font-semibold capitalize transition-colors ${
                tab === t ? 'text-[#C9A84C] border-b-2 border-[#C9A84C]' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {t === 'auto' ? 'Auto-Assign' : 'Team'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'team' ? (
            <>
              {/* Agent list */}
              <div className="space-y-2 mb-4">
                {agents.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-[#1e3a5f] flex items-center justify-center text-xs font-bold text-[#C9A84C] flex-shrink-0">
                      {initials(a.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{a.name}</p>
                      <p className="text-[10px] text-white/40 truncate">{a.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        a.availability_status === 'online' ? 'bg-green-400' : 'bg-gray-500'
                      }`} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        a.role === 'administrator' ? 'bg-[#C9A84C]/20 text-[#C9A84C]' : 'bg-white/10 text-white/50'
                      }`}>
                        {a.role === 'administrator' ? 'Admin' : 'Agent'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add staff */}
              {!adding ? (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/20 text-xs text-white/50 hover:text-white hover:border-white/40 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add Staff Member
                </button>
              ) : (
                <div className="bg-white/5 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-white">New Staff Member</p>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                  />
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email address"
                    type="email"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                  />
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#C9A84C]/50"
                  >
                    <option value="agent">Agent</option>
                    <option value="administrator">Administrator</option>
                  </select>
                  {error && <p className="text-xs text-red-400">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAdding(false); setError('') }}
                      className="flex-1 py-2 rounded-lg bg-white/5 text-white/60 text-xs hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={saving || !name.trim() || !email.trim()}
                      className="flex-1 py-2 rounded-lg bg-[#C9A84C] text-[#0B1F3A] text-xs font-semibold hover:bg-[#d4b05c] disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-white/40 text-sm">
              <p className="mb-2">Round-robin auto-assignment is active.</p>
              <p className="text-xs">Rotation: Glory → Anita → Seyi</p>
              <p className="text-xs mt-4 text-white/25">Agent ID mod assignment on each new conversation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
