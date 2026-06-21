import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 40

/**
 * POST /api/group/[param]/visa/analyse
 *
 * Aggregates all member visa profiles and calls Claude to produce a
 * group visa risk assessment. Only callable by the session creator.
 *
 * [param] = sessionId
 */
export async function POST(
  _req: NextRequest,
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
    include: { members: { include: { visaProfile: true } } },
  })

  if (!session)            return NextResponse.json({ error: 'Session not found' },         { status: 404 })
  if (session.creatorId !== creator?.id)
    return NextResponse.json({ error: 'Only the creator can trigger group visa analysis' }, { status: 403 })
  if (!session.visaDestination)
    return NextResponse.json({ error: 'No visa destination set on this session' },          { status: 400 })

  const profiles = session.members
    .map(m => m.visaProfile)
    .filter(Boolean)

  if (profiles.length < 1) {
    return NextResponse.json({ error: 'No member visa profiles found' }, { status: 400 })
  }

  await prisma.groupSession.update({
    where: { id: params.param },
    data:  { visaStatus: 'in_progress' },
  })

  const profilePayload = profiles.map(p => {
    const member = session.members.find(m => m.id === p!.memberId)
    return {
      member_id:         p!.memberId,
      name:              member?.name ?? 'Unknown',
      nationality:       p!.nationality,
      travel_history:    p!.travelHistoryJson,
      document_count:    Array.isArray(p!.documentUrls) ? (p!.documentUrls as unknown[]).length : 0,
      individual_score:  p!.individualScore ?? 0,
    }
  })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    system:
      'You are a visa risk analyst. You will receive visa profiles for a group of travellers applying to the same destination. ' +
      'Each profile includes their nationality, travel history, document count, and an individual approval score (0-100). ' +
      'Your job is to assess the group\'s collective visa situation, identify the weakest applications, and produce a group strategy. ' +
      'Return only valid JSON.',
    messages: [{
      role:    'user',
      content:
        `Destination country: ${session.visaDestination}\n\n` +
        `Member visa profiles:\n${JSON.stringify(profilePayload, null, 2)}\n\n` +
        `Return exactly this JSON structure:\n` +
        `{\n` +
        `  "group_risk_rating": "low" | "medium" | "high",\n` +
        `  "group_risk_summary": "2 sentences",\n` +
        `  "members": [\n` +
        `    {\n` +
        `      "member_id": "string",\n` +
        `      "name": "string",\n` +
        `      "individual_score": number,\n` +
        `      "risk_level": "low" | "medium" | "high",\n` +
        `      "red_flags": ["string"],\n` +
        `      "remediation_steps": ["string"],\n` +
        `      "needs_cover_letter": boolean\n` +
        `    }\n` +
        `  ],\n` +
        `  "weakest_member_id": "string",\n` +
        `  "application_strategy": "joint" | "staggered",\n` +
        `  "strategy_reason": "string",\n` +
        `  "group_checklist": [\n` +
        `    { "item": "string", "applies_to": "all" | "<member_id>", "deadline_note": "string" }\n` +
        `  ],\n` +
        `  "disclaimer": "Visa rules change frequently. Always verify requirements with the official embassy website before applying."\n` +
        `}`,
    }],
  })

  const raw   = message.content[0].type === 'text' ? message.content[0].text : ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let analysis: unknown
  try {
    analysis = JSON.parse(clean)
  } catch {
    await prisma.groupSession.update({ where: { id: params.param }, data: { visaStatus: 'pending' } })
    return NextResponse.json({ error: 'Claude returned invalid JSON — try again' }, { status: 502 })
  }

  await prisma.groupSession.update({
    where: { id: params.param },
    data:  {
      visaAnalysisJson: analysis as object,
      visaStatus:       'complete',
      visaDestination:  session.visaDestination,
    },
  })

  return NextResponse.json({ success: true, analysis })
}
