import { NextResponse }         from 'next/server'
import { getAdminSession }       from '@/lib/admin-auth'
import { viatorTestConnection }  from '@/lib/viator/client'

export const dynamic = 'force-dynamic'

/** GET /api/admin/viator-test — super_admin only, never ship to public */
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') {
    return NextResponse.json({ error: 'super_admin only' }, { status: 403 })
  }

  try {
    const { status, data } = await viatorTestConnection()
    return NextResponse.json({ httpStatus: status, viatorResponse: data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
