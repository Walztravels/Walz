// app/api/admin/business/organizations/route.ts — Staff admin surface for
// Walz Business (Release 1).
//
// GET  — list all Organizations. Requires 'b2b'.
// POST — create a new Organization. Requires 'b2b.manage'. This is the ONLY
//        organization-creation path in Release 1 — there is no self-service
//        signup route anywhere in this domain.

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'
import prisma from '@/lib/db'
import { recordBusinessAudit } from '@/lib/business/audit'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['LEAD', 'ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(session, 'b2b')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const query = (req.nextUrl.searchParams.get('query') ?? '').trim()

  const organizations = await prisma.organization.findMany({
    where: query
      ? {
          OR: [
            { legalName: { contains: query, mode: 'insensitive' } },
            { tradingName: { contains: query, mode: 'insensitive' } },
            { businessEmail: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
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
    businessEmail, businessPhone, status, accountManagerId, defaultCurrency, market,
  } = (body ?? {}) as Record<string, unknown>

  if (typeof legalName !== 'string' || !legalName.trim()) {
    return NextResponse.json({ error: 'legalName is required' }, { status: 400 })
  }
  if (typeof country !== 'string' || !country.trim()) {
    return NextResponse.json({ error: 'country is required' }, { status: 400 })
  }
  if (typeof businessEmail !== 'string' || !businessEmail.trim()) {
    return NextResponse.json({ error: 'businessEmail is required' }, { status: 400 })
  }
  if (status !== undefined && !VALID_STATUSES.includes(status as string)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
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
      status: (status as string) ?? 'LEAD',
      accountManagerId: typeof accountManagerId === 'string' ? accountManagerId.trim() : null,
      defaultCurrency: typeof defaultCurrency === 'string' && defaultCurrency.trim() ? defaultCurrency.trim().toUpperCase() : 'GBP',
      market: typeof market === 'string' ? market.trim() : null,
    },
  })

  await recordBusinessAudit({
    organizationId: organization.id,
    actorStaffId: session.staffId ?? session.email,
    action: 'organization.create',
    entityType: 'Organization',
    entityId: organization.id,
    after: { legalName: organization.legalName, businessEmail: organization.businessEmail, status: organization.status },
  })

  return NextResponse.json({ organization }, { status: 201 })
}
