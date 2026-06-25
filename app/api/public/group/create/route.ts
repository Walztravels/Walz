import { NextRequest, NextResponse } from 'next/server'
import { randomUUID }                from 'crypto'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import prisma                        from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/group/create
 *
 * Creates a new group planning session and generates unique invite tokens
 * for each member. Returns shareable invite URLs per member.
 *
 * Body:
 *   name:    string             — e.g. "Lads trip 2026"
 *   members: { name: string }[] — list of members to invite
 *
 * Returns:
 *   { sessionId, inviteLinks: { name, url, token }[] }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Sign in to create a group session' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body?.name || !Array.isArray(body.members) || body.members.length < 2) {
    return NextResponse.json(
      { error: 'Session name and at least 2 members are required' },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  try {
    const groupSession = await prisma.groupSession.create({
      data: {
        id:        randomUUID(),
        name:      body.name,
        creatorId: user.id,
        status:    'collecting',
        members: {
          create: (body.members as { name: string }[]).map(m => ({
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
