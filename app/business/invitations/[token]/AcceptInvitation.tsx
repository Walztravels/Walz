'use client'

// app/business/invitations/[token]/AcceptInvitation.tsx — explicit "Accept"
// action for the organization-invitation flow. Every security-sensitive
// failure shows the same generic message (the API never says why acceptance
// failed) — mirrors app/business/claim/[token]/ClaimConfirm.tsx.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed' | 'conflict'>('idle')
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  async function accept() {
    setState('working')
    try {
      const res = await fetch('/api/business/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        setOrganizationId(typeof data.organizationId === 'string' ? data.organizationId : null)
        setState('done')
        return
      }
      setState(res.status === 409 ? 'conflict' : 'failed')
    } catch {
      setState('failed')
    }
  }

  if (state === 'done') {
    return (
      <div role="status" style={{ background: '#eefaf0', border: '1px solid #b7e4c0', color: '#1d5f2c', padding: 16, borderRadius: 8 }}>
        You&apos;ve joined the organization.{' '}
        <Link
          href={organizationId ? `/business/${organizationId}` : '/business'}
          style={{ color: '#1d5f2c', fontWeight: 600 }}
          onClick={() => router.refresh()}
        >
          Go to Walz Business
        </Link>
      </div>
    )
  }

  return (
    <div>
      {state === 'failed' && (
        <div role="alert" style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          This invitation is invalid or has expired, or it was sent to a different email address than the one
          you&apos;re signed in with. Ask the organization to send a new invitation.
        </div>
      )}
      {state === 'conflict' && (
        <div role="alert" style={{ background: '#fff8e1', border: '1px solid #ffe082', color: '#795500', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          You are already a member of this organization.
        </div>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={state === 'working'}
        style={{ padding: '10px 20px', borderRadius: 8, background: '#C9A84C', color: '#0B1F3A', border: 'none', fontWeight: 700, cursor: 'pointer' }}
      >
        {state === 'working' ? 'Accepting…' : 'Accept invitation'}
      </button>
    </div>
  )
}
