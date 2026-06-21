import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 15   // fail fast — don't block results list

/**
 * POST /api/flights/ai-recommend
 *
 * Passes offers + user preferences to Claude and returns a single recommended
 * offer with a plain-language reason.
 *
 * Body:
 *   offers:      FlightItinerary[]   (full array from Duffel/mock)
 *   preferences: { budget?: number; cabin?: string; flexible?: boolean; preferDirect?: boolean }
 *   miles:       number              (Walz Miles balance — 0 if guest)
 *
 * Returns:
 *   { offerId: string; reason: string; confidence: number }   on success
 *   { offerId: null }                                          on timeout or Claude error
 */
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ offerId: null })
  }

  const body = await req.json().catch(() => null)
  if (!body?.offers?.length) return NextResponse.json({ offerId: null })

  const { offers, preferences = {}, miles = 0 } = body as {
    offers:      unknown[]
    preferences: { budget?: number; cabin?: string; flexible?: boolean; preferDirect?: boolean }
    miles:       number
  }

  // Trim to top 12 offers with only the fields Claude needs — reduces token count
  type OfferSlim = {
    id: string; stops: number; totalDuration: number
    price: { total: number; currency: string }
    fareType: string; refundable: boolean; changeable: boolean
    segments: { airline: string; departureIata: string; arrivalIata: string; departureTime: string; arrivalTime: string }[]
    baggageInfo: { cabin: string; checked: string; included: boolean }
    badge?: string
  }

  const slimmed: OfferSlim[] = (offers as OfferSlim[]).slice(0, 12).map(o => ({
    id:            o.id,
    stops:         o.stops,
    totalDuration: o.totalDuration,
    price:         { total: o.price?.total ?? 0, currency: o.price?.currency ?? 'GBP' },
    fareType:      o.fareType,
    refundable:    o.refundable,
    changeable:    o.changeable,
    segments:      (o.segments ?? []).slice(0, 2).map(s => ({
      airline:       s.airline,
      departureIata: s.departureIata,
      arrivalIata:   s.arrivalIata,
      departureTime: s.departureTime,
      arrivalTime:   s.arrivalTime,
    })),
    baggageInfo:   o.baggageInfo,
    badge:         o.badge,
  }))

  const prompt = `You are a flight recommendation engine for Walz Travels.

USER PREFERENCES:
- Budget: ${preferences.budget ? `£${preferences.budget}` : 'flexible'}
- Preferred cabin: ${preferences.cabin ?? 'ECONOMY'}
- Flexible on dates: ${preferences.flexible ? 'yes' : 'no'}
- Prefers direct: ${preferences.preferDirect ? 'yes' : 'any'}
- Walz Miles balance: ${miles} miles (higher balance = consider upgrade/rewards)

FLIGHT OFFERS (${slimmed.length} options):
${JSON.stringify(slimmed, null, 2)}

Pick the single best offer considering: value, duration, stops, refundability, baggage, departure time, and the user's preferences. If the user has plenty of miles, consider whether a slightly more expensive option earns more miles or unlocks a better fare.

Return ONLY valid JSON, no markdown:
{
  "offerId": "<the id field of the chosen offer>",
  "reason": "<one clear sentence explaining why — mention price, stops, or timing>",
  "confidence": <0.0 to 1.0>
}`

  try {
    const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw   = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const rec   = JSON.parse(clean) as { offerId: string; reason: string; confidence: number }

    // Validate the returned offerId actually exists in our offers list
    const valid = slimmed.some(o => o.id === rec.offerId)
    if (!valid || !rec.reason) return NextResponse.json({ offerId: null })

    return NextResponse.json({
      offerId:    rec.offerId,
      reason:     rec.reason,
      confidence: Math.min(1, Math.max(0, Number(rec.confidence) || 0.7)),
    })
  } catch {
    // Timeout or Claude error — fall back silently, callers show all offers normally
    return NextResponse.json({ offerId: null })
  }
}
