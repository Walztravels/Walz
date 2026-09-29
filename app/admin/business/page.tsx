'use client'

// app/admin/business/page.tsx — Walz Business (Release 1) — minimal staff
// admin surface: list Organizations, create a new one. Deliberately bare —
// a working, secure shell, not a polished product. Gated server-side by the
// 'b2b'/'b2b.manage' permissions on the API routes it calls.

import { useEffect, useState, useCallback } from 'react'

interface OrganizationRow {
  id: string
  legalName: string
  tradingName: string | null
  country: string
  businessEmail: string
  status: string
  defaultCurrency: string
  createdAt: string
}

export default function AdminBusinessPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ legalName: '', country: '', businessEmail: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/business/organizations')
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load organizations')
      const data = await res.json()
      setOrganizations(data.organizations ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/business/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to create organization')
      setForm({ legalName: '', country: '', businessEmail: '' })
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Walz Business — Organizations</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Release 1: create and view organizations. Staff is the only path to create one — no self-service signup.
      </p>

      {error && (
        <div style={{ background: '#fee', border: '1px solid #fcc', color: '#900', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          required
          placeholder="Legal name"
          value={form.legalName}
          onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))}
          style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, flex: '1 1 200px' }}
        />
        <input
          required
          placeholder="Country"
          value={form.country}
          onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
          style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, flex: '1 1 140px' }}
        />
        <input
          required
          type="email"
          placeholder="Business email"
          value={form.businessEmail}
          onChange={e => setForm(f => ({ ...f, businessEmail: e.target.value }))}
          style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, flex: '1 1 220px' }}
        />
        <button type="submit" disabled={creating} style={{ padding: '8px 16px', borderRadius: 6, background: '#111', color: '#fff', border: 'none' }}>
          {creating ? 'Creating…' : 'Create organization'}
        </button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : organizations.length === 0 ? (
        <p style={{ color: '#666' }}>No organizations yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: 8 }}>Legal name</th>
              <th style={{ padding: 8 }}>Country</th>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Currency</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map(org => (
              <tr key={org.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{org.tradingName ?? org.legalName}</td>
                <td style={{ padding: 8 }}>{org.country}</td>
                <td style={{ padding: 8 }}>{org.businessEmail}</td>
                <td style={{ padding: 8 }}>{org.status}</td>
                <td style={{ padding: 8 }}>{org.defaultCurrency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
