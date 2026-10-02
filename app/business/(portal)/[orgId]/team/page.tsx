// app/business/[orgId]/team/page.tsx — Walz Business (V1-B)
// Membership roster + invite UI, moved here from the Dashboard.
//
// Gate: assertOrgScopedAccess(userId, orgId, { minRole: 'COORDINATOR' }) —
// the EXACT same gate and minRole as
// app/api/business/organizations/[id]/members/route.ts GET (the floor
// TRAVELLER role is denied the full roster, matching that route). This is
// the plain org-scoped gate, NOT assertAgencyOrCorporateAccess — Team is not
// on the REFERRAL_PARTNER deny-list (members/route.ts never used the
// org-type gate), so REFERRAL_PARTNER organizations keep normal Team access.
//
// Invite control is gated to ADMIN-tier and above, matching the POST
// route's own minRole — InviteMemberForm itself is still only ever rendered
// for that tier, and the API route re-enforces it independently regardless.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, ORG_ROLE_RANK } from '@/lib/business/authz'
import { Card, EmptyState, PageHeader } from '@/components/business/PortalUI'
import { MembershipStatusBadge } from '@/components/business/Badge'
import InviteMemberForm from './InviteMemberForm'

export const dynamic = 'force-dynamic'

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

export default async function TeamPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}/team`)

  // Same gate + minRole as GET .../members — the floor TRAVELLER role never
  // reaches the full roster here either.
  const access = await assertOrgScopedAccess(session.user.id, params.orgId, { minRole: 'COORDINATOR' })
  if (!access.ok) notFound()

  const canInvite = rank(access.membership.role) >= ORG_ROLE_RANK.ADMIN

  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: params.orgId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Travel management" title="Team" description="Everyone with access to this organization's Walz Business portal." />

      {canInvite && (
        <div className="mb-6">
          <InviteMemberForm orgId={params.orgId} />
        </div>
      )}

      <Card>
        {members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0B1F3A] truncate">{m.user?.name ?? m.user?.email ?? 'Member'}</p>
                  {m.user?.name && m.user?.email && <p className="text-xs text-slate-400 truncate">{m.user.email}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{m.role.replace('_', ' ')}</span>
                  <MembershipStatusBadge status={m.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
