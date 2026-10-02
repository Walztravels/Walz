// app/business/(portal)/layout.tsx — Walz Business (V1-A)
//
// Applies the authenticated BusinessShell to every route inside this route
// group: /business and /business/[orgId] (and their future children). The
// (portal) segment is a Next.js route group — it is excluded from the URL,
// so this layout does not change either path.
//
// /business/login, /business/register and /business/invitations/[token]
// live OUTSIDE this group and never receive this shell — they have no
// session/org context yet (see those routes' own lighter layouts).
//
// Session-gated here in addition to the per-page checks already in
// page.tsx / [orgId]/page.tsx (defense in depth, same redirect target —
// those checks are unchanged otherwise). The ACTIVE-membership query below
// is the exact pattern already used by app/business/(portal)/page.tsx,
// reused here only to decide whether OrgSwitcher renders (2+ orgs).

import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { BusinessShell } from '@/components/business/BusinessShell'

export const dynamic = 'force-dynamic'

export default async function BusinessPortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/business/login?callbackUrl=/business')

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: session.user.id, status: 'ACTIVE' },
    include: { organization: { select: { id: true, legalName: true, tradingName: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const organizations = memberships.map(m => ({
    id: m.organization.id,
    name: m.organization.tradingName ?? m.organization.legalName,
  }))

  return (
    <BusinessShell
      user={{ name: session.user.name ?? null, email: session.user.email ?? null }}
      organizations={organizations}
    >
      {children}
    </BusinessShell>
  )
}
