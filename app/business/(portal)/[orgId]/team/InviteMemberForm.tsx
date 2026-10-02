'use client'

// app/business/[orgId]/team/InviteMemberForm.tsx — Walz Business (V1-B)
// Thin client form over the EXISTING POST .../members route — no new
// invitation mechanics (that route itself already calls
// lib/business/invitations.ts, which this form never touches). Rendered
// only for ADMIN-tier members and above, matching the POST route's own
// minRole.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = ['TRAVELLER', 'COORDINATOR', 'TRAVEL_MANAGER', 'APPROVER', 'FINANCE', 'ADMIN', 'OWNER'] as const

export default function InviteMemberForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('TRAVELLER')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/business/organizations/${orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not send that invitation')
        return
      }
      setSuccess(`Invitation sent to ${email}`)
      setEmail('')
      setRole('TRAVELLER')
      router.refresh()
    } catch {
      setError('Could not send that invitation')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setSuccess(null) }}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors"
      >
        Invite teammate
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-md bg-slate-50 border border-slate-200 rounded-xl p-4">
      {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      {success && <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-3 py-2">{success}</div>}
      <div>
        <label htmlFor="invite-email" className="block text-xs font-semibold text-slate-500 mb-1">Email address</label>
        <input
          id="invite-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 focus:border-[#0B1F3A]"
        />
        <p className="mt-1 text-xs text-slate-400">They must already have a Walz account registered to this email.</p>
      </div>
      <div>
        <label htmlFor="invite-role" className="block text-xs font-semibold text-slate-500 mb-1">Role</label>
        <select
          id="invite-role"
          value={role}
          onChange={e => setRole(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 focus:border-[#0B1F3A]"
        >
          {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors disabled:opacity-60">
          {busy ? 'Sending…' : 'Send invitation'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-white transition-colors">
          Cancel
        </button>
      </div>
    </form>
  )
}
