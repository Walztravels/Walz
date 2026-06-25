import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 40

/**
 * POST /api/group/[param]/lock
 *
 * Creator-only. Synthesises group preferences via Claude, picks the top
 * destination, and transitions status → 'locked'. Idempotent: returns the
 * existing destination if already locked.
 *
 * [param] = sessionId
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { param: string } },
) {
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
    return NextResponse.json({ error: 'Only the session creator can lock it' }, { status: 403 })
  }

  // Already locked — idempotent
  if (session.status === 'locked' && session.destination) {
    return NextResponse.json({ success: true, destination: session.destination, alreadyLocked: true })
  }

  const submitted = session.members.filter(m => m.submittedAt && m.preferencesJson)
  if (submitted.length < 1) {
    return NextResponse.json({ error: 'No preferences submitted yet' }, { status: 400 })
  }

  // If shortlist already exists (previous synthesise call), just pick the winner
  if (session.shortlistJson) {
    const sl     = session.shortlistJson as { shortlist?: Array<{ destination: string; fit_score?: number }> }
    const sorted = (sl.shortlist ?? []).slice().sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    const winner = sorted[0]?.destination
    if (winner) {
      await prisma.groupSession.update({
        where: { id: session.id },
        data:  { status: 'locked', destination: winner },
      })
      return NextResponse.json({ success: true, destination: winner })
    }
  }

  // No shortlist yet — run Claude synthesis now
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const prefs = submitted.map(m => ({ member: m.name, preferences: m.preferencesJson }))

  const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1200,
    system:
      'You are a group travel planning expert. Recommend exactly 3 destination options that maximise group satisfaction. ' +
      'Return only valid JSON.',
    messages: [{
      role:    'user',
      content:
        JSON.stringify(prefs) +
        '\n\nReturn this exact JSON:\n' +
        '{"shortlist":[{"destination":"City, Country","country":"Country","fit_score":95,' +
        '"why_it_works":"...","conflicts":[],"estimated_budget_pp":"£500-800","best_for":"..."}],' +
        '"group_notes":"..."}',
    }],
  })

  const raw   = message.content[0].type === 'text' ? message.content[0].text : ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let shortlist: { shortlist?: Array<{ destination: string; fit_score?: number }>; group_notes?: string }
  let winner: string

  try {
    shortlist = JSON.parse(clean)
    const sorted = (shortlist.shortlist ?? []).slice().sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0))
    winner = sorted[0]?.destination ?? 'Group recommended destination'
  } catch {
    // Claude returned bad JSON — fall back to a generic lock
    winner = 'Group recommended destination'
    shortlist = {}
  }

  await prisma.groupSession.update({
    where: { id: session.id },
    data:  {
      status:        'locked',
      destination:   winner,
      shortlistJson: Object.keys(shortlist).length ? (shortlist as object) : undefined,
      groupNotes:    shortlist.group_notes ?? null,
    },
  })

  return NextResponse.json({ success: true, destination: winner })
}
