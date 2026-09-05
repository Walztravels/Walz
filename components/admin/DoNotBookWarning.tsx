'use client'

// components/admin/DoNotBookWarning.tsx
//
// Blocking Do-Not-Book warning used by every admin booking creation flow.
// A full-screen modal — not a badge, not a tooltip — that cannot be
// proceeded past without an explicit acknowledgment, which is recorded
// server-side (ActivityLog "Do Not Book Override": who + when + context).
// Cancel selects nothing and logs nothing.

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

export interface DoNotBookWarningProps {
  clientName:  string
  reason:      string | null
  /** userId or email — at least one is required for the override log. */
  userId?:     string
  email?:      string
  /** Where the override happens, e.g. "hotel booking", "quote creation". */
  context:     string
  onCancel:    () => void
  /** Called ONLY after the override has been recorded server-side. */
  onOverride:  () => void
}

export function DoNotBookWarning({ clientName, reason, userId, email, context, onCancel, onOverride }: DoNotBookWarningProps) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function acknowledge() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/clients/do-not-book', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId, email, clientName, context }),
      })
      if (!res.ok) {
        setError('Could not record the override — try again.')
        return
      }
      // Only proceed once the acknowledgment is durably logged
      onOverride()
    } catch {
      setError('Could not record the override — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl overflow-hidden bg-white shadow-2xl">
        {/* Banner header */}
        <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-white flex-shrink-0" />
          <div>
            <p className="text-white font-black text-base leading-tight">DO NOT BOOK</p>
            <p className="text-red-100 text-xs">This client is blocked for future bookings</p>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-gray-900 font-semibold mb-1">
            This client is flagged as Do Not Book.
          </p>
          <p className="text-sm text-gray-700 mb-4">
            <span className="font-semibold">{clientName || email || 'This client'}</span>
            {' — '}Reason: <span className="italic">{reason || 'No reason recorded.'}</span>
          </p>
          <p className="text-xs text-gray-500 mb-5">
            Proceeding requires a manager exception. Your acknowledgment will be
            recorded in the activity log with your name and the current time.
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel — do not proceed
            </button>
            <button
              type="button"
              onClick={() => void acknowledge()}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Recording…' : 'I acknowledge — proceed anyway'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
