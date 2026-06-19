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

// ─── Chatwoot helpers ─────────────────────────────────────────────────────────

async function cwPost(path: string, body: unknown) {
  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(`${CHATWOOT_BASE}/api/v1${path}`, {
      method:  'POST',
      signal:  ac.signal,
      headers: {
        'Content-Type':     'application/json',
        'api_access_token': CHATWOOT_TOKEN,
      },
      body: JSON.stringify(body),
    })
    clearTimeout(t)
    const txt = await res.text()
    if (!res.ok) throw new Error(`CW ${path} ${res.status}: ${txt.slice(0, 150)}`)
    return JSON.parse(txt)
  } catch (e) { clearTimeout(t); throw e }
}

async function cwGet(path: string) {
  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(`${CHATWOOT_BASE}/api/v1${path}`, {
      signal:  ac.signal,
      headers: {
        'Content-Type':     'application/json',
        'api_access_token': CHATWOOT_TOKEN,
      },
    })
    clearTimeout(t)
    const txt = await res.text()
    if (!res.ok) throw new Error(`CW GET ${path} ${res.status}: ${txt.slice(0, 150)}`)
    return JSON.parse(txt)
  } catch (e) { clearTimeout(t); throw e }
}

async function pushToCharwoot(
  sessionId: string,
  customerName: string,
  userMessage: string,
  agentReply: string,
  existingConvId: number | null
): Promise<number | null> {

  // 1. Find or create contact
  let contactId: number | null = null

  try {
    const search = await cwGet(
      `/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(sessionId)}&include_contacts=true`
    )
    // Search returns { payload: [ { id, ... }, ... ] }
    const found = Array.isArray(search?.payload) ? search.payload[0] : search?.payload?.contacts?.[0]
    if (found?.id) contactId = found.id as number
  } catch (e) {
    console.error('[Jade→CW] Search failed:', String(e).slice(0, 100))
  }

  if (!contactId) {
    try {
      const created = await cwPost(`/accounts/${ACCOUNT_ID}/contacts`, {
        name:       customerName || 'Website Visitor',
        identifier: sessionId,
      })
      // Create returns { payload: { contact: { id } } }
      contactId = created?.payload?.contact?.id
               ?? created?.payload?.id
               ?? created?.id
               ?? null
      console.log('[Jade→CW] Contact created:', contactId)
    } catch (e) {
      console.error('[Jade→CW] Contact create failed:', String(e).slice(0, 100))
      return null
    }
  }

  if (!contactId) return null

  // 2. Create or reuse conversation
  let convId: number | null = existingConvId

  if (!convId) {
    try {
      const conv = await cwPost(`/accounts/${ACCOUNT_ID}/conversations`, {
        inbox_id:   Number(INBOX_ID),
        contact_id: contactId,
      })
      // Conversation returns { id, ... } at root
      convId = conv?.id ?? conv?.data?.id ?? null
      console.log('[Jade→CW] Conversation created:', convId)
    } catch (e) {
      console.error('[Jade→CW] Conv create failed:', String(e).slice(0, 100))
      return null
    }
  }

  if (!convId) return null

  // 3. Visitor message (message_type 0 = incoming)
  try {
    await cwPost(`/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`, {
      content:      userMessage,
      message_type: 0,
      content_type: 'text',
      private:      false,
    })
  } catch (e) {
    console.error('[Jade→CW] Incoming msg failed:', String(e).slice(0, 100))
  }

  // 4. Jade reply (message_type 1 = outgoing)
  try {
    await cwPost(`/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`, {
      content:      agentReply,
      message_type: 1,
      content_type: 'text',
      private:      false,
    })
  } catch (e) {
    console.error('[Jade→CW] Outgoing msg failed:', String(e).slice(0, 100))
  }

  return convId
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
- ✈ Flights → /flights | 🏨 Hotels → /hotels | 🎭 Activities → /activities
- 🚗 Transfers → /transfers | 🗺 Tours → /tours | 📦 Packages → /packages
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
  const system = buildSystemPrompt(messages.length, customerName, pageContext)

  try {
    const res = await anthropic.messages.create({
      model:      messages.length > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
      max_tokens: 500,
      system,
      messages:   messages as Anthropic.MessageParam[],
    })
    return res.content[0].type === 'text' ? res.content[0].text : ''
  } catch (e) { console.error('[Jade] Claude failed:', e) }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 500, temperature: 0.75,
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    })
    return res.choices[0]?.message?.content ?? ''
  } catch (e) { console.error('[Jade] OpenAI failed:', e) }

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
  } = await req.json() as {
    message:             string
    conversationHistory: Msg[]
    sessionId?:          string
    conversationId?:     number | null
    customerName?:       string
    pageContext?:        string
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const messages: Msg[] = [
    ...conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant'),
    { role: 'user', content: message },
  ]

  // AI reply first — user never waits for Chatwoot
  const reply = await jadeReply(messages, customerName, pageContext)

  // Push to Chatwoot (non-blocking on failure)
  const sid    = sessionId ?? `web-${Date.now()}`
  const convId = conversationId ?? null

  let newConvId: number | null = null
  try {
    newConvId = await pushToCharwoot(sid, customerName, message, reply, convId)
    if (newConvId) console.log(`[Jade→CW] ✅ Conversation ${newConvId}`)
  } catch (e) {
    console.error('[Jade→CW] Push error:', String(e).slice(0, 100))
  }

  return NextResponse.json({ reply, conversationId: newConvId })
}
