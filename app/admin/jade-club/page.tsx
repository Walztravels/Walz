'use client'

// app/admin/jade-club/page.tsx — Jade Club Control Centre (Phase 1).
//
// Client component fetching from RBAC-gated API routes — the same pattern
// as app/admin/quotes/page.tsx. All authorization is enforced server-side
// on every /api/admin/jade-club/* route; this page never trusts anything
// client-side for security, it only renders what the server was willing to
// return. A staff member without 'jade_club' sees a plain "no permission"
// message (the nav item is already hidden for them via getNavForStaff).

import { useEffect, useState, useCallback } from 'react'
import { Sparkles, Users, CreditCard, Package } from 'lucide-react'

interface Overview {
  jadeFreeCount: number
  clubCount: number
  clubPlusCount: number
  activeCount: number
  expiringCount: number
  expiredCount: number
  cancelledCount: number
  physicalCardsRequested: number
  physicalCardsInFulfilment: number
  activeBenefitsCount: number
  revenue: null
}

interface MembershipRow {
  userId: string
  memberCode: string
  name: string | null
  email: string | null
  tier: string
  status: string
  source: string
  startedAt: string
  expiresAt: string | null
  physicalCardStatus: string
}

interface BenefitRow {
  key: string
  name: string
  category: string
  provider: string | null
  status: string
  eligibleTiers: string[]
  active: boolean
}

const TIERS = ['FREE', 'CLUB', 'CLUB_PLUS']
const STATUSES = ['FREE', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'CANCELLED']
const BENEFIT_STATUSES = ['ACTIVE', 'INACTIVE', 'COMING_SOON']

export default function JadeClubAdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [benefits, setBenefits] = useState<BenefitRow[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const [ovRes, memRes, benRes] = await Promise.all([
        fetch('/api/admin/jade-club/overview'),
        fetch(`/api/admin/jade-club/memberships${q ? `?query=${encodeURIComponent(q)}` : ''}`),
        fetch('/api/admin/jade-club/benefits'),
      ])
      if (ovRes.status === 403 || memRes.status === 403 || benRes.status === 403) {
        setError('You do not have permission to view Jade Travel Club.')
        return
      }
      if (!ovRes.ok || !memRes.ok || !benRes.ok) {
        setError('Failed to load Jade Travel Club data.')
        return
      }
      const ov = await ovRes.json()
      const mem = await memRes.json()
      const ben = await benRes.json()
      setOverview(ov)
      setMemberships(mem.memberships)
      setBenefits(ben.benefits)
    } catch {
      setError('Failed to load Jade Travel Club data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load('') }, [load])

  async function adjustMembership(userId: string, tier: string, status: string) {
    const reason = prompt('Reason for this membership change (required, kept in the audit log):')
    if (!reason || !reason.trim()) return
    setSavingKey(userId)
    try {
      const res = await fetch(`/api/admin/jade-club/memberships/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, status, reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? 'Failed to update membership')
        return
      }
      await load(query)
    } finally {
      setSavingKey(null)
    }
  }

  async function updateBenefit(key: string, status: string) {
    setSavingKey(key)
    try {
      const res = await fetch(`/api/admin/jade-club/benefits/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? 'Failed to update benefit')
        return
      }
      await load(query)
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <div className="p-8 text-white/50">Loading Jade Travel Club…</div>
  if (error) return <div className="p-8 text-red-400">{error}</div>
  if (!overview) return null

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-[#C9A84C]" />
        <h1 className="text-white font-bold text-xl">Jade Travel Club — Control Centre</h1>
      </div>

      {/* ── Overview stats ───────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Jade Free" value={overview.jadeFreeCount} icon={<Users className="w-4 h-4" />} />
        <Stat label="Active Club" value={overview.clubCount} icon={<Sparkles className="w-4 h-4" />} />
        <Stat label="Active Club+" value={overview.clubPlusCount} icon={<Sparkles className="w-4 h-4" />} />
        <Stat label="Expiring" value={overview.expiringCount} icon={<Users className="w-4 h-4" />} />
        <Stat label="Expired" value={overview.expiredCount} icon={<Users className="w-4 h-4" />} />
        <Stat label="Physical Cards Requested" value={overview.physicalCardsRequested} icon={<CreditCard className="w-4 h-4" />} />
        <Stat label="Physical Cards In Fulfilment" value={overview.physicalCardsInFulfilment} icon={<Package className="w-4 h-4" />} />
        <Stat label="Active Benefits" value={overview.activeBenefitsCount} icon={<Sparkles className="w-4 h-4" />} />
      </div>
      <p className="text-white/30 text-xs">
        Membership revenue is not shown — no paid membership purchase flow is active in Phase 1.
      </p>

      {/* ── Memberships table ────────────────────────── */}
      <div className="bg-[#0f1c33] rounded-xl border border-white/8 overflow-hidden">
        <div className="p-4 border-b border-white/8 flex items-center gap-3">
          <h2 className="text-white font-semibold text-sm flex-1">Memberships</h2>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(query) }}
            placeholder="Search by name or email…"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30"
          />
          <button onClick={() => load(query)} className="text-xs font-semibold text-[#C9A84C]">Search</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-xs uppercase">
              <th className="text-left px-4 py-2">Customer</th>
              <th className="text-left px-4 py-2">Member ID</th>
              <th className="text-left px-4 py-2">Tier</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Physical Card</th>
              <th className="text-left px-4 py-2">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {memberships.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-white/30 text-center">No memberships have been created yet — customers appear here once they first visit Jade Club.</td></tr>
            )}
            {memberships.map(m => (
              <tr key={m.userId} className="border-t border-white/5">
                <td className="px-4 py-2 text-white">{m.name || m.email}</td>
                <td className="px-4 py-2 text-white/60 font-mono">{m.memberCode}</td>
                <td className="px-4 py-2 text-white/60">{m.tier}</td>
                <td className="px-4 py-2 text-white/60">{m.status}</td>
                <td className="px-4 py-2 text-white/60">{m.physicalCardStatus}</td>
                <td className="px-4 py-2">
                  <AdjustForm
                    userId={m.userId}
                    tier={m.tier}
                    status={m.status}
                    saving={savingKey === m.userId}
                    onSave={adjustMembership}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Benefits catalog ─────────────────────────── */}
      <div className="bg-[#0f1c33] rounded-xl border border-white/8 overflow-hidden">
        <div className="p-4 border-b border-white/8">
          <h2 className="text-white font-semibold text-sm">Benefits Catalog</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-xs uppercase">
              <th className="text-left px-4 py-2">Benefit</th>
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-left px-4 py-2">Provider</th>
              <th className="text-left px-4 py-2">Eligible Tiers</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {benefits.map(b => (
              <tr key={b.key} className="border-t border-white/5">
                <td className="px-4 py-2 text-white">{b.name}</td>
                <td className="px-4 py-2 text-white/60">{b.category}</td>
                <td className="px-4 py-2 text-white/60">{b.provider ?? '—'}</td>
                <td className="px-4 py-2 text-white/60">{b.eligibleTiers.join(', ')}</td>
                <td className="px-4 py-2">
                  <select
                    value={b.status}
                    disabled={savingKey === b.key}
                    onChange={e => updateBenefit(b.key, e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
                    {BENEFIT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-[#0f1c33] rounded-xl border border-white/8 p-4">
      <div className="flex items-center gap-2 text-[#C9A84C] mb-2">{icon}</div>
      <p className="text-white text-2xl font-bold">{value.toLocaleString()}</p>
      <p className="text-white/40 text-xs mt-1">{label}</p>
    </div>
  )
}

function AdjustForm({ userId, tier, status, saving, onSave }: {
  userId: string; tier: string; status: string; saving: boolean
  onSave: (userId: string, tier: string, status: string) => void
}) {
  const [t, setT] = useState(tier)
  const [s, setS] = useState(status)
  useEffect(() => { setT(tier); setS(status) }, [tier, status])
  return (
    <div className="flex items-center gap-1.5">
      <select value={t} onChange={e => setT(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-xs text-white">
        {TIERS.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <select value={s} onChange={e => setS(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-xs text-white">
        {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <button
        disabled={saving}
        onClick={() => onSave(userId, t, s)}
        className="text-xs font-semibold text-[#C9A84C] disabled:opacity-50">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
