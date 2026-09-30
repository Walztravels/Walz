'use client'

// app/business/claim/[token]/ClaimConfirm.tsx — explicit "Confirm" action
// for the traveller account-claim flow. Every failure shows the same
// generic message (the API never says why a claim failed).

import { useState } from 'react'
import Link from 'next/link'

export default function ClaimConfirm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle')

  async function confirm() {
    setState('working')
    try {
      const res = await fetch('/api/business/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setState(res.ok ? 'done' : 'failed')
    } catch {
      setState('failed')
    }
  }

  if (state === 'done') {
    return (
      <div role="status" style={{ background: '#eefaf0', border: '1px solid #b7e4c0', color: '#1d5f2c', padding: 16, borderRadius: 8 }}>
        Your traveller profile is now linked to your Walz account. If your organization has also invited you
        as a member, you&apos;ll see its trips in <Link href="/business" style={{ color: '#1d5f2c', fontWeight: 600 }}>Walz Business</Link>.
      </div>
    )
  }

  return (
    <div>
      {state === 'failed' && (
        <div role="alert" style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          This link is invalid or has expired, or it was sent to a different email address than the one you&apos;re
          signed in with. Ask your organization to send a new link.
        </div>
      )}
      <button
        type="button"
        onClick={confirm}
        disabled={state === 'working'}
        style={{ padding: '10px 20px', borderRadius: 8, background: '#C9A84C', color: '#0B1F3A', border: 'none', fontWeight: 700, cursor: 'pointer' }}
      >
        {state === 'working' ? 'Confirming…' : 'Confirm it’s me'}
      </button>
    </div>
  )
}
