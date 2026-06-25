import { NextRequest }              from 'next/server'
import Anthropic                    from '@anthropic-ai/sdk'
import OpenAI                       from 'openai'
import prisma                       from '@/lib/db'
import { buildVisaMatrix }          from '@/lib/visa-lookup'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPrefsField(prefs: unknown, key: string): string {
  return (prefs as Record<string, unknown>)?.[key] as string ?? ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON<T = unknown>(text: string): T {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
  try { return JSON.parse(cleaned) as T } catch {}
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const slice = cleaned.substring(start, end + 1)
    try { return JSON.parse(slice) as T } catch {}
    try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, '$1')) as T } catch {}
  }
  throw new Error('Could not parse JSON from AI response')
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildItineraryPrompt(
  destination:    string,
  groupSize:      number,
  vibesSummary:   string,
  budgetsSummary: string,
  flyingFromArr:  string[],
  nationalities:  string[],
  voteText:       string,
): string {
  const flyingFromList = flyingFromArr.length > 0 ? flyingFromArr.join(', ') : 'various locations'
  const natList        = nationalities.length    > 0 ? nationalities.join(', ') : 'Mixed'

  const routeTemplate = flyingFromArr.length > 0
    ? flyingFromArr.map(city =>
        `      { "from": "${city}", "to": "${destination}", "recommendedAirlines": ["<airline 1>", "<airline 2>"], "estimatedCost": "<£XXX–£YYY return>", "flightDuration": "<Xh Ym>", "bestTimeToBook": "<X weeks ahead>", "jadeTip": "<specific tip for this route>" }`
      ).join(',\n')
    : `      { "from": "London", "to": "${destination}", "recommendedAirlines": ["<airline 1>", "<airline 2>"], "estimatedCost": "<£XXX–£YYY return>", "flightDuration": "<Xh Ym>", "bestTimeToBook": "<X weeks ahead>", "jadeTip": "<specific tip>" }`

  return `You are Jade, Walz Travels' elite AI travel concierge. Plan a premium 3-day group trip.

GROUP PROFILE:
- Destination: ${destination}
- Travellers: ${groupSize} people
- Nationalities: ${natList}
- Flying from: ${flyingFromList}
- Vibes: ${vibesSummary}
- Budgets: ${budgetsSummary}
- Vote results:\n${voteText}

Return ONLY valid JSON starting with { — no markdown, no backticks, no prose:
{
  "destination": "${destination}",
  "tagline": "<one punchy exciting line about this trip>",
  "duration": "3 days",
  "bestTimeToVisit": "<best months to visit>",
  "groupSize": ${groupSize},
  "highlights": ["<highlight 1>", "<highlight 2>", "<highlight 3>"],
  "days": [
    {
      "day": 1,
      "title": "<exciting day title>",
      "theme": "<day theme e.g. Arrival & First Impressions>",
      "activities": [
        { "time": "10:00", "title": "<name>", "description": "<2-3 sentences why this group will love it>", "duration": "<Xh>", "type": "culture", "cost": "<£Xpp>", "location": "<area>", "bookingTip": "<how to book>", "jadeTip": "<insider tip>" },
        { "time": "14:00", "title": "<name>", "description": "<2-3 sentences>", "duration": "<Xh>", "type": "food", "cost": "<£Xpp>", "location": "<area>", "bookingTip": "<tip>", "jadeTip": "<tip>" },
        { "time": "19:00", "title": "<name>", "description": "<2-3 sentences>", "duration": "<Xh>", "type": "dining", "cost": "<£Xpp>", "location": "<area>", "bookingTip": "<tip>", "jadeTip": "<tip>" }
      ],
      "meals": {
        "breakfast": { "venue": "<cafe/restaurant name>", "dish": "<recommended dish>", "cost": "<£Xpp>", "tip": "<quick tip>" },
        "lunch":     { "venue": "<venue name>", "dish": "<dish>", "cost": "<£Xpp>", "tip": "<tip>" },
        "dinner":    { "venue": "<restaurant name>", "dish": "<dish>", "cost": "<£Xpp>", "tip": "<book in advance>" }
      },
      "accommodation": { "name": "<real hotel name>", "area": "<neighbourhood>", "stars": 4, "priceRange": "<£XXX/night>", "whyWeChoseIt": "<one sentence>" },
      "dayBudget": "<total estimate per person excl. accommodation>"
    },
    {
      "day": 2,
      "title": "<title>", "theme": "<theme>",
      "activities": [
        { "time": "10:00", "title": "<n>", "description": "<d>", "duration": "<dur>", "type": "adventure", "cost": "<c>", "location": "<l>", "bookingTip": "<b>", "jadeTip": "<j>" },
        { "time": "14:00", "title": "<n>", "description": "<d>", "duration": "<dur>", "type": "leisure",   "cost": "<c>", "location": "<l>", "bookingTip": "<b>", "jadeTip": "<j>" },
        { "time": "19:00", "title": "<n>", "description": "<d>", "duration": "<dur>", "type": "dining",   "cost": "<c>", "location": "<l>", "bookingTip": "<b>", "jadeTip": "<j>" }
      ],
      "meals": {
        "breakfast": { "venue": "<v>", "dish": "<d>", "cost": "<c>", "tip": "<t>" },
        "lunch":     { "venue": "<v>", "dish": "<d>", "cost": "<c>", "tip": "<t>" },
        "dinner":    { "venue": "<v>", "dish": "<d>", "cost": "<c>", "tip": "<t>" }
      },
      "accommodation": { "name": "<hotel>", "area": "<area>", "stars": 4, "priceRange": "<price>", "whyWeChoseIt": "<reason>" },
      "dayBudget": "<budget>"
    },
    {
      "day": 3,
      "title": "<title>", "theme": "<theme>",
      "activities": [
        { "time": "10:00", "title": "<n>", "description": "<d>", "duration": "<dur>", "type": "shopping", "cost": "<c>", "location": "<l>", "bookingTip": "<b>", "jadeTip": "<j>" },
        { "time": "14:00", "title": "<n>", "description": "<d>", "duration": "<dur>", "type": "culture",  "cost": "<c>", "location": "<l>", "bookingTip": "<b>", "jadeTip": "<j>" },
        { "time": "18:00", "title": "<n>", "description": "<d>", "duration": "<dur>", "type": "leisure",  "cost": "<c>", "location": "<l>", "bookingTip": "<b>", "jadeTip": "<j>" }
      ],
      "meals": {
        "breakfast": { "venue": "<v>", "dish": "<d>", "cost": "<c>", "tip": "<t>" },
        "lunch":     { "venue": "<v>", "dish": "<d>", "cost": "<c>", "tip": "<t>" },
        "dinner":    { "venue": "<v>", "dish": "<d>", "cost": "<c>", "tip": "<t>" }
      },
      "accommodation": { "name": "<hotel>", "area": "<area>", "stars": 4, "priceRange": "<price>", "whyWeChoseIt": "<reason>" },
      "dayBudget": "<budget>"
    }
  ],
  "flightAdvice": {
    "summary": "<overall advice for booking flights to ${destination}>",
    "routes": [
${routeTemplate}
    ],
    "groupBookingTip": "<tip for booking as a group — same flight, group discount etc.>",
    "baggageAdvice": "<luggage tips specific to ${destination}>"
  },
  "packingList": {
    "essential": ["<item 1>", "<item 2>", "<item 3>", "<item 4>", "<item 5>"],
    "clothing":  ["<clothing 1>", "<clothing 2>", "<clothing 3>"],
    "tech":      ["<tech item 1>", "<tech item 2>"],
    "documents": ["Valid passport (6 months validity)", "Visa approval letter if required", "Travel insurance certificate", "Hotel booking confirmations", "Return flight tickets"],
    "jadePick":  "<one surprising packing item Jade recommends for ${destination}>"
  },
  "totalCost": {
    "budget":      "<low estimate per person incl. flights from ${flyingFromList}>",
    "comfortable": "<mid estimate per person>",
    "luxury":      "<high estimate per person>",
    "includes":    "Flights, accommodation, activities and meals",
    "excludes":    "Shopping, optional tours, personal expenses"
  },
  "jadeFinalWord": "<Jade warm 2-3 sentence personal message to the group about this specific trip>"
}`
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

  if (!session) return new Response(
    JSON.stringify({ type: 'error', error: 'Session not found' }) + '\n',
    { status: 404, headers: { 'Content-Type': 'text/event-stream' } },
  )

  // Always compute — fast and needed for every response
  const submitted   = session.members.filter(m => m.submittedAt && m.preferencesJson)
  const voteResults = computeVoteTally(submitted)
  const destination = session.destination ?? voteResults[0]?.destination ?? 'London'

  const membersForVisa = submitted.map(m => ({
    name:                m.name,
    passportNationality: (m.passportNationality ?? getPrefsField(m.preferencesJson, 'passportNationality')) || null,
    flyingFrom:          (m.flyingFrom ?? getPrefsField(m.preferencesJson, 'flyingFrom')) || null,
  }))
  const visaMatrix = buildVisaMatrix(membersForVisa, destination)

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch {}
      }

      try {
        // ── Cached ───────────────────────────────────────────────────────────
        if (session.status === 'locked' && session.itineraryJson && session.destination) {
          send({ type: 'complete', itinerary: session.itineraryJson, destination: session.destination, voteResults, visaMatrix, cached: true })
          controller.close()
          return
        }

        // ── Member context ────────────────────────────────────────────────────
        const groupSize     = session.members.length
        const flyingFromArr = [...new Set(membersForVisa.map(m => m.flyingFrom).filter(Boolean) as string[])]
        const nationalities = [...new Set(membersForVisa.map(m => m.passportNationality).filter(Boolean) as string[])]

        const vibes        = submitted.map(m => getPrefsField(m.preferencesJson, 'vibe')).filter(Boolean)
        const vibesSummary = vibes.length > 0 ? [...new Set(vibes)].join(', ') : 'mixed'

        const budgets = submitted.map(m => getPrefsField(m.preferencesJson, 'budget')).filter(Boolean)
        const budgetMap: Record<string, string> = {
          'under-500': 'Under £500', '500-1000': '£500–£1,000',
          '1000-2000': '£1,000–£2,000', '2000-plus': '£2,000+',
        }
        const budgetsSummary = budgets.length > 0
          ? [...new Set(budgets.map(b => budgetMap[b] ?? b))].join(', ')
          : 'mixed budgets'

        const voteText = voteResults.slice(0, 5)
          .map((v, i) => `  ${i === 0 ? '🏆' : `${i + 1}.`} ${v.destination} — ${v.points}pts (${v.percentage}%)`)
          .join('\n')

        const prompt = buildItineraryPrompt(
          destination, groupSize, vibesSummary, budgetsSummary,
          flyingFromArr, nationalities, voteText,
        )

        // ── Try Claude first (streaming) ─────────────────────────────────────
        let itinerary:  Record<string, unknown> | null = null
        let modelUsed   = ''
        let claudeError = ''

        if (process.env.ANTHROPIC_API_KEY) {
          const abort      = new AbortController()
          const claudeKill = setTimeout(() => abort.abort(), 45_000)

          try {
            const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
            let   fullText  = ''
            const stream    = anthropic.messages.stream(
              {
                model:      'claude-sonnet-4-6',
                max_tokens: 4000,
                system:     'You are Jade, Walz Travels AI travel concierge. Return ONLY valid JSON. No markdown, no backticks. Start with { and end with }.',
                messages:   [{ role: 'user', content: prompt }],
              },
              { signal: abort.signal },
            )

            stream.on('text', (text) => { fullText += text; send({ type: 'chunk', text }) })
            await stream.finalMessage()
            clearTimeout(claudeKill)

            console.log('[group/lock] Claude raw (first 300):', fullText.substring(0, 300))
            itinerary = extractJSON<Record<string, unknown>>(fullText)
            modelUsed  = 'claude-sonnet-4-6'
          } catch (err) {
            clearTimeout(claudeKill)
            claudeError = err instanceof Error ? err.message : String(err)
            console.error('[group/lock] Claude failed:', claudeError.slice(0, 200))
          }
        }

        // ── GPT-4o fallback ───────────────────────────────────────────────────
        if (!itinerary) {
          if (!process.env.OPENAI_API_KEY) {
            throw new Error(
              claudeError
                ? `Claude failed (${claudeError.slice(0, 120)}) and OPENAI_API_KEY is not configured.`
                : 'Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is configured.',
            )
          }

          send({ type: 'status', message: '✦ Jade is trying a different approach...' })

          // Periodic heartbeat keeps SSE connection alive during blocking GPT-4o call
          const heartbeat = setInterval(() => send({ type: 'status', message: '✦ Still building your itinerary...' }), 5_000)

          try {
            const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
            const completion = await openai.chat.completions.create({
              model:           'gpt-4o',
              max_tokens:      4000,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: 'You are Jade, Walz Travels AI travel concierge. Return ONLY valid JSON.' },
                { role: 'user',   content: prompt },
              ],
            })
            clearInterval(heartbeat)
            const text = completion.choices[0]?.message?.content ?? ''
            console.log('[group/lock] GPT-4o raw (first 300):', text.substring(0, 300))
            itinerary = extractJSON<Record<string, unknown>>(text)
            modelUsed  = 'gpt-4o'
            console.log('[group/lock] GPT-4o fallback succeeded:', destination)
          } catch (gptErr) {
            clearInterval(heartbeat)
            const gptMsg = gptErr instanceof Error ? gptErr.message : String(gptErr)
            throw new Error(
              [claudeError && `Claude: ${claudeError.slice(0, 100)}`, `GPT-4o: ${gptMsg.slice(0, 100)}`]
                .filter(Boolean).join(' | '),
            )
          }
        }

        const withModel = { ...itinerary, _modelUsed: modelUsed }
        const finalDest = (itinerary.destination as string | undefined) ?? destination

        await prisma.groupSession.update({
          where: { id: session.id },
          data:  { status: 'locked', destination: finalDest, itineraryJson: withModel as object },
        })

        send({ type: 'complete', itinerary: withModel, destination: finalDest, voteResults, visaMatrix })
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[group/lock] Error:', msg.slice(0, 300))
        send({ type: 'error', error: `Failed to generate itinerary: ${msg.slice(0, 150)}` })
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':   'keep-alive',
    },
  })
}
