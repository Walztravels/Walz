'use client'

// Do-Not-Book flag management — shown in the expanded client card on
// Clients & Leads. Setting the flag requires a reason and a management
// role (enforced server-side); every change is written with who/when and
// an ActivityLog entry. Clearing restores the client to normal booking.

import { useState } from 'react'
import { ShieldAlert, ShieldCheck, Loader2 } from 'lucide-react'

export function DoNotBookManager({ userId, clientName, doNotBook, reason, onChanged }: {
  userId:     string
  clientName: string
  doNotBook:  boolean
  reason:     string | null
  onChanged:  () => void
}) {
  const [editing, setEditing]   = useState(false)
  const [newReason, setNewReason] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function save(flag: boolean) {
    if (busy) return
    if (flag && !newReason.trim()) { setError('A reason is required to flag a client.'); return }
    setBusy(true); setError(null)
    try {
      const res  = await fetch('/api/admin/clients/do-not-book', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, doNotBook: flag, reason: flag ? newReason.trim() : undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to update flag'); return }
      setEditing(false); setNewReason('')
      onChanged()
    } catch {
      setError('Network error — try again')
    } finally { setBusy(false) }
  }

  if (doNotBook) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-900/15 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-300">DO NOT BOOK</p>
            <p className="text-xs text-red-200/80 mt-1">{reason ?? 'No reason recorded.'}</p>
            <p className="text-[10px] text-red-200/50 mt-1.5">
              Booking flows show a blocking warning for this client; proceeding requires a logged override.
            </p>
          </div>
          <button
            onClick={() => void save(false)}
            disabled={busy}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-red-400/40 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Remove flag
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    )
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-xs text-white/35 hover:text-red-400 transition-colors"
      >
        <ShieldAlert className="w-3.5 h-3.5" />
        Flag as Do Not Book…
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-4 space-y-2">
      <p className="text-xs font-bold text-red-300">Flag {clientName} as Do Not Book</p>
      <p className="text-[11px] text-white/40">
        This blocks future bookings behind a warning that requires a logged manager override.
        The reason is shown to staff whenever this client is selected.
      </p>
      <textarea
        value={newReason}
        onChange={e => setNewReason(e.target.value)}
        placeholder="Reason (required) — e.g. repeated conduct issues toward staff…"
        rows={2}
        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-red-400/50 resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => { setEditing(false); setError(null) }} disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/50 hover:text-white">
          Cancel
        </button>
        <button onClick={() => void save(true)} disabled={busy || !newReason.trim()}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          Set Do Not Book flag
        </button>
      </div>
    </div>
  )
}
