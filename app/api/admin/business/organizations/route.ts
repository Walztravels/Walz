// app/api/admin/business/organizations/route.ts — Staff admin surface for
// Walz Business (Release 1).
//
// GET  — list all Organizations. Requires 'b2b'.
// POST — create a new Organization. Requires 'b2b.manage'. This is the ONLY
//        organization-creation path in Release 1 — there is no self-service
//        signup route anywhere in this domain.
//
// SECURITY FIX (delta review after the independent security review's MEDIUM
// finding): creation can no longer set an arbitrary lifecycle status — every
// new Organization enters ONBOARDING, full stop. Reaching ACTIVE (or any
// other status) is a separate, explicit, audited transition — see
// app/api/admin/business/organizations/[id]/status/route.ts. This mirrors
// the "no automatic/silent lifecycle jump" principle already established in
// this codebase (Jade Club's JadeClubMembership never starts anywhere but
// FREE; a status change is always its own audited admin action).
// `accountManagerId` (a Staff.email string, per the schema comment) is now
// verified against a real, active Staff row before the Organization is
// created — a typo'd or made-up email is rejected rather than silently
// stored, closing the "arbitrary string" gap the review flagged.
//
// RELEASE 2: `defaultCurrency` is now REQUIRED and must be one of
// lib/business/currency.ts::SUPPORTED_ORG_CURRENCIES. The R1 silent 'GBP'
// fallback is gone for every organization created from now on. Existing
// organizations are never touched by this route; their currency only
// changes via the dedicated, audited [id]/currency/route.ts action.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'
import { CREATION_STATUS } from '@/lib/business/organization-status'
import { parseOrgCurrency, SUPPORTED_ORG_CURRENCIES } from '@/lib/business/currency'
import { DEFAULT_ORGANIZATION_TYPE, parseOrganizationType, VALID_ORGANIZATION_TYPES } from '@/lib/business/organization-type'
import { issueOrganizationInvitation } from '@/lib/business/invitations'
import { sendOrganizationInvitationEmail } from '@/lib/business/invitation-email'

export const dynamic = 'force-dynamic'
// Every Organization is created in CREATION_STATUS ('ONBOARDING'),
// unconditionally. The POST body's `status` field (if a caller sends one)
// is intentionally ignored — see the removed destructure below. The only
// other place Organization.status may be written is the dedicated
// [id]/status/route.ts transition endpoint.

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'b2b')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const query = (req.nextUrl.searchParams.get('query') ?? '').trim()

  const typeParam = (req.nextUrl.searchParams.get('type') ?? '').trim()
  let organizationTypeFilter: string | undefined
  if (typeParam) {
    const parsedType = parseOrganizationType(typeParam)
    if (!parsedType) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_ORGANIZATION_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
    organizationTypeFilter = parsedType
  }

  const where: Record<string, unknown> = {}
  if (query) {
    where.OR = [
      { legalName: { contains: query, mode: 'insensitive' } },
      { tradingName: { contains: query, mode: 'insensitive' } },
      { businessEmail: { contains: query, mode: 'insensitive' } },
    ]
  }
  if (organizationTypeFilter) {
    where.organizationType = organizationTypeFilter
  }

  const organizations = await prisma.organization.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json({ organizations })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'b2b.manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    legalName, tradingName, registrationNumber, country, billingAddress,
    businessEmail, businessPhone, accountManagerId, defaultCurrency, market,
    organizationType: rawOrganizationType,
  } = (body ?? {}) as Record<string, unknown>
  // `status` is deliberately NOT destructured/accepted here — see the
  // module header. Any status field a caller sends is silently ignored.

  if (typeof legalName !== 'string' || !legalName.trim()) {
    return NextResponse.json({ error: 'legalName is required' }, { status: 400 })
  }
  if (typeof country !== 'string' || !country.trim()) {
    return NextResponse.json({ error: 'country is required' }, { status: 400 })
  }
  if (typeof businessEmail !== 'string' || !businessEmail.trim()) {
    return NextResponse.json({ error: 'businessEmail is required' }, { status: 400 })
  }

  const currency = parseOrgCurrency(defaultCurrency)
  if (!currency) {
    return NextResponse.json(
      { error: `defaultCurrency is required and must be one of: ${SUPPORTED_ORG_CURRENCIES.join(', ')}` },
      { status: 400 },
    )
  }

  // organizationType is OPTIONAL at creation — omitted/empty defaults to
  // DEFAULT_ORGANIZATION_TYPE (CORPORATE). A present-but-invalid value is
  // rejected (fail closed), same as defaultCurrency above.
  let organizationType = DEFAULT_ORGANIZATION_TYPE
  const organizationTypeOmitted =
    rawOrganizationType === undefined ||
    rawOrganizationType === null ||
    (typeof rawOrganizationType === 'string' && rawOrganizationType.trim() === '')
  if (!organizationTypeOmitted) {
    const parsedOrganizationType = parseOrganizationType(rawOrganizationType)
    if (!parsedOrganizationType) {
      return NextResponse.json(
        { error: `organizationType must be one of: ${VALID_ORGANIZATION_TYPES.join(', ')}` },
        { status: 400 },
      )
    }
    organizationType = parsedOrganizationType
  }

  let verifiedAccountManagerId: string | null = null
  if (accountManagerId !== undefined && accountManagerId !== null) {
    if (typeof accountManagerId !== 'string' || !accountManagerId.trim()) {
      return NextResponse.json({ error: 'accountManagerId must be a non-empty string' }, { status: 400 })
    }
    const email = accountManagerId.trim().toLowerCase()
    const staff = await prisma.staff.findUnique({ where: { email }, select: { email: true, isActive: true } })
    if (!staff || !staff.isActive) {
      return NextResponse.json({ error: 'accountManagerId must be an active Staff email' }, { status: 400 })
    }
    verifiedAccountManagerId = staff.email
  }

  const organization = await prisma.organization.create({
    data: {
      legalName: legalName.trim(),
      tradingName: typeof tradingName === 'string' ? tradingName.trim() : null,
      registrationNumber: typeof registrationNumber === 'string' ? registrationNumber.trim() : null,
      country: country.trim(),
      billingAddress: typeof billingAddress === 'string' ? billingAddress.trim() : null,
      businessEmail: businessEmail.trim().toLowerCase(),
      businessPhone: typeof businessPhone === 'string' ? businessPhone.trim() : null,
      status: CREATION_STATUS,
      accountManagerId: verifiedAccountManagerId,
      defaultCurrency: currency,
      market: typeof market === 'string' ? market.trim() : null,
      organizationType,
    },
  })

  await recordBusinessAudit({
    organizationId: organization.id,
    actorStaffId: session.staffId ?? session.email,
    action: 'organization.create',
    entityType: 'Organization',
    entityId: organization.id,
    after: {
      legalName: organization.legalName,
      businessEmail: organization.businessEmail,
      status: organization.status,
      defaultCurrency: organization.defaultCurrency,
      accountManagerId: organization.accountManagerId ?? null,
      organizationType: organization.organizationType,
    },
  })

  // RELEASE 2.2 Slice B: auto-trigger the bootstrap invitation for the
  // organization's businessEmail as OWNER, right at creation — the same
  // issueOrganizationInvitation()/sendOrganizationInvitationEmail() pair the
  // standalone [id]/invitations/route.ts bootstrap route already uses, just
  // invoked automatically instead of requiring a separate staff action.
  // `role: 'OWNER'` is hardcoded for THIS call site only; the standalone
  // route still accepts an admin-chosen role for subsequent/re-invitations.
  // Deliberately non-fatal: a failure here must never fail or roll back the
  // organization creation that already succeeded above.
  try {
    const issued = await issueOrganizationInvitation({
      organizationId: organization.id,
      email: organization.businessEmail,
      role: 'OWNER',
      invitedByStaffId: session.staffId ?? session.email,
    })
    if (issued.ok) {
      await sendOrganizationInvitationEmail({
        to: organization.businessEmail,
        organizationName: organization.tradingName ?? organization.legalName,
        role: 'OWNER',
        token: issued.token,
        expiresAt: issued.expiresAt,
      })
    } else {
      console.error('[Organization] bootstrap invitation issue failed (non-fatal):', issued.error)
    }
  } catch (err) {
    console.error('[Organization] bootstrap invitation failed (non-fatal):', (err as Error).message)
  }

  return NextResponse.json({ organization }, { status: 201 })
}
