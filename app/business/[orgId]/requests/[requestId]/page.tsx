// app/business/[orgId]/requests/[requestId]/page.tsx — Walz Business (R2)
// Travel request detail: title, requester, travellers, notes, linked
// services, status, approval history + Approve/Reject, timeline.
//
// Same two-pronged gate as every API route in this domain:
//   (1) assertOrgScopedAccess(session user, params.orgId) — non-members get
//       the generic not-found page (never a "no permission" page);
//   (2) lib/business/request-detail.ts requires request.organizationId ===
//       params.orgId, and for the floor TRAVELLER role that the caller
//       submitted the request or is a named traveller on it.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, ORG_ROLE_RANK } from '@/lib/business/authz'
import { assertVisaDocumentAccess } from '@/lib/business/capabilities'
import { loadTravelRequestDetail } from '@/lib/business/request-detail'
import ApprovalPanel from './ApprovalPanel'
import ManageRequest from './ManageRequest'
import VisaDocuments from './VisaDocuments'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = { QUOTE: 'Quote', VISA_APPLICATION: 'Visa case', ITINERARY: 'Itinerary', TRIP: 'Trip' }
const FINAL_STATUSES = ['COMPLETED', 'CANCELLED']

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}
function fmt(d: Date | null | undefined) {
  return d ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(d) : '—'
}
function human(action: string) {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default async function TravelRequestDetailPage({ params }: { params: { orgId: string; requestId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/login?callbackUrl=/business/${params.orgId}/requests/${params.requestId}`)

  const access = await assertOrgScopedAccess(session.user.id, params.orgId)
  if (!access.ok) notFound()

  const detail = await loadTravelRequestDetail(params.requestId, params.orgId, {
    kind: 'member', userId: session.user.id, membershipId: access.membership.id, role: access.membership.role,
  })
  if (!detail) notFound()

  const role = access.membership.role
  const canApprove = rank(role) >= ORG_ROLE_RANK.APPROVER && !FINAL_STATUSES.includes(detail.request.status)
  const canManage = rank(role) >= ORG_ROLE_RANK.TRAVEL_MANAGER
  const myApproval = detail.approvals.find(a => a.isMine) ?? null
  const hasVisaService = detail.services.some(s => s.serviceType === 'VISA' && s.links.some(l => l.kind === 'VISA_APPLICATION'))
  const visaAccess = hasVisaService ? (await assertVisaDocumentAccess(session.user.id, params.orgId)).ok : false

  const availableTravellers = canManage
    ? (await prisma.businessTraveller.findMany({
        where: { organizationId: params.orgId, id: { notIn: detail.travellers.map(t => t.id) } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { lastName: 'asc' },
        take: 200,
      })).map(t => ({ id: t.id, name: `${t.firstName} ${t.lastName}` }))
    : []

  const section = { marginBottom: 28 } as const
  const h2 = { fontSize: 16, fontWeight: 600, marginBottom: 8 } as const
  const muted = { color: '#666' } as const

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <Link href={`/business/${params.orgId}`} style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}>← Back to organization</Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px' }}>{detail.request.title || '(untitled request)'}</h1>
      <p style={{ ...muted, marginBottom: 24 }}>
        Status: <strong>{detail.request.status}</strong> &middot; Requested by {detail.request.requester ?? 'a member'} on {fmt(detail.request.createdAt)}
      </p>

      {detail.request.notes && (
        <section style={section}>
          <h2 style={h2}>Notes</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{detail.request.notes}</p>
        </section>
      )}

      <section style={section}>
        <h2 style={h2}>Travellers</h2>
        {detail.travellers.length === 0 ? <p style={muted}>No travellers named yet.</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {detail.travellers.map(t => (
              <li key={t.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
                {t.firstName} {t.lastName}{t.email ? <span style={{ ...muted, fontSize: 13 }}> &middot; {t.email}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>Services</h2>
        {detail.services.length === 0 ? <p style={muted}>No services requested yet.</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {detail.services.map(s => (
              <li key={s.id} style={{ padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
                <div style={{ fontWeight: 600 }}>{s.serviceType}</div>
                {s.links.length === 0 ? <div style={{ ...muted, fontSize: 13 }}>Being arranged by Walz Travels</div> : s.links.map(l => (
                  <div key={`${l.kind}:${l.id}`} style={{ fontSize: 14, marginTop: 4 }}>
                    <span style={{ ...muted, fontSize: 12 }}>{KIND_LABEL[l.kind] ?? l.kind}:</span> {l.reference ?? ''} {l.title ?? ''}
                    {l.status && <span style={{ ...muted, fontSize: 13 }}> &middot; {l.status}</span>}
                    {l.total && <span style={{ ...muted, fontSize: 13 }}> &middot; {l.currency} {l.total}</span>}
                    {l.kind === 'VISA_APPLICATION' && visaAccess && (
                      <VisaDocuments orgId={params.orgId} requestId={params.requestId} serviceId={s.id} />
                    )}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <section style={section}>
          <h2 style={h2}>Manage request</h2>
          <ManageRequest orgId={params.orgId} requestId={params.requestId} availableTravellers={availableTravellers} />
        </section>
      )}

      <section style={section}>
        <h2 style={h2}>Approvals</h2>
        {detail.approvals.length === 0 ? <p style={muted}>No approval decisions yet.</p> : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {detail.approvals.map(a => (
              <li key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}>
                <strong>{a.decision}</strong> by {a.approver}{a.decidedAt ? <span style={{ ...muted, fontSize: 13 }}> &middot; {fmt(a.decidedAt)}</span> : null}
                {a.reason && <div style={{ ...muted, fontSize: 13 }}>&ldquo;{a.reason}&rdquo;</div>}
              </li>
            ))}
          </ul>
        )}
        {canApprove && (
          <ApprovalPanel orgId={params.orgId} requestId={params.requestId} existingDecision={myApproval?.decision ?? null} />
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>Timeline</h2>
        {detail.timeline.length === 0 ? <p style={muted}>No recorded activity yet.</p> : (
          <ol style={{ paddingLeft: 18, margin: 0 }}>
            {detail.timeline.map(t => (
              <li key={t.id} style={{ padding: '3px 0', fontSize: 14 }}>
                <span style={{ ...muted, fontSize: 12 }}>{fmt(t.at)}</span> — {human(t.action)} <span style={muted}>by {t.actor}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

