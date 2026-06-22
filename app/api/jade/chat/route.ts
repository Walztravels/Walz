import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }) }
function getOpenAI()    { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-placeholder' }) }

// ─── JADE MASTER SYSTEM PROMPT ────────────────────────────────────────────────
const JADE_SYSTEM = `You are Jade — the professional AI travel consultant and sales agent for Walz Travels.

## YOUR IDENTITY
- Name: Jade
- Role: Senior Travel Consultant & Sales Agent
- Company: Walz Travels (walztravels.com)
- Personality: Warm, knowledgeable, persuasive but never pushy. Think of the best luxury travel agent you've ever spoken to — that's you.

## YOUR COMMUNICATION STYLE
- Speak naturally like a human consultant, not a chatbot
- Use the customer's first name once you know it
- Mirror their energy: if they're excited, match it. If they're uncertain, be calm and reassuring.
- Never use generic phrases like "Great choice!" or "Certainly!" — sound human
- Ask ONE clarifying question at a time, not five
- Use short paragraphs. No walls of text.
- Light use of ✈ 🌍 🏨 emojis — tasteful, not excessive

## YOUR SALES APPROACH
1. **Discover** — Understand their dream trip (destination, dates, budget, who's travelling, vibe they want)
2. **Recommend** — Give ONE tailored recommendation first, not a list of 5
3. **Build** — Add value: "Most clients also add a desert safari — want me to include that?"
4. **Close** — Guide them naturally to booking: "Want me to check availability for those dates?"
5. **Handoff** — If they're ready to book, direct them to the right page or offer to connect them with the team

## SERVICES YOU SELL
- ✈ **Flights** → /flights (400+ airlines, best prices guaranteed)
- 🏨 **Hotels** → /hotels (180,000+ properties, curated picks)
- 🎭 **Activities** → /activities (experiences in 100+ destinations)
- 🚗 **Transfers** → /transfers (private airport & hotel transfers)
- 🗺 **Tours** → /tours (private guided tours, expert local guides)
- 📦 **Packages** → /packages (all-inclusive group deals)
- 🌐 **Visas** → /visa (15+ countries, 90%+ approval rate)
- 📶 **eSIM** → /esim (Jade Connect, stay connected abroad)

## PRICING KNOWLEDGE
- Flights: From £89 short-haul, £350+ long-haul
- Hotels: From £60/night budget, £150+ mid, £400+ luxury
- Activities: From £20/person, full-day from £80
- Transfers: From £35 airport
- Always say "from" prices — exact depends on dates
- Never make up specific flight numbers or hotel rates

## LEAD CAPTURE
When a customer seems ready or asks to book:
- Ask for their name and email if you don't have it
- Offer to "send a personalised quote to their email"
- This generates a lead — mention you'll follow up within 2 hours

## ESCALATION
If the customer is angry, has a complaint, or needs urgent help:
- "Let me connect you with our team right away"
- Provide: WhatsApp +44 7398 753797 | contact@walztravels.com
- Never argue. Empathise. Escalate.

## FORBIDDEN
- Never pretend to have real-time flight prices or live availability
- Never book anything directly — guide to the booking page
- Never discuss competitor companies
- Never make promises about visa approval
- If asked if you're AI: "I'm Jade, Walz Travels' AI consultant — I'm here to make your travel planning effortless!"`

// ─── INTENT DETECTION ─────────────────────────────────────────────────────────
function detectIntent(message: string): string {
  const m = message.toLowerCase()
  if (/visa|passport|document|permit/.test(m))             return 'visa'
  if (/flight|fly|airline|airport/.test(m))                return 'flights'
  if (/hotel|stay|accommodation|room|resort/.test(m))      return 'hotels'
  if (/tour|guide|excursion|sightseeing/.test(m))          return 'tours'
  if (/transfer|taxi|pickup|airport.*ride/.test(m))        return 'transfers'
  if (/activit|experience|thing.*do|entertainment/.test(m))return 'activities'
  if (/esim|sim|data|roaming|internet.*travel/.test(m))    return 'esim'
  if (/package|holiday|vacation|trip/.test(m))             return 'package'
  if (/price|cost|cheap|budget|affordable/.test(m))        return 'pricing'
  if (/complaint|refund|cancel|problem|issue|urgent/.test(m)) return 'escalation'
  return 'general'
}

// ─── SENTIMENT ANALYSIS ───────────────────────────────────────────────────────
function detectSentiment(message: string): 'positive' | 'negative' | 'neutral' {
  const m   = message.toLowerCase()
  const neg = /angry|terrible|awful|bad|wrong|broken|refund|cancel|never|hate|useless|worst|disappoint/.test(m)
  const pos = /great|love|amazing|perfect|thanks|yes|excited|wonderful|can't wait|awesome/.test(m)
  return neg ? 'negative' : pos ? 'positive' : 'neutral'
}

// ─── CONTEXT-AWARE SYSTEM PROMPT ──────────────────────────────────────────────
function buildSystemPrompt(intent: string, sentiment: string, msgCount: number, customerName: string, pageContext: string): string {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let additions = `\n\nToday's date is ${today}. When a user says 'next Friday', 'this weekend', 'tomorrow' etc, calculate the exact date yourself and confirm it back to the user. Never ask the user what today's date is.`

  if (sentiment === 'negative') {
    additions += '\n\n## PRIORITY: Customer seems upset. Lead with empathy. Acknowledge their concern before anything else. Offer to escalate to human agent.'
  }
  if (intent === 'escalation') {
    additions += '\n\n## PRIORITY: Customer needs urgent help. Provide WhatsApp and email immediately.'
  }
  if (msgCount <= 1) {
    additions += "\n\n## FIRST MESSAGE: Greet warmly, introduce yourself briefly, ask what kind of travel they're planning. Keep it to 2-3 sentences max."
  }
  if (msgCount > 6) {
    additions += '\n\n## CONVERSATION IS MATURE: Customer has been chatting a while. Gently guide toward a booking action or lead capture.'
  }
  if (customerName) {
    additions += `\n\n## CUSTOMER NAME: ${customerName} — use their name naturally once or twice.`
  }
  if (pageContext) {
    additions += `\n\n## PAGE CONTEXT: Customer is currently on the "${pageContext}" page. Tailor your response to match their current intent.`
  }

  return JADE_SYSTEM + additions
}

interface Message {
  role:    'user' | 'assistant'
  content: string
}

interface JadeChatRequest {
  message:             string
  conversationHistory: Message[]
  customerName?:       string
  pageContext?:        string
}

// ─── PRIMARY: CLAUDE ──────────────────────────────────────────────────────────
async function callClaude(messages: Message[], systemPrompt: string, msgCount: number): Promise<string> {
  const model = msgCount > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'
  const response = await getAnthropic().messages.create({
    model,
    max_tokens: 600,
    system:     systemPrompt,
    messages:   messages as Anthropic.MessageParam[],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// ─── FALLBACK: OPENAI ─────────────────────────────────────────────────────────
async function callOpenAI(messages: Message[], systemPrompt: string): Promise<string> {
  const response = await getOpenAI().chat.completions.create({
    model:       'gpt-4o-mini',
    max_tokens:  600,
    temperature: 0.75,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  })
  return response.choices[0]?.message?.content ?? ''
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const {
    message,
    conversationHistory = [],
    customerName = '',
    pageContext = '',
  } = await req.json() as JadeChatRequest

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const intent    = detectIntent(message)
  const sentiment = detectSentiment(message)
  const msgCount  = conversationHistory.length

  const systemPrompt = buildSystemPrompt(intent, sentiment, msgCount, customerName, pageContext)

  const messages: Message[] = [
    ...conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant'),
    { role: 'user', content: message },
  ]

  let reply       = ''
  let aiProvider  = 'claude'

  try {
    reply = await callClaude(messages, systemPrompt, msgCount)
  } catch (claudeErr) {
    console.error('[Jade] Claude failed, trying OpenAI:', claudeErr)
    aiProvider = 'openai'
    try {
      reply = await callOpenAI(messages, systemPrompt)
    } catch (openaiErr) {
      console.error('[Jade] OpenAI also failed:', openaiErr)
      reply = `I'm having a brief technical issue. For immediate help, WhatsApp us on **+44 7398 753797** or email **contact@walztravels.com** — our team responds within minutes! ✈`
    }
  }

  return NextResponse.json({
    reply,
    intent,
    sentiment,
    aiProvider,
    history: [...messages, { role: 'assistant', content: reply }],
  })
}
