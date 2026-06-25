import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'
import prisma                        from '@/lib/db'
import { buildVisaMatrix }           from '@/lib/visa-lookup'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 60

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
    // repair trailing commas
    try { return JSON.parse(slice.replace(/,(\s*[}\]])/g, '$1')) as T } catch {}
  }
  throw new Error('Could not parse JSON from AI response')
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
        // ── Cached — return immediately ──────────────────────────────────────
        if (session.status === 'locked' && session.itineraryJson && session.destination) {
          send({ type: 'complete', itinerary: session.itineraryJson, destination: session.destination, voteResults, visaMatrix, cached: true })
          controller.close()
          return
        }

        if (!process.env.ANTHROPIC_API_KEY) {
          send({ type: 'error', error: 'AI service not configured — contact support.' })
          controller.close()
          return
        }

        // ── Member context ────────────────────────────────────────────────────
        const groupSize = session.members.length

        const flyingFromSet  = new Set(membersForVisa.map(m => m.flyingFrom).filter(Boolean) as string[])
        const flyingFromList = flyingFromSet.size > 0 ? [...flyingFromSet].join(', ') : 'various cities'

        const vibes = submitted.map(m => getPrefsField(m.preferencesJson, 'vibe')).filter(Boolean)
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
          .map((v, i) => `${i === 0 ? '🏆' : `${i + 1}.`} ${v.destination} — ${v.points}pts (${v.percentage}%)`)
          .join('\n')

        // ── Prompt (concise — 3 days, max_tokens 2000 for fast response) ─────
        const prompt = `You are Jade, Walz Travels' AI travel planner. Create a 3-day group trip to ${destination} for ${groupSize} people.

Flying from: ${flyingFromList}
Group vibes: ${vibesSummary}
Budgets: ${budgetsSummary}
Destination vote: ${voteText}

Return ONLY valid JSON starting with { — no markdown, no prose:
{
  "destination": "${destination}",
  "duration": "3 days",
  "groupSize": ${groupSize},
  "tagline": "<5-8 word tagline for this specific group>",
  "highlights": ["<top highlight 1>", "<top highlight 2>", "<top highlight 3>"],
  "days": [
    {
      "day": 1,
      "title": "<evocative day title>",
      "activities": [
        {"time":"10:00","title":"<name>","description":"<what it is and why this group will love it — 2 sentences>","type":"culture","cost":"<£Xpp>","jadeTip":"<insider tip>"},
        {"time":"14:00","title":"<name>","description":"<2 sentences>","type":"food","cost":"<£Xpp>","jadeTip":"<insider tip>"},
        {"time":"19:00","title":"<name>","description":"<2 sentences>","type":"dining","cost":"<£Xpp>","jadeTip":"<insider tip>"}
      ],
      "accommodation": "<Real hotel name in ${destination}>",
      "dayBudget": "<£X–£Ypp excluding accommodation>"
    },
    {
      "day": 2,
      "title": "<day 2 title>",
      "activities": [
        {"time":"10:00","title":"<name>","description":"<2 sentences>","type":"adventure","cost":"<£Xpp>","jadeTip":"<tip>"},
        {"time":"14:00","title":"<name>","description":"<2 sentences>","type":"leisure","cost":"<£Xpp>","jadeTip":"<tip>"},
        {"time":"19:00","title":"<name>","description":"<2 sentences>","type":"dining","cost":"<£Xpp>","jadeTip":"<tip>"}
      ],
      "accommodation": "<hotel name>",
      "dayBudget": "<£X–£Ypp>"
    },
    {
      "day": 3,
      "title": "<day 3 title>",
      "activities": [
        {"time":"10:00","title":"<name>","description":"<2 sentences>","type":"shopping","cost":"<£Xpp>","jadeTip":"<tip>"},
        {"time":"14:00","title":"<name>","description":"<2 sentences>","type":"culture","cost":"<£Xpp>","jadeTip":"<tip>"},
        {"time":"18:00","title":"<name>","description":"<2 sentences>","type":"leisure","cost":"<£Xpp>","jadeTip":"<tip>"}
      ],
      "accommodation": "<hotel name>",
      "dayBudget": "<£X–£Ypp>"
    }
  ],
  "totalCost": {
    "budget": "<total per person inc. flights from ${flyingFromList} — budget travellers>",
    "comfortable": "<total — comfortable experience>",
    "luxury": "<total — luxury experience>"
  },
  "jadeFinalWord": "<Jade's warm personal message to the group — 2 sentences>"
}`

        // ── Stream from Claude ────────────────────────────────────────────────
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        let fullText = ''
        const stream = anthropic.messages.stream({
          model:      'claude-sonnet-4-6',
          max_tokens: 2000,
          messages:   [{ role: 'user', content: prompt }],
        })

        stream.on('text', (text) => {
          fullText += text
          send({ type: 'chunk', text })
        })

        await stream.finalMessage()

        console.log('[group/lock] Raw Claude (first 500):', fullText.substring(0, 500))

        const itinerary = extractJSON<Record<string, unknown>>(fullText)
        const finalDest = (itinerary.destination as string | undefined) ?? destination

        await prisma.groupSession.update({
          where: { id: session.id },
          data:  {
            status:        'locked',
            destination:   finalDest,
            itineraryJson: itinerary as object,
          },
        })

        send({ type: 'complete', itinerary, destination: finalDest, voteResults, visaMatrix })
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
