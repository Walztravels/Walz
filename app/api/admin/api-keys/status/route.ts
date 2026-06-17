import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { hasPermission } from '@/lib/admin/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getAdminSession()
  if (!session || !hasPermission(session, 'api_keys')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const keys = [
    'ANTHROPIC_API_KEY',
    'STRIPE_SECRET_KEY',
    'FLUTTERWAVE_SECRET_KEY',
    'RESEND_API_KEY',
    'HOTELBEDS_ACTIVITIES_API_KEY',
    'HOTELBEDS_TRANSFERS_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TRAVELPAYOUTS_MARKER',
  ]
  const status = Object.fromEntries(keys.map(k => [k, !!process.env[k]]))
  return NextResponse.json({ status })
}
