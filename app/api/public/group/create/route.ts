import { NextRequest, NextResponse } from 'next/server'
import { randomUUID }                from 'crypto'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/public/group/create
 *
 * Creates a new group planning session and generates unique invite tokens
 * for each member. Returns shareable invite URLs per member.
 *
 * Auth is optional — associates with the logged-in user if available,
 * but works for unauthenticated users too (creatorId = null).
 *
 * Body:
 *   name:    string             — e.g. "Lads trip 2026"
 *   members: { name: string }[] — list of members to invite
 *
 * Returns:
 *   { sessionId, sessionName, inviteLinks: { name, url, token }[] }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.name || !Array.isArray(body.members) || body.members.length < 2) {
    return NextResponse.json(
      { error: 'Session name and at least 2 members are required' },
      { status: 400 },
    )
  }

  // Associate with logged-in user if available, but don't require it
  let creatorId: string | undefined = undefined
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.email) {
      const user = await prisma.user.findUnique({ where: { email: session.user.email } })
      if (user) creatorId = user.id
    }
  } catch {
    // ignore auth errors — proceed anonymously
  }

  try {
    const groupSession = await prisma.groupSession.create({
      data: {
        id:        randomUUID(),
        name:      body.name,
        creatorId: creatorId,
        status:    'collecting',
        members: {
          create: (body.members as { name: string }[]).map((m: { name: string }) => ({
            id:          randomUUID(),
            inviteToken: randomUUID(),
            name:        m.name,
          })),
        },
      },
      include: { members: true },
    })

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://walztravels.com'

    const inviteLinks = groupSession.members.map(m => ({
      name:  m.name,
      token: m.inviteToken,
      url:   `${baseUrl}/group/join/${m.inviteToken}`,
    }))

    return NextResponse.json({
      sessionId:   groupSession.id,
      sessionName: groupSession.name,
      inviteLinks,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[group/create]', msg)
    return NextResponse.json(
      { error: `Database error: ${msg.slice(0, 200)}` },
      { status: 500 },
    )
  }
}
