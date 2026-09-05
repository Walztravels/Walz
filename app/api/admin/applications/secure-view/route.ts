import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getStaffPermissionsByEmail } from '@/lib/getStaffPermissions'
import prisma from '@/lib/db'
import {
  assertVerifiedAccess, auditLookupEvent,
  ACCESS_REASONS, type AccessReason,
} from '@/lib/secure-lookup/service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/applications/secure-view?verificationId=…&reason=…
 *
 * Unlocks the full staff view — ONLY for a valid, unexpired verification
 * that belongs to the calling staff member. Verification is an additional
 * privacy gate on top of RBAC, never a bypass: the field set returned is
 * still filtered by the caller's role permissions (payments only with
 * payments_view, etc.). Documents keep their existing secure URL logic —
 * this endpoint returns the admin page link, never raw storage paths.
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const verificationId = searchParams.get('verificationId') ?? ''
  const reasonRaw      = searchParams.get('reason') ?? 'CUSTOMER_SUPPORT'
  const reason: AccessReason = (ACCESS_REASONS as string[]).includes(reasonRaw)
    ? reasonRaw as AccessReason : 'CUSTOMER_SUPPORT'

  const access = await assertVerifiedAccess({ verificationId, staffEmail: session.email })
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 403 })
  }

  // RBAC — verification never overrides role restrictions
  const perms = await getStaffPermissionsByEmail(session.email)
  const isEnvAdmin  = perms.staffId === null
  const canViewApp  = isEnvAdmin || perms.visa_view || perms.applications_view
  const canPayments = isEnvAdmin || perms.payments_view
  if (!canViewApp) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const app = await prisma.visaApplication.findUnique({
    where: { id: access.applicationId },
    select: {
      id: true, referenceNumber: true, destinationIso2: true, visaType: true,
      status: true, statusMessage: true,
      firstName: true, middleName: true, lastName: true,
      email: true, phone: true, nationality: true, dateOfBirth: true,
      appointmentDate: true, appointmentLocation: true,
      createdAt: true, updatedAt: true,
      notes: { select: { content: true, createdAt: true, authorName: true }, orderBy: { createdAt: 'desc' }, take: 10 },
    },
  })
  if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  await auditLookupEvent('APPLICATION_FULL_ACCESS_GRANTED', {
    staffEmail: session.email, applicationId: app.id,
    channel: 'STAFF_SUPPORT', detail: `reason=${reason}`,
  })

  return NextResponse.json({
    verifiedUntil: access.verifiedUntil.toISOString(),
    accessReason:  reason,
    application: {
      id:              app.id,
      walzRef:         app.referenceNumber,
      applicationType: `${app.destinationIso2?.toUpperCase()} ${app.visaType} visa`,
      status:          app.status,
      statusMessage:   app.statusMessage,
      clientName:      [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' '),
      email:           app.email,
      phone:           app.phone,
      nationality:     app.nationality,
      dateOfBirth:     app.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      appointmentAt:   app.appointmentDate?.toISOString() ?? null,
      appointmentLocation: app.appointmentLocation,
      createdAt:       app.createdAt.toISOString(),
      updatedAt:       app.updatedAt.toISOString(),
      notes:           app.notes,
      // Payments only for roles that already have payments_view
      paymentsIncluded: canPayments,
      // Documents: existing secure page handles signed URLs — no raw paths here
      adminUrl:        `/admin/visa-applications/${app.id}`,
    },
  })
}

/**
 * POST — record that the staff member actually opened the full record page.
 * Body: { verificationId, applicationId }
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { verificationId?: string; applicationId?: string } | null = null
  try { body = await req.json() } catch { /* below */ }
  if (!body?.applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  await auditLookupEvent('APPLICATION_FULL_RECORD_OPENED', {
    staffEmail: session.email, applicationId: body.applicationId, channel: 'STAFF_SUPPORT',
  })
  return NextResponse.json({ ok: true })
}
