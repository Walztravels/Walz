// app/business/(portal)/[orgId]/layout.tsx — Walz Business (V1-B)
//
// Makes the current organization's `organizationType` available to
// BusinessSidebar/BusinessMobileNav (via OrgTypeContext) so the nav can
// show "Employees"/"Clients" instead of the generic "Travellers" label, and
// hide the items REFERRAL_PARTNER organizations are denied on. This is
// COSMETIC ONLY — see components/business/OrgTypeContext.tsx. The real
// authorization boundary is each page's own independent server-side gate;
// this layout changes no access decision anywhere.
//
// Gated with assertOrgScopedAccess (the SAME gate the organization-profile
// route — app/api/business/organizations/[id]/route.ts — already uses, no
// minRole): any ACTIVE member, including a REFERRAL_PARTNER member, may
// load the shell and reach the pages they ARE allowed (Dashboard/Team/
// Settings). Deliberately NOT assertAgencyOrCorporateAccess here — that
// gate would 404 this entire layout (and therefore every page beneath it,
// Team and Settings included) for REFERRAL_PARTNER members, which is too
// broad: they are only denied Travellers/Requests, not the whole org shell.
//
// Session-gated here too, same redirect target as every page beneath it —
// defense in depth, identical pattern to the existing top-level
// app/business/(portal)/layout.tsx.

import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import { OrgTypeContext } from '@/components/business/OrgTypeContext'
import type { OrganizationType } from '@/lib/business/organization-type'

export const dynamic = 'force-dynamic'

export default async function OrgScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}`)

  const access = await assertOrgScopedAccess(session.user.id, params.orgId)
  if (!access.ok) notFound()

  const organization = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { organizationType: true },
  })
  if (!organization) notFound()

  return (
    <OrgTypeContext.Provider value={organization.organizationType as OrganizationType}>
      {children}
    </OrgTypeContext.Provider>
  )
}
