import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/public/group/[param]/lock
 *
 * Public route — no auth required. The session ID acts as the secret.
 * Generates a full day-by-day group itinerary with Claude and locks the session.
 * Idempotent: returns the cached itinerary if already generated.
 *
 * [param] = sessionId
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { param: string } },
) {
  const session = await prisma.groupSession.findUnique({
    where:   { id: params.param },
    include: { members: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Idempotent — return cached itinerary if already generated
  if (session.status === 'locked' && session.itineraryJson && session.destination) {
    return NextResponse.json({
      success:     true,
      itinerary:   session.itineraryJson,
      destination: session.destination,
      cached:      true,
    })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  // Pick destination — use existing if already set, else tally votes from prefs
  let destination = session.destination ?? ''
  if (!destination) {
    const votes: Record<string, number> = {}
    for (const m of session.members) {
      const prefs = m.preferencesJson as { destinations?: string[] } | null
      const dests = prefs?.destinations ?? []
      dests.forEach((d, i) => {
        if (d && i < 3) votes[d] = (votes[d] ?? 0) + (3 - i)
      })
    }
    destination = Object.entries(votes).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'London'
  }

  // Build member context from preferences
  const submitted = session.members.filter(m => m.submittedAt && m.preferencesJson)
  const groupSize = session.members.length

  const prefsContext = submitted.length > 0
    ? submitted.map(m => {
        const p = m.preferencesJson as Record<string, unknown>
        return `${m.name}: budget=${p.budget ?? '?'}, vibe=${p.vibe ?? '?'}, days=${p.durationDays ?? 7}`
      }).join(' | ')
    : `Group of ${groupSize} travellers — preferences not yet collected`

  // Average trip duration from member prefs
  const durations = submitted.map(m => {
    const p = m.preferencesJson as Record<string, unknown>
    return typeof p?.durationDays === 'number' ? (p.durationDays as number) : 5
  })
  const tripDays = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 5

  const prompt = `You are Jade, Walz Travels' expert AI travel planner. Create a premium ${tripDays}-day group itinerary for ${destination}.

Group details:
- ${groupSize} travellers
- ${prefsContext}
- Managed by Walz Travels concierge team

Return ONLY valid JSON (no prose, no fences):

{
  "destination": "${destination}",
  "duration": "${tripDays} days",
  "groupSize": ${groupSize},
  "theme": "<one-line theme for this trip>",
  "highlights": ["<highlight 1>", "<highlight 2>", "<highlight 3>"],
  "days": [
    {
      "day": 1,
      "title": "<Day title>",
      "activities": [
        {
          "time": "09:00",
          "title": "<Activity name>",
          "description": "<What to do and why — 2 sentences>",
          "duration": "2 hours",
          "type": "sightseeing",
          "tips": "<Jade's insider tip>"
        }
      ],
      "accommodation": "<Recommended hotel name>",
      "meals": {
        "breakfast": "<recommendation>",
        "lunch": "<recommendation>",
        "dinner": "<recommendation>"
      },
      "estimatedCost": "<per person in local currency>"
    }
  ],
  "totalEstimatedCost": "<per person total>",
  "flightTip": "<flight booking advice for this destination>",
  "jadeTip": "<Jade's personal recommendation for the group>",
  "bookWithWalz": "Book this entire trip through Walz Travels and save up to 15% on flights and hotels."
}

Include ${tripDays} days. Each day should have 3-4 activities covering morning through evening.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw  = message.content[0]?.type === 'text' ? message.content[0].text : ''
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()

    let itinerary: Record<string, unknown>
    try {
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      itinerary = JSON.parse(jsonMatch?.[0] ?? clean) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Claude returned invalid JSON — please try again' }, { status: 502 })
    }

    const finalDestination = (itinerary.destination as string | undefined) ?? destination

    await prisma.groupSession.update({
      where: { id: session.id },
      data:  {
        status:        'locked',
        destination:   finalDestination,
        itineraryJson: itinerary as object,
      },
    })

    return NextResponse.json({
      success:     true,
      itinerary,
      destination: finalDestination,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[group/lock] Claude error:', msg.slice(0, 300))
    return NextResponse.json(
      { error: `Failed to generate itinerary: ${msg.slice(0, 200)}` },
      { status: 500 },
    )
  }
}
