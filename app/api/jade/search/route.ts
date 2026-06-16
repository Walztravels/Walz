import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const SYSTEM_PROMPT = `You are Jade, the AI travel assistant for Walz Travels.
You help customers plan and book complete travel experiences.

When a customer describes what they want (destination, duration, interests, budget),
suggest a complete package recommendation with estimated prices.

You have access to these services:
- Flights (400+ airlines, global)
- Hotels (180,000+ properties worldwide)
- Activities (things to do in 100+ destinations)
- Transfers (airport & hotel transfers)
- Tours (private guided tours with expert local guides)
- Packages (all-inclusive group deals)

When responding to travel queries:
1. Acknowledge what the customer wants
2. Suggest a complete recommended package with estimated prices in GBP/USD
3. Break it down: Flight estimate + Hotel estimate + Activities + Transfer
4. Show a total estimated price range
5. End with a clear call to action directing them to the relevant page

For bookings, direct customers to these pages (use the exact path so they become clickable links):
- /flights — search and book flights
- /hotels — search and book hotels
- /activities — browse activities and experiences
- /transfers — book airport or hotel transfers
- /cart — review cart and checkout

Keep responses friendly, professional and concise. Use emojis sparingly.
Always clarify that exact prices depend on travel dates and availability.
Company contact: contact@walztravels.com | WhatsApp: +44 7398 753797`

interface Message {
  role:    'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  const { message, conversationHistory = [] } = await req.json() as {
    message:             string
    conversationHistory: Message[]
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const messages: Message[] = [
    ...conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant'),
    { role: 'user', content: message },
  ]

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages,
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''

    return NextResponse.json({
      reply,
      history: [...messages, { role: 'assistant', content: reply }],
    })
  } catch (err: unknown) {
    console.error('[Jade search]', err)
    return NextResponse.json(
      { reply: "I'm having trouble right now. WhatsApp us on +44 7398 753797 for instant help." },
      { status: 200 }
    )
  }
}
