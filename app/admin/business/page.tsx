'use client'

// app/admin/business/page.tsx — Walz Business (Release 1) — minimal staff
// admin surface: list Organizations, create a new one. Deliberately bare —
// a working, secure shell, not a polished product. Gated server-side by the
// 'b2b'/'b2b.manage' permissions on the API routes it calls.
//
// CONTRAST FIX (production acceptance defect): this page previously used raw
// inline styles with no explicit text color anywhere, so every element
// inherited the browser default (near-black) against app/admin/layout.tsx's
// bg-[#0a1628] dark navy shell — invisible until manually selected. Colors
// below are not new choices: they match the exact token convention already
// established elsewhere in Walz Admin (see app/admin/jade-club/page.tsx) —
// text-white / text-white/60 / text-white/40 for value/label hierarchy,
// bg-[#0f1c33] + border-white/8 for panels, border-white/5 for row dividers,
// hover:bg-white/3 for row hover. No layout, structure, or business logic
// changed — same form fields, same table columns, same API calls.
//
// RELEASE 2: the create form now has a REQUIRED currency selector (the
// closed list in lib/business/currency.ts). There is no default selection,
// so a new organization can never silently fall back to GBP — the server
// rejects a missing/unsupported currency as well. Each row links to the
// new organization detail page (app/admin/business/[orgId]/page.tsx).

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { SUPPORTED_ORG_CURRENCIES, orgCurrencyLabel } from '@/lib/business/currency'
import { VALID_ORGANIZATION_TYPES, DEFAULT_ORGANIZATION_TYPE } from '@/lib/business/organization-type'

interface OrganizationRow {
  id: string
  legalName: string
  tradingName: string | null
  country: string
  businessEmail: string
  status: string
  defaultCurrency: string
  organizationType: string
  createdAt: string
}

export default function AdminBusinessPage() {
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ legalName: '', country: '', businessEmail: '', defaultCurrency: '', organizationType: DEFAULT_ORGANIZATION_TYPE as string })
  const [typeFilter, setTypeFilter] = useState('')

  const load = useCallback(async (filter: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/business/organizations${filter ? `?type=${encodeURIComponent(filter)}` : ''}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to load organizations')
      const data = await res.json()
      setOrganizations(data.organizations ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(typeFilter) }, [load, typeFilter])

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
      setForm({ legalName: '', country: '', businessEmail: '', defaultCurrency: '', organizationType: DEFAULT_ORGANIZATION_TYPE })
      await load(typeFilter)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6 max-w-[960px] mx-auto">
      <h1 className="text-white text-xl font-bold mb-1">Walz Business — Organizations</h1>
      <p className="text-white/50 text-sm mb-6">
        Create and manage Corporate, Travel Agency, and Referral Partner organizations. Organizations are created by authorized Walz staff and onboarded through secure invitations.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-3 rounded-xl mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex gap-2 flex-wrap mb-6">
        <input
          required
          placeholder="Legal name"
          value={form.legalName}
          onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50 flex-[1_1_200px]"
        />
        <input
          required
          placeholder="Country"
          value={form.country}
          onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50 flex-[1_1_140px]"
        />
        <input
          required
          type="email"
          placeholder="Business email"
          value={form.businessEmail}
          onChange={e => setForm(f => ({ ...f, businessEmail: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50 flex-[1_1_220px]"
        />
        <select
          required
          aria-label="Billing currency"
          value={form.defaultCurrency}
          onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50 flex-[1_1_160px]"
        >
          <option value="" disabled className="bg-[#0f1c33] text-white/60">Billing currency…</option>
          {SUPPORTED_ORG_CURRENCIES.map(code => (
            <option key={code} value={code} className="bg-[#0f1c33] text-white">{orgCurrencyLabel(code)}</option>
          ))}
        </select>
        <select
          required
          aria-label="Organization type"
          value={form.organizationType}
          onChange={e => setForm(f => ({ ...f, organizationType: e.target.value }))}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50 flex-[1_1_160px]"
        >
          {VALID_ORGANIZATION_TYPES.map(t => (
            <option key={t} value={t} className="bg-[#0f1c33] text-white">{t}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating || !form.defaultCurrency}
          className="px-4 py-2 rounded-xl bg-[#C9A84C] text-[#0a1628] font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#d9ba5c] transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
        >
          {creating ? 'Creating…' : 'Create organization'}
        </button>
      </form>

      <div className="flex items-center gap-2 mb-3">
        <label htmlFor="type-filter" className="text-white/50 text-xs">Filter by type</label>
        <select
          id="type-filter"
          aria-label="Filter by organization type"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 focus:border-[#C9A84C]/50"
        >
          <option value="" className="bg-[#0f1c33] text-white">All types</option>
          {VALID_ORGANIZATION_TYPES.map(t => (
            <option key={t} value={t} className="bg-[#0f1c33] text-white">{t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-white/50 text-sm">Loading…</p>
      ) : organizations.length === 0 ? (
        <p className="text-white/50 text-sm">No organizations yet.</p>
      ) : (
        <div className="bg-[#0f1c33] rounded-xl border border-white/8 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase">
                <th className="text-left px-4 py-2">Legal name</th>
                <th className="text-left px-4 py-2">Country</th>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Currency</th>
                <th className="text-left px-4 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map(org => (
                <tr key={org.id} className="border-t border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-2 text-white">{org.tradingName ?? org.legalName}
                    {' '}
                    <Link href={`/admin/business/${org.id}`} className="text-[#C9A84C] text-xs hover:underline focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded">
                      Open
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-white/60">{org.country}</td>
                  <td className="px-4 py-2 text-white/60">{org.businessEmail}</td>
                  <td className="px-4 py-2 text-white/60">{org.status}</td>
                  <td className="px-4 py-2 text-white/60">{org.defaultCurrency}</td>
                  <td className="px-4 py-2 text-white/60">{org.organizationType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
