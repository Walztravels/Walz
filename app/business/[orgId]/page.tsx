// app/business/[orgId]/page.tsx — Walz Business (Release 1) portal shell.
// Session-gated + org-membership-gated via assertOrgScopedAccess (the same
// helper every API route in this domain uses — no separate access logic
// here). Shows org name, member list, and a bare-bones "Create Travel
// Request" form. Deliberately minimal.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import CreateRequestForm from './CreateRequestForm'

export const dynamic = 'force-dynamic'

export default async function BusinessOrganizationPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/login?callbackUrl=/business/${params.orgId}`)

  const access = await assertOrgScopedAccess(session.user.id, params.orgId)
  // Fail closed exactly like the API routes — a non-member sees the generic
  // "not found" page, never a "you don't have permission" page that would
  // reveal the organization exists.
  if (!access.ok) notFound()

  const [organization, members, requests] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { id: true, legalName: true, tradingName: true, status: true, defaultCurrency: true },
    }),
    prisma.organizationMembership.findMany({
      where: { organizationId: params.orgId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.travelRequest.findMany({
      where: { organizationId: params.orgId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  if (!organization) notFound()

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {organization.tradingName ?? organization.legalName}
      </h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Status: {organization.status} &middot; Currency: {organization.defaultCurrency} &middot; Your role: {access.membership.role}
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Members</h2>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map(m => (
            <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
              <span>{m.user?.name ?? m.user?.email ?? m.userId}</span>
              <span style={{ color: '#666', fontSize: 13 }}>{m.role} &middot; {m.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Create travel request</h2>
        <CreateRequestForm orgId={params.orgId} />
      </section>

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Recent travel requests</h2>
        {requests.length === 0 ? (
          <p style={{ color: '#666' }}>No travel requests yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {requests.map(r => (
              <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                <span>{r.title || '(untitled)'}</span>
                <span style={{ color: '#666', fontSize: 13 }}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
