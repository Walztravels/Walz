// app/business/[orgId]/requests/page.tsx — Walz Business (V1-B)
// Travel requests list. Links into the existing, UNMODIFIED request detail
// route (app/business/[orgId]/requests/[requestId]).
//
// Gate: assertAgencyOrCorporateAccess(userId, orgId) — the EXACT same gate
// and the same within-org TRAVELLER-row-filter as
// app/api/business/organizations/[id]/requests/route.ts GET. REFERRAL_PARTNER
// organizations are denied the generic 404 here regardless of role — this is
// independent of, and the real boundary behind, the sidebar/mobile-nav hiding
// this item for them.
//
// The only creation flow here is the existing title+notes-only form
// (CreateRequestForm, moved from the removed Dashboard form) for
// TRAVEL_MANAGER-tier members and above, matching the POST route's own
// minRole. No structured TravelRequestService.details UI and no V1-C
// visa-secure-link flow — both explicitly out of scope.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'
import { assertAgencyOrCorporateAccess } from '@/lib/business/org-type-gate'
import { ORG_ROLE_RANK } from '@/lib/business/authz'
import { Card, EmptyState, PageHeader } from '@/components/business/PortalUI'
import { RequestStatusBadge } from '@/components/business/Badge'
import CreateRequestForm from './CreateRequestForm'

export const dynamic = 'force-dynamic'

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d)
}

export default async function RequestsPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}/requests`)

  // Same gate as GET .../requests — REFERRAL_PARTNER orgs are denied
  // outright, regardless of role.
  const access = await assertAgencyOrCorporateAccess(session.user.id, params.orgId)
  if (!access.ok) notFound()

  const isFloorRole = access.membership.role === 'TRAVELLER'
  const canManage = rank(access.membership.role) >= ORG_ROLE_RANK.TRAVEL_MANAGER

  // Identical within-org filter to the GET route — a TRAVELLER sees only
  // what they submitted or are named on, never the org's full list.
  const requests = await prisma.travelRequest.findMany({
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
  })

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
        <PageHeader
          eyebrow="Travel management"
          title={isFloorRole ? 'Your travel requests' : 'Travel requests'}
          description={isFloorRole ? 'Requests you submitted, or that name you as a traveller.' : 'Every travel request raised by your organization.'}
        />
      </div>

      {canManage && (
        <div className="mb-6">
          <CreateRequestForm orgId={params.orgId} />
        </div>
      )}

      <Card>
        {requests.length === 0 ? (
          <EmptyState
            title="No travel requests yet"
            description={canManage ? 'Create your first travel request above to get started.' : 'Nothing has been raised yet.'}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map(r => (
              <li key={r.id}>
                <Link
                  href={`/business/${params.orgId}/requests/${r.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#0B1F3A] truncate">{r.title || '(untitled request)'}</span>
                    <span className="block text-xs text-slate-400 mt-0.5">Created {fmt(r.createdAt)}</span>
                  </span>
                  <RequestStatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
