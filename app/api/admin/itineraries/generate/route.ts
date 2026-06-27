import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { destination, destinations, duration, tripType, numberOfTravellers, budget, notes } = await req.json()

  const destList: string[] = destinations && Array.isArray(destinations) && destinations.length > 0
    ? destinations
    : destination ? [destination] : []
  const destLabel = destList.length > 0 ? destList.join(' → ') : 'the destination'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 50000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Create a detailed day-by-day travel itinerary for a luxury travel agency.

Destination(s): ${destLabel}
Duration: ${duration || 7} days
Trip type: ${tripType || 'leisure'}
Travellers: ${numberOfTravellers || 1}
Budget: ${budget || 'flexible'}
Special notes: ${notes || 'none'}

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
}`,
        }],
      }),
    })

    clearTimeout(timer)

    if (!response.ok) {
      return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 })
    }

    const aiData = await response.json()
    const text = aiData.content?.[0]?.text ?? ''

    try {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1) throw new Error('No JSON found')
      const parsed = JSON.parse(text.slice(start, end + 1))
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ error: 'AI returned unexpected format. Please try again.', raw: text.slice(0, 300) }, { status: 500 })
    }
  } catch (err: unknown) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Generation timed out after 50 seconds. Please try again or reduce the number of days.' }, { status: 504 })
    }
    return NextResponse.json({ error: 'Failed to generate itinerary. Please try again.' }, { status: 500 })
  }
}
