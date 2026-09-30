'use client'

// app/admin/business/[orgId]/requests/[requestId]/page.tsx — Walz Business
// (Release 2) staff travel-request detail + service linking.
//
// Linking uses SEARCH/SELECT only (GET .../link-candidates) — staff never
// paste a raw record id. The link route re-verifies everything server-side:
// the service belongs to this request, the request to this organization,
// the record exists, and the record is not already linked to ANOTHER
// organization (serializable transaction), and the record's owner is a
// member/traveller of this organization. Every link/unlink needs a reason
// and is audited. If ownership cannot be verified the server answers
// OWNERSHIP_UNVERIFIED and this page offers an explicit, separately-reasoned
// staff override (never an automatic retry).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Panel, ErrorBanner, SuccessBanner, Badge, statusTone, fmtDate, fmtDateTime, postJson,
  ReasonForm, humanizeAction, inputCls, ghostButtonCls,
} from '../../../_components/ui'

const SERVICE_TYPES = ['FLIGHT', 'HOTEL', 'VISA', 'TRANSFER', 'ESIM', 'ITINERARY'] as const
const ALLOWED: Record<string, string[]> = {
  FLIGHT: ['QUOTE', 'ITINERARY', 'TRIP'], HOTEL: ['QUOTE', 'ITINERARY', 'TRIP'], TRANSFER: ['QUOTE', 'ITINERARY', 'TRIP'],
  ESIM: ['QUOTE', 'ITINERARY', 'TRIP'], ITINERARY: ['ITINERARY', 'QUOTE', 'TRIP'], VISA: ['VISA_APPLICATION'],
}
const KIND_LABEL: Record<string, string> = { QUOTE: 'Quote', VISA_APPLICATION: 'Visa case', ITINERARY: 'Itinerary', TRIP: 'Trip' }

interface LinkView { kind: string; id: string; reference: string | null; title: string | null; status: string | null; detail: string | null; currency?: string | null; total?: string | null }
interface Detail {
  request: { id: string; title: string | null; notes: string | null; status: string; createdAt: string; requester: string | null; requesterRole: string | null }
  travellers: Array<{ id: string; firstName: string; lastName: string; email: string | null; linked: boolean }>
  services: Array<{ id: string; serviceType: string; createdAt: string; links: LinkView[] }>
  approvals: Array<{ id: string; decision: string; decidedAt: string | null; reason: string | null; approver: string; approverRole: string | null; createdAt: string }>
  timeline: Array<{ id: string; action: string; at: string; actor: string }>
}
interface Candidate { id: string; label: string; sublabel: string | null; status: string | null; alreadyLinkedInThisOrganization: boolean }

export default function AdminRequestDetailPage({ params }: { params: { orgId: string; requestId: string } }) {
  const orgBase = `/api/admin/business/organizations/${encodeURIComponent(params.orgId)}`
  const url = `${orgBase}/requests/${encodeURIComponent(params.requestId)}`
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newType, setNewType] = useState<string>('FLIGHT')

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch(url)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error ?? 'Failed to load'); return }
    setData(body)
  }, [url])
  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <Link href={`/admin/business/${params.orgId}`} className="text-white/50 text-xs hover:text-white focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50 rounded">
        ← Back to organization
      </Link>
      <ErrorBanner message={error} />
      {data && (
        <>
          <div className="flex items-center gap-3 mt-2 mb-1 flex-wrap">
            <h1 className="text-white text-xl font-bold">{data.request.title || '(untitled request)'}</h1>
            <Badge tone={statusTone(data.request.status)}>{data.request.status}</Badge>
          </div>
          <p className="text-white/50 text-sm mb-4">
            Requested by {data.request.requester ?? 'a member'}{data.request.requesterRole ? ` (${data.request.requesterRole})` : ''} on {fmtDate(data.request.createdAt)}
          </p>

          {data.request.notes && (
            <Panel title="Notes"><p className="text-white/70 text-sm whitespace-pre-wrap">{data.request.notes}</p></Panel>
          )}

          <Panel title="Travellers">
            {data.travellers.length === 0 ? <p className="text-white/50 text-sm">No travellers named on this request.</p> : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.travellers.map(t => (
                  <li key={t.id} className="text-white">{t.firstName} {t.lastName} <span className="text-white/40 text-xs">{t.email}</span> {t.linked && <Badge tone="good">account linked</Badge>}</li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Services">
            {data.services.length === 0 && <p className="text-white/50 text-sm mb-3">No services yet.</p>}
            <div className="flex flex-col gap-3 mb-4">
              {data.services.map(s => <ServiceCard key={s.id} orgBase={orgBase} requestId={params.requestId} service={s} onChange={load} />)}
            </div>
            <ReasonForm
              label="Add service"
              submitLabel="Add service"
              onSubmit={async reason => {
                const r = await postJson(`${url}/services`, { serviceType: newType, reason })
                if (!r.ok) return r.data.error ?? 'Failed'
                load(); return null
              }}
            >
              <select aria-label="Service type" value={newType} onChange={e => setNewType(e.target.value)} className={`${inputCls} text-sm`}>
                {SERVICE_TYPES.map(t => <option key={t} value={t} className="bg-[#0f1c33]">{t}</option>)}
              </select>
            </ReasonForm>
          </Panel>

          <Panel title="Approval history">
            {data.approvals.length === 0 ? <p className="text-white/50 text-sm">No approval decisions yet.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.approvals.map(a => (
                  <li key={a.id} className="text-white/80">
                    <Badge tone={statusTone(a.decision)}>{a.decision}</Badge> by {a.approver}{a.approverRole ? ` (${a.approverRole})` : ''}
                    {a.decidedAt && <span className="text-white/40 text-xs"> · {fmtDateTime(a.decidedAt)}</span>}
                    {a.reason && <p className="text-white/60 text-xs mt-0.5">“{a.reason}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Timeline">
            {data.timeline.length === 0 ? <p className="text-white/50 text-sm">No recorded activity.</p> : (
              <ol className="flex flex-col gap-1 text-sm">
                {data.timeline.map(t => (
                  <li key={t.id} className="text-white/70"><span className="text-white/40 text-xs">{fmtDateTime(t.at)}</span> — {humanizeAction(t.action)} <span className="text-white/40">by {t.actor}</span></li>
                ))}
              </ol>
            )}
          </Panel>
        </>
      )}
    </div>
  )
}

function ServiceCard({ orgBase, requestId, service, onChange }: {
  orgBase: string; requestId: string; service: Detail['services'][number]; onChange: () => void
}) {
  const allowed = ALLOWED[service.serviceType] ?? []
  const [kind, setKind] = useState(allowed[0] ?? 'QUOTE')
  const [q, setQ] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState<string | null>(null)
  // Set only when the server returned OWNERSHIP_UNVERIFIED for this exact
  // selection; holds the original link reason so the override resends it.
  const [overrideFor, setOverrideFor] = useState<{ targetId: string; kind: string; reason: string } | null>(null)
  const linkUrl = `${orgBase}/requests/${encodeURIComponent(requestId)}/services/${encodeURIComponent(service.id)}/link`
  const linkedKinds = new Set(service.links.map(l => l.kind))

  useEffect(() => {
    setSelected(null)
    setOverrideFor(null)
    if (q.trim().length < 2) { setCandidates([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${orgBase}/link-candidates?kind=${kind}&q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        const body = await res.json().catch(() => ({}))
        setCandidates(res.ok ? body.candidates ?? [] : [])
      } catch { /* aborted */ }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, kind, orgBase])

  return (
    <div className="border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <Badge tone="gold">{service.serviceType}</Badge>
        <span className="text-white/40 text-xs">added {fmtDate(service.createdAt)}</span>
      </div>
      <ErrorBanner message={err} />
      <SuccessBanner message={msg} />
      {service.links.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {service.links.map(l => (
            <li key={`${l.kind}:${l.id}`} className="text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge>{KIND_LABEL[l.kind] ?? l.kind}</Badge>
                <span className="text-white">{l.reference ?? ''} {l.title ?? ''}</span>
                {l.status && <span className="text-white/40 text-xs">{l.status}</span>}
                {l.total && <span className="text-white/40 text-xs">{l.currency} {l.total}</span>}
                <button type="button" className={ghostButtonCls} onClick={() => setUnlinking(unlinking === l.kind ? null : l.kind)}>Unlink…</button>
              </div>
              {unlinking === l.kind && (
                <div className="mt-2">
                  <ReasonForm label={`Unlink ${KIND_LABEL[l.kind]}`} submitLabel="Unlink" onSubmit={async reason => {
                    const r = await postJson(linkUrl, { action: 'unlink', kind: l.kind, reason })
                    if (!r.ok) return r.data.error ?? 'Failed'
                    setUnlinking(null); onChange(); return null
                  }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {allowed.some(k => !linkedKinds.has(k)) && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 flex-wrap">
            <select aria-label="Record type to link" value={kind} onChange={e => { setKind(e.target.value); setQ('') }} className={`${inputCls} text-sm`}>
              {allowed.filter(k => !linkedKinds.has(k)).map(k => <option key={k} value={k} className="bg-[#0f1c33]">{KIND_LABEL[k]}</option>)}
            </select>
            <input
              aria-label={`Search ${KIND_LABEL[kind]} by reference, title or client`}
              placeholder={`Search ${KIND_LABEL[kind]?.toLowerCase()} by reference, title or client…`}
              value={q}
              onChange={e => setQ(e.target.value)}
              className={`${inputCls} text-sm flex-[1_1_260px]`}
            />
          </div>
          {candidates.length > 0 && !selected && (
            <ul role="listbox" className="border border-white/10 rounded-xl overflow-hidden">
              {candidates.map(c => (
                <li key={c.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => setSelected(c)}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 focus:bg-white/5 focus:outline-none">
                    <span className="block text-white text-sm">{c.label}</span>
                    <span className="block text-white/40 text-xs">{c.sublabel}{c.status ? ` · ${c.status}` : ''}{c.alreadyLinkedInThisOrganization ? ' · already used in this organization' : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && candidates.length === 0 && <p className="text-white/40 text-xs">No linkable records match. Records that belong to another organization are never shown.</p>}
          {selected && (
            <ReasonForm
              label={`Link ${KIND_LABEL[kind]}`}
              submitLabel="Link"
              onSubmit={async reason => {
                setMsg(null); setErr(null)
                setOverrideFor(null)
                const r = await postJson(linkUrl, { action: 'link', kind, targetId: selected.id, reason })
                if (!r.ok) {
                  if (r.data.error === 'OWNERSHIP_UNVERIFIED') {
                    setOverrideFor({ targetId: selected.id, kind, reason })
                    return r.data.message ?? 'Ownership could not be verified'
                  }
                  return r.data.error ?? 'Failed'
                }
                setSelected(null); setQ(''); setMsg('Linked.'); onChange(); return null
              }}
            >
              <span className="text-white text-sm">{selected.label}</span>
              <button type="button" className={ghostButtonCls} onClick={() => { setSelected(null); setOverrideFor(null) }}>Change</button>
            </ReasonForm>
          )}
          {selected && overrideFor && overrideFor.targetId === selected.id && overrideFor.kind === kind && (
            <div className="border border-amber-400/30 rounded-xl p-3 flex flex-col gap-2">
              <p className="text-amber-200/80 text-xs">
                Override the ownership check: link this record even though its owner is not a verified member or traveller of this organization. Requires a separate override reason and is audited.
              </p>
              <ReasonForm
                label="Override ownership check"
                submitLabel="Override and link"
                onSubmit={async overrideReason => {
                  setMsg(null); setErr(null)
                  const r = await postJson(linkUrl, {
                    action: 'link', kind: overrideFor.kind, targetId: overrideFor.targetId, reason: overrideFor.reason,
                    confirmOverride: true, overrideReason,
                  })
                  if (!r.ok) return r.data.error ?? 'Failed'
                  setOverrideFor(null); setSelected(null); setQ(''); setMsg('Linked (override).'); onChange(); return null
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
