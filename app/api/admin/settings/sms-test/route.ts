import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getSmsReadiness } from '@/lib/sms/config'
import { runSmsAcceptanceTest } from '@/lib/sms/acceptance-test'

export const dynamic = 'force-dynamic'

/**
 * Super Admin-only owner acceptance-test trigger for CUSTOMER_CARE SMS.
 * Server-side authorization, fail closed. The request may carry ONLY a phone
 * number and a client-generated attempt key; any other field (message,
 * classification, audience…) is ignored, never read.
 */
async function requireSuperAdmin() {
  const session = await getAdminSession().catch(() => null)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.role !== 'super_admin' || session.staffRole !== 'super_admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session }
}

// GET — readiness only (PRESENT / MISSING / INVALID; never a value).
export async function GET() {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error
  return NextResponse.json({ readiness: getSmsReadiness() })
}

// POST — one explicit test send.
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return auth.error

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { phone, clientKey } = body as { phone?: unknown; clientKey?: unknown }

  try {
    const out = await runSmsAcceptanceTest({
      staff: {
        id: auth.session.id,
        name: auth.session.name,
        email: auth.session.email,
        staffRole: auth.session.staffRole,
      },
      phone,
      clientKey,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent'),
    })
    if (out.kind === 'INVALID_INPUT') return NextResponse.json({ accepted: false, message: out.message }, { status: 400 })
    if (out.kind === 'RATE_LIMITED') return NextResponse.json({ accepted: false, message: out.message }, { status: 429 })
    const { kind: _k, ...safe } = out
    return NextResponse.json(safe)
  } catch (e) {
    console.error('[sms-test] failed:', (e as { code?: string } | null)?.code ?? 'unknown')
    return NextResponse.json({ accepted: false, message: 'Unexpected error. Nothing was confirmed as sent; check the SMS log before retrying.' }, { status: 500 })
  }
}
