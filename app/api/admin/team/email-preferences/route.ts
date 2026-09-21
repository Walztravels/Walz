/**
 * Walz Team Hub V1.1 — the signed-in staff member's OWN email notification
 * preferences. Strictly self-scoped: the staff id is always resolved from
 * the session (currentStaffId), never accepted from the request, so there
 * is no way to read or change anyone else's settings through this route —
 * not even for a super admin (consistent with lib/team/authz.ts's
 * no-bypass posture for Team Hub).
 *
 * A missing row means "everything on", so GET synthesises the defaults
 * rather than creating a row, and PATCH upserts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { currentStaffId } from '@/lib/team/authz'
import { DEFAULT_TEAM_EMAIL_PREFERENCES, type TeamEmailPreferences } from '@/lib/team/email-notify'

export const dynamic = 'force-dynamic'

const KEYS = ['directMessages', 'mentionsAndThreads', 'missedCalls', 'invites'] as const

export async function GET() {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.teamEmailNotificationPreference.findUnique({
    where: { staffId: currentStaffId(session) },
    select: { directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: true },
  })
  return NextResponse.json({ preferences: row ?? DEFAULT_TEAM_EMAIL_PREFERENCES })
}

export async function PATCH(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Partial<Record<(typeof KEYS)[number], unknown>>
  const patch: Partial<TeamEmailPreferences> = {}
  for (const key of KEYS) {
    if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid preference values supplied.' }, { status: 400 })
  }

  const staffId = currentStaffId(session)
  const saved = await prisma.teamEmailNotificationPreference.upsert({
    where: { staffId },
    update: patch,
    create: { staffId, ...DEFAULT_TEAM_EMAIL_PREFERENCES, ...patch },
    select: { directMessages: true, mentionsAndThreads: true, missedCalls: true, invites: true },
  })
  // Metadata only — which toggles changed, never any content.
  console.info(`[team/email-prefs] updated staffId=${staffId} keys=${Object.keys(patch).join(',')}`)

  return NextResponse.json({ preferences: saved })
}
