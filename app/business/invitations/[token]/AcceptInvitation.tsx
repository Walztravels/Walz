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

  // Walz Business hotfix (B1.2) — 'failed' is a CONCLUSIVE, server-confirmed
  // failure (the POST already ran and the API returned a non-ok, non-409
  // result — see app/api/business/invitations/accept/route.ts). Re-pressing
  // "Accept" can never succeed from this state (the token itself is
  // invalid/expired/consumed/mismatched — nothing about re-clicking changes
  // that), so the button is not shown at all rather than merely disabled,
  // and recovery actions are offered instead. This changes NO server-side
  // check — acceptOrganizationInvitation()'s own revalidation is untouched
  // and remains the sole authority; this is presentation only.
  if (state === 'failed') {
    return (
      <div>
        <div role="alert" style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          This invitation is invalid or has expired, or it was sent to a different email address than the one
          you&apos;re signed in with. It cannot be accepted as-is.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <Link href="/business/login" style={{ color: '#0B1F3A', fontWeight: 600 }}>
            Back to Walz Business sign in
          </Link>
          <p style={{ color: '#666', fontSize: 14, margin: 0 }}>
            Ask your organization administrator for a new invitation if you still need access.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
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
