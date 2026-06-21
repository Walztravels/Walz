import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 40

/**
 * POST /api/group/[param]/itinerary
 *
 * Generates a day-by-day itinerary for the winning destination.
 * Only callable by session creator after the session is locked.
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
    include: { members: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (session.creatorId !== creator?.id) {
    return NextResponse.json({ error: 'Only the creator can generate the itinerary' }, { status: 403 })
  }
  if (session.status !== 'locked' || !session.destination) {
    return NextResponse.json({ error: 'Session must be locked with a winning destination first' }, { status: 409 })
  }

  // Return cached itinerary if already generated
  if (session.itineraryJson) {
    return NextResponse.json({ itinerary: session.itineraryJson })
  }

  const allPrefs = session.members
    .filter(m => m.preferencesJson)
    .map(m => ({ member: m.name, preferences: m.preferencesJson }))

  // Extract trip duration from preferences (default 7 days)
  const durations = allPrefs.map(m => {
    const p = m.preferences as Record<string, unknown>
    return typeof p?.durationDays === 'number' ? p.durationDays : 7
  })
  const tripDays = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 3000,
    system:
      'You are a travel itinerary expert. Generate a structured day-by-day group travel itinerary in valid JSON only.',
    messages: [{
      role: 'user',
      content:
        `Destination: ${session.destination}\n` +
        `Trip duration: ${tripDays} days\n` +
        `Group size: ${allPrefs.length} people\n` +
        `Group preferences:\n${JSON.stringify(allPrefs, null, 2)}\n\n` +
        `Return a JSON object with this exact structure:\n` +
        `{\n` +
        `  "destination": "${session.destination}",\n` +
        `  "totalDays": ${tripDays},\n` +
        `  "days": [\n` +
        `    {\n` +
        `      "day": 1,\n` +
        `      "theme": "Arrival & Orientation",\n` +
        `      "morning": { "title": "...", "description": "...", "satisfies": ["member names"] },\n` +
        `      "afternoon": { "title": "...", "description": "...", "satisfies": ["member names"] },\n` +
        `      "evening": { "title": "...", "description": "...", "satisfies": ["member names"] },\n` +
        `      "accommodation": "...",\n` +
        `      "estimatedCost": "..." \n` +
        `    }\n` +
        `  ],\n` +
        `  "totalEstimatedBudget": "...",\n` +
        `  "travelTips": ["..."],\n` +
        `  "packingHighlights": ["..."]\n` +
        `}`,
    }],
  })

  const raw   = message.content[0].type === 'text' ? message.content[0].text : ''
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

  let itinerary: unknown
  try {
    itinerary = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Claude returned invalid JSON — try again' }, { status: 502 })
  }

  await prisma.groupSession.update({
    where: { id: session.id },
    data:  { itineraryJson: itinerary as object },
  })

  return NextResponse.json({ itinerary })
}
