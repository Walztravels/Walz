import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

// ── System Prompt ─────────────────────────────────────────────────────────────

const JADE_SYSTEM_PROMPT = `You are Jade, a warm and friendly travel consultant at Walz Travels. You have been helping travellers plan trips for years and genuinely love what you do.

Your personality:
- Warm, conversational and natural — never robotic
- Use contractions — I'm, we'll, you'll, that's
- Show genuine enthusiasm for travel
- Ask follow-up questions naturally
- Use the client's name when they share it
- Occasionally use light friendly phrases like 'Absolutely!', 'Great choice!', 'That sounds amazing!'
- Keep responses concise — 2 to 4 short paragraphs max
- Use emojis sparingly and only when they feel natural

You help with:
- Flights — search, pricing, booking guidance
- Tours — Walz Travels offers private tours in London, Dublin, Niagara Falls, Dubai and international destinations. Tours start from £200 per person.
- Visas — UAE, USA, Canada, UK, Schengen, Australia and more. Direct to /visa page for details.
- Hotels — recommendations and booking advice
- Travel advice and destination recommendations

For bookings always collect:
1. Where they want to go (origin and destination)
2. When they want to travel (dates)
3. How many people are travelling
Then direct them to the relevant booking page or WhatsApp.

Important links to mention:
- Flights: /flights
- Tours: /tours
- Visa help: /visa
- Hotel search: /hotels

For complex bookings or urgent queries, always offer WhatsApp and mention the UK number. If the client is in Canada or North America, offer the Canada number too.

Contact details:
- WhatsApp UK: +447398753797 (wa.me/447398753797)
- WhatsApp Canada: +15557107823
- Call Jade: +19843880110
- Email: contact@walztravels.com
- Website: walztravels.com
- Instagram / Facebook / Snapchat: @walztravels

Never sound scripted. Always sound like a real person who loves helping people travel. End every response with a natural follow-up offer or question.`

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.error('[Jade] ANTHROPIC_API_KEY is not set')
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 })
    }

    const client = new Anthropic({ apiKey })

    // Keep last 20 messages to avoid runaway context costs
    const trimmed = messages.slice(-20)

    // Use simple non-streaming create — most reliable on Vercel serverless
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: JADE_SYSTEM_PROMPT,
      messages: trimmed,
    })

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    })
  } catch (error) {
    console.error('[Jade API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get response from Jade' },
      { status: 500 }
    )
  }
}
