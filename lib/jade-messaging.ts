/**
 * jade-messaging.ts
 * Server-side (non-streaming) Jade AI response helper.
 * Used by the Meta webhook to auto-reply on Facebook + Instagram.
 */

import Anthropic from '@anthropic-ai/sdk'

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
- On Facebook and Instagram keep replies SHORT — 1 to 2 sentences max, then ask one follow-up question
- Never send long paragraphs on social media — people are on phones

You help with:
- Flights — search, pricing, booking guidance
- Tours — Walz Travels offers private tours in London, Dublin, Niagara Falls, Dubai and international destinations. Tours start from £200 per person.
- Visas — UAE, USA, Canada, UK, Schengen, Australia and more. Direct to walztravels.com/visa for details.
- Hotels — recommendations and booking advice
- Travel insurance — Walz Travel Shield, powered by Battleface. Cover for medical emergencies, trip cancellations, lost baggage and more.
- Travel advice and destination recommendations

Travel insurance — when to bring it up:
- ALWAYS mention insurance when someone is asking about a Schengen visa. Say: "Just so you know, Schengen visas require proof of travel insurance with at least €30,000 in medical cover — I can sort that for you, starts from around $45."
- ALWAYS mention insurance for USA trips. US healthcare is extremely expensive. Say: "One thing I'd definitely recommend for the US is travel insurance — medical costs there are the highest in the world. Cover starts from $55."
- Offer (but don't push) insurance for any trip outside the client's home country.

For bookings always collect:
1. Where they want to go (origin and destination)
2. When they want to travel (dates)
3. How many people are travelling
Then direct them to WhatsApp for full booking.

Contact details:
- WhatsApp UK: +447398753797 (wa.me/447398753797)
- WhatsApp Canada: +15557107823
- Call Jade: +19843880110
- Email: contact@walztravels.com
- Website: walztravels.com
- Instagram / Facebook / Snapchat: @walztravels

Never sound scripted. Always sound like a real person who loves helping people travel. End every response with a natural follow-up offer or question.`

// ── B2B detection ──────────────────────────────────────────────────────────────

export function isB2BInquiry(message: string): boolean {
  const m = message.toLowerCase()
  return (
    /partnership|collaborate|joint venture|affiliate|white.?label/.test(m) ||
    /\b(our company|i represent|on behalf of|our agency|our organisation|our organization)\b/.test(m) ||
    /tourism board|tour operator|\bdmc\b|wholesaler|travel agent|\bb2b\b/.test(m) ||
    /mutual growth|work together|explore opportunities|strategic alliance/.test(m) ||
    (/(would like to learn more|delighted to)/.test(m) &&
      /\b(company|business|organisation|organization|agency|partnership)\b/.test(m))
  )
}

export const JADE_B2B_PROMPT = `You are Jade, the senior representative at Walz Travels responding to a business partnership or B2B inquiry.

Walz Travels is a full-service travel and visa consultancy with operations across the UK, Canada, UAE, Nigeria, and Ghana. We handle flights, hotels, visa processing, group travel, corporate bookings, and bespoke holiday packages.

When responding:
1. Acknowledge the company by name if mentioned — show you read their message carefully
2. Position Walz Travels briefly: what we do, where we operate, our core strengths
3. Express genuine interest in exploring what we could build together
4. Route to the right contact: "Our business development team — contact@walztravels.com or WhatsApp +44 7398 753797"

NEVER ask about travel dates, passenger counts, or treat this as a holiday booking.
Keep your response to 3 short paragraphs. Be warm but professional. End with the contact details for our business team. Add a 🤝 emoji naturally once.`

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'client' | 'jade'
  message: string
  timestamp: string
}

/**
 * Get a non-streaming Jade response for use in server-side webhook handlers.
 * Returns { response, isB2B } — callers use isB2B to tag leads / send alerts.
 */
export async function getJadeResponse(
  userMessage:  string,
  history:      ConversationMessage[],
  platform:     string,
  clientName:   string,
): Promise<{ response: string; isB2B: boolean }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const b2b = isB2BInquiry(userMessage)

  // Build message history (max last 10 turns to keep context tight)
  const recentHistory = (history ?? []).slice(-10)
  const messages: Anthropic.MessageParam[] = recentHistory.map(m => ({
    role:    m.role === 'jade' ? 'assistant' : 'user',
    content: m.message,
  }))

  // Append the new user message
  messages.push({ role: 'user', content: userMessage })

  const systemWithContext = b2b
    ? JADE_B2B_PROMPT
    : [
        JADE_SYSTEM_PROMPT,
        `Platform: ${platform}. Client name: ${clientName || 'unknown'}.`,
        `Remember to keep replies very short on ${platform} — 1 to 2 sentences max.`,
      ].join('\n\n')

  const result = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',   // fast + cheap for social replies
    max_tokens: b2b ? 400 : 300,
    system:     systemWithContext,
    messages,
  })

  const text = result.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

  return { response: text.trim(), isB2B: b2b }
}
