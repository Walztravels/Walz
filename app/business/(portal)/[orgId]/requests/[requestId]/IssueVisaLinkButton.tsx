'use client'

// Issues (or reissues) a one-time, expiring link a named BusinessTraveller
// can use to submit visa documents for this service — WITHOUT that
// traveller needing a Walz account or an organization membership. The
// recipient-facing page that actually consumes this link does not exist yet
// (a later phase); this button only issues the link and shows it to the
// issuer to copy/share. Modeled on SendClaimInviteButton.tsx's busy/sent/
// failed state pattern.

import { useState } from 'react'

interface Traveller { id: string; name: string }

export default function IssueVisaLinkButton({
  orgId,
  requestId,
  serviceId,
  travellers,
}: {
  orgId: string
  requestId: string
  serviceId: string
  travellers: Traveller[]
}) {
  const [selected, setSelected] = useState(travellers[0]?.id ?? '')
  const [state, setState] = useState<'idle' | 'busy' | 'issued' | 'failed'>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function issue() {
    if (!selected) return
    setState('busy')
    setCopied(false)
    try {
      const res = await fetch(
        `/api/business/organizations/${orgId}/requests/${requestId}/services/${serviceId}/visa-link`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessTravellerId: selected }) },
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) {
        setUrl(data.url)
        setExpiresAt(data.expiresAt ?? null)
        setState('issued')
      } else {
        setState('failed')
      }
    } catch {
      setState('failed')
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      /* clipboard access denied — the link text is still visible to copy manually */
    }
  }

  if (travellers.length === 0) {
    return <p style={{ marginTop: 6, fontSize: 12, color: '#888' }}>Add a traveller to this request to issue a visa submission link.</p>
  }

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value); setState('idle'); setUrl(null) }}
          disabled={state === 'busy'}
          style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', fontSize: 12 }}
        >
          {travellers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button
          type="button"
          onClick={issue}
          disabled={state === 'busy' || !selected}
          style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', fontSize: 12 }}
        >
          {state === 'busy' ? 'Issuing…' : 'Send visa submission link'}
        </button>
        {state === 'failed' && <span role="alert" style={{ color: '#900', fontSize: 12 }}>Couldn&apos;t issue the link</span>}
      </div>

      {state === 'issued' && url && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
          <input
            readOnly
            value={url}
            onFocus={e => e.currentTarget.select()}
            style={{ flex: '1 1 260px', minWidth: 180, padding: '3px 8px', borderRadius: 6, border: '1px solid #ccc', background: '#fafafa', fontSize: 12 }}
          />
          <button type="button" onClick={copy} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', fontSize: 12 }}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {expiresAt && <span style={{ color: '#666' }}>Expires {new Date(expiresAt).toISOString().slice(0, 10)}</span>}
        </div>
      )}
    </div>
  )
}
