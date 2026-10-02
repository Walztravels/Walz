// app/business/[orgId]/settings/page.tsx — Walz Business (V1-B)
//
// Surfaces: organization name/identity, organization TYPE (read-only — no
// reclassification UI; that is staff-only via the dedicated admin route,
// out of scope here), organization status, default currency, the current
// user's own role, and the existing brand-settings fields.
//
// Gate: assertOrgScopedAccess(userId, orgId) — the EXACT same gate (no
// minRole) as app/api/business/organizations/[id]/route.ts GET and
// app/api/business/organizations/[id]/brand-settings/route.ts GET: any
// ACTIVE member, including a REFERRAL_PARTNER member, may view their own
// organization's settings. The brand-settings EDIT form is gated to
// ADMIN-tier and above, matching that route's PATCH minRole exactly — the
// route itself re-enforces this independently regardless of what this page
// renders.

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import prisma from '@/lib/db'
import { assertOrgScopedAccess, ORG_ROLE_RANK } from '@/lib/business/authz'
import { Card, SectionHeader, PageHeader } from '@/components/business/PortalUI'
import BrandSettingsForm from './BrandSettingsForm'

export const dynamic = 'force-dynamic'

function rank(role: string) {
  return (ORG_ROLE_RANK as Record<string, number>)[role] ?? 0
}

const TYPE_LABEL: Record<string, string> = {
  CORPORATE: 'Corporate',
  TRAVEL_AGENCY: 'Travel agency',
  REFERRAL_PARTNER: 'Referral partner',
}
const STATUS_LABEL: Record<string, string> = {
  LEAD: 'Lead', ONBOARDING: 'Onboarding', ACTIVE: 'Active', SUSPENDED: 'Suspended', CLOSED: 'Closed',
}

export default async function SettingsPage({ params }: { params: { orgId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(`/business/login?callbackUrl=/business/${params.orgId}/settings`)

  // Same gate as GET organization profile / GET brand-settings — no minRole,
  // any ACTIVE member (including REFERRAL_PARTNER) may view this page.
  const access = await assertOrgScopedAccess(session.user.id, params.orgId)
  if (!access.ok) notFound()

  const canEditBrand = rank(access.membership.role) >= ORG_ROLE_RANK.ADMIN

  const [organization, brandSettings] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: params.orgId },
      select: { legalName: true, tradingName: true, status: true, defaultCurrency: true, organizationType: true },
    }),
    prisma.organizationBrandSettings.findUnique({ where: { organizationId: params.orgId } }),
  ])
  if (!organization) notFound()

  const identity = [
    { label: 'Legal name', value: organization.legalName },
    { label: 'Trading name', value: organization.tradingName ?? '—' },
    { label: 'Organization type', value: TYPE_LABEL[organization.organizationType] ?? organization.organizationType },
    { label: 'Status', value: STATUS_LABEL[organization.status] ?? organization.status },
    { label: 'Default currency', value: organization.defaultCurrency },
    { label: 'Your role', value: access.membership.role.replace('_', ' ') },
  ]

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Travel management" title="Settings" description="Your organization's identity and presentation." />

      <Card className="mb-6">
        <SectionHeader title="Organization" />
        <dl className="px-5 py-4 grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {identity.map(row => (
            <div key={row.label}>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{row.label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-[#0B1F3A]">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="px-5 pb-4 text-xs text-slate-400">
          Organization type and status are set by Walz Travels and cannot be changed from the portal.
        </p>
      </Card>

      <Card>
        <SectionHeader title="Brand presentation" />
        <div className="px-5 py-5">
          {canEditBrand ? (
            <BrandSettingsForm
              orgId={params.orgId}
              initial={{
                displayName: brandSettings?.displayName ?? null,
                logoUrl: brandSettings?.logoUrl ?? null,
                brandColor: brandSettings?.brandColor ?? null,
                supportEmail: brandSettings?.supportEmail ?? null,
                supportPhone: brandSettings?.supportPhone ?? null,
                clientFacingSenderName: brandSettings?.clientFacingSenderName ?? null,
                whiteLabelEnabled: brandSettings?.whiteLabelEnabled ?? false,
              }}
            />
          ) : (
            <p className="text-sm text-slate-500">
              Only an organization admin or owner can edit brand presentation settings.
              {brandSettings?.displayName && <> Current display name: <strong>{brandSettings.displayName}</strong>.</>}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
