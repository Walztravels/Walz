import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { getAircallUsers } from '@/lib/aircall-api'
import { hasAnyInboxPermission } from '@/lib/inbox/authz'

export const dynamic = 'force-dynamic'

// P1 security hotfix (2026-09-19), Fix 3: this had zero permission check —
// any authenticated staff account could list every Aircall user's name,
// email and live availability. Lower sensitivity than the Chatwoot
// identity mapping (Fix 1/2), so this uses the same
// 'inbox_view'/'inbox_assign' bar the agent roster needs for assignment
// purposes, mirroring app/api/admin/routing/chatwoot-agents/route.ts's
// hasAnyInboxPermission gate rather than the stricter settings_integrations
// used for the Chatwoot-agent-id mapping routes.
export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasAnyInboxPermission(session, ['inbox_view', 'inbox_assign'])) {
    console.error('[routing/aircall-users] permission denied for', session.email)
    return NextResponse.json({ error: 'You do not have permission to do this.' }, { status: 403 })
  }

  const data = await getAircallUsers()
  if (!data) return NextResponse.json({ users: [] })

  return NextResponse.json({
    users: data.users.map((u) => ({
      id:           u.id,
      name:         u.name,
      email:        u.email,
      availability: u.availability_status,
    })),
  })
}
