import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'
import { buildVisaMatrix }           from '@/lib/visa-lookup'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 120

// ── Vote tally ───────────────────────────────────────────────────────────────

interface VoteResult {
  destination: string
  points:      number
  percentage:  number
  isWinner:    boolean
}

function computeVoteTally(members: Array<{ preferencesJson: unknown }>): VoteResult[] {
  const raw: Record<string, number> = {}
  for (const m of members) {
    const prefs = m.preferencesJson as { destinations?: string[] } | null
    const dests = prefs?.destinations ?? []
    dests.forEach((d, i) => {
      if (d && i < 3) raw[d] = (raw[d] ?? 0) + (3 - i)
    })
  }
  const total  = Object.values(raw).reduce((a, b) => a + b, 0)
  const sorted = Object.entries(raw).sort(([, a], [, b]) => b - a)
  return sorted.map(([destination, points], idx) => ({
    destination,
    points,
    percentage: total > 0 ? Math.round((points / total) * 100) : 0,
    isWinner:   idx === 0,
  }))
}

// ── Member context helpers ───────────────────────────────────────────────────

function getPrefsField(prefs: unknown, key: string): string {
  return (prefs as Record<string, unknown>)?.[key] as string ?? ''
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: { param: string } },
) {
  const session = await prisma.groupSession.findUnique({
    where:   { id: params.param },
    include: { members: true },
  })

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Always compute these — they're fast and needed even for cached responses
  const submitted  = session.members.filter(m => m.submittedAt && m.preferencesJson)
  const voteResults = computeVoteTally(submitted)

  const winner     = session.destination ?? voteResults[0]?.destination ?? 'London'
  const destination = winner

  // Build visa matrix from preferencesJson (works before SQL migration too)
  const membersForVisa = submitted.map(m => ({
    name:                m.name,
    passportNationality: (m.passportNationality ?? getPrefsField(m.preferencesJson, 'passportNationality')) || null,
    flyingFrom:          (m.flyingFrom ?? getPrefsField(m.preferencesJson, 'flyingFrom')) || null,
  }))
  const visaMatrix = buildVisaMatrix(membersForVisa, destination)

  // Idempotent — return cached itinerary if already generated
  if (session.status === 'locked' && session.itineraryJson && session.destination) {
    return NextResponse.json({
      success:      true,
      itinerary:    session.itineraryJson,
      destination:  session.destination,
      voteResults,
      visaMatrix,
      cached:       true,
    })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
  }

  const groupSize  = session.members.length

  // Trip duration — average from member prefs
  const durationMap: Record<string, number> = {
    weekend: 3, short: 5, week: 7, '2weeks': 14,
  }
  const durations = submitted.map(m => {
    const d = getPrefsField(m.preferencesJson, 'duration')
    return durationMap[d] ?? (typeof (m.preferencesJson as Record<string,unknown>)?.durationDays === 'number'
      ? (m.preferencesJson as Record<string,unknown>).durationDays as number : 5)
  })
  const tripDays = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 5

  // Unique flying-from cities
  const flyingFromSet = new Set(
    membersForVisa.map(m => m.flyingFrom).filter(Boolean) as string[],
  )
  const flyingFromList = flyingFromSet.size > 0
    ? [...flyingFromSet].join(', ')
    : 'various cities'

  // Vibe summary
  const vibes = submitted
    .map(m => getPrefsField(m.preferencesJson, 'vibe'))
    .filter(Boolean)
  const vibesSummary = vibes.length > 0
    ? [...new Set(vibes)].join(', ')
    : 'mixed preferences'

  // Budget summary
  const budgets = submitted
    .map(m => getPrefsField(m.preferencesJson, 'budget'))
    .filter(Boolean)
  const budgetMap: Record<string, string> = {
    'under-500': 'Under £500', '500-1000': '£500–£1,000',
    '1000-2000': '£1,000–£2,000', '2000-plus': '£2,000+',
  }
  const budgetsSummary = budgets.length > 0
    ? [...new Set(budgets.map(b => budgetMap[b] ?? b))].join(', ')
    : 'mixed budgets'

  // Vote results text for Claude
  const voteText = voteResults.slice(0, 5)
    .map((v, i) => `${i === 0 ? '🏆' : `${i + 1}.`} ${v.destination} — ${v.points}pts (${v.percentage}%)`)
    .join('\n')

  // Member passport summary for flight sections
  const memberFlyingFrom = membersForVisa
    .map(m => `${m.name}: flying from ${m.flyingFrom || 'unknown'}`)
    .join(', ')

  const prompt = `You are Jade, Walz Travels' expert AI travel planner. Build a premium ${tripDays}-day group trip to ${destination}.

GROUP PROFILE:
- ${groupSize} travellers
- Flying from: ${flyingFromList}
- Trip vibes: ${vibesSummary}
- Budgets: ${budgetsSummary}
- Member flight origins: ${memberFlyingFrom}

DESTINATION VOTE RESULTS (weighted 1st=3pts, 2nd=2pts, 3rd=1pt):
${voteText}

INSTRUCTIONS:
- Be specific — name real hotels, restaurants, and attractions
- Suggest hotels in the best neighbourhoods for groups
- Give practical Jade insider tips
- Flight advice must account for their specific origins (${flyingFromList})
- Include activities across all vibes the group mentioned
- Keep costs realistic in local currency + GBP equivalent

Return ONLY valid JSON (no markdown, no prose):

{
  "destination": "${destination}",
  "duration": "${tripDays} days",
  "groupSize": ${groupSize},
  "tagline": "<5-8 word tagline for this specific group trip>",
  "theme": "<one-line theme explaining why ${destination} is perfect for this group>",
  "highlights": ["<top highlight 1>", "<top highlight 2>", "<top highlight 3>"],
  "days": [
    {
      "day": 1,
      "title": "<evocative day title>",
      "activities": [
        {
          "time": "09:00",
          "title": "<Activity name>",
          "description": "<What it is and why this group will love it — 2 sentences>",
          "duration": "2 hours",
          "type": "sightseeing",
          "cost": "<realistic cost per person>",
          "bookingTip": "<how to book or get tickets>",
          "jadeTip": "<insider tip only Jade knows>",
          "location": "<neighbourhood or exact area>"
        }
      ],
      "accommodation": {
        "name": "<Real hotel name>",
        "stars": 4,
        "area": "<neighbourhood>",
        "pricePerNight": "<£X–£Y per room>"
      },
      "meals": {
        "breakfast": "<specific recommendation with restaurant name>",
        "lunch": "<specific recommendation with restaurant name>",
        "dinner": "<specific recommendation with restaurant name>"
      },
      "estimatedCost": "<£X–£Y per person for this day excluding accommodation>"
    }
  ],
  "costBreakdown": {
    "budget": "<total inc. flights from ${flyingFromList} for budget travellers>",
    "comfortable": "<total inc. flights for comfortable experience>",
    "luxury": "<total inc. flights for luxury experience>"
  },
  "totalEstimatedCost": "<comfortable tier total — e.g. '£1,400 per person'>",
  "flightAdvice": [
    {
      "from": "<city>",
      "to": "${destination}",
      "airlines": "<2-3 recommended airlines>",
      "estimatedPrice": "<return price range>",
      "tip": "<booking advice specific to this route>"
    }
  ],
  "packingTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "jadeFinalWord": "<Jade's personal message to the group — warm, specific, 2-3 sentences>",
  "bookWithWalz": "Book this entire trip through Walz Travels — we handle group flights from ${flyingFromList}, hotel blocks, visa processing, and transfers in one package. WhatsApp us to start planning."
}

Include exactly ${tripDays} days. Each day must have 3–4 activities with specific times from morning to evening.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // Timeout promise — ensures we return a clean JSON error before Vercel drops the connection
  const claudeTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Jade timed out — please try generating again')), 55_000)
  )

  try {
    const message = await Promise.race([
      anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 5000,
        messages:   [{ role: 'user', content: prompt }],
      }),
      claudeTimeout,
    ])

    const raw   = message.content[0]?.type === 'text' ? message.content[0].text : ''
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
      voteResults,
      visaMatrix,
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
