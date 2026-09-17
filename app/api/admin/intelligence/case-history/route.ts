import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getCaseTimeline } from '@/lib/intelligence/case-events'

export const dynamic = 'force-dynamic'

/** Case Intelligence History — the append-only per-case timeline (DI-4). */
export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const applicationId = new URL(req.url).searchParams.get('applicationId') ?? ''
  if (!applicationId) return NextResponse.json({ events: [] })

  const events = await getCaseTimeline(applicationId)
  return NextResponse.json({ events })
}
