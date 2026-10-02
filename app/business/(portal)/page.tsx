// app/business/page.tsx — Walz Business portal home.
// Session-gated. Lists the organizations the caller belongs to (ACTIVE
// membership rows only), or an empty state if none.
//
// Release 2: also shows the caller's OWN pending invitations (INVITED
// memberships of the signed-in user only) with an Accept action, and a
// per-organization "needs your attention" count (requests awaiting a
// decision) for members in the approval tier. Every figure here is scoped
// to the signed-in user's own memberships — nothing crosses an org boundary.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'
import { ORG_ROLE_RANK } from '@/lib/business/authz'
import AcceptInviteButton from './AcceptInviteButton'

export const dynamic = 'force-dynamic'

const BLOCKED_ORG_STATUSES = ['SUSPENDED', 'CLOSED']

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

export default async function BusinessPortalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/business/login?callbackUrl=/business')
  const userId = session.user.id

  const [memberships, invitations] = await Promise.all([
    prisma.organizationMembership.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { organization: { select: { id: true, legalName: true, tradingName: true, status: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.organizationMembership.findMany({
      where: { userId, status: 'INVITED' },
      include: { organization: { select: { id: true, legalName: true, tradingName: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Approval-tier members: count requests in THEIR org awaiting a decision
  // that they have not decided themselves yet.
  const approverMemberships = memberships.filter(m => rank(m.role) >= ORG_ROLE_RANK.APPROVER)
  const pendingCounts = new Map<string, number>()
  await Promise.all(approverMemberships.map(async m => {
    const n = await prisma.travelRequest.count({
      where: {
        organizationId: m.organizationId,
        status: { in: ['SUBMITTED', 'AWAITING_APPROVAL'] },
        NOT: { approvals: { some: { approverMembershipId: m.id, decision: { not: 'PENDING' } } } },
      },
    })
    pendingCounts.set(m.organizationId, n)
  }))

  const openInvitations = invitations.filter(i => !BLOCKED_ORG_STATUSES.includes(i.organization.status))

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Walz Business</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>Organizations you belong to.</p>

      {openInvitations.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Pending invitations</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openInvitations.map(i => (
              <li key={i.id} style={{ padding: 16, border: '1px solid #e6d9a8', background: '#fffbea', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{i.organization.tradingName ?? i.organization.legalName}</div>
                  <div style={{ color: '#666', fontSize: 13 }}>Invited as {i.role.replace('_', ' ').toLowerCase()}</div>
                </div>
                <AcceptInviteButton orgId={i.organization.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {memberships.length === 0 ? (
        <p style={{ color: '#666' }}>
          You are not a member of any organization yet. Ask your organization&apos;s admin to invite you.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memberships.map(m => {
            const pending = pendingCounts.get(m.organizationId) ?? 0
            return (
              <li key={m.id}>
                <Link
                  href={`/business/${m.organization.id}`}
                  style={{
                    display: 'block', padding: 16, border: '1px solid #ddd', borderRadius: 8,
                    textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{m.organization.tradingName ?? m.organization.legalName}</div>
                  <div style={{ color: '#666', fontSize: 13 }}>Your role: {m.role}</div>
                  {pending > 0 && (
                    <div style={{ color: '#8a5a00', fontSize: 13, marginTop: 4, fontWeight: 600 }}>
                      {pending} request{pending === 1 ? '' : 's'} awaiting your approval
                    </div>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
