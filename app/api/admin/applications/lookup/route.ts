import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getStaffPermissionsByEmail } from '@/lib/getStaffPermissions'
import { rateLimit } from '@/lib/rate-limit'
import { lookupApplicationByWalzRef, createApplicationVerification } from '@/lib/secure-lookup/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/applications/lookup — staff secure lookup entry point.
 * Body: { ref, conversationId? }
 *
 * Returns ONLY the masked summary + a verificationId. A Walz Ref locates
 * the application; it never authenticates the client. Exact match only —
 * no partial or similar refs are revealed.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RBAC: staff must be able to view applications at all
  const perms = await getStaffPermissionsByEmail(session.email)
  const isEnvAdmin = perms.staffId === null   // env super-admin fallback has all perms
  if (!isEnvAdmin && !perms.visa_view && !perms.applications_view) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: 20 lookups / 5 min per staff member
  const rl = rateLimit({ key: `app-lookup:${session.email}`, limit: 20, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many lookups — try again shortly.' }, { status: 429 })
  }

  let body: { ref?: unknown; conversationId?: unknown } | null = null
  try { body = await req.json() } catch { /* below */ }
  const ref = typeof body?.ref === 'string' ? body.ref : ''
  if (!ref.trim()) return NextResponse.json({ error: 'Reference required' }, { status: 400 })
  const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null

  const result = await lookupApplicationByWalzRef(ref, {
    channel: 'STAFF_SUPPORT', staffEmail: session.email, conversationId,
  })

  if (!result.found) {
    return NextResponse.json({ found: false, message: 'No application found for this reference.' })
  }

  const { verificationId } = await createApplicationVerification({
    applicationId: result.applicationId,
    channel:       'STAFF_SUPPORT',
    staffEmail:    session.email,
    conversationId,
  })

  return NextResponse.json({
    found: true,
    verificationId,
    summary: {
      walzRef:         result.walzRef,
      applicationType: result.applicationType,
      destination:     result.destination,
      status:          result.status,
      maskedName:      result.maskedName,
      maskedEmail:     result.maskedEmail,
      maskedPhone:     result.maskedPhone,
      hasEmail:        result.hasEmail,
      hasPhone:        result.hasPhone,
    },
  })
}
