import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { checkConversationMembership } from '@/lib/team/authz'
import { getActiveGroupCall } from '@/lib/team/calls'

export const dynamic = 'force-dynamic'

/**
 * GET — the current non-terminal (STARTED/ACTIVE) call for this
 * conversation, or `{call: null}`. Powers the header's "Start Call" vs
 * "Join Call" state and the lightweight "X started a call — Join" banner
 * via polling — membership-gated like every other Team Hub read.
 * Deliberately never returns conferenceName/providerCallId — nothing about
 * the actual Twilio room is ever exposed to the browser.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await checkConversationMembership(session, params.id)
  if (!membership.allowed) return NextResponse.json({ error: membership.error }, { status: membership.status })

  const call = await getActiveGroupCall(params.id)
  return NextResponse.json({ call })
}
