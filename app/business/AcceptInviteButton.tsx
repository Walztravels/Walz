'use client'

// Accepts the signed-in user's OWN pending invitation to one organization.
// The server resolves the membership only from (orgId, session user) — this
// component sends no membership/user id at all.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AcceptInviteButton({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/invitation/accept`, { method: 'POST' })
      if (res.ok) router.refresh()
      else setError('This invitation is no longer available.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {error && <span role="alert" style={{ color: '#900', fontSize: 13 }}>{error}</span>}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        style={{ padding: '6px 14px', borderRadius: 6, background: '#C9A84C', color: '#0B1F3A', border: 'none', fontWeight: 700 }}
      >
        {busy ? 'Accepting…' : 'Accept invitation'}
      </button>
    </span>
  )
}
