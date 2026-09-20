import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { currentStaffId } from '@/lib/team/authz'
import { joinPublicChannel } from '@/lib/team/conversations'

export const dynamic = 'force-dynamic'

/** Self-service join for a PUBLIC + joinable channel only (owner decision 5). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await joinPublicChannel(params.id, currentStaffId(session))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 })
  return NextResponse.json({ ok: true })
}
