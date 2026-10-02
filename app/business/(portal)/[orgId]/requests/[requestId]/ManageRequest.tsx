'use client'

// TRAVEL_MANAGER-tier request management: name a traveller on the request
// (selected from the org's own traveller list — never a pasted id) and add
// an unlinked service line. Linking a service to a Quote/Visa/Itinerary/
// Trip is done by the Walz Travels team (staff-only), never here.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SERVICE_TYPES = ['FLIGHT', 'HOTEL', 'VISA', 'TRANSFER', 'ESIM', 'ITINERARY'] as const

export default function ManageRequest({
  orgId, requestId, availableTravellers,
}: {
  orgId: string
  requestId: string
  availableTravellers: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [travellerId, setTravellerId] = useState('')
  const [serviceType, setServiceType] = useState<string>('FLIGHT')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(path: string, body: unknown) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/requests/${requestId}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'Something went wrong')
      else router.refresh()
      return res.ok
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <div role="alert" style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 10, borderRadius: 6 }}>{error}</div>}
      {availableTravellers.length > 0 && (
        <form
          onSubmit={async e => { e.preventDefault(); if (travellerId && await post('travellers', { businessTravellerId: travellerId })) setTravellerId('') }}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <select aria-label="Traveller to add" value={travellerId} onChange={e => setTravellerId(e.target.value)} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, minWidth: 220 }}>
            <option value="">Add a traveller…</option>
            {availableTravellers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="submit" disabled={busy || !travellerId} style={{ padding: '8px 14px', borderRadius: 6, background: '#111', color: '#fff', border: 'none' }}>Add traveller</button>
        </form>
      )}
      <form
        onSubmit={async e => { e.preventDefault(); await post('services', { serviceType }) }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <select aria-label="Service type" value={serviceType} onChange={e => setServiceType(e.target.value)} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}>
          {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" disabled={busy} style={{ padding: '8px 14px', borderRadius: 6, background: '#111', color: '#fff', border: 'none' }}>Request service</button>
      </form>
    </div>
  )
}
