'use client'

// app/admin/business/[orgId]/page.tsx — Walz Business (Release 2) staff
// organization detail: Overview / People / Travellers / Requests / Services
// / Audit.
//
// Every read goes through the org-scoped admin GET endpoints under
// app/api/admin/business/organizations/[id]/** ('b2b'); every mutation goes
// through a dedicated route that re-checks 'b2b.manage', requires a reason,
// and writes a before/after audit row. This page never writes anything the
// server has not independently validated (e.g. the account manager picker
// is a convenience — the server re-verifies an ACTIVE Staff row).
//
// The organization is identified by legalName/tradingName throughout; the
// raw id appears only as a small "support reference".

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SUPPORTED_ORG_CURRENCIES, orgCurrencyLabel } from '@/lib/business/currency'
import { VALID_STATUSES } from '@/lib/business/organization-status'
import { VALID_ORGANIZATION_TYPES } from '@/lib/business/organization-type'
import {
  Panel, ErrorBanner, SuccessBanner, Badge, statusTone, fmtDate, fmtDateTime, postJson,
  ReasonForm, humanizeAction, inputCls, ghostButtonCls,
} from '../_components/ui'
import StaffPicker, { type StaffOption } from '../_components/StaffPicker'

const TABS = ['Overview', 'People', 'Travellers', 'Requests', 'Services', 'Audit'] as const
type Tab = (typeof TABS)[number]

interface Overview {
  organization: {
    id: string; legalName: string; tradingName: string | null; registrationNumber: string | null; country: string
    billingAddress: string | null; businessEmail: string; businessPhone: string | null; status: string
    accountManagerId: string | null; defaultCurrency: string; market: string | null; createdAt: string
    organizationType: string
  }
  accountManager: { name: string | null; email: string; isActive: boolean } | null
  counts: { members: number; invited: number; travellers: number; requests: number; pendingRequests: number }
}

function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    if (!url) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(url)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to load')
      setData(body as T)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [url])
  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}

export default function AdminOrganizationDetailPage({ params }: { params: { orgId: string } }) {
  const orgId = params.orgId
  const base = `/api/admin/business/organizations/${encodeURIComponent(orgId)}`
  const [tab, setTab] = useState<Tab>('Overview')
  const overview = useJson<Overview>(base)

  const org = overview.data?.organization
  const displayName = org ? org.tradingName ?? org.legalName : 'Organization'

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <Link href="/admin/business" className="text-white/50 text-xs hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded">
        ← All organizations
      </Link>
      <div className="flex items-center gap-3 mt-2 mb-1 flex-wrap">
        <h1 className="text-white text-xl font-bold">{displayName}</h1>
        {org && <Badge tone={statusTone(org.status)}>{org.status}</Badge>}
        {org && <Badge tone="gold">{org.defaultCurrency}</Badge>}
        {org && <Badge>{org.organizationType}</Badge>}
      </div>
      {org && org.tradingName && <p className="text-white/50 text-sm">Legal name: {org.legalName}</p>}

      <ErrorBanner message={overview.error} />

      <nav className="flex gap-1 mt-4 mb-4 border-b border-white/10 overflow-x-auto" aria-label="Organization sections">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={tab === t ? 'page' : undefined}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded-t ${tab === t ? 'border-[#C9A84C] text-white' : 'border-transparent text-white/50 hover:text-white'}`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && overview.data && <OverviewTab base={base} data={overview.data} reload={overview.reload} />}
      {tab === 'People' && <PeopleTab base={base} />}
      {tab === 'Travellers' && <TravellersTab base={base} />}
      {tab === 'Requests' && <RequestsTab base={base} orgId={orgId} />}
      {tab === 'Services' && <ServicesTab base={base} orgId={orgId} />}
      {tab === 'Audit' && <AuditTab base={base} />}

      {org && (
        <p className="text-white/30 text-[11px] mt-8">Support reference: <span className="font-mono">{org.id}</span></p>
      )}
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ base, data, reload }: { base: string; data: Overview; reload: () => void }) {
  const { organization: org, accountManager, counts } = data
  const [status, setStatus] = useState(org.status)
  const [currency, setCurrency] = useState(org.defaultCurrency)
  const [organizationType, setOrganizationType] = useState(org.organizationType)
  const [manager, setManager] = useState<StaffOption | null>(null)

  const rows: Array<[string, string]> = [
    ['Legal name', org.legalName],
    ['Trading name', org.tradingName ?? '—'],
    ['Registration no.', org.registrationNumber ?? '—'],
    ['Country', org.country],
    ['Market', org.market ?? '—'],
    ['Business email', org.businessEmail],
    ['Business phone', org.businessPhone ?? '—'],
    ['Billing address', org.billingAddress ?? '—'],
    ['Organization type', org.organizationType],
    ['Created', fmtDate(org.createdAt)],
  ]

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {([
          ['Active members', counts.members], ['Invited', counts.invited], ['Travellers', counts.travellers],
          ['Requests', counts.requests], ['Awaiting approval', counts.pendingRequests],
        ] as Array<[string, number]>).map(([label, n]) => (
          <div key={label} className="bg-[#0f1c33] rounded-xl border border-white/8 p-3">
            <p className="text-white/40 text-[11px] uppercase">{label}</p>
            <p className="text-white text-lg font-bold">{n}</p>
          </div>
        ))}
      </div>

      <Panel title="Profile">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="text-white/40 w-36 shrink-0">{k}</dt>
              <dd className="text-white/80 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Account manager">
        <p className="text-white/70 text-sm mb-3">
          {accountManager
            ? <>{accountManager.name ?? 'Unknown staff'} <span className="text-white/40">({accountManager.email})</span>{!accountManager.isActive && <> <Badge tone="bad">inactive</Badge></>}</>
            : 'No account manager assigned.'}
        </p>
        <ReasonForm
          label="Change account manager"
          submitLabel={manager ? 'Assign' : 'Clear'}
          disabled={!manager && !accountManager}
          onSubmit={async reason => {
            const r = await postJson(`${base}/account-manager`, { accountManagerEmail: manager?.email ?? null, reason })
            if (!r.ok) return r.data.error ?? 'Failed'
            setManager(null); reload(); return null
          }}
        >
          <StaffPicker value={manager} onChange={setManager} />
        </ReasonForm>
      </Panel>

      <Panel title="Lifecycle status">
        <ReasonForm
          label="Change status"
          submitLabel="Change status"
          disabled={status === org.status}
          onSubmit={async reason => {
            const r = await postJson(`${base}/status`, { status, reason })
            if (!r.ok) return r.data.error ?? 'Failed'
            reload(); return null
          }}
        >
          <select aria-label="New status" value={status} onChange={e => setStatus(e.target.value)} className={`${inputCls} text-sm`}>
            {VALID_STATUSES.map(s => <option key={s} value={s} className="bg-[#0f1c33]">{s}</option>)}
          </select>
        </ReasonForm>
      </Panel>

      <Panel title="Billing currency">
        <p className="text-white/50 text-xs mb-3">
          Changes the default currency for new work going forward only. Existing quotes, trips and invoices keep their own currency.
        </p>
        <ReasonForm
          label="Change currency"
          submitLabel="Change currency"
          disabled={currency === org.defaultCurrency}
          onSubmit={async reason => {
            const r = await postJson(`${base}/currency`, { currency, reason })
            if (!r.ok) return r.data.error ?? 'Failed'
            reload(); return null
          }}
        >
          <select aria-label="New currency" value={currency} onChange={e => setCurrency(e.target.value)} className={`${inputCls} text-sm`}>
            {SUPPORTED_ORG_CURRENCIES.map(c => <option key={c} value={c} className="bg-[#0f1c33]">{orgCurrencyLabel(c)}</option>)}
          </select>
        </ReasonForm>
      </Panel>

      <Panel title="Organization type">
        <p className="text-white/50 text-xs mb-3">
          CORPORATE arranges travel for its own employees; TRAVEL_AGENCY runs cases on behalf of its own clients; REFERRAL_PARTNER is denied access to traveller/booking/visa-document management.
        </p>
        <ReasonForm
          label="Change organization type"
          submitLabel="Change type"
          disabled={organizationType === org.organizationType}
          onSubmit={async reason => {
            const r = await postJson(`${base}/organization-type`, { organizationType, reason })
            if (!r.ok) return r.data.error ?? 'Failed'
            reload(); return null
          }}
        >
          <select aria-label="New organization type" value={organizationType} onChange={e => setOrganizationType(e.target.value)} className={`${inputCls} text-sm`}>
            {VALID_ORGANIZATION_TYPES.map(t => <option key={t} value={t} className="bg-[#0f1c33]">{t}</option>)}
          </select>
        </ReasonForm>
      </Panel>
    </>
  )
}

// ── People ──────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string; name: string | null; email: string | null; role: string; status: string
  invitedBy: string | null; joinedAt: string | null; createdAt: string
  capabilities: Array<{ id: string; capability: string; grantedAt: string }>
}

function PeopleTab({ base }: { base: string }) {
  const { data, error, loading, reload } = useJson<{ members: MemberRow[] }>(`${base}/members`)
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <Panel title="Members">
      <ErrorBanner message={error} />
      {loading && !data && <p className="text-white/50 text-sm">Loading…</p>}
      {data && data.members.length === 0 && <p className="text-white/50 text-sm">No members yet.</p>}
      {data && data.members.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase">
                <th className="text-left px-3 py-2">Member</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Joined</th>
                <th className="text-left px-3 py-2">Visa documents</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map(m => {
                const hasVisa = m.capabilities.some(c => c.capability === 'VISA_DOCUMENTS_VIEW')
                const baseline = m.role === 'ADMIN' || m.role === 'OWNER'
                const eligible = !baseline && m.role !== 'TRAVELLER' && m.status === 'ACTIVE'
                return (
                  <tr key={m.id} className="border-t border-white/5 hover:bg-white/3 transition-colors align-top">
                    <td className="px-3 py-2 text-white">{m.name ?? m.email ?? 'Member'}<span className="block text-white/40 text-xs">{m.email}</span></td>
                    <td className="px-3 py-2 text-white/70">{m.role}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                    <td className="px-3 py-2 text-white/60">{fmtDate(m.joinedAt)}</td>
                    <td className="px-3 py-2 text-white/60">
                      {baseline ? <Badge tone="good">By role (Admin/Owner)</Badge>
                        : hasVisa ? <Badge tone="gold">Explicit grant</Badge>
                        : <span className="text-white/40 text-xs">No access</span>}
                      {(eligible || hasVisa) && (
                        <div className="mt-2">
                          {editing === m.id ? (
                            <ReasonForm
                              label={hasVisa ? 'Revoke visa-document access' : 'Grant visa-document access'}
                              submitLabel={hasVisa ? 'Revoke' : 'Grant'}
                              onSubmit={async reason => {
                                const r = await postJson(`${base}/members/${m.id}/capabilities`, {
                                  capability: 'VISA_DOCUMENTS_VIEW', action: hasVisa ? 'revoke' : 'grant', reason,
                                })
                                if (!r.ok) return r.data.error ?? 'Failed'
                                setEditing(null); reload(); return null
                              }}
                            />
                          ) : (
                            <button type="button" className={ghostButtonCls} onClick={() => setEditing(m.id)}>
                              {hasVisa ? 'Revoke access…' : 'Grant access…'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ── Travellers ──────────────────────────────────────────────────────────────

interface TravellerRow {
  id: string; firstName: string; lastName: string; email: string; phone: string | null; status: string
  createdAt: string; linked: boolean; claimState: 'claimed' | 'pending' | 'expired' | 'none'
}

function TravellersTab({ base }: { base: string }) {
  const { data, error, loading, reload } = useJson<{ travellers: TravellerRow[] }>(`${base}/travellers`)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function sendClaim(id: string) {
    setBusy(id); setMsg(null); setErr(null)
    const r = await postJson(`${base}/travellers/${id}/claim`, {})
    setBusy(null)
    if (!r.ok) { setErr(r.data.error ?? 'Failed'); return }
    setMsg(r.data.emailSent ? 'Claim invitation emailed.' : 'Claim invitation created, but the email could not be sent.')
    reload()
  }

  const claimLabel: Record<TravellerRow['claimState'], string> = { claimed: 'Linked', pending: 'Invite pending', expired: 'Invite expired', none: 'Not invited' }

  return (
    <Panel title="Travellers">
      <ErrorBanner message={error ?? err} />
      <SuccessBanner message={msg} />
      {loading && !data && <p className="text-white/50 text-sm">Loading…</p>}
      {data && data.travellers.length === 0 && <p className="text-white/50 text-sm">No travellers yet.</p>}
      {data && data.travellers.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase">
                <th className="text-left px-3 py-2">Traveller</th>
                <th className="text-left px-3 py-2">Phone</th>
                <th className="text-left px-3 py-2">Account</th>
                <th className="text-left px-3 py-2">Added</th>
                <th className="text-left px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.travellers.map(t => (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2 text-white">{t.firstName} {t.lastName}<span className="block text-white/40 text-xs">{t.email}</span></td>
                  <td className="px-3 py-2 text-white/60">{t.phone ?? '—'}</td>
                  <td className="px-3 py-2"><Badge tone={statusTone(t.claimState)}>{claimLabel[t.claimState]}</Badge></td>
                  <td className="px-3 py-2 text-white/60">{fmtDate(t.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    {!t.linked && (
                      <button type="button" className={ghostButtonCls} disabled={busy === t.id} onClick={() => sendClaim(t.id)}>
                        {busy === t.id ? 'Sending…' : t.claimState === 'none' ? 'Send claim invite' : 'Resend claim invite'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ── Requests ────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string; title: string | null; status: string; createdAt: string; requester: string | null
  travellerCount: number; serviceCount: number; approvalCount: number
}

function RequestsTab({ base, orgId }: { base: string; orgId: string }) {
  const { data, error, loading } = useJson<{ requests: RequestRow[] }>(`${base}/requests`)
  return (
    <Panel title="Travel requests">
      <ErrorBanner message={error} />
      {loading && !data && <p className="text-white/50 text-sm">Loading…</p>}
      {data && data.requests.length === 0 && <p className="text-white/50 text-sm">No travel requests yet.</p>}
      {data && data.requests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase">
                <th className="text-left px-3 py-2">Request</th>
                <th className="text-left px-3 py-2">Requester</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Travellers</th>
                <th className="text-left px-3 py-2">Services</th>
                <th className="text-left px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map(r => (
                <tr key={r.id} className="border-t border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-3 py-2">
                    <Link href={`/admin/business/${orgId}/requests/${r.id}`} className="text-white hover:text-[#C9A84C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded">
                      {r.title || '(untitled request)'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/60">{r.requester ?? '—'}</td>
                  <td className="px-3 py-2"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                  <td className="px-3 py-2 text-white/60">{r.travellerCount}</td>
                  <td className="px-3 py-2 text-white/60">{r.serviceCount}</td>
                  <td className="px-3 py-2 text-white/60">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ── Services ────────────────────────────────────────────────────────────────

interface LinkView { kind: string; id: string; reference: string | null; title: string | null; status: string | null; currency?: string | null; total?: string | null }
interface ServiceView { id: string; serviceType: string; createdAt: string; requestId: string; requestTitle: string | null; links: LinkView[] }

function ServicesTab({ base, orgId }: { base: string; orgId: string }) {
  const { data, error, loading } = useJson<{ services: ServiceView[] }>(`${base}/services`)
  return (
    <Panel title="Linked services">
      <ErrorBanner message={error} />
      {loading && !data && <p className="text-white/50 text-sm">Loading…</p>}
      {data && data.services.length === 0 && <p className="text-white/50 text-sm">No services on any request yet. Add and link services from a request.</p>}
      {data && data.services.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase">
                <th className="text-left px-3 py-2">Service</th>
                <th className="text-left px-3 py-2">Request</th>
                <th className="text-left px-3 py-2">Linked records</th>
              </tr>
            </thead>
            <tbody>
              {data.services.map(s => (
                <tr key={s.id} className="border-t border-white/5 hover:bg-white/3 transition-colors align-top">
                  <td className="px-3 py-2 text-white">{s.serviceType}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/business/${orgId}/requests/${s.requestId}`} className="text-white/70 hover:text-[#C9A84C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded">
                      {s.requestTitle || '(untitled request)'}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/60">
                    {s.links.length === 0 ? <span className="text-white/40 text-xs">Not linked yet</span> : s.links.map(l => (
                      <div key={`${l.kind}:${l.id}`}>
                        <Badge>{l.kind.replace('_', ' ')}</Badge> <span className="text-white/80">{l.reference ?? ''} {l.title ?? ''}</span>
                        {l.status && <span className="text-white/40 text-xs"> · {l.status}</span>}
                        {l.total && <span className="text-white/40 text-xs"> · {l.currency} {l.total}</span>}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

// ── Audit (read-only, append-only) ──────────────────────────────────────────

interface AuditEntry {
  id: string; at: string; action: string; entityType: string; entityId: string | null
  actorType: 'staff' | 'member' | 'system'; actor: string; before: unknown; after: unknown
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex-1 min-w-[180px]">
      <p className="text-white/40 text-[11px] uppercase mb-1">{label}</p>
      <pre className="text-white/70 text-xs bg-black/20 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

function reasonOf(after: unknown): string | null {
  if (after && typeof after === 'object' && 'reason' in (after as Record<string, unknown>)) {
    const r = (after as Record<string, unknown>).reason
    return typeof r === 'string' ? r : null
  }
  return null
}

function AuditTab({ base }: { base: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (before: string | null) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${base}/audit${before ? `?before=${encodeURIComponent(before)}` : ''}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to load audit log')
      setEntries(prev => (before ? [...prev, ...body.entries] : body.entries))
      setNext(body.nextBefore ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => { load(null) }, [load])

  return (
    <Panel title="Audit timeline (read-only)">
      <p className="text-white/40 text-xs mb-3">Append-only record of every change to this organization. Entries cannot be edited or deleted.</p>
      <ErrorBanner message={error} />
      {entries.length === 0 && !loading && <p className="text-white/50 text-sm">No audit entries yet.</p>}
      <ol className="flex flex-col gap-3">
        {entries.map(e => {
          const reason = reasonOf(e.after)
          return (
            <li key={e.id} className="border-l-2 border-[#C9A84C]/40 pl-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-white font-semibold">{humanizeAction(e.action)}</span>
                <Badge>{e.entityType}</Badge>
                <span className="text-white/40 text-xs">{fmtDateTime(e.at)}</span>
              </div>
              <p className="text-white/60 text-xs mt-0.5">
                By {e.actorType === 'staff' ? 'staff' : e.actorType === 'member' ? 'member' : 'system'}: <span className="text-white/80">{e.actor}</span>
              </p>
              {reason && <p className="text-white/70 text-xs mt-1">Reason: <span className="text-white">{reason}</span></p>}
              {(e.before !== null && e.before !== undefined) || (e.after !== null && e.after !== undefined) ? (
                <div className="flex gap-3 mt-2 flex-wrap">
                  <JsonBlock label="Before" value={e.before} />
                  <JsonBlock label="After" value={e.after} />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      {next && (
        <button type="button" className={`${ghostButtonCls} mt-4`} disabled={loading} onClick={() => load(next)}>
          {loading ? 'Loading…' : 'Load older entries'}
        </button>
      )}
    </Panel>
  )
}
