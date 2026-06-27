import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

async function isAdmin() {
  const c = await cookies()
  return !!(c.get('admin_token')?.value)
}

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const { destination, duration, tripType, numberOfTravellers, budget, notes } = await req.json()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Create a detailed day-by-day travel itinerary.

Destination: ${destination}
Duration: ${duration || 7} days
Trip type: ${tripType || 'leisure'}
Travellers: ${numberOfTravellers || 1}
Budget: ${budget ? `${budget}` : 'flexible'}
Special notes: ${notes || 'none'}

Return ONLY a JSON object with this exact structure (no markdown, no preamble):
{
  "overview": "2-3 sentence engaging trip overview",
  "inclusions": ["item1", "item2", "item3"],
  "exclusions": ["item1", "item2"],
  "days": [
    {
      "day": 1,
      "title": "Arrival & First Impressions",
      "description": "Exciting paragraph about this day",
      "activities": ["Activity 1 with detail", "Activity 2 with detail"],
      "meals": "Breakfast at hotel, Lunch at local restaurant, Welcome dinner at top spot",
      "accommodation": "Hotel name",
      "notes": "Any special tips or notes"
    }
  ]
}`,
      }],
    }),
  })

  if (!response.ok) return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
  const aiData = await response.json()
  const text = aiData.content?.[0]?.text ?? ''
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 })
  }
}
