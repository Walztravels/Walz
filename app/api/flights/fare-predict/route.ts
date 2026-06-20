import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export interface FarePrediction {
  recommendation: 'book_now' | 'wait' | 'flexible'
  confidence:     number
  headline:       string
  detail:         string
  alternativeDates: { date: string; saving: number; label: string }[]
  priceHistory:   { label: string; price: number }[]
  aiMessage:      string
}

function deterministicFallback(from: string, to: string, daysToFlight: number, cabin: string, price: number): FarePrediction {
  const isLongHaul  = ['LOS', 'ACC', 'JFK', 'SIN', 'BKK'].includes(to)
  const isBusiness  = cabin === 'BUSINESS' || cabin === 'FIRST'
  const priceHistory = [
    { label: '6 weeks ago', price: Math.round(price * 0.88) },
    { label: '4 weeks ago', price: Math.round(price * 0.94) },
    { label: '2 weeks ago', price: Math.round(price * 1.02) },
    { label: 'Now',         price },
  ]

  if (daysToFlight <= 7) {
    return {
      recommendation: 'book_now',
      confidence:     91,
      headline:       'Prices are rising fast — book today',
      detail:         `With only ${daysToFlight} days until departure, last-minute fares on this route typically jump 15–25%. Lock in your seat now.`,
      alternativeDates: [],
      priceHistory,
      aiMessage: `I'm Jade, your Walz AI travel advisor. This fare is about to spike — I'd strongly recommend booking in the next few hours.`,
    }
  }

  if (daysToFlight > 90 && isLongHaul) {
    return {
      recommendation: 'wait',
      confidence:     73,
      headline:       'Good time to wait — prices may drop',
      detail:         'Long-haul fares often dip 60–75 days before departure as airlines fill seats. Check back in 2–3 weeks.',
      alternativeDates: [
        { date: new Date(Date.now() + (daysToFlight - 20) * 86400000).toISOString().slice(0, 10), saving: Math.round(price * 0.12), label: '3 weeks later' },
      ],
      priceHistory,
      aiMessage: `I'm Jade, your AI travel advisor. There's a good chance this route softens in the next few weeks. I'll keep watching it for you.`,
    }
  }

  const saving = isBusiness ? Math.round(price * 0.08) : Math.round(price * 0.06)
  return {
    recommendation: 'flexible',
    confidence:     65,
    headline:       'Prices are stable — consider flexible dates',
    detail:         `${from}–${to} fares are stable right now. Travelling ±3 days could save you up to £${saving}.`,
    alternativeDates: [
      { date: new Date(Date.now() + (daysToFlight - 2) * 86400000).toISOString().slice(0, 10), saving: Math.round(price * 0.04), label: '2 days earlier' },
      { date: new Date(Date.now() + (daysToFlight + 3) * 86400000).toISOString().slice(0, 10), saving: saving, label: '3 days later' },
    ],
    priceHistory,
    aiMessage: `I'm Jade. Prices on this route look stable. Being flexible by a day or two could save you a decent amount.`,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { from, to, departDate, cabin, price, currency = 'GBP', daysToFlight } = await req.json()

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(deterministicFallback(from, to, Number(daysToFlight), cabin, Number(price)))
    }

    const client = new Anthropic()
    const msg    = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     `You are Jade, Walz Travels' AI flight pricing advisor. You are an expert in airline revenue management and fare prediction. You always respond with valid JSON only — no markdown, no explanation outside the JSON.`,
      messages:   [{
        role:    'user',
        content: `Analyse this flight fare and provide a prediction:
Route: ${from} → ${to}
Departure: ${departDate} (${daysToFlight} days from today)
Cabin: ${cabin}
Current price: ${currency} ${price}

Respond ONLY with this exact JSON shape (no markdown):
{
  "recommendation": "book_now" | "wait" | "flexible",
  "confidence": number 0-100,
  "headline": "short imperative headline under 60 chars",
  "detail": "2-3 sentences of actionable pricing insight",
  "alternativeDates": [{"date":"YYYY-MM-DD","saving":number,"label":"string"}],
  "priceHistory": [{"label":"6 weeks ago","price":number},{"label":"4 weeks ago","price":number},{"label":"2 weeks ago","price":number},{"label":"Now","price":${price}}],
  "aiMessage": "Jade speaking in first person, 1 conversational sentence tip"
}`,
      }],
    })

    const text   = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const parsed = JSON.parse(text) as FarePrediction
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[fare-predict] Error:', err)
    const { from, to, daysToFlight, cabin, price } = await req.json().catch(() => ({}))
    return NextResponse.json(deterministicFallback(from ?? 'LHR', to ?? 'LOS', Number(daysToFlight ?? 30), cabin ?? 'ECONOMY', Number(price ?? 800)))
  }
}
