'use client'

// app/business/[orgId]/requests/CreateRequestForm.tsx — bare-bones "Create
// Travel Request" form (title + notes only), moved here from the Dashboard
// (V1-B). Unchanged shape/behavior from the prior Dashboard version —
// travellers and service lines are still added from the request detail page
// (app/business/[orgId]/requests/[requestId]). Rendered only for
// TRAVEL_MANAGER-tier members and above, matching the POST route's own
// minRole.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateRequestForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, notes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create travel request')
      }
      setTitle('')
      setNotes('')
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors"
      >
        New travel request
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-xl bg-slate-50 border border-slate-200 rounded-xl p-4">
      {error && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="new-request-title" className="block text-xs font-semibold text-slate-500 mb-1">Title (optional)</label>
        <input
          id="new-request-title"
          placeholder="e.g. Lagos sales trip — October"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 focus:border-[#0B1F3A]"
        />
      </div>
      <div>
        <label htmlFor="new-request-notes" className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
        <textarea
          id="new-request-notes"
          placeholder="Any context useful for the Walz Travels team"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 focus:border-[#0B1F3A]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create travel request'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          disabled={submitting}
          className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
