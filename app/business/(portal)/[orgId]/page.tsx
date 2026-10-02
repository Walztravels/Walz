// app/business/[orgId]/page.tsx — Walz Business portal: Dashboard (V1-B
// redesign).
//
// Session-gated + org-membership-gated via assertOrgScopedAccess (the same
// helper every API route in this domain uses — no separate access logic
// here). This mirrors the pre-existing gate on this exact page; it is
// deliberately NOT upgraded to assertAgencyOrCorporateAccess, because a
// REFERRAL_PARTNER member must still be able to load SOME dashboard (their
// organization identity, Team, Settings) — see the inline note below on how
// the Requests/Travellers summaries are independently suppressed for them.
//
// V1-B layout (top to bottom): organization welcome (name only — status,
// type, currency, role and internal ids now live on Settings, never here) →
// Open requests → Awaiting your approval → Travellers/Employees/Clients
// summary card → Quick actions → Recent activity. The inline
// "Create travel request" form has been REMOVED from this page entirely —
// it now lives on the Requests page (app/business/(portal)/[orgId]/requests)
// per the V1-B scope.
//
// Documents Requiring Action: OMITTED. There is no existing query that can
// honestly produce "documents this member must act on" without inventing a
// requirements model that doesn't exist yet (VisaApplication's own
// outstanding-document state is not surfaced anywhere in this domain today,
// and the visa-document content route is gated behind
// assertVisaDocumentAccess, a narrower capability than plain dashboard
// access) — building that would be new backend work, which is out of scope.
//
// REFERRAL_PARTNER DATA SUPPRESSION: TravelRequest and BusinessTraveller
// data are both on the REFERRAL_PARTNER deny-list (see
// lib/business/org-type-gate.ts and the dedicated API routes for this
// data). Because this page queries Prisma directly rather than through
// those gated routes, it independently skips those two queries entirely —
// not just hides the resulting UI — whenever organizationType is
// REFERRAL_PARTNER, so no denied-category data is ever fetched for them,
// let alone rendered. The equivalent audit-log entries are filtered out of
// Recent Activity for the same reason.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, ORG_ROLE_RANK } from '@/lib/business/authz'
import { claimState } from '@/lib/business/claim'
import { Card, SectionHeader, EmptyState, StatCard, PageHeader } from '@/components/business/PortalUI'
import { RequestStatusBadge } from '@/components/business/Badge'
import {
  ClipboardList, Users, UserPlus, Settings as SettingsIcon, CheckCircle2, ArrowRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const PENDING_STATUSES = ['SUBMITTED', 'AWAITING_APPROVAL']
const DENIED_FOR_REFERRAL_PARTNER_ENTITY_TYPES = ['BusinessTraveller', 'TravelRequest', 'TravelApproval']

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

function travellerNoun(organizationType: string): string {
  if (organizationType === 'CORPORATE') return 'Employees'
  if (organizationType === 'TRAVEL_AGENCY') return 'Clients'
  return 'Travellers'
}

function humanAction(action: string) {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtRelative(d: Date) {
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d)
}

export default async function BusinessOrganizationPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}`)

  const access = await assertOrgScopedAccess(session.user.id, params.orgId)
  // Fail closed exactly like the API routes — a non-member sees the generic
  // "not found" page, never a "you don't have permission" page that would
  // reveal the organization exists.
  if (!access.ok) notFound()

  const isFloorRole = access.membership.role === 'TRAVELLER'
  const myRank = rank(access.membership.role)
  const canApprove = myRank >= ORG_ROLE_RANK.APPROVER
  const canManage = myRank >= ORG_ROLE_RANK.TRAVEL_MANAGER
  const canInviteTeammate = myRank >= ORG_ROLE_RANK.ADMIN
  const seesRoster = !isFloorRole && myRank >= ORG_ROLE_RANK.COORDINATOR

  const organization = await prisma.organization.findUnique({
    where: { id: params.orgId },
    select: { id: true, legalName: true, tradingName: true, organizationType: true },
  })
  if (!organization) notFound()

  // See the REFERRAL_PARTNER DATA SUPPRESSION note above — these two
  // Prisma calls are never even issued for a REFERRAL_PARTNER organization.
  const isReferralPartner = organization.organizationType === 'REFERRAL_PARTNER'

  const [requests, travellerCount, unlinkedCount, awaitingMe, auditRows] = await Promise.all([
    isReferralPartner
      ? Promise.resolve([])
      : prisma.travelRequest.findMany({
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
          take: 8,
        }),
    isReferralPartner || !seesRoster ? Promise.resolve(0) : prisma.businessTraveller.count({ where: { organizationId: params.orgId } }),
    isReferralPartner || !seesRoster
      ? Promise.resolve(0)
      : prisma.businessTraveller
          .findMany({
            where: { organizationId: params.orgId },
            select: { userId: true, claimVerificationToken: true, claimTokenExpiresAt: true },
            take: 500,
          })
          .then(rows => rows.filter(t => claimState(t) !== 'claimed').length),
    isReferralPartner || !canApprove
      ? Promise.resolve([])
      : prisma.travelRequest.findMany({
          where: {
            organizationId: params.orgId,
            status: { in: PENDING_STATUSES },
            NOT: { approvals: { some: { approverMembershipId: access.membership.id, decision: { not: 'PENDING' } } } },
          },
          orderBy: { createdAt: 'asc' },
          take: 10,
        }),
    prisma.businessAuditLog.findMany({
      where: { organizationId: params.orgId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const visibleAuditRows = (isReferralPartner
    ? auditRows.filter(r => !DENIED_FOR_REFERRAL_PARTNER_ENTITY_TYPES.includes(r.entityType))
    : auditRows
  ).slice(0, 6)
  const actorIds = Array.from(new Set(visibleAuditRows.map(r => r.actorUserId).filter((v): v is string => !!v)))
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : []
  const actorName = new Map(actors.map(u => [u.id, u.name ?? u.email ?? 'Member']))

  const openRequests = requests.filter(r => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(r.status))
  const orgName = organization.tradingName ?? organization.legalName
  const noun = travellerNoun(organization.organizationType)

  return (
    <div className="max-w-6xl">
      <PageHeader eyebrow="Welcome back" title={orgName} />

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Open requests" value={openRequests.length} hint={isFloorRole ? 'Yours' : 'Organization-wide'} />
        {canApprove && !isReferralPartner && (
          <StatCard label="Awaiting your approval" value={awaitingMe.length} tone={awaitingMe.length > 0 ? 'gold' : 'default'} />
        )}
        {seesRoster && !isReferralPartner && (
          <StatCard label={noun} value={travellerCount} hint={unlinkedCount > 0 ? `${unlinkedCount} not linked yet` : 'All linked'} />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {canApprove && !isReferralPartner && (
            <Card>
              <SectionHeader title="Awaiting your approval" />
              {awaitingMe.length === 0 ? (
                <EmptyState title="Nothing waiting on you" description="Requests that need your decision will show up here." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {awaitingMe.map(r => (
                    <li key={r.id}>
                      <Link href={`/business/${params.orgId}/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                        <span className="text-sm font-medium text-[#0B1F3A] truncate">{r.title || '(untitled request)'}</span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#8a6d1f] flex-shrink-0">
                          Review <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {!isReferralPartner && (
            <Card>
              <SectionHeader
                title={isFloorRole ? 'Your travel requests' : 'Open requests'}
                action={<Link href={`/business/${params.orgId}/requests`} className="text-xs font-semibold text-[#0B1F3A] hover:underline">View all →</Link>}
              />
              {requests.length === 0 ? (
                <EmptyState
                  title="No travel requests yet"
                  description={canManage ? 'Create your first travel request to get started.' : 'Your organization has not created any travel requests yet.'}
                  action={canManage ? (
                    <Link href={`/business/${params.orgId}/requests`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1F3A] text-white text-sm font-medium hover:bg-[#122a4d] transition-colors">
                      New travel request
                    </Link>
                  ) : undefined}
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {requests.slice(0, 6).map(r => (
                    <li key={r.id}>
                      <Link href={`/business/${params.orgId}/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                        <span className="text-sm font-medium text-[#0B1F3A] truncate">{r.title || '(untitled request)'}</span>
                        <RequestStatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <SectionHeader title="Recent activity" />
            {visibleAuditRows.length === 0 ? (
              <EmptyState title="No recent activity" description="Actions taken in this organization will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {visibleAuditRows.map(r => (
                  <li key={r.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <span className="text-sm text-slate-600">
                      <span className="font-medium text-[#0B1F3A]">{r.actorUserId ? actorName.get(r.actorUserId) ?? 'A member' : 'Walz Travels'}</span>
                      {' '}{humanAction(r.action).toLowerCase()}
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">{fmtRelative(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeader title="Quick actions" />
            <div className="p-4 flex flex-col gap-2">
              {canManage && !isReferralPartner && (
                <Link href={`/business/${params.orgId}/requests`} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-[#0B1F3A] hover:bg-slate-50 transition-colors">
                  <ClipboardList className="w-4 h-4 text-slate-400" aria-hidden="true" /> New travel request
                </Link>
              )}
              {canInviteTeammate && (
                <Link href={`/business/${params.orgId}/team`} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-[#0B1F3A] hover:bg-slate-50 transition-colors">
                  <UserPlus className="w-4 h-4 text-slate-400" aria-hidden="true" /> Invite a teammate
                </Link>
              )}
              {seesRoster && !isReferralPartner && (
                <Link href={`/business/${params.orgId}/travellers`} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-[#0B1F3A] hover:bg-slate-50 transition-colors">
                  <Users className="w-4 h-4 text-slate-400" aria-hidden="true" /> Manage {noun.toLowerCase()}
                </Link>
              )}
              <Link href={`/business/${params.orgId}/settings`} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium text-[#0B1F3A] hover:bg-slate-50 transition-colors">
                <SettingsIcon className="w-4 h-4 text-slate-400" aria-hidden="true" /> Organization settings
              </Link>
            </div>
          </Card>

          {!canApprove && !canManage && (
            <Card>
              <SectionHeader title="All caught up" />
              <div className="px-5 py-6 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-slate-500">Nothing needs your attention right now.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
