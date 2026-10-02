// app/business/[orgId]/page.tsx — Walz Business portal: organization home.
// Session-gated + org-membership-gated via assertOrgScopedAccess (the same
// helper every API route in this domain uses — no separate access logic
// here).
//
// Release 2 upgrade — role-scoped sections:
//   - Action items (everyone): what needs this member's attention.
//   - Awaiting your approval (APPROVER tier and above): requests in
//     SUBMITTED/AWAITING_APPROVAL that this member has not decided yet.
//   - Members (COORDINATOR and above — unchanged R1 rule).
//   - Travellers (COORDINATOR and above), with account-link state; the
//     TRAVEL_MANAGER tier can send claim invites.
//   - Create travel request (TRAVEL_MANAGER tier — matches the API minRole).
//   - Requests: TRAVELLER still sees ONLY requests they submitted or are a
//     named traveller on (unchanged R1 protection); everyone else sees the
//     org's recent requests. Each links to the request detail page.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, ORG_ROLE_RANK } from '@/lib/business/authz'
import { claimState } from '@/lib/business/claim'
import CreateRequestForm from './CreateRequestForm'
import SendClaimInviteButton from './SendClaimInviteButton'

export const dynamic = 'force-dynamic'

const PENDING_STATUSES = ['SUBMITTED', 'AWAITING_APPROVAL']

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

export default async function BusinessOrganizationPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}`)

  const access = await assertOrgScopedAccess(session.user.id, params.orgId)
  // Fail closed exactly like the API routes — a non-member sees the generic
  // "not found" page, never a "you don't have permission" page that would
  // reveal the organization exists.
  if (!access.ok) notFound()

  // SECURITY FIX (delta review): this page queries Prisma directly rather
  // than the API routes, so it must apply the SAME within-org visibility
  // narrowing those routes now enforce, independently — see
  // app/api/business/organizations/[id]/members/route.ts and
  // .../requests/route.ts for the matching logic and rationale.
  const isFloorRole = access.membership.role === 'TRAVELLER'
  const myRank = rank(access.membership.role)
  const canApprove = myRank >= ORG_ROLE_RANK.APPROVER
  const canManage = myRank >= ORG_ROLE_RANK.TRAVEL_MANAGER
  const seesRoster = !isFloorRole && myRank >= ORG_ROLE_RANK.COORDINATOR

  const [organization, members, requests, travellers, awaitingMe] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { id: true, legalName: true, tradingName: true, status: true, defaultCurrency: true, organizationType: true },
    }),
    seesRoster
      ? prisma.organizationMembership.findMany({
          where: { organizationId: params.orgId },
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : Promise.resolve([]),
    prisma.travelRequest.findMany({
      where: isFloorRole
        ? {
            organizationId: params.orgId,
            OR: [
              { submittedByMembershipId: access.membership.id },
              { travellers: { some: { businessTraveller: { userId: session.user.id } } } },
            ],
          }
        : { organizationId: params.orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    seesRoster
      ? prisma.businessTraveller.findMany({
          where: { organizationId: params.orgId },
          select: { id: true, firstName: true, lastName: true, email: true, userId: true, claimVerificationToken: true, claimTokenExpiresAt: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      : Promise.resolve([]),
    canApprove
      ? prisma.travelRequest.findMany({
          where: {
            organizationId: params.orgId,
            status: { in: PENDING_STATUSES },
            NOT: { approvals: { some: { approverMembershipId: access.membership.id, decision: { not: 'PENDING' } } } },
          },
          orderBy: { createdAt: 'asc' },
          take: 20,
        })
      : Promise.resolve([]),
  ])

  if (!organization) notFound()

  const now = new Date()
  // Derive the display state server-side and drop the token immediately —
  // it never leaves this function.
  const travellerRows = travellers.map(t => ({
    id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email, state: claimState(t, now),
  }))
  const unlinkedCount = travellerRows.filter(t => t.state !== 'claimed').length
  const myDrafts = requests.filter(r => r.status === 'DRAFT' && r.submittedByMembershipId === access.membership.id).length

  const actionItems: string[] = []
  if (awaitingMe.length > 0) actionItems.push(`${awaitingMe.length} travel request${awaitingMe.length === 1 ? '' : 's'} awaiting your approval`)
  if (canManage && myDrafts > 0) actionItems.push(`${myDrafts} draft request${myDrafts === 1 ? '' : 's'} you created`)
  if (canManage && unlinkedCount > 0) actionItems.push(`${unlinkedCount} traveller${unlinkedCount === 1 ? ' has' : 's have'} not linked a Walz account yet`)

  const claimLabel = { claimed: 'Account linked', pending: 'Invite sent', expired: 'Invite expired', none: 'Not linked' } as const

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {organization.tradingName ?? organization.legalName}
      </h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Status: {organization.status} &middot; Currency: {organization.defaultCurrency} &middot; Type: {organization.organizationType} &middot; Your role: {access.membership.role}
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Action items</h2>
        {actionItems.length === 0 ? (
          <p style={{ color: '#666' }}>Nothing needs your attention right now.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {actionItems.map(a => <li key={a} style={{ padding: '2px 0' }}>{a}</li>)}
          </ul>
        )}
      </section>

      {canApprove && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Awaiting your approval</h2>
          {awaitingMe.length === 0 ? (
            <p style={{ color: '#666' }}>No requests are waiting on you.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {awaitingMe.map(r => (
                <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                  <Link href={`/business/${params.orgId}/requests/${r.id}`} style={{ color: 'inherit' }}>{r.title || '(untitled)'}</Link>
                  <span style={{ color: '#8a5a00', fontSize: 13 }}>Review &rarr;</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Members</h2>
        {!seesRoster ? (
          <p style={{ color: '#666' }}>Your role does not include visibility into the full member list.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {members.map(m => (
              <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                <span>{m.user?.name ?? m.user?.email ?? 'Member'}</span>
                <span style={{ color: '#666', fontSize: 13 }}>{m.role} &middot; {m.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {seesRoster && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Travellers</h2>
          {travellerRows.length === 0 ? (
            <p style={{ color: '#666' }}>No travellers added yet.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {travellerRows.map(t => (
                <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
                  <span>{t.firstName} {t.lastName} <span style={{ color: '#888', fontSize: 13 }}>{t.email}</span></span>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#666', fontSize: 13 }}>{claimLabel[t.state]}</span>
                    {canManage && t.state !== 'claimed' && (
                      <SendClaimInviteButton orgId={params.orgId} travellerId={t.id} resend={t.state !== 'none'} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Create travel request</h2>
          <CreateRequestForm orgId={params.orgId} />
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          {isFloorRole ? 'Your travel requests' : 'Recent travel requests'}
        </h2>
        {requests.length === 0 ? (
          <p style={{ color: '#666' }}>No travel requests yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {requests.map(r => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                <Link href={`/business/${params.orgId}/requests/${r.id}`} style={{ color: 'inherit' }}>{r.title || '(untitled)'}</Link>
                <span style={{ color: '#666', fontSize: 13 }}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
