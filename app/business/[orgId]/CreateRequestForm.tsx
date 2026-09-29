'use client'

// app/business/[orgId]/CreateRequestForm.tsx — bare-bones "Create Travel
// Request" form (title + notes only). Service-linking is API-only for
// Release 1 — no UI for it here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateRequestForm({ orgId }: { orgId: string }) {
  const router = useRouter()
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
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 480 }}>
      {error && (
        <div style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 10, borderRadius: 6 }}>
          {error}
        </div>
      )}
      <input
        placeholder="Title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{ padding: '8px 16px', borderRadius: 6, background: '#111', color: '#fff', border: 'none', alignSelf: 'flex-start' }}
      >
        {submitting ? 'Creating…' : 'Create travel request'}
      </button>
    </form>
  )
}
