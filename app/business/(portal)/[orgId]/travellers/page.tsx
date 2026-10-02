// app/business/[orgId]/travellers/page.tsx — Walz Business (V1-B)
// Travellers roster. Reuses BusinessTraveller/travellerKind exactly as-is —
// no new model. Labeled "Employees" for CORPORATE organizations, "Clients"
// for TRAVEL_AGENCY — read server-side from Organization.organizationType,
// never trusted from client state.
//
// Gate: assertAgencyOrCorporateAccess(userId, orgId, { minRole: 'COORDINATOR' })
// — the EXACT same gate and minRole as
// app/api/business/organizations/[id]/travellers/route.ts GET. A
// REFERRAL_PARTNER organization's members are denied the generic 404 here
// regardless of role — this is the real boundary; hiding the nav item for
// them is cosmetic only.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import prisma from '@/lib/db'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { ORG_ROLE_RANK } from '@/lib/business/authz'
import { claimState } from '@/lib/business/claim'
import { Card, EmptyState, PageHeader } from '@/components/business/PortalUI'
import { ClaimStateBadge } from '@/components/business/Badge'
import SendClaimInviteButton from '../SendClaimInviteButton'

export const dynamic = 'force-dynamic'

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

function noun(organizationType: string): { singular: string; plural: string } {
  if (organizationType === 'CORPORATE') return { singular: 'Employee', plural: 'Employees' }
  if (organizationType === 'TRAVEL_AGENCY') return { singular: 'Client', plural: 'Clients' }
  return { singular: 'Traveller', plural: 'Travellers' }
}

export default async function TravellersPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}/travellers`)

  // Same gate + minRole as GET .../travellers — REFERRAL_PARTNER orgs are
  // denied outright, regardless of role.
  const access = await assertAgencyOrCorporateAccess(session.user.id, params.orgId, { minRole: 'COORDINATOR' })
  if (!access.ok) notFound()

  const canManage = rank(access.membership.role) >= ORG_ROLE_RANK.TRAVEL_MANAGER

  const organization = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { organizationType: true },
  })
  if (!organization) notFound()
  const { singular, plural } = noun(organization.organizationType)

  const travellers = await prisma.businessTraveller.findMany({
    where: { organizationId: params.orgId },
    orderBy: { createdAt: 'desc' },
  })
  const now = new Date()
  const rows = travellers.map(t => ({
    id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email, phone: t.phone,
    state: claimState(t, now),
  }))
  const unlinkedCount = rows.filter(t => t.state !== 'claimed').length

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Travel management"
        title={plural}
        description={`People your organization travels for.${unlinkedCount > 0 ? ` ${unlinkedCount} ${unlinkedCount === 1 ? 'has' : 'have'} not linked a Walz account yet.` : ''}`}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={`No ${plural.toLowerCase()} added yet`}
            description={canManage ? `${singular}s added by your organization will appear here.` : undefined}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#0B1F3A] truncate">{t.firstName} {t.lastName}</p>
                  <p className="text-xs text-slate-400 truncate">{t.email}{t.phone ? ` · ${t.phone}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ClaimStateBadge state={t.state} />
                  {canManage && t.state !== 'claimed' && (
                    <SendClaimInviteButton orgId={params.orgId} travellerId={t.id} resend={t.state !== 'none'} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
