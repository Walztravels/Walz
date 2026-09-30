// app/api/business/organizations/[id]/brand-settings/route.ts
// Walz Business (Release 2.1) — white-label presentation foundation.
//
// PRESENTATION ONLY. Nothing in this table or route ever changes what
// legal, regulatory, government-facing, or payment disclosures show — those
// ALWAYS show the real Walz/operator identity regardless of
// whiteLabelEnabled. No custom domains. If a future admin UI surfaces these
// fields, it MUST carry this same warning in its copy.
//
// GET   — any ACTIVE member of the org may read its brand settings.
// PATCH — ADMIN+ only. Upsert (1:1 with Organization).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { assertOrgScopedAccess } from '@/lib/business/authz'
import { recordBusinessAudit } from '@/lib/business/audit'
import { checkLength, FIELD_LIMITS } from '@/lib/business/validation'

export const dynamic = 'force-dynamic'

// B6 remediation: each field's own generous, non-truncating length cap —
// an over-length value is REJECTED (400) rather than silently truncated
// (the previous behavior here, now fixed).
const STRING_FIELDS: readonly [field: string, max: number][] = [
  ['displayName', FIELD_LIMITS.DISPLAY_NAME],
  ['logoUrl', FIELD_LIMITS.URL],
  ['brandColor', FIELD_LIMITS.COLOR],
  ['supportEmail', FIELD_LIMITS.EMAIL],
  ['supportPhone', FIELD_LIMITS.PHONE],
  ['clientFacingSenderName', FIELD_LIMITS.DISPLAY_NAME],
]

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const settings = await prisma.organizationBrandSettings.findUnique({ where: { organizationId: params.id } })

  return NextResponse.json({
    brandSettings: settings ?? {
      organizationId: params.id,
      displayName: null, logoUrl: null, brandColor: null,
      supportEmail: null, supportPhone: null, clientFacingSenderName: null,
      whiteLabelEnabled: false,
    },
    // Repeated here so any client rendering this response is reminded of
    // the constraint even if it never reads the route source.
    presentationOnlyNotice: 'Legal, regulatory, government-facing, and payment disclosures always show the real Walz/operator identity, regardless of whiteLabelEnabled.',
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const access = await assertOrgScopedAccess(session.user.id, params.id, { minRole: 'ADMIN' })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  for (const [field, max] of STRING_FIELDS) {
    const v = (body as Record<string, unknown>)[field]
    if (v === undefined) continue
    if (v !== null && typeof v !== 'string') {
      return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 })
    }
    if (v === null) {
      data[field] = null
      continue
    }
    const trimmed = v.trim()
    const check = checkLength(trimmed, field, max)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
    data[field] = trimmed
  }
  if ((body as Record<string, unknown>).whiteLabelEnabled !== undefined) {
    if (typeof (body as Record<string, unknown>).whiteLabelEnabled !== 'boolean') {
      return NextResponse.json({ error: 'whiteLabelEnabled must be a boolean' }, { status: 400 })
    }
    data.whiteLabelEnabled = (body as Record<string, unknown>).whiteLabelEnabled
  }

  const before = await prisma.organizationBrandSettings.findUnique({ where: { organizationId: params.id } })

  const updated = await prisma.organizationBrandSettings.upsert({
    where: { organizationId: params.id },
    create: { organizationId: params.id, ...data },
    update: data,
  })

  await recordBusinessAudit({
    organizationId: params.id,
    actorUserId: session.user.id,
    action: 'brand_settings.updated',
    entityType: 'OrganizationBrandSettings',
    entityId: params.id,
    before: before ?? null,
    after: updated,
  })

  return NextResponse.json({ brandSettings: updated })
}
