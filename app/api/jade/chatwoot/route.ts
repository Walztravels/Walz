import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI   from 'openai'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const CHATWOOT_BASE  = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = '1'
const INBOX_ID       = '3'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai    = new OpenAI({    apiKey: process.env.OPENAI_API_KEY })

// ─── Chatwoot REST helpers ────────────────────────────────────────────────────

async function cwFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${CHATWOOT_BASE}/api/v1${path}`, {
    ...opts,
    headers: {
      'Content-Type':     'application/json',
      'api_access_token': CHATWOOT_TOKEN,
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Chatwoot ${path} → ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

async function getOrCreateContact(identifier: string, name: string): Promise<number> {
  try {
    const search = await cwFetch(
      `/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(identifier)}&include_contacts=true`
    )
    const found = search?.payload?.contacts?.[0]
    if (found?.id) return found.id as number
  } catch {}

  const contact = await cwFetch(`/accounts/${ACCOUNT_ID}/contacts`, {
    method: 'POST',
    body:   JSON.stringify({ name: name || 'Website Visitor', identifier }),
  })
  return (contact?.payload?.contact?.id ?? contact?.id ?? contact?.payload?.id) as number
}

async function getOrCreateConversation(contactId: number, conversationId?: number | null): Promise<number> {
  if (conversationId) return conversationId

  const conv = await cwFetch(`/accounts/${ACCOUNT_ID}/conversations`, {
    method: 'POST',
    body:   JSON.stringify({
      inbox_id:              Number(INBOX_ID),
      contact_id:            contactId,
      additional_attributes: { initiated_at: { timestamp: new Date().toISOString() } },
    }),
  })
  return (conv?.id ?? conv?.data?.id) as number
}

async function sendCwMessage(conversationId: number, content: string, type: 'incoming' | 'outgoing') {
  // Chatwoot requires numeric message_type: 0 = incoming (visitor), 1 = outgoing (agent)
  const message_type = type === 'incoming' ? 0 : 1
  return cwFetch(`/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`, {
    method: 'POST',
    body:   JSON.stringify({ content, message_type, content_type: 'text', private: false }),
  })
}

// ─── Jade AI (Claude primary → OpenAI fallback) ───────────────────────────────

const JADE_SYSTEM = `You are Jade — the professional AI travel consultant and sales agent for Walz Travels.

## YOUR IDENTITY
Name: Jade | Role: Senior Travel Consultant & Sales Agent | Company: Walz Travels (walztravels.com)

## YOUR COMMUNICATION STYLE
- Speak naturally like a human consultant, not a chatbot
- Use the customer's first name once you know it
- Mirror their energy — match excitement, be calm when uncertain
- Never use "Great choice!" or "Certainly!" — sound human
- Ask ONE clarifying question at a time. Short paragraphs. No walls of text.
- Light use of ✈ 🌍 🏨 emojis — tasteful, not excessive

## YOUR SALES APPROACH
1. Discover — destination, dates, budget, who's travelling, vibe
2. Recommend — ONE tailored recommendation first
3. Build value — "Most clients also add a desert safari — want me to include that?"
4. Close naturally — "Want me to check availability for those dates?"
5. Handoff — direct to booking page or offer to connect with the team

## SERVICES
- ✈ Flights → /flights (400+ airlines) | 🏨 Hotels → /hotels (180,000+ properties)
- 🎭 Activities → /activities | 🚗 Transfers → /transfers
- 🗺 Tours → /tours | 📦 Packages → /packages
- 🌐 Visas → /visa (15+ countries, 90%+ approval rate) | 📶 eSIM → /esim

## PRICING KNOWLEDGE
Flights from £89 short-haul, £350+ long-haul | Hotels £60–£400+/night
Activities from £20/person | Transfers from £35 | Always say "from" prices

## ESCALATION
Angry/urgent customer → WhatsApp +44 7398 753797 | contact@walztravels.com immediately

## FORBIDDEN
Never pretend to have real-time prices | Never book directly | Never promise visa approval
If asked if you're AI: "I'm Jade, Walz Travels' AI consultant — here to make travel planning effortless!"`

interface Msg { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(msgCount: number, customerName: string, pageContext: string): string {
  let extra = ''
  if (msgCount <= 1) extra += "\n\n## FIRST MESSAGE: Greet warmly, introduce yourself briefly, ask what they're planning. 2-3 sentences max."
  if (msgCount > 6)  extra += '\n\n## MATURE CONVERSATION: Gently guide toward booking or lead capture.'
  if (customerName)  extra += `\n\n## CUSTOMER NAME: ${customerName} — use naturally once or twice.`
  if (pageContext)   extra += `\n\n## PAGE CONTEXT: Customer is on "${pageContext}" page.`
  return JADE_SYSTEM + extra
}

async function jadeReply(messages: Msg[], customerName: string, pageContext: string): Promise<string> {
  const systemPrompt = buildSystemPrompt(messages.length, customerName, pageContext)

  try {
    const res = await anthropic.messages.create({
      model:      messages.length > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
      max_tokens: 500,
      system:     systemPrompt,
      messages:   messages as Anthropic.MessageParam[],
    })
    return res.content[0].type === 'text' ? res.content[0].text : ''
  } catch (e) {
    console.error('[Jade] Claude failed:', e)
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 500, temperature: 0.75,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  } catch (e) {
    console.error('[Jade] OpenAI failed:', e)
  }

  return "I'm having a brief technical issue. For immediate help, WhatsApp us on +44 7398 753797 or email contact@walztravels.com ✈"
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const {
    message,
    conversationHistory = [],
    sessionId,
    conversationId,
    customerName  = '',
    pageContext   = '',
  } = await req.json()

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const messages: Msg[] = [
    ...conversationHistory,
    { role: 'user', content: message },
  ]

  // Always generate the AI reply — even if Chatwoot fails, the user still gets a response
  const replyPromise = jadeReply(messages, customerName, pageContext)

  let convId: number | null = null

  // Attempt Chatwoot integration (non-blocking on failure)
  try {
    const identifier = (sessionId as string | undefined) ?? `web-${Date.now()}`
    const contactId  = await getOrCreateContact(identifier, customerName || 'Website Visitor')
    convId           = await getOrCreateConversation(contactId, conversationId as number | null | undefined)

    // Send visitor message to Chatwoot
    await sendCwMessage(convId, message, 'incoming')

    // Wait for AI reply then post it as outgoing
    const reply = await replyPromise
    await sendCwMessage(convId, reply, 'outgoing')

    return NextResponse.json({
      reply,
      conversationId: convId,
      chatwootUrl:    `${CHATWOOT_BASE}/app/accounts/${ACCOUNT_ID}/conversations/${convId}`,
    })
  } catch (cwErr) {
    console.error('[Jade Chatwoot] Chatwoot error (replying anyway):', cwErr)

    // Chatwoot failed — still send the AI reply to the user
    const reply = await replyPromise
    return NextResponse.json({ reply, conversationId: null })
  }
}
