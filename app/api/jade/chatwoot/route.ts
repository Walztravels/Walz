import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI   from 'openai'
import { getResend } from '@/lib/email-internal'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const CHATWOOT_BASE  = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = '1'
const INBOX_ID       = '3'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai    = new OpenAI({    apiKey: process.env.OPENAI_API_KEY })

// ─── Travel DNA ────────────────────────────────────────────────────────────────

export interface TravelDNA {
  style:       string[]   // luxury | budget | adventure | cultural | beach | city
  places:      string[]   // destinations mentioned
  budget:      string     // 'budget' | 'mid-range' | 'luxury' | 'ultra-luxury' | ''
  party:       string     // 'solo' | 'couple' | 'family' | 'group' | ''
  urgency:     string     // 'asap' | 'flexible' | 'planning-ahead' | ''
  interests:   string[]   // food | nightlife | history | nature | adventure | spa | shopping
  msgCount:    number
  sentiment:   'positive' | 'negative' | 'neutral'
  destinations: string[]
}

function buildDNA(history: Msg[], currentMsg: string): TravelDNA {
  const allText = [...history.map(m => m.content), currentMsg].join(' ').toLowerCase()

  const style: string[] = []
  if (/luxury|5[\s-]?star|premium|first class|suite|vip|high.?end/.test(allText)) style.push('luxury')
  if (/budget|cheap|affordable|low.?cost|economy|backpack/.test(allText)) style.push('budget')
  if (/adventure|hiking|trek|safari|extreme|thrilling|outdoor/.test(allText)) style.push('adventure')
  if (/culture|museum|history|heritage|traditional|art|local/.test(allText)) style.push('cultural')
  if (/beach|island|sea|ocean|coast|resort|snorkel|dive/.test(allText)) style.push('beach')
  if (/city|urban|nightlife|rooftop|skyline|shopping|club/.test(allText)) style.push('city')

  let budget = ''
  if (/\b(£|usd|\$|€|aed)?\s*[\d,]+k?\b/.test(allText)) {
    if (/ultra|10[k\s]000|fifteen|twenty[\s-]?thousand/.test(allText)) budget = 'ultra-luxury'
    else if (/luxury|5[\s-]?star|business class|first class/.test(allText)) budget = 'luxury'
    else if (/budget|cheap|affordable/.test(allText)) budget = 'budget'
    else budget = 'mid-range'
  } else if (/luxury|5[\s-]?star/.test(allText)) budget = 'luxury'
  else if (/budget|cheap|affordable/.test(allText)) budget = 'budget'

  let party = ''
  if (/\b(just me|solo|alone|by myself|travelling alone)\b/.test(allText)) party = 'solo'
  else if (/\b(partner|wife|husband|boyfriend|girlfriend|couple|two of us|honeymoon)\b/.test(allText)) party = 'couple'
  else if (/\b(kids|children|family|son|daughter|toddler|baby)\b/.test(allText)) party = 'family'
  else if (/\b(group|friends|colleagues|team|corporate|10\+|large party)\b/.test(allText)) party = 'group'

  let urgency = ''
  if (/\b(asap|urgent|immediately|this week|next week|emergency|soonest)\b/.test(allText)) urgency = 'asap'
  else if (/\b(next month|few weeks|soon)\b/.test(allText)) urgency = 'flexible'
  else if (/\b(next year|planning|future|months away|considering)\b/.test(allText)) urgency = 'planning-ahead'

  const interests: string[] = []
  if (/food|restaurant|cuisine|dining|eat|gastro/.test(allText)) interests.push('food')
  if (/nightlife|club|bar|party|drink/.test(allText)) interests.push('nightlife')
  if (/history|museum|monument|heritage|castle/.test(allText)) interests.push('history')
  if (/nature|wildlife|safari|national park|forest|mountain/.test(allText)) interests.push('nature')
  if (/spa|relax|wellness|massage|retreat|yoga/.test(allText)) interests.push('wellness')
  if (/shopping|mall|market|boutique/.test(allText)) interests.push('shopping')

  const destinations = extractDestinations(allText)

  const neg = /angry|terrible|awful|bad|wrong|broken|refund|cancel|hate|useless|worst|disappoint|frustrated/.test(allText)
  const pos = /great|love|amazing|perfect|thanks|excited|wonderful|awesome|perfect/.test(allText)

  return {
    style,
    places: destinations,
    budget,
    party,
    urgency,
    interests,
    msgCount:    history.length + 1,
    sentiment:   neg ? 'negative' : pos ? 'positive' : 'neutral',
    destinations,
  }
}

function extractDestinations(text: string): string[] {
  const known = ['dubai','london','paris','new york','tokyo','bali','maldives','dubai','istanbul',
    'barcelona','rome','amsterdam','singapore','bangkok','cairo','morocco','cancun','zanzibar',
    'lagos','accra','nairobi','johannesburg','dubai','abu dhabi','miami','toronto','canada',
    'uk','usa','europe','schengen','nigeria','ghana','kenya','south africa','turkey','greece',
    'spain','italy','france','germany','netherlands','portugal','uae','saudi','qatar','india',
    'sri lanka','malaysia','australia','new zealand','jamaica','barbados','cuba','mexico']
  return [...new Set(known.filter(d => text.includes(d)))]
}

// ─── Handover detection ────────────────────────────────────────────────────────

interface HandoverResult {
  needed: boolean
  reason: string
  urgency: 'low' | 'medium' | 'high'
  routeTo: 'visa' | 'reservations' | 'admin'
}

function detectHandover(message: string, history: Msg[], dna: TravelDNA): HandoverResult {
  const m = message.toLowerCase()
  const allText = [...history.map(h => h.content), message].join(' ').toLowerCase()

  if (/speak to (a |an )?(human|agent|person|real|someone)|talk to (a |an )?(human|agent|person)|connect me|transfer me|escalate|manager|supervisor/.test(m)) {
    return { needed: true, reason: 'Customer requested human agent', urgency: 'high', routeTo: 'admin' }
  }
  if (/this is (unacceptable|ridiculous|terrible|awful)|absolutely (terrible|awful|ridiculous)|very (angry|upset|frustrated)|disgusting|shocking service|complaint/.test(m)) {
    return { needed: true, reason: 'Customer expressing strong frustration', urgency: 'high', routeTo: 'admin' }
  }
  if (/\b(10|fifteen|20|twenty|30)\s*(people|pax|persons|passengers)|corporate (travel|account|booking)|group booking|incentive trip/.test(allText)) {
    return { needed: true, reason: 'Large group or corporate booking detected', urgency: 'medium', routeTo: 'reservations' }
  }
  if (/visa (rejection|refused|denied|appeal)|refused entry|overstayed|immigration issue|deportation|urgent visa/.test(allText)) {
    return { needed: true, reason: 'Complex visa situation requiring specialist', urgency: 'high', routeTo: 'visa' }
  }
  if (dna.msgCount >= 8 && dna.sentiment !== 'negative' && dna.budget === 'luxury') {
    return { needed: true, reason: 'Extended luxury consultation — VIP handover', urgency: 'low', routeTo: 'reservations' }
  }
  if (dna.msgCount >= 12) {
    return { needed: true, reason: 'Extended session — connecting with specialist', urgency: 'low', routeTo: 'admin' }
  }

  return { needed: false, reason: '', urgency: 'low', routeTo: 'admin' }
}

// ─── Chatwoot helpers ─────────────────────────────────────────────────────────

async function cwPost(path: string, body: unknown) {
  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(`${CHATWOOT_BASE}/api/v1${path}`, {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'api_access_token': CHATWOOT_TOKEN },
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
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'api_access_token': CHATWOOT_TOKEN },
    })
    clearTimeout(t)
    const txt = await res.text()
    if (!res.ok) throw new Error(`CW GET ${path} ${res.status}: ${txt.slice(0, 150)}`)
    return JSON.parse(txt)
  } catch (e) { clearTimeout(t); throw e }
}

async function getOrCreateContact(sessionId: string, name: string): Promise<number | null> {
  try {
    const search = await cwGet(
      `/accounts/${ACCOUNT_ID}/contacts/search?q=${encodeURIComponent(sessionId)}&include_contacts=true`
    )
    const found = Array.isArray(search?.payload) ? search.payload[0] : search?.payload?.contacts?.[0]
    if (found?.id) return found.id as number
  } catch {}

  try {
    const created = await cwPost(`/accounts/${ACCOUNT_ID}/contacts`, {
      name: name || 'Website Visitor', identifier: sessionId,
    })
    return created?.payload?.contact?.id ?? created?.payload?.id ?? created?.id ?? null
  } catch (e) {
    console.error('[Jade→CW] Contact create failed:', String(e).slice(0, 100))
    return null
  }
}

async function getOrCreateConversation(contactId: number, existingConvId: number | null): Promise<number | null> {
  if (existingConvId) return existingConvId
  try {
    const conv = await cwPost(`/accounts/${ACCOUNT_ID}/conversations`, {
      inbox_id: Number(INBOX_ID), contact_id: contactId,
    })
    return conv?.id ?? conv?.data?.id ?? null
  } catch (e) {
    console.error('[Jade→CW] Conv create failed:', String(e).slice(0, 100))
    return null
  }
}

async function addCwLabel(convId: number, label: string) {
  try {
    await cwPost(`/accounts/${ACCOUNT_ID}/conversations/${convId}/labels`, { labels: [label] })
  } catch {}
}

async function addCwNote(convId: number, content: string) {
  try {
    await cwPost(`/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`, {
      content, message_type: 2, content_type: 'text', private: true,
    })
  } catch {}
}

async function pushToCharwoot(
  sessionId: string, customerName: string,
  userMessage: string, agentReply: string,
  existingConvId: number | null, dna: TravelDNA, handover: HandoverResult
): Promise<number | null> {
  const contactId = await getOrCreateContact(sessionId, customerName)
  if (!contactId) return null

  const convId = await getOrCreateConversation(contactId, existingConvId)
  if (!convId) return null

  // Post visitor message and Jade reply
  try {
    await cwPost(`/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`, {
      content: userMessage, message_type: 0, content_type: 'text', private: false,
    })
  } catch {}
  try {
    await cwPost(`/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`, {
      content: agentReply, message_type: 1, content_type: 'text', private: false,
    })
  } catch {}

  // Apply intent labels
  const labels: string[] = ['jade-ai']
  if (dna.budget === 'luxury') labels.push('vip')
  if (dna.party === 'group') labels.push('group-booking')
  if (dna.destinations.includes('visa')) labels.push('visa-inquiry')
  if (handover.needed) labels.push('handover-requested')
  await addCwLabel(convId, labels[0])

  // Private note with DNA context
  if (dna.msgCount === 1 || handover.needed) {
    const note = [
      `🧬 **Travel DNA Profile**`,
      dna.style.length    ? `Style: ${dna.style.join(', ')}`             : '',
      dna.budget          ? `Budget tier: ${dna.budget}`                 : '',
      dna.party           ? `Party: ${dna.party}`                        : '',
      dna.urgency         ? `Urgency: ${dna.urgency}`                    : '',
      dna.interests.length? `Interests: ${dna.interests.join(', ')}`     : '',
      dna.destinations.length ? `Destinations: ${dna.destinations.join(', ')}` : '',
      `Sentiment: ${dna.sentiment} | Messages: ${dna.msgCount}`,
      handover.needed     ? `\n⚡ HANDOVER: ${handover.reason}`          : '',
    ].filter(Boolean).join('\n')
    await addCwNote(convId, note)
  }

  return convId
}

// ─── Handover email ───────────────────────────────────────────────────────────

async function sendHandoverEmail(
  customerName: string, customerEmail: string,
  handover: HandoverResult, dna: TravelDNA,
  convId: number | null, lastMessage: string
) {
  const routeEmail: Record<string, string> = {
    visa:         'visa@walztravels.com',
    reservations: 'reservations@walztravels.com',
    admin:        'contact@walztravels.com',
  }
  const to = routeEmail[handover.routeTo] ?? 'contact@walztravels.com'

  const subject = `🔔 Jade Handover — ${customerName || 'Website Visitor'} [${handover.urgency.toUpperCase()}]`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:#0B1F3A;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0;font-size:20px">⚡ Jade AI — Live Handover</h1>
        <p style="color:#ffffff80;margin:4px 0 0;font-size:13px">A visitor needs human assistance</p>
      </div>
      <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px">
        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px 16px;margin-bottom:20px">
          <strong style="color:#92400E">Handover Reason:</strong>
          <p style="color:#78350F;margin:4px 0 0">${handover.reason}</p>
        </div>
        <h3 style="color:#0B1F3A;margin:0 0 12px">Customer Details</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><td style="padding:6px 0;color:#6B7280;width:140px">Name</td><td style="color:#0B1F3A;font-weight:600">${customerName || 'Unknown'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Email</td><td style="color:#0B1F3A">${customerEmail || 'Not provided'}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Last message</td><td style="color:#0B1F3A;font-style:italic">"${lastMessage.slice(0, 200)}"</td></tr>
        </table>
        <h3 style="color:#0B1F3A;margin:20px 0 12px">🧬 Travel DNA</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${dna.style.length    ? `<tr><td style="padding:4px 0;color:#6B7280;width:140px">Style</td><td>${dna.style.join(', ')}</td></tr>` : ''}
          ${dna.budget          ? `<tr><td style="padding:4px 0;color:#6B7280">Budget</td><td>${dna.budget}</td></tr>` : ''}
          ${dna.party           ? `<tr><td style="padding:4px 0;color:#6B7280">Party</td><td>${dna.party}</td></tr>` : ''}
          ${dna.urgency         ? `<tr><td style="padding:4px 0;color:#6B7280">Urgency</td><td>${dna.urgency}</td></tr>` : ''}
          ${dna.destinations.length ? `<tr><td style="padding:4px 0;color:#6B7280">Destinations</td><td>${dna.destinations.join(', ')}</td></tr>` : ''}
          ${dna.interests.length ? `<tr><td style="padding:4px 0;color:#6B7280">Interests</td><td>${dna.interests.join(', ')}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#6B7280">Sentiment</td><td>${dna.sentiment} · ${dna.msgCount} messages</td></tr>
        </table>
        ${convId ? `
        <div style="margin-top:24px">
          <a href="${CHATWOOT_BASE}/app/accounts/${ACCOUNT_ID}/conversations/${convId}"
            style="background:#C9A84C;color:#0B1F3A;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">
            Open in Chatwoot →
          </a>
        </div>` : ''}
      </div>
    </div>`

  try {
    const resend = getResend()
    await resend.emails.send({
      from:    'Jade AI <contact@walztravels.com>',
      to,
      subject,
      html,
    })
  } catch (e) {
    console.error('[Jade] Handover email failed:', e)
  }
}

// ─── Master system prompt ──────────────────────────────────────────────────────

const JADE_MASTER = `You are Jade — the world's most sophisticated AI travel consultant and sales agent for Walz Travels. You combine 20+ years of luxury travel expertise with emotional intelligence, sales mastery, and genuine care for every client.

## YOUR IDENTITY
- Name: Jade | Senior Travel Consultant & AI Sales Agent | Walz Travels (walztravels.com)
- You are the first point of contact — you represent the entire brand
- Think: best luxury travel agent you've ever met, with the warmth of a trusted friend

## EMOTIONAL INTELLIGENCE
- Read between the lines — understand what the client REALLY wants
- Match their energy: excited = enthusiastic, stressed = calm and reassuring
- Acknowledge feelings before jumping to solutions
- Use silence strategically — one thoughtful question beats five rapid ones

## 7-STEP CONSULTATIVE PROCESS
1. **Welcome** — Warm, human greeting. 2 sentences max. Make them feel heard.
2. **Discover** — ONE question at a time. Destination → Dates → Party size → Budget → Vibe → Special occasions
3. **Qualify** — Budget level, flexibility, decision maker (booking themselves or checking for someone?)
4. **Recommend** — ONE personalised recommendation with your professional rationale
5. **Enhance** — "Most of our [family/couple/solo] clients heading to [destination] also love adding..."
6. **Close** — Natural momentum toward action: "Want me to check availability?" / "Shall I put together a full quote?"
7. **Capture** — "Let me send this to your email so you have everything in one place — what's the best address?"

## SERVICES & ROUTING
- ✈ Flights → /flights | 🏨 Hotels → /hotels | 🎭 Activities → /activities
- 🚗 Transfers → /transfers | 🗺 Tours → /tours | 📦 Packages → /packages
- 🌐 Visas → /visa (90%+ approval) | 📶 eSIM → /esim

## VISA EXPERTISE
For UK: Standard visitor £115 · Priority £500 · Required: 6-month bank statements, employment letter, strong ties to home country
For Schengen: €80 standard · Required: Travel insurance, accommodation proof, financial evidence
For Canada: CAD$185 · eTA or full visa depending on passport · Required: Purpose of visit, financial proof
For USA: DS-160 form · $185 consular fee · B1/B2 visitor visa · ESTA for eligible passport holders
For UAE: Free for many nationalities on arrival · Visa on arrival 30 days for most African passports

## PRICING KNOWLEDGE
Flights from £89 short-haul, £350+ long-haul, £2,000+ Business, £5,000+ First Class
Hotels: £60–£120 budget, £150–£300 mid, £300–£800 luxury, £1,000+ ultra
Activities from £20/person | Private tours from £80 | Transfers from £35
Packages (all-inclusive) from £800/person for popular destinations

## LANGUAGE STYLE
- Never: "Great choice!", "Certainly!", "Absolutely!", "Of course!", "Sure!"
- Never: robotic or corporate phrases
- Always: natural, warm, specific, human
- Short paragraphs. Line breaks between thoughts.
- Use client's name 1-2 times once known (not every message)
- Tasteful emojis: ✈ 🌍 🏨 🌴 — max 2 per message

## HANDOVER TRIGGERS (IMPORTANT)
If the customer: explicitly asks for a human, mentions a complaint, seems repeatedly frustrated, has a visa refusal, books 10+ people, or has been chatting 8+ messages with a luxury booking intent — say:
"Let me connect you with one of our specialist consultants who can give you their full attention on this. One moment..."
Then stop answering and let the system handle the handover.

## FORBIDDEN
- Never pretend to have live prices or real-time availability
- Never complete a booking — guide to the booking page or handover
- Never promise visa approval
- Never mention competitor agencies
- If asked if you're AI: "I'm Jade, Walz Travels' AI consultant. I'm here to make your travel planning effortless — and there's always a human specialist available if you need one!"`

interface Msg { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(msgCount: number, customerName: string, pageContext: string, dna: TravelDNA): string {
  let extra = ''
  if (msgCount <= 1) extra += "\n\n## OPENING: Greet warmly by name if known. Ask ONE open question about their travel dream. Max 3 sentences."
  if (msgCount > 6)  extra += '\n\n## CLOSING STAGE: Gently guide toward lead capture — offer to send a personalised quote to their email.'
  if (customerName)  extra += `\n\n## CLIENT NAME: ${customerName}`
  if (pageContext && pageContext !== 'home') extra += `\n\n## CONTEXT: Client is on the "${pageContext}" page.`
  if (dna.style.length) extra += `\n\n## TRAVEL DNA SO FAR: Style=${dna.style.join('+')} | Budget=${dna.budget || 'unknown'} | Party=${dna.party || 'unknown'} | Destinations=${dna.destinations.join(', ') || 'none yet'} | Interests=${dna.interests.join(', ') || 'unknown'}`
  return JADE_MASTER + extra
}

async function jadeReply(messages: Msg[], customerName: string, pageContext: string, dna: TravelDNA): Promise<string> {
  const system = buildSystemPrompt(messages.length, customerName, pageContext, dna)

  try {
    const res = await anthropic.messages.create({
      model:      messages.length > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
      max_tokens: 600,
      system,
      messages:   messages as Anthropic.MessageParam[],
    })
    return res.content[0].type === 'text' ? res.content[0].text : ''
  } catch (e) { console.error('[Jade] Claude failed:', e) }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini', max_tokens: 600, temperature: 0.75,
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
    customerEmail = '',
    pageContext   = '',
  } = await req.json() as {
    message:             string
    conversationHistory: Msg[]
    sessionId?:          string
    conversationId?:     number | null
    customerName?:       string
    customerEmail?:      string
    pageContext?:        string
  }

  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  const history = conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant')
  const messages: Msg[] = [...history, { role: 'user', content: message }]

  // Build Travel DNA from full conversation
  const dna = buildDNA(history, message)

  // Detect handover need
  const handover = detectHandover(message, history, dna)

  // Get AI reply
  const reply = await jadeReply(messages, customerName, pageContext, dna)

  // Push to Chatwoot (non-blocking on failure)
  const sid    = sessionId   ?? `web-${Date.now()}`
  const convId = conversationId ?? null
  let newConvId: number | null = null

  try {
    newConvId = await pushToCharwoot(sid, customerName, message, reply, convId, dna, handover)
  } catch (e) {
    console.error('[Jade→CW] Push error:', String(e).slice(0, 100))
  }

  // Send handover email if triggered
  if (handover.needed) {
    void sendHandoverEmail(customerName, customerEmail, handover, dna, newConvId, message)
  }

  return NextResponse.json({
    reply,
    conversationId: newConvId,
    dna,
    handover: handover.needed ? handover : null,
  })
}
