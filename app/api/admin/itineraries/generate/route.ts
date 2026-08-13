import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const maxDuration = 60

const PROMPT_TEMPLATE = (destLabel: string, duration: number, tripType: string, numberOfTravellers: number | string, budget: string | number, notes: string) => `Create a detailed day-by-day travel itinerary for a luxury travel agency.

Destination(s): ${destLabel}
Duration: ${duration} days
Trip type: ${tripType}
Travellers: ${numberOfTravellers}
Budget: ${budget}
Special notes: ${notes}

Return ONLY a valid JSON object with no markdown, no preamble, just the JSON:
{
  "overview": "2-3 sentence engaging trip overview",
  "inclusions": ["Included item 1", "Included item 2", "Included item 3"],
  "exclusions": ["Excluded item 1", "Excluded item 2"],
  "days": [
    {
      "day": 1,
      "title": "Arrival & First Impressions",
      "description": "Engaging paragraph about this day",
      "activities": ["Specific activity 1", "Specific activity 2"],
      "meals": "Breakfast at hotel, Lunch at local spot, Welcome dinner",
      "accommodation": "Hotel name",
      "destination": "City or location for this day",
      "weather": "Expected weather e.g. Warm 28°C, sunny",
      "dressCode": "e.g. Smart casual, beach wear, formal",
      "notes": "Practical tips for this day"
    }
  ]
}`

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const start = text.indexOf('{')
    const end   = text.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { destination, destinations, duration, tripType, numberOfTravellers, budget, notes } = await req.json()

  const destList: string[] = destinations && Array.isArray(destinations) && destinations.length > 0
    ? destinations
    : destination ? [destination] : []
  const destLabel = destList.length > 0 ? destList.join(' → ') : 'the destination'

  const prompt = PROMPT_TEMPLATE(
    destLabel,
    duration || 7,
    tripType || 'leisure',
    numberOfTravellers || 1,
    budget || 'flexible',
    notes || 'none',
  )

  // ── Try OpenAI gpt-4o-mini first (fast, ~5-10s for 7 days) ──────────────
  const openAiKey = process.env.OPENAI_API_KEY
  if (openAiKey) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25000)
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 3500,
          response_format: { type: 'json_object' },
        }),
      })
      clearTimeout(timer)
      if (res.ok) {
        const data = await res.json() as { choices: Array<{ message: { content: string } }> }
        const parsed = parseJson(data.choices?.[0]?.message?.content || '')
        if (parsed?.days) return NextResponse.json(parsed)
      }
    } catch (err) {
      clearTimeout(timer)
      if ((err as Error).name !== 'AbortError') console.error('[generate] OpenAI error:', err)
    }
  }

  // ── Fall back to Claude Haiku (fast, ~8-15s for 7 days) ─────────────────
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    clearTimeout(timer)

    if (!res.ok) return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 })

    const aiData = await res.json() as { content: Array<{ text: string }> }
    const parsed = parseJson(aiData.content?.[0]?.text ?? '')
    if (parsed?.days) return NextResponse.json(parsed)

    return NextResponse.json({ error: 'AI returned unexpected format. Please try again.' }, { status: 500 })
  } catch (err: unknown) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Generation timed out. Please try again.' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to generate itinerary. Please try again.' }, { status: 500 })
  }
}
