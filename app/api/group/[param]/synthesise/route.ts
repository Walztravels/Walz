import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/group/[param]/synthesise
 *
 * Only callable by the session creator. Reads all submitted preferences,
 * sends them to Claude Sonnet 4.6, saves the shortlist JSON, and
 * transitions the session to 'voting' status.
 *
 * [param] = sessionId
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { param: string } },
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const authSession = await getServerSession(authOptions)
  if (!authSession?.user?.email) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const creator = await prisma.user.findUnique({ where: { email: authSession.user.email } })
  const session = await prisma.groupSession.findUnique({
    where:   { id: params.param },
    include: { members: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.creatorId !== creator?.id) {
    return NextResponse.json({ error: 'Only the creator can trigger synthesis' }, { status: 403 })
  }

  const submitted = session.members.filter(m => m.submittedAt && m.preferencesJson)
  if (submitted.length < 2) {
    return NextResponse.json(
      { error: 'At least 2 members must submit before synthesis' },
      { status: 400 },
    )
  }

  const prefs = submitted.map(m => ({
    member:      m.name,
    preferences: m.preferencesJson,
  }))

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    system:
      'You are a group travel planning expert. You will receive preference profiles for a group of travellers. ' +
      'Your job is to recommend exactly 3 destination options that maximise group satisfaction. ' +
      'You must anchor the budget to the most constrained member — never exceed their ceiling. ' +
      'Surface any conflicts honestly (e.g. one member needs wheelchair access — this narrows the options). ' +
      'Return only valid JSON, no prose.',
    messages: [{
      role:    'user',
      content: JSON.stringify(prefs),
    }],
  })

  const raw   = message.content[0].type === 'text' ? message.content[0].text : ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let shortlist: { shortlist: unknown[]; group_notes: string }
  try {
    shortlist = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Claude returned invalid JSON — try again' }, { status: 502 })
  }

  await prisma.groupSession.update({
    where: { id: session.id },
    data:  {
      status:        'voting',
      shortlistJson: shortlist as object,
      groupNotes:    shortlist.group_notes ?? null,
    },
  })

  return NextResponse.json({ success: true, shortlist })
}
