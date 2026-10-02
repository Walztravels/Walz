'use client'

// Sends (or re-sends) a traveller's account-claim invitation email. The
// token goes only to the traveller's inbox — it is never shown here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SendClaimInviteButton({ orgId, travellerId, resend }: { orgId: string; travellerId: string; resend: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle')

  async function send() {
    setState('busy')
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/travellers/${travellerId}/claim`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setState(res.ok && data.emailSent !== false ? 'sent' : 'failed')
      if (res.ok) router.refresh()
    } catch {
      setState('failed')
    }
  }

  if (state === 'sent') return <span style={{ color: '#1d5f2c', fontSize: 13 }}>Invite sent</span>
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {state === 'failed' && <span role="alert" style={{ color: '#900', fontSize: 12 }}>Couldn&apos;t send</span>}
      <button type="button" onClick={send} disabled={state === 'busy'}
        style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', fontSize: 12 }}>
        {state === 'busy' ? 'Sending…' : resend ? 'Resend link invite' : 'Invite to link account'}
      </button>
    </span>
  )
}
