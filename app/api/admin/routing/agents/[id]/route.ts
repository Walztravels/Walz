import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { setAgentActive, getAgentById } from '@/lib/agent-roster'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body    = await req.json() as { active?: boolean }

  if (typeof body.active !== 'boolean') {
    return NextResponse.json({ error: 'active must be boolean' }, { status: 400 })
  }

  const agent = getAgentById(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  setAgentActive(id, body.active)

  console.log(
    `[routing] ${session.email} set ${agent.name} → ${body.active ? 'active' : 'away'}`,
  )

  return NextResponse.json({ id, name: agent.name, active: body.active })
}
