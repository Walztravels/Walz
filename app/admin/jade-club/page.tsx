'use client'

// app/admin/jade-club/page.tsx — Jade Club Control Centre (Phase 1).
//
// Client component fetching from RBAC-gated API routes — the same pattern
// as app/admin/quotes/page.tsx. All authorization is enforced server-side
// on every /api/admin/jade-club/* route; this page never trusts anything
// client-side for security, it only renders what the server was willing to
// return. A staff member without 'jade_club' sees a plain "no permission"
// message (the nav item is already hidden for them via getNavForStaff).

import { Fragment, useEffect, useState, useCallback } from 'react'
import { Sparkles, Users, CreditCard, Package, ShieldCheck, Search } from 'lucide-react'
import { decimalToMinor, formatCurrencyMinor } from '@/lib/currency'

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

// YYYY-MM-DD for an <input type="date">, or '' if unset.
function toDateInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
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

// ── Release 2A: Commercial Control & Entitlements ─────────────────────────
const COMMERCIAL_TIERS = ['CLUB', 'CLUB_PLUS']
const ENTITLEMENT_TYPES = ['COUNT_PER_PERIOD', 'COST_CAPPED', 'BOOLEAN_ELIGIBILITY']

interface PolicyRow {
  id: string
  tier: string
  market: string
  currency: string
  annualPriceMinor: number
  durationMonths: number
  serviceFeeDiscountPercent: number
  effectiveFrom: string
  effectiveTo: string | null
  version: number
  status: string
}

interface PolicyBenefitRow {
  id: string
  policyId: string
  benefitKey: string
  entitlementType: string
  countPerPeriod: number | null
  costCapMinorUsd: number | null
  booleanEligible: boolean | null
}

interface EntitlementEventRow {
  id: string
  eventType: string
  actorStaffId: string | null
  actorUserId: string | null
  detail: string | null
  createdAt: string
}

interface EntitlementSlotRow {
  id: string
  slotNumber: number
  status: string
  reservedBy: string | null
  reservationExpiresAt: string | null
  consumedAt: string | null
  events: EntitlementEventRow[]
}

interface BenefitSnapshotRow {
  id: string
  benefitKey: string
  benefitName: string
  entitlementType: string
  countPerPeriod: number | null
  costCapMinorUsd: number | null
  booleanEligible: boolean | null
  slots: EntitlementSlotRow[]
}

interface MembershipTermsRow {
  id: string
  tier: string
  market: string
  currency: string
  annualPriceMinor: number
  serviceFeeDiscountPercent: number
  activatedAt: string
  expiresAt: string
  source: string
  policyVersion: number
  benefits: BenefitSnapshotRow[]
}

// Release 2B: payment-state view sourced from JadeClubPurchase.
interface PurchaseRow {
  id: string
  tier: string
  market: string
  currency: string
  amountMinor: number
  provider: string
  providerReference: string
  paymentStatus: string
  activationStatus: string
  activationAttempts: number
  failureReason: string | null
  createdAt: string
  paidAt: string | null
  activatedAt: string | null
}

export default function JadeClubAdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [benefits, setBenefits] = useState<BenefitRow[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // ── Release 2A: Commercial Control & Entitlements state ──────────────
  const [policies, setPolicies] = useState<PolicyRow[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(true)
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null)
  const [policyBenefits, setPolicyBenefits] = useState<PolicyBenefitRow[]>([])
  const [auditUserId, setAuditUserId] = useState('')
  const [auditTerms, setAuditTerms] = useState<MembershipTermsRow[] | null>(null)
  const [auditPurchases, setAuditPurchases] = useState<PurchaseRow[] | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [retryingPurchaseId, setRetryingPurchaseId] = useState<string | null>(null)

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true)
    try {
      const res = await fetch('/api/admin/jade-club/policies')
      if (res.ok) {
        const data = await res.json()
        setPolicies(data.policies)
      }
    } finally {
      setPoliciesLoading(false)
    }
  }, [])

  useEffect(() => { loadPolicies() }, [loadPolicies])

  async function loadPolicyBenefits(policyId: string) {
    if (expandedPolicyId === policyId) {
      setExpandedPolicyId(null)
      setPolicyBenefits([])
      return
    }
    const res = await fetch(`/api/admin/jade-club/policies/${policyId}`)
    if (res.ok) {
      const data = await res.json()
      setPolicyBenefits(data.benefits)
      setExpandedPolicyId(policyId)
    }
  }

  async function createDraftPolicy(form: {
    tier: string; market: string; currency: string; annualPriceMinor: string
    durationMonths: string; serviceFeeDiscountPercent: string; effectiveFrom: string
  }) {
    const reason = prompt('Reason for creating this policy draft (required, kept in the audit log):')
    if (!reason || !reason.trim()) return
    const res = await fetch('/api/admin/jade-club/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier: form.tier,
        market: form.market,
        currency: form.currency,
        annualPriceMinor: Number(form.annualPriceMinor),
        durationMonths: Number(form.durationMonths) || 12,
        serviceFeeDiscountPercent: Number(form.serviceFeeDiscountPercent),
        effectiveFrom: new Date(form.effectiveFrom).toISOString(),
        reason,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error ?? 'Failed to create policy draft')
      return
    }
    await loadPolicies()
  }

  async function activatePolicyVersion(policyId: string) {
    const reason = prompt('Reason for activating this policy version (required — this will supersede the current ACTIVE policy for the same tier/market/currency):')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/admin/jade-club/policies/${policyId}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error ?? 'Failed to activate policy')
      return
    }
    await loadPolicies()
  }

  async function addBenefitToPolicy(policyId: string, form: {
    benefitKey: string; entitlementType: string; countPerPeriod: string; costCapMinorUsd: string; booleanEligible: boolean
  }) {
    const reason = prompt('Reason for adding this benefit to the draft policy (required):')
    if (!reason || !reason.trim()) return
    const payload: Record<string, unknown> = { benefitKey: form.benefitKey, entitlementType: form.entitlementType, reason }
    if (form.entitlementType === 'COUNT_PER_PERIOD') payload.countPerPeriod = Number(form.countPerPeriod)
    if (form.entitlementType === 'COST_CAPPED') payload.costCapMinorUsd = Number(form.costCapMinorUsd)
    if (form.entitlementType === 'BOOLEAN_ELIGIBILITY') payload.booleanEligible = form.booleanEligible
    const res = await fetch(`/api/admin/jade-club/policies/${policyId}/benefits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error ?? 'Failed to add benefit')
      return
    }
    await loadPolicyBenefits(policyId).catch(() => {})
    // re-open the panel with fresh data
    setExpandedPolicyId(null)
    await loadPolicyBenefits(policyId)
  }

  async function loadMemberAudit() {
    if (!auditUserId.trim()) return
    setAuditLoading(true)
    setAuditError(null)
    setAuditTerms(null)
    setAuditPurchases(null)
    try {
      const res = await fetch(`/api/admin/jade-club/memberships/${encodeURIComponent(auditUserId.trim())}/terms`)
      if (res.status === 403) { setAuditError('You do not have permission to view this.'); return }
      if (!res.ok) { setAuditError('Failed to load member terms/entitlements.'); return }
      const data = await res.json()
      setAuditTerms(data.terms)
      setAuditPurchases(data.purchases ?? [])
    } catch {
      setAuditError('Failed to load member terms/entitlements.')
    } finally {
      setAuditLoading(false)
    }
  }

  async function retryActivation(purchaseId: string) {
    const reason = prompt('Reason for retrying this stuck activation (required, audited):')
    if (!reason || !reason.trim()) return
    setRetryingPurchaseId(purchaseId)
    try {
      const res = await fetch(`/api/admin/jade-club/purchases/${purchaseId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(body.error ?? 'Failed to retry activation')
        return
      }
      alert(`Retry outcome: ${body.outcome?.outcome ?? 'unknown'}`)
      await loadMemberAudit()
    } finally {
      setRetryingPurchaseId(null)
    }
  }

  async function reverseSlot(slotId: string) {
    const reason = prompt('Reason for reversing this CONSUMED entitlement slot (required, audited, terminal):')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/admin/jade-club/entitlement-slots/${slotId}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error ?? 'Failed to reverse slot')
      return
    }
    await loadMemberAudit()
  }

  async function replaceSlot(snapshotId: string) {
    const reason = prompt('Reason for granting a replacement entitlement slot (required — creates a brand-new slot, never resurrects a reversed one):')
    if (!reason || !reason.trim()) return
    const res = await fetch(`/api/admin/jade-club/benefit-snapshots/${snapshotId}/replace-slot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error ?? 'Failed to grant replacement slot')
      return
    }
    await loadMemberAudit()
  }

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

  async function adjustMembership(userId: string, tier: string, status: string, expiresAtChanged: boolean, expiresAt: string) {
    const reason = prompt('Reason for this membership change (required, kept in the audit log):')
    if (!reason || !reason.trim()) return
    setSavingKey(userId)
    try {
      const body: Record<string, unknown> = { tier, status, reason }
      // Only include expiresAt when the admin actually touched the date
      // field — omitting it entirely leaves the existing value unchanged
      // (see adminAdjustMembership's `undefined` = "no change" contract).
      if (expiresAtChanged) body.expiresAt = expiresAt ? new Date(expiresAt).toISOString() : null
      const res = await fetch(`/api/admin/jade-club/memberships/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
                    expiresAt={m.expiresAt}
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

      {/* ── Release 2A: Commercial Policies ──────────── */}
      <div className="bg-[#0f1c33] rounded-xl border border-white/8 overflow-hidden">
        <div className="p-4 border-b border-white/8 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#C9A84C]" />
          <h2 className="text-white font-semibold text-sm flex-1">Commercial Policies</h2>
        </div>
        <div className="p-4 border-b border-white/8">
          <NewPolicyForm onCreate={createDraftPolicy} />
        </div>
        {policiesLoading ? (
          <div className="p-4 text-white/40 text-sm">Loading policies…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase">
                <th className="text-left px-4 py-2">Tier</th>
                <th className="text-left px-4 py-2">Market</th>
                <th className="text-left px-4 py-2">Currency</th>
                <th className="text-left px-4 py-2">Annual Price (minor)</th>
                <th className="text-left px-4 py-2">Fee Discount %</th>
                <th className="text-left px-4 py-2">Version</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-white/30 text-center">No commercial policies have been authored yet.</td></tr>
              )}
              {policies.map(p => (
                <Fragment key={p.id}>
                  <tr className="border-t border-white/5">
                    <td className="px-4 py-2 text-white">{p.tier}</td>
                    <td className="px-4 py-2 text-white/60">{p.market}</td>
                    <td className="px-4 py-2 text-white/60">{p.currency}</td>
                    <td className="px-4 py-2 text-white/60">{p.annualPriceMinor.toLocaleString()}</td>
                    <td className="px-4 py-2 text-white/60">{p.serviceFeeDiscountPercent}%</td>
                    <td className="px-4 py-2 text-white/60">v{p.version}</td>
                    <td className="px-4 py-2">
                      <span className={
                        p.status === 'ACTIVE' ? 'text-emerald-400' : p.status === 'DRAFT' ? 'text-amber-300' : 'text-white/30'
                      }>{p.status}</span>
                    </td>
                    <td className="px-4 py-2 flex items-center gap-2">
                      <button onClick={() => loadPolicyBenefits(p.id)} className="text-xs font-semibold text-[#C9A84C]">
                        {expandedPolicyId === p.id ? 'Hide Benefits' : 'Benefits'}
                      </button>
                      {p.status === 'DRAFT' && (
                        <button onClick={() => activatePolicyVersion(p.id)} className="text-xs font-semibold text-emerald-400">Activate</button>
                      )}
                    </td>
                  </tr>
                  {expandedPolicyId === p.id && (
                    <tr className="border-t border-white/5 bg-white/[0.02]">
                      <td colSpan={8} className="px-4 py-3">
                        <PolicyBenefitsPanel
                          policyId={p.id}
                          benefits={policyBenefits}
                          editable={p.status === 'DRAFT'}
                          onAdd={(form) => addBenefitToPolicy(p.id, form)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-white/30 text-xs p-4 border-t border-white/8">
          No hardcoded Club/Club+ price or discount value is used anywhere — every number above was authored here by an admin.
        </p>
      </div>

      {/* ── Release 2A: Member Terms / Entitlements audit (read-only) ── */}
      <div className="bg-[#0f1c33] rounded-xl border border-white/8 overflow-hidden">
        <div className="p-4 border-b border-white/8 flex items-center gap-3">
          <Search className="w-4 h-4 text-[#C9A84C]" />
          <h2 className="text-white font-semibold text-sm flex-1">Member Terms &amp; Entitlements (Support / Audit)</h2>
          <input
            value={auditUserId}
            onChange={e => setAuditUserId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') loadMemberAudit() }}
            placeholder="Paste a User ID…"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30 w-64"
          />
          <button onClick={loadMemberAudit} className="text-xs font-semibold text-[#C9A84C]">Look up</button>
        </div>
        <div className="p-4">
          {auditLoading && <p className="text-white/40 text-sm">Loading…</p>}
          {auditError && <p className="text-red-400 text-sm">{auditError}</p>}

          {/* ── Release 2B: Purchases / payment-state ─────────────────── */}
          {auditPurchases && (
            <div className="mb-6">
              <h3 className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Purchases</h3>
              {auditPurchases.length === 0 ? (
                <p className="text-white/30 text-sm">No purchase attempts for this member.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-white/30 uppercase">
                      <th className="text-left py-1">Tier / Scope</th>
                      <th className="text-left py-1">Amount</th>
                      <th className="text-left py-1">Payment</th>
                      <th className="text-left py-1">Activation</th>
                      <th className="text-left py-1">Attempts</th>
                      <th className="text-left py-1">Failure</th>
                      <th className="text-left py-1">Created</th>
                      <th className="text-left py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {auditPurchases.map(p => (
                      <tr key={p.id} className="border-t border-white/5">
                        <td className="py-1 text-white/70">{p.tier} · {p.market}/{p.currency}</td>
                        <td className="py-1 text-white/60">{formatCurrencyMinor(p.amountMinor, p.currency)}</td>
                        <td className="py-1 text-white/60">{p.paymentStatus}</td>
                        <td className="py-1 text-white/60">{p.activationStatus}</td>
                        <td className="py-1 text-white/40">{p.activationAttempts}</td>
                        <td className="py-1 text-white/40">{p.failureReason ?? '—'}</td>
                        <td className="py-1 text-white/30">{new Date(p.createdAt).toLocaleString()}</td>
                        <td className="py-1">
                          {p.activationStatus === 'FAILED_PERMANENTLY' && p.paymentStatus === 'SUCCEEDED' && (
                            <button
                              disabled={retryingPurchaseId === p.id}
                              onClick={() => retryActivation(p.id)}
                              className="text-[#C9A84C] font-semibold disabled:opacity-40"
                            >
                              {retryingPurchaseId === p.id ? 'Retrying…' : 'Retry Activation'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {auditTerms && auditTerms.length === 0 && <p className="text-white/30 text-sm">No commercial terms have ever been activated for this member.</p>}
          {auditTerms && auditTerms.map(t => (
            <div key={t.id} className="mb-4 border border-white/8 rounded-lg p-3">
              <p className="text-white text-sm font-semibold">{t.tier} · {t.market}/{t.currency} · policy v{t.policyVersion}</p>
              <p className="text-white/40 text-xs mb-2">
                Activated {new Date(t.activatedAt).toLocaleDateString()} · Expires {new Date(t.expiresAt).toLocaleDateString()} · Fee discount {t.serviceFeeDiscountPercent}% · Source {t.source}
              </p>
              {t.benefits.map(b => (
                <div key={b.id} className="ml-2 mb-2">
                  <p className="text-white/70 text-xs font-semibold">{b.benefitName} ({b.entitlementType})</p>
                  {b.entitlementType === 'COUNT_PER_PERIOD' && (
                    <table className="w-full text-xs mt-1">
                      <thead>
                        <tr className="text-white/30 uppercase"><th className="text-left py-1">Slot</th><th className="text-left py-1">Status</th><th className="text-left py-1">Reserved By</th><th className="text-left py-1">Consumed</th><th className="text-left py-1">Events</th><th className="text-left py-1">Actions</th></tr>
                      </thead>
                      <tbody>
                        {b.slots.map(s => (
                          <tr key={s.id} className="border-t border-white/5">
                            <td className="py-1 text-white/60">#{s.slotNumber}</td>
                            <td className="py-1 text-white/60">{s.status}</td>
                            <td className="py-1 text-white/40 font-mono">{s.reservedBy ?? '—'}</td>
                            <td className="py-1 text-white/40">{s.consumedAt ? new Date(s.consumedAt).toLocaleString() : '—'}</td>
                            <td className="py-1 text-white/30">{s.events.map(e => e.eventType).join(' → ')}</td>
                            <td className="py-1 flex gap-2">
                              {s.status === 'CONSUMED' && <button onClick={() => reverseSlot(s.id)} className="text-red-400 font-semibold">Reverse</button>}
                              {s.status === 'REVERSED' && <button onClick={() => replaceSlot(b.id)} className="text-[#C9A84C] font-semibold">Grant Replacement</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {b.entitlementType === 'BOOLEAN_ELIGIBILITY' && (
                    <p className="text-white/40 text-xs">Eligible: {b.booleanEligible ? 'Yes' : 'No'}</p>
                  )}
                  {b.entitlementType === 'COST_CAPPED' && (
                    <p className="text-white/40 text-xs">Cost cap: {b.costCapMinorUsd ?? '—'} (minor USD)</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Sane-range guard for a hand-typed annual price — catches an obvious
// fat-finger (an extra/missing zero, a price of "0") before it ever
// reaches the server. Deliberately generous (this repo prices in many
// currencies) — this is a typo trap, not a business rule.
const MIN_SANE_ANNUAL_PRICE_MAJOR = 1
const MAX_SANE_ANNUAL_PRICE_MAJOR = 10_000_000

function NewPolicyForm({ onCreate }: {
  onCreate: (form: { tier: string; market: string; currency: string; annualPriceMinor: string; durationMonths: string; serviceFeeDiscountPercent: string; effectiveFrom: string }) => void
}) {
  const [tier, setTier] = useState(COMMERCIAL_TIERS[0])
  const [market, setMarket] = useState('')
  const [currency, setCurrency] = useState('')
  // Admin types a MAJOR-currency amount (e.g. "85000" for ₦85,000, not the
  // minor-unit integer) — this is the exact 99-vs-9900 bug fix: the old
  // raw "Annual Price (minor)" field had zero unit conversion, so an admin
  // typing "99" (meaning $99) silently created a $0.99 policy instead of a
  // $9,900.00 one silently doubling as $99.00 in the wrong direction. This
  // field is converted through lib/currency.ts's decimalToMinor, never a
  // bare "* 100".
  const [annualPriceMajor, setAnnualPriceMajor] = useState('')
  const [durationMonths, setDurationMonths] = useState('12')
  const [serviceFeeDiscountPercent, setServiceFeeDiscountPercent] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')

  const parsedMajor = parseFloat(annualPriceMajor)
  const priceValid = currency.trim().length > 0 && Number.isFinite(parsedMajor)
    && parsedMajor >= MIN_SANE_ANNUAL_PRICE_MAJOR && parsedMajor <= MAX_SANE_ANNUAL_PRICE_MAJOR
  const minorPreview = priceValid ? decimalToMinor(parsedMajor, currency) : null

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Tier">
        <select value={tier} onChange={e => setTier(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
          {COMMERCIAL_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Market"><input value={market} onChange={e => setMarket(e.target.value)} placeholder="e.g. NG" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-20" /></Field>
      <Field label="Currency"><input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="e.g. NGN" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-20" /></Field>
      <Field label={`Annual Price (${currency || 'major units'})`}>
        <input
          value={annualPriceMajor}
          onChange={e => setAnnualPriceMajor(e.target.value)}
          type="number" step="0.01" placeholder="e.g. 85000"
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-28"
        />
        {annualPriceMajor && (
          <span className={`text-[10px] mt-0.5 ${priceValid ? 'text-white/30' : 'text-red-400'}`}>
            {priceValid && minorPreview !== null
              ? `= ${formatCurrencyMinor(minorPreview, currency)} (${minorPreview} minor units)`
              : currency ? 'Out of sane range — check for a typo' : 'Enter a currency first'}
          </span>
        )}
      </Field>
      <Field label="Duration (months)"><input value={durationMonths} onChange={e => setDurationMonths(e.target.value)} type="number" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-20" /></Field>
      <Field label="Fee Discount %"><input value={serviceFeeDiscountPercent} onChange={e => setServiceFeeDiscountPercent(e.target.value)} type="number" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-20" /></Field>
      <Field label="Effective From"><input value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} type="date" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white" /></Field>
      <button
        disabled={!market || !currency || !priceValid || minorPreview === null || !serviceFeeDiscountPercent || !effectiveFrom}
        onClick={() => onCreate({ tier, market, currency, annualPriceMinor: String(minorPreview), durationMonths, serviceFeeDiscountPercent, effectiveFrom })}
        className="text-xs font-semibold text-[#C9A84C] disabled:opacity-40 border border-[#C9A84C]/40 rounded-lg px-3 py-1.5"
      >
        Create Draft
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-white/30 uppercase">{label}</span>
      {children}
    </label>
  )
}

function PolicyBenefitsPanel({ policyId, benefits, editable, onAdd }: {
  policyId: string
  benefits: PolicyBenefitRow[]
  editable: boolean
  onAdd: (form: { benefitKey: string; entitlementType: string; countPerPeriod: string; costCapMinorUsd: string; booleanEligible: boolean }) => void
}) {
  const [benefitKey, setBenefitKey] = useState('')
  const [entitlementType, setEntitlementType] = useState(ENTITLEMENT_TYPES[0])
  const [countPerPeriod, setCountPerPeriod] = useState('')
  const [costCapMinorUsd, setCostCapMinorUsd] = useState('')
  const [booleanEligible, setBooleanEligible] = useState(true)

  return (
    <div>
      <table className="w-full text-xs mb-3">
        <thead>
          <tr className="text-white/30 uppercase"><th className="text-left py-1">Benefit Key</th><th className="text-left py-1">Type</th><th className="text-left py-1">Value</th></tr>
        </thead>
        <tbody>
          {benefits.length === 0 && <tr><td colSpan={3} className="py-2 text-white/30">No benefit rows configured for this policy version yet.</td></tr>}
          {benefits.map(b => (
            <tr key={b.id} className="border-t border-white/5">
              <td className="py-1 text-white/70">{b.benefitKey}</td>
              <td className="py-1 text-white/50">{b.entitlementType}</td>
              <td className="py-1 text-white/50">
                {b.entitlementType === 'COUNT_PER_PERIOD' && `${b.countPerPeriod}× per period`}
                {b.entitlementType === 'COST_CAPPED' && `${b.costCapMinorUsd} minor USD cap`}
                {b.entitlementType === 'BOOLEAN_ELIGIBILITY' && (b.booleanEligible ? 'Eligible' : 'Not eligible')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Benefit Key"><input value={benefitKey} onChange={e => setBenefitKey(e.target.value)} placeholder="e.g. jade-connect" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-40" /></Field>
          <Field label="Entitlement Type">
            <select value={entitlementType} onChange={e => setEntitlementType(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
              {ENTITLEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          {entitlementType === 'COUNT_PER_PERIOD' && (
            <Field label="Count / Period"><input value={countPerPeriod} onChange={e => setCountPerPeriod(e.target.value)} type="number" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-20" /></Field>
          )}
          {entitlementType === 'COST_CAPPED' && (
            <Field label="Cost Cap (minor USD)"><input value={costCapMinorUsd} onChange={e => setCostCapMinorUsd(e.target.value)} type="number" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-28" /></Field>
          )}
          {entitlementType === 'BOOLEAN_ELIGIBILITY' && (
            <Field label="Eligible">
              <select value={booleanEligible ? 'yes' : 'no'} onChange={e => setBooleanEligible(e.target.value === 'yes')} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
                <option value="yes">Yes</option><option value="no">No</option>
              </select>
            </Field>
          )}
          <button
            disabled={!benefitKey}
            onClick={() => onAdd({ benefitKey, entitlementType, countPerPeriod, costCapMinorUsd, booleanEligible })}
            className="text-xs font-semibold text-[#C9A84C] disabled:opacity-40 border border-[#C9A84C]/40 rounded-lg px-3 py-1.5"
          >
            Add Benefit
          </button>
        </div>
      ) : (
        <p className="text-white/30 text-xs">This policy is {policyId ? 'no longer DRAFT' : ''} — benefit rows are immutable once ACTIVE.</p>
      )}
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

function AdjustForm({ userId, tier, status, expiresAt, saving, onSave }: {
  userId: string; tier: string; status: string; expiresAt: string | null; saving: boolean
  onSave: (userId: string, tier: string, status: string, expiresAtChanged: boolean, expiresAt: string) => void
}) {
  const initialExpiresAt = toDateInputValue(expiresAt)
  const [t, setT] = useState(tier)
  const [s, setS] = useState(status)
  const [exp, setExp] = useState(initialExpiresAt)
  useEffect(() => { setT(tier); setS(status); setExp(toDateInputValue(expiresAt)) }, [tier, status, expiresAt])
  // EXPIRED requires an expiresAt (server-enforced); ACTIVE/EXPIRING reject a
  // past one — surface this in the UI so the date field appears exactly
  // when a change would otherwise be rejected server-side.
  const expiresAtRequired = s === 'EXPIRED' && !exp
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <select value={t} onChange={e => setT(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-xs text-white">
          {TIERS.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select value={s} onChange={e => setS(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-xs text-white">
          {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <button
          disabled={saving || expiresAtRequired}
          onClick={() => onSave(userId, t, s, exp !== initialExpiresAt, exp)}
          className="text-xs font-semibold text-[#C9A84C] disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={exp}
          onChange={e => setExp(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-xs text-white"
        />
        <span className="text-[10px] text-white/30">
          {expiresAtRequired ? 'Required for EXPIRED' : 'Expires (optional)'}
        </span>
      </div>
    </div>
  )
}
