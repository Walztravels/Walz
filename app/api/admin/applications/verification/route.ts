import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { rateLimit } from '@/lib/rate-limit'
import prisma from '@/lib/db'
import {
  sendApplicationOtp, verifyApplicationOtp,
  getFallbackQuestion, verifyApplicationFallback,
} from '@/lib/secure-lookup/service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/applications/verification — staff verification actions.
 * Body: { verificationId, action, ... }
 *   action: 'send_otp'         { method: 'EMAIL' | 'PHONE' }
 *   action: 'verify_otp'       { code }
 *   action: 'get_fallback'     {}
 *   action: 'verify_fallback'  { answer }
 *
 * Every decision is deterministic server-side. Expected answers and OTP
 * codes never appear in any response. The verification must belong to the
 * calling staff member.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = rateLimit({ key: `app-verify:${session.email}`, limit: 30, windowMs: 10 * 60_000 })
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts — slow down.' }, { status: 429 })

  let body: Record<string, unknown> | null = null
  try { body = await req.json() } catch { /* below */ }
  const verificationId = typeof body?.verificationId === 'string' ? body.verificationId : ''
  const action         = typeof body?.action === 'string' ? body.action : ''
  if (!verificationId || !action) {
    return NextResponse.json({ error: 'verificationId and action required' }, { status: 400 })
  }

  // Ownership: staff verifications are bound to the staff member who started them
  const v = await prisma.applicationVerification.findUnique({
    where:  { id: verificationId },
    select: { staffEmail: true, channel: true },
  })
  if (!v) return NextResponse.json({ error: 'Verification not found' }, { status: 404 })
  if (v.channel !== 'STAFF_SUPPORT' || (v.staffEmail ?? '').toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json({ error: 'This verification belongs to another session.' }, { status: 403 })
  }

  switch (action) {
    case 'send_otp': {
      const method = body?.method === 'PHONE' ? 'PHONE' : 'EMAIL'
      const result = await sendApplicationOtp({ verificationId, method })
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }
    case 'verify_otp': {
      const code = typeof body?.code === 'string' ? body.code : ''
      const result = await verifyApplicationOtp({ verificationId, code })
      return NextResponse.json(result)
    }
    case 'get_fallback': {
      const q = await getFallbackQuestion(verificationId)
      return NextResponse.json(q, { status: 'error' in q ? 400 : 200 })
    }
    case 'verify_fallback': {
      const answer = typeof body?.answer === 'string' ? body.answer : ''
      const result = await verifyApplicationFallback({ verificationId, answer })
      return NextResponse.json(result)
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
