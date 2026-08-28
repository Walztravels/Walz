import { NextRequest, NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { BUSINESS } from '@/lib/config/business'


export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const SYSTEM_PROMPT = `You are Jade, the AI travel consultant for Walz Travels.
You help customers plan and book complete travel experiences.

## YOUR ROLE
When a customer describes what they want (destination, duration, interests, budget), help them
understand their options and guide them to start a live search. You do NOT estimate prices —
all prices must come from live search results.

## SERVICES
- Flights (hundreds of airlines, global) → /flights
- Hotels (180,000+ properties worldwide) → /hotels
- Activities (experiences in 100+ destinations) → /activities
- Transfers (airport & hotel transfers) → /transfers
- Tours (private guided tours) → /tours
- Packages (all-inclusive group deals) → /packages

## RESPONDING TO TRAVEL QUERIES
1. Acknowledge what the customer wants
2. Confirm what information you have (destination, dates, travellers, budget)
3. Guide them to the relevant search page, or offer to start a live search
4. Do NOT quote price estimates — say "I can search for current options" instead

## COMMERCIAL GROUNDING — NON-NEGOTIABLE
- Never quote estimated prices, fare bands, or approximate costs from memory
- Never convert currencies without an authoritative server exchange rate
- Never say prices are "around", "roughly", "approximately", or "from £X" unless a live search result provided that exact figure
- When no search has been run: say what you can search, not what you think it costs

For bookings, direct customers to the exact page path (so they become clickable links):
/flights | /hotels | /activities | /transfers | /cart

Keep responses friendly, professional and concise.
Company contact: contact@walztravels.com | WhatsApp: ${BUSINESS.contacts.globalWhatsapp.display}`

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
    const response = await getAnthropic().messages.create({
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
      { reply: `I'm having trouble right now. WhatsApp us on ${BUSINESS.contacts.globalWhatsapp.display} for instant help.` },
      { status: 200 }
    )
  }
}
