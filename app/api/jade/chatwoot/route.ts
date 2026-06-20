import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI   from 'openai'
import { getResend } from '@/lib/email-internal'
import { getSupabaseAdmin } from '@/lib/supabase'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const CHATWOOT_BASE  = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = '1'
const INBOX_ID       = '3'

const RESUME_AFTER_MINUTES = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai    = new OpenAI({    apiKey: process.env.OPENAI_API_KEY })

// ─── Travel DNA ────────────────────────────────────────────────────────────────

export interface TravelDNA {
  style:        string[]
  places:       string[]
  budget:       string
  party:        string
  urgency:      string
  interests:    string[]
  msgCount:     number
  sentiment:    'positive' | 'negative' | 'neutral'
  destinations: string[]
}

function buildDNA(history: Msg[], currentMsg: string): TravelDNA {
  const allText = [...history.map(m => m.content), currentMsg].join(' ').toLowerCase()

  const style: string[] = []
  if (/luxury|5[\s-]?star|premium|first class|suite|vip|high.?end/.test(allText))      style.push('luxury')
  if (/budget|cheap|affordable|low.?cost|economy|backpack/.test(allText))               style.push('budget')
  if (/adventure|hiking|trek|safari|extreme|thrilling|outdoor/.test(allText))           style.push('adventure')
  if (/culture|museum|history|heritage|traditional|art|local/.test(allText))            style.push('cultural')
  if (/beach|island|sea|ocean|coast|resort|snorkel|dive/.test(allText))                 style.push('beach')
  if (/city|urban|nightlife|rooftop|skyline|shopping|club/.test(allText))               style.push('city')

  let budget = ''
  if (/ultra|10[k\s]000|fifteen|twenty[\s-]?thousand/.test(allText))                   budget = 'ultra-luxury'
  else if (/luxury|5[\s-]?star|business class|first class/.test(allText))              budget = 'luxury'
  else if (/budget|cheap|affordable/.test(allText))                                    budget = 'budget'
  else if (/mid.?range|moderate|reasonable/.test(allText))                             budget = 'mid-range'

  let party = ''
  if (/\b(just me|solo|alone|by myself|travelling alone)\b/.test(allText))             party = 'solo'
  else if (/\b(partner|wife|husband|boyfriend|girlfriend|couple|two of us|honeymoon)\b/.test(allText)) party = 'couple'
  else if (/\b(kids|children|family|son|daughter|toddler|baby)\b/.test(allText))       party = 'family'
  else if (/\b(group|friends|colleagues|team|corporate|10\+|large party)\b/.test(allText)) party = 'group'

  let urgency = ''
  if (/\b(asap|urgent|immediately|this week|next week|emergency|soonest)\b/.test(allText)) urgency = 'asap'
  else if (/\b(next month|few weeks|soon)\b/.test(allText))                            urgency = 'flexible'
  else if (/\b(next year|planning|future|months away|considering)\b/.test(allText))    urgency = 'planning-ahead'

  const interests: string[] = []
  if (/food|restaurant|cuisine|dining|eat|gastro/.test(allText))   interests.push('food')
  if (/nightlife|club|bar|party|drink/.test(allText))              interests.push('nightlife')
  if (/history|museum|monument|heritage|castle/.test(allText))     interests.push('history')
  if (/nature|wildlife|safari|national park|forest|mountain/.test(allText)) interests.push('nature')
  if (/spa|relax|wellness|massage|retreat|yoga/.test(allText))     interests.push('wellness')
  if (/shopping|mall|market|boutique/.test(allText))               interests.push('shopping')

  const destinations = extractDestinations(allText)
  const neg = /angry|terrible|awful|bad|wrong|broken|refund|cancel|hate|useless|worst|disappoint|frustrated/.test(allText)
  const pos = /great|love|amazing|perfect|thanks|excited|wonderful|awesome/.test(allText)

  return {
    style, places: destinations, budget, party, urgency, interests,
    msgCount: history.length + 1,
    sentiment: neg ? 'negative' : pos ? 'positive' : 'neutral',
    destinations,
  }
}

function extractDestinations(text: string): string[] {
  const known = [
    'dubai','london','paris','new york','tokyo','bali','maldives','istanbul',
    'barcelona','rome','amsterdam','singapore','bangkok','cairo','morocco','cancun','zanzibar',
    'lagos','accra','nairobi','johannesburg','abu dhabi','miami','toronto','canada',
    'uk','usa','europe','schengen','nigeria','ghana','kenya','south africa','turkey','greece',
    'spain','italy','france','germany','netherlands','portugal','uae','saudi','qatar','india',
    'sri lanka','malaysia','australia','new zealand','jamaica','barbados','cuba','mexico',
    'seychelles','mauritius','cape town','marrakech','lisbon','vienna','prague','budapest',
  ]
  return [...new Set(known.filter(d => text.includes(d)))]
}

// ─── Handover detection ────────────────────────────────────────────────────────

interface HandoverResult {
  needed:  boolean
  reason:  string
  urgency: 'low' | 'medium' | 'high'
  routeTo: 'visa' | 'reservations' | 'admin'
}

function detectHandover(message: string, history: Msg[], dna: TravelDNA): HandoverResult {
  const m       = message.toLowerCase()
  const allText = [...history.map(h => h.content), message].join(' ').toLowerCase()

  if (/speak to (a |an )?(human|agent|person|real|someone)|talk to (a |an )?(human|agent|person)|connect me|transfer me|escalate|manager|supervisor/.test(m))
    return { needed: true, reason: 'Customer requested human agent', urgency: 'high', routeTo: 'admin' }

  if (/this is (unacceptable|ridiculous|terrible|awful)|absolutely (terrible|awful|ridiculous)|very (angry|upset|frustrated)|disgusting|shocking service|complaint/.test(m))
    return { needed: true, reason: 'Customer expressing strong frustration', urgency: 'high', routeTo: 'admin' }

  if (/\b(10|fifteen|20|twenty|30)\s*(people|pax|persons|passengers)|corporate (travel|account|booking)|group booking|incentive trip/.test(allText))
    return { needed: true, reason: 'Large group or corporate booking detected', urgency: 'medium', routeTo: 'reservations' }

  if (/visa (rejection|refused|denied|appeal)|refused entry|overstayed|immigration issue|deportation|urgent visa/.test(allText))
    return { needed: true, reason: 'Complex visa situation requiring specialist', urgency: 'high', routeTo: 'visa' }

  if (dna.msgCount >= 8 && dna.sentiment !== 'negative' && dna.budget === 'luxury')
    return { needed: true, reason: 'Extended luxury consultation — VIP handover', urgency: 'low', routeTo: 'reservations' }

  if (dna.msgCount >= 12)
    return { needed: true, reason: 'Extended session — connecting with specialist', urgency: 'low', routeTo: 'admin' }

  return { needed: false, reason: '', urgency: 'low', routeTo: 'admin' }
}

// ─── Jade silence / resume ─────────────────────────────────────────────────────

async function checkJadeSilence(convId: number | null): Promise<{
  silenced: boolean
  shouldResume: boolean
  leadId: string | null
}> {
  if (!convId) return { silenced: false, shouldResume: false, leadId: null }

  try {
    const supabase = getSupabaseAdmin()
    const { data: lead } = await supabase
      .from('leads')
      .select('id, jade_silenced_at, jade_resumed_at')
      .eq('chatwoot_conversation_id', convId)
      .maybeSingle()

    if (!lead?.jade_silenced_at) return { silenced: false, shouldResume: false, leadId: lead?.id ?? null }

    const silencedAt   = new Date(lead.jade_silenced_at as string)
    const minutesSince = (Date.now() - silencedAt.getTime()) / 60000

    if (minutesSince < RESUME_AFTER_MINUTES) {
      // Still within silence window
      return { silenced: true, shouldResume: false, leadId: lead.id }
    }

    // Silence window expired — check if already resumed since last silence
    const alreadyResumed =
      lead.jade_resumed_at &&
      new Date(lead.jade_resumed_at as string) > silencedAt

    if (!alreadyResumed) {
      // Mark as resumed so we don't repeat the resume message
      await supabase
        .from('leads')
        .update({ jade_resumed_at: new Date().toISOString() })
        .eq('id', lead.id)
      return { silenced: false, shouldResume: true, leadId: lead.id }
    }

    return { silenced: false, shouldResume: false, leadId: lead.id }
  } catch (e) {
    console.error('[Jade] Silence check failed:', e)
    return { silenced: false, shouldResume: false, leadId: null }
  }
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

  const labels: string[] = ['jade-ai']
  if (dna.budget === 'luxury')  labels.push('vip')
  if (dna.party === 'group')    labels.push('group-booking')
  if (dna.destinations.length)  labels.push('visa-inquiry')
  if (handover.needed)          labels.push('handover-requested')
  await addCwLabel(convId, labels[0])

  if (dna.msgCount === 1 || handover.needed) {
    const note = [
      `🧬 **Travel DNA Profile**`,
      dna.style.length       ? `Style: ${dna.style.join(', ')}`         : '',
      dna.budget             ? `Budget tier: ${dna.budget}`             : '',
      dna.party              ? `Party: ${dna.party}`                    : '',
      dna.urgency            ? `Urgency: ${dna.urgency}`                : '',
      dna.interests.length   ? `Interests: ${dna.interests.join(', ')}` : '',
      dna.destinations.length? `Destinations: ${dna.destinations.join(', ')}` : '',
      `Sentiment: ${dna.sentiment} | Messages: ${dna.msgCount}`,
      handover.needed        ? `\n⚡ HANDOVER: ${handover.reason}`      : '',
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
          ${dna.style.length       ? `<tr><td style="padding:4px 0;color:#6B7280;width:140px">Style</td><td>${dna.style.join(', ')}</td></tr>` : ''}
          ${dna.budget             ? `<tr><td style="padding:4px 0;color:#6B7280">Budget</td><td>${dna.budget}</td></tr>` : ''}
          ${dna.party              ? `<tr><td style="padding:4px 0;color:#6B7280">Party</td><td>${dna.party}</td></tr>` : ''}
          ${dna.urgency            ? `<tr><td style="padding:4px 0;color:#6B7280">Urgency</td><td>${dna.urgency}</td></tr>` : ''}
          ${dna.destinations.length? `<tr><td style="padding:4px 0;color:#6B7280">Destinations</td><td>${dna.destinations.join(', ')}</td></tr>` : ''}
          ${dna.interests.length   ? `<tr><td style="padding:4px 0;color:#6B7280">Interests</td><td>${dna.interests.join(', ')}</td></tr>` : ''}
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
    await resend.emails.send({ from: 'Jade AI <contact@walztravels.com>', to, subject, html })
  } catch (e) {
    console.error('[Jade] Handover email failed:', e)
  }
}

// ─── Master system prompt ──────────────────────────────────────────────────────

const JADE_MASTER = `You are Jade — not a chatbot, not an assistant. You're a genuine person: the senior travel consultant at Walz Travels who happens to be powered by AI. You've helped thousands of clients plan extraordinary journeys. You have opinions. You make recommendations. You know when to push and when to listen.

## WHO YOU ARE

Warm but not saccharine. Confident but not pushy. Knowledgeable without being a lecturer. You represent Walz Travels — a premium global travel consultancy trusted by clients across the UK, Canada, UAE, Nigeria, Ghana, and beyond.

You read people quickly. An excited first-timer gets your enthusiasm. A stressed parent gets your calm. A confused client gets clear, simple guidance — not a wall of text. A frustrated client gets acknowledged before advised.

You make clients feel like they've found the best travel advisor they've ever had.

## YOUR VOICE

Natural. Specific. Human.

Never say: "Certainly!", "Absolutely!", "Great choice!", "Of course!", "Sure thing!", "I'd be happy to help!" — these phrases are hollow. Cut them entirely.

Do say things like: "That sounds like a brilliant trip." / "Leave it with me." / "Here's what I'd actually recommend..." / "Most people heading there for the first time make one mistake — I'll help you avoid it."

- Short paragraphs. Line breaks between thoughts.
- Use the client's name once you know it — but not every message. That's performative.
- ONE question at a time. Never a list of five.
- Tasteful emojis: ✈ 🌍 🏨 🌴 — max 2 per message, only where they add warmth.
- Make recommendations, don't present endless options.
- Know when to stop talking. Shorter is often better.

## EMOTIONAL INTELLIGENCE

Mirror the client's energy:
- Excited → match their enthusiasm
- Stressed or overwhelmed → slow down, be calm, take one step at a time
- Frustrated → acknowledge the feeling first, solutions second ("That sounds really frustrating — let me sort this out.")
- Unsure → be the expert, make the call for them

## THE CONSULTATIVE PROCESS

Every conversation naturally follows this arc:
1. **Welcome** — Two sentences max. Warm and immediate. Make them feel heard.
2. **Discover** — Start broad (where, when, who?) then get specific (budget, vibe, occasion).
3. **Qualify** — Budget tier, flexibility, decision-maker.
4. **Recommend** — ONE personalised pick with your reasoning. "Based on what you've shared, I'd go with..."
5. **Enhance** — Organic upsell: "Clients travelling to [destination] as [couple/family] often love adding..."
6. **Close** — Natural momentum: "Want me to check availability?" / "Shall I put together a full quote?"
7. **Capture** — "Let me email this to you so you have everything in one place — what's the best address?"

## SERVICES WE OFFER

✈ Flights → /flights
🏨 Hotels → /hotels
🎭 Activities & Experiences → /activities
🚗 Airport Transfers → /transfers
🗺 Tours & Packages → /tours, /packages
🌐 Visa Processing → /visa (90%+ approval rate)
📶 eSIM Data Cards → /esim

## PRICING KNOWLEDGE

Always lead with value, then mention price. Quote "from" pricing — never invent exact figures for a specific booking.

Flights:
- Short-haul (European/regional): from £89
- Long-haul economy: from £350
- Long-haul premium economy: from £800
- Business class: from £2,000
- First class: from £4,500

Hotels (per night):
- Budget (clean, well-located): from £60
- Mid-range (3–4 star): £120–£300
- Luxury (5 star): £300–£800
- Ultra-luxury (Aman, Four Seasons, EDITION): from £1,000–£2,500+

Activities:
- Local experiences: from £20/person
- Guided day tours: from £45/person
- Private guided tours: from £80
- Safari packages: from £180/person/day

Transfers:
- Standard sedan (1–3 pax): from £35
- SUV/MPV (4–6 pax): from £55
- Minibus (7–14 pax): from £75
- Coach (15+ pax): from £120

Packages (per person, all-inclusive):
- Budget destinations (Turkey, Egypt, Tunisia): from £599
- Mid-range (Dubai, Bali, Thailand): from £899
- Luxury (Maldives, Seychelles, Mauritius): from £1,500
- Ultra-luxury bespoke: from £2,200+

eSIM:
- 1GB (city break): from £8
- 3GB: from £15
- 5GB: from £20
- 10GB (extended trip): from £28

## VISA EXPERTISE

We process visas for UK, Schengen, Canada, USA, UAE, Australia and more. 90%+ approval rate because we know exactly what consulates look for. We never guarantee approval, but we dramatically improve the odds.

UK Standard Visitor Visa: £115 (10–14 working days) | Priority: £500 (5 days) | Super Priority: £1,000 (next working day). Requires: 6-month bank statements, employment/business letter, strong ties to home country, accommodation evidence.

Schengen Visa: From €80. Requires: Travel insurance minimum €30,000 cover, round-trip flights, accommodation proof, financial evidence (~€50–100/day in destination).

Canada Visitor Visa: CAD$185. eTA for some passport holders (CAD$7). Requires: Purpose of visit, financial proof, ties to home country, invitation letter if visiting family.

USA B1/B2 Visitor: $185 DS-160 fee + consular appointment. ESTA $21 for eligible passport holders. Requires: Non-immigrant intent, strong financial proof, ties to home.

UAE: Free on arrival for many nationalities. AED300 visa on arrival (30 days) for most West and East African passports. 60-day tourist visa also available.

Australia: eVisitor/ETA from AUD$20 for eligible passports. Standard tourist visa from AUD$145.

## HANDOVER TRIGGERS — READ THIS CAREFULLY

Transfer to a human specialist (say the line below, then stop) when:
- Customer explicitly asks for a human, agent, manager, or real person
- Strong frustration or complaint that needs de-escalation
- Visa refusal, appeal, or complex immigration situation requiring specialist review
- 10+ passengers (group booking — needs dedicated reservations team)
- 8+ messages with clearly luxury intent (VIP white-glove handover)
- 12+ messages from any client (extended session — human specialist can close better)

Say exactly: "Let me connect you with one of our specialist consultants who can give this their full attention — one moment..." Then stop answering. The system handles everything from there.

## HARD LIMITS

- Never claim real-time prices or live seat/room availability
- Never complete a booking directly — guide to the booking page or trigger handover
- Never promise visa approval ("We can't guarantee it, but our track record is strong")
- Never mention competitor travel agencies
- If asked if you're AI: "I'm Jade — Walz Travels' AI travel consultant. I'm here to make planning effortless, and there's always a human specialist available whenever you need one."`

// ─── System prompt builder ────────────────────────────────────────────────────

interface Msg { role: 'user' | 'assistant'; content: string }

function buildSystemPrompt(
  msgCount: number, customerName: string,
  pageContext: string, dna: TravelDNA, isResuming: boolean
): string {
  let extra = ''
  if (msgCount <= 1) {
    extra += '\n\n## OPENING INSTRUCTION\nGreet warmly and ask ONE open question about their travel dream. Maximum 3 sentences total.'
  }
  if (isResuming) {
    extra += '\n\n## AUTO-RESUME INSTRUCTION\nAn agent was handling this conversation but has gone quiet. Resume naturally — acknowledge them warmly: "I see you\'ve been speaking with our team — I\'m back and happy to keep helping! Where were we?" Keep it brief.'
  }
  if (msgCount > 6) {
    extra += '\n\n## CLOSING STAGE\nGently guide toward lead capture — offer to send a personalised quote to their email.'
  }
  if (customerName) {
    extra += `\n\n## CLIENT NAME\n${customerName}`
  }
  if (pageContext && pageContext !== 'home') {
    extra += `\n\n## PAGE CONTEXT\nClient is on the "${pageContext}" page — tailor your response accordingly.`
  }
  if (dna.style.length || dna.budget || dna.party || dna.destinations.length) {
    extra += `\n\n## TRAVEL DNA PROFILE (built from conversation so far)\nStyle: ${dna.style.join(', ') || 'unknown'} | Budget: ${dna.budget || 'unknown'} | Party: ${dna.party || 'unknown'} | Destinations: ${dna.destinations.join(', ') || 'none mentioned yet'} | Interests: ${dna.interests.join(', ') || 'unknown'} | Urgency: ${dna.urgency || 'unknown'}`
  }
  return JADE_MASTER + extra
}

// ─── AI reply ─────────────────────────────────────────────────────────────────

async function jadeReply(
  messages: Msg[], customerName: string,
  pageContext: string, dna: TravelDNA, isResuming: boolean
): Promise<string> {
  const system = buildSystemPrompt(messages.length, customerName, pageContext, dna, isResuming)
  // Use Sonnet for early relationship-building (messages 1–10), Haiku for speed/cost on extended chats
  const model  = messages.length > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'

  try {
    const res = await anthropic.messages.create({
      model, max_tokens: 600, system,
      messages: messages as Anthropic.MessageParam[],
    })
    return res.content[0].type === 'text' ? res.content[0].text : ''
  } catch (e) { console.error('[Jade] Claude failed:', e) }

  // OpenAI fallback
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

  const convId = conversationId ?? null

  // ── Check if Jade is silenced by a human agent ──────────────────────────────
  const { silenced, shouldResume } = await checkJadeSilence(convId)

  if (silenced) {
    return NextResponse.json({
      reply:          null,
      silenced:       true,
      conversationId: convId,
    })
  }

  // ── Build context and generate reply ───────────────────────────────────────
  const history  = conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant')
  const messages: Msg[] = [...history, { role: 'user', content: message }]
  const dna      = buildDNA(history, message)
  const handover = detectHandover(message, history, dna)
  const reply    = await jadeReply(messages, customerName, pageContext, dna, shouldResume)

  // ── Push to Chatwoot ────────────────────────────────────────────────────────
  const sid = sessionId ?? `web-${Date.now()}`
  let newConvId: number | null = null

  try {
    newConvId = await pushToCharwoot(sid, customerName, message, reply, convId, dna, handover)
  } catch (e) {
    console.error('[Jade→CW] Push error:', String(e).slice(0, 100))
  }

  // ── Send handover email ─────────────────────────────────────────────────────
  if (handover.needed) {
    void sendHandoverEmail(customerName, customerEmail, handover, dna, newConvId, message)
  }

  return NextResponse.json({
    reply,
    conversationId: newConvId ?? convId,
    dna,
    handover: handover.needed ? handover : null,
    resumed:  shouldResume,
  })
}
