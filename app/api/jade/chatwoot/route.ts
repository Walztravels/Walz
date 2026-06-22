import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI   from 'openai'
import { getResend } from '@/lib/email-internal'
import { getSupabaseAdmin } from '@/lib/supabase'
import { fetchClientMemory } from '@/lib/jade-memory'
import type { ClientProfile } from '@/lib/jade-memory'
import { isB2BInquiry, JADE_B2B_PROMPT } from '@/lib/jade-messaging'
import { saveJadeSession, loadJadeSession } from '@/lib/jade-session'
import type { JadeSessionState } from '@/lib/jade-session'
import { searchFlights, assignBadges } from '@/lib/flights/duffel'
import type { FlightSearchParams, FlightItinerary } from '@/lib/flights/types'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

const CHATWOOT_BASE  = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = '1'
const INBOX_ID       = '3'

const RESUME_AFTER_MINUTES = 30

function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' }) }
function getOpenAI()    { return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'sk-placeholder' }) }

// ─── Travel DNA (kept for Chatwoot labels / handover trigger compatibility) ───

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

function buildDNA(messages: Msg[], currentMsg: string): TravelDNA {
  const allText = [...messages.map(m => m.content), currentMsg].join(' ').toLowerCase()

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
    msgCount: messages.filter(m => m.role === 'user').length + 1,
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

  if (dna.msgCount >= 20 && dna.sentiment !== 'negative' && dna.budget === 'luxury')
    return { needed: true, reason: 'Extended luxury consultation — VIP handover', urgency: 'low', routeTo: 'reservations' }

  if (dna.msgCount >= 30)
    return { needed: true, reason: 'Extended session — connecting with specialist', urgency: 'low', routeTo: 'admin' }

  return { needed: false, reason: '', urgency: 'low', routeTo: 'admin' }
}

// ─── Jade silence / resume ─────────────────────────────────────────────────────

interface CwMessage {
  message_type: number
  private:      boolean
  created_at:   number
  content?:     string
  sender:       { id?: number; type: string; name?: string } | null
}

// Cache Jade's own Chatwoot user ID to exclude it from human-agent detection.
// Because Jade uses a user API token, its messages show sender.type === 'user' —
// same as a human agent — so we need to filter by sender ID, not just type.
let _jadeCwSenderId: number | null | undefined = undefined

async function getJadeCwSenderId(): Promise<number | null> {
  if (_jadeCwSenderId !== undefined) return _jadeCwSenderId
  try {
    const profile   = await cwGet('/profile')
    _jadeCwSenderId = profile?.id ?? null
  } catch {
    _jadeCwSenderId = null
  }
  return _jadeCwSenderId as number | null
}

// Checks Chatwoot conversation messages for a recent HUMAN agent reply.
// Excludes Jade's own messages by comparing sender ID against Jade's profile ID.
async function detectHumanAgentReply(convId: number): Promise<Date | null> {
  try {
    const [data, jadeSenderId] = await Promise.all([
      cwGet(`/accounts/${ACCOUNT_ID}/conversations/${convId}/messages`),
      getJadeCwSenderId(),
    ])
    const raw  = data?.payload?.messages ?? data?.payload ?? []
    const msgs = Array.isArray(raw) ? (raw as CwMessage[]) : []
    const cutoff = Date.now() - RESUME_AFTER_MINUTES * 60 * 1000

    for (const msg of msgs) {
      const msgTime    = (msg.created_at ?? 0) * 1000
      const senderType = (msg.sender?.type ?? '').toLowerCase()
      const senderId   = msg.sender?.id
      // Skip Jade's own messages (same sender ID), bot messages, and private notes
      if (jadeSenderId && senderId === jadeSenderId) continue
      if (
        msg.message_type === 1 &&      // outgoing (agent direction)
        !msg.private &&                // not a private note
        msgTime > cutoff &&            // within the silence window
        senderType === 'user' &&       // must be a user (human agent)
        !senderType.includes('bot')    // extra safety guard
      ) {
        return new Date(msgTime)
      }
    }
    return null
  } catch {
    return null
  }
}

async function checkJadeSilence(convId: number | null): Promise<{
  silenced:     boolean
  shouldResume: boolean
}> {
  if (!convId) return { silenced: false, shouldResume: false }

  try {
    const supabase = getSupabaseAdmin()
    const { data: lead } = await supabase
      .from('leads')
      .select('id, jade_silenced_at, jade_resumed_at')
      .eq('chatwoot_conversation_id', convId)
      .maybeSingle()

    // Primary: Supabase silence flag (fast — set by previous detection)
    let silencedAt: Date | null = lead?.jade_silenced_at
      ? new Date(lead.jade_silenced_at as string)
      : null

    // Fallback: inspect Chatwoot messages directly for human agent replies.
    // This catches cases where no webhook is configured, or the flag was never set.
    if (!silencedAt) {
      const humanAt = await detectHumanAgentReply(convId)
      if (humanAt) {
        silencedAt = humanAt
        // Write back so future requests skip the extra API call
        if (lead?.id) {
          await supabase
            .from('leads')
            .update({ jade_silenced_at: humanAt.toISOString() })
            .eq('id', lead.id)
        }
      }
    }

    if (!silencedAt) return { silenced: false, shouldResume: false }

    const minutesSince = (Date.now() - silencedAt.getTime()) / 60000

    if (minutesSince < RESUME_AFTER_MINUTES) {
      return { silenced: true, shouldResume: false }
    }

    // 30+ minutes of no human response — Jade resumes
    const alreadyResumed =
      lead?.jade_resumed_at &&
      new Date(lead.jade_resumed_at as string) > silencedAt

    if (!alreadyResumed && lead?.id) {
      // Clear silence flag so future requests don't re-run this check
      await supabase
        .from('leads')
        .update({
          jade_resumed_at: new Date().toISOString(),
          jade_silenced_at: null,
        })
        .eq('id', lead.id)
      return { silenced: false, shouldResume: true }
    }

    return { silenced: false, shouldResume: false }
  } catch (e) {
    console.error('[Jade] Silence check failed:', e)
    return { silenced: false, shouldResume: false }
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
  existingConvId: number | null, dna: TravelDNA,
  handover: HandoverResult, profile: ClientProfile | null
): Promise<number | null> {
  const contactId = await getOrCreateContact(sessionId, customerName || profile?.name || '')
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
      content:            agentReply,
      message_type:       1,
      content_type:       'text',
      private:            false,
      content_attributes: { jade_ai: true },   // marks this as Jade's message so the webhook can skip it
    })
  } catch {}

  // Labels
  const labels: string[] = ['jade-ai']
  if (dna.budget === 'luxury' || profile?.budgetTier === 'luxury') labels.push('vip')
  if (dna.party === 'group'   || profile?.partyType === 'group')   labels.push('group-booking')
  if (profile?.travelStyle.includes('romantic'))                    labels.push('honeymoon')
  if ((profile?.visaInterests ?? []).length > 0)                   labels.push('visa-inquiry')
  if (profile?.bookingIntent === 'ready-to-book')                   labels.push('hot-lead')
  if (handover.needed)                                              labels.push('handover-requested')
  await addCwLabel(convId, labels[0])

  // Private note with profile context (first message or handover)
  if (dna.msgCount === 1 || handover.needed) {
    const lines = [`🧬 **Client Profile**`]
    if (profile?.name)          lines.push(`Name: ${profile.name}`)
    if (profile?.email)         lines.push(`Email: ${profile.email}`)
    if (profile?.nationality)   lines.push(`Nationality: ${profile.nationality}`)
    if (profile?.travelStyle.length) lines.push(`Style: ${profile.travelStyle.join(', ')}`)
    if (profile?.budgetTier)    lines.push(`Budget: ${profile.budgetTier}`)
    if (profile?.partyType)     lines.push(`Party: ${profile.partyType}`)
    if (profile?.destinations.length) lines.push(`Destinations: ${profile.destinations.join(', ')}`)
    if (profile?.bookingIntent) lines.push(`Intent: ${profile.bookingIntent}`)
    if (profile?.isReturning)   lines.push(`↩ Returning client`)
    lines.push(`Sentiment: ${dna.sentiment} | Messages: ${dna.msgCount}`)
    if (handover.needed) lines.push(`\n⚡ HANDOVER: ${handover.reason}`)
    await addCwNote(convId, lines.filter(Boolean).join('\n'))
  }

  return convId
}

// ─── B2B notification email ────────────────────────────────────────────────────

async function sendB2BEmail(company: string, originalMessage: string, convId: number | null) {
  const subject = `🤝 B2B Partnership Inquiry — ${company} via Website`
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:#0B1F3A;padding:20px 24px;border-radius:12px 12px 0 0">
        <h1 style="color:#C9A84C;margin:0;font-size:20px">🤝 B2B Partnership Inquiry</h1>
        <p style="color:#ffffff80;margin:4px 0 0;font-size:13px">Received via Walz Travels website chat</p>
      </div>
      <div style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px">
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
          <tr><td style="padding:6px 0;color:#6B7280;width:140px">Company</td><td style="color:#0B1F3A;font-weight:600">${company}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Channel</td><td style="color:#0B1F3A">Website chat (Jade)</td></tr>
        </table>
        <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:12px 16px;margin-bottom:20px">
          <strong style="color:#166534">Their message:</strong>
          <p style="color:#15803D;margin:4px 0 0;font-style:italic">"${originalMessage}"</p>
        </div>
        <p style="font-size:13px;color:#374151">Jade has responded professionally and applied the <strong>b2b-inquiry</strong> label in Chatwoot.</p>
        ${convId ? `
        <div style="margin-top:16px">
          <a href="${CHATWOOT_BASE}/app/accounts/${ACCOUNT_ID}/conversations/${convId}"
            style="background:#C9A84C;color:#0B1F3A;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">
            Open in Chatwoot →
          </a>
        </div>` : ''}
      </div>
    </div>`

  try {
    const resend = getResend()
    await resend.emails.send({ from: 'Jade AI <contact@walztravels.com>', to: 'contact@walztravels.com', subject, html })
  } catch (e) {
    console.error('[Jade] B2B email failed:', e)
  }
}

// ─── Handover email ───────────────────────────────────────────────────────────

async function sendHandoverEmail(
  customerName: string, customerEmail: string,
  handover: HandoverResult, dna: TravelDNA, profile: ClientProfile | null,
  convId: number | null, lastMessage: string
) {
  const routeEmail: Record<string, string> = {
    visa:         'visa@walztravels.com',
    reservations: 'reservations@walztravels.com',
    admin:        'contact@walztravels.com',
  }
  const to      = routeEmail[handover.routeTo] ?? 'contact@walztravels.com'
  const name    = profile?.name || customerName || 'Website Visitor'
  const email   = profile?.email || customerEmail || 'Not provided'
  const subject = `🔔 Jade Handover — ${name} [${handover.urgency.toUpperCase()}]`

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
          <tr><td style="padding:6px 0;color:#6B7280;width:140px">Name</td><td style="color:#0B1F3A;font-weight:600">${name}</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Email</td><td style="color:#0B1F3A">${email}</td></tr>
          ${profile?.phone ? `<tr><td style="padding:6px 0;color:#6B7280">Phone</td><td style="color:#0B1F3A">${profile.phone}</td></tr>` : ''}
          ${profile?.nationality ? `<tr><td style="padding:6px 0;color:#6B7280">Nationality</td><td style="color:#0B1F3A">${profile.nationality}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#6B7280">Last message</td><td style="color:#0B1F3A;font-style:italic">"${lastMessage.slice(0, 200)}"</td></tr>
          <tr><td style="padding:6px 0;color:#6B7280">Booking intent</td><td style="color:#0B1F3A">${profile?.bookingIntent || 'browsing'}</td></tr>
        </table>
        <h3 style="color:#0B1F3A;margin:20px 0 12px">🧬 Travel Profile</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${profile?.travelStyle.length ? `<tr><td style="padding:4px 0;color:#6B7280;width:140px">Style</td><td>${profile.travelStyle.join(', ')}</td></tr>` : ''}
          ${profile?.budgetTier  ? `<tr><td style="padding:4px 0;color:#6B7280">Budget</td><td>${profile.budgetTier}</td></tr>` : ''}
          ${profile?.partyType   ? `<tr><td style="padding:4px 0;color:#6B7280">Party</td><td>${profile.partyType}</td></tr>` : ''}
          ${profile?.destinations.length ? `<tr><td style="padding:4px 0;color:#6B7280">Destinations</td><td>${profile.destinations.join(', ')}</td></tr>` : ''}
          ${profile?.visaInterests.length ? `<tr><td style="padding:4px 0;color:#6B7280">Visa interests</td><td>${profile.visaInterests.join(', ')}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#6B7280">Sentiment</td><td>${dna.sentiment} · ${dna.msgCount} messages</td></tr>
          ${profile?.isReturning ? `<tr><td style="padding:4px 0;color:#6B7280">Client type</td><td>↩ Returning client</td></tr>` : ''}
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

## SOCIAL CHANNELS

When a client asks how to follow us or find us on social media, share the correct handle:
- Instagram: @walz_travels ← underscore, not a hyphen (instagram.com/walz_travels)
- Facebook: @walztravels (facebook.com/walztravels)
- TikTok: @walztravels (tiktok.com/@walztravels)
- Snapchat: @walztravels (snapchat.com/add/walztravels)
- X / Twitter: @walztravels (x.com/walztravels)
- YouTube: @walztravels (youtube.com/@walztravels)
- LinkedIn: /company/walztravels (linkedin.com/company/walztravels)

Contact:
- WhatsApp UK: wa.me/447398753797
- WhatsApp Canada: wa.me/15557107823
- Email: contact@walztravels.com
- Call Jade: +1 984 388 0110

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

We process visas for UK, Schengen, Canada, USA, UAE, Australia and more. 90%+ approval rate. We never guarantee approval, but we dramatically improve the odds.

Exchange rates used for conversions (approximate): £1 ≈ $1.35 ≈ ₦1,836 ≈ GH₵15.66

**UK Standard Visitor Visa**: £115 fee (10–14 working days) | Priority: £500 (5 days) | Super Priority: £1,000 (next day). Total cost with our service: approx ₦555,680 (adult) / ₦455,680 (child). Requires: 6-month bank statements, employment/business letter, strong ties to home country, accommodation evidence.

**Schengen Visa**: From €80 / £77 / ₦140,000+ embassy fee. Total with service: approx ₦511,440 (adult) / ₦431,440 (child). Requires: Travel insurance min €30k cover, round-trip flights, accommodation proof, financial evidence (~€50–100/day in destination).

**Canada Visitor Visa (TRV)**: CAD$185 / ~£133 / GH₵2,088 / ₦244,800. Total with service: approx ₦694,800. eTA (CAD$7) for some passport holders. Requires: Purpose of visit, financial proof, ties to home country.

**USA B1/B2 Visitor**: $185 DS-160 fee + consular appointment. ESTA $21 for eligible passport holders. Requires: Non-immigrant intent, strong financial proof, ties to home.

**UAE Visas**:
- Security clearance only: ₦93,840 / $69 / £51
- 96-hour transit: ₦639,200 / $470 / £348 / GH₵5,452
- 1-month tourist: ₦1,564,000 / $1,150 / £852 / GH₵13,340
- Free on arrival for many nationalities (varies by passport)

**Africa Destinations (from Nigeria)**:
- Uganda Tourist: from ₦200,000 (~£109)
- East Africa Multi-Country: from ₦280,000 (~£153)
- Tanzania Standard: ₦299,200 ($220 / £163) | Express: ₦394,400 ($290 / £215)
- Egypt: from ₦340,000 ($250 / £185)
- Morocco: from ₦590,000 (~£322)

**Asia Destinations (from Nigeria)**:
- Philippines E-Visa: from ₦550,000 (~£299)
- Thailand E-Visa: from ₦250,000 (~£136)
- Malaysia: ₦571,200 ($420 / £311) / GH₵4,872
- Indonesia: from ₦950,000 (~£518)

**Americas**:
- Mexico: from ₦3,000,000 (~$2,206 / £1,634) — full consular process

**Australia**: eVisitor/ETA from AUD$20 for eligible passports. Standard tourist visa from AUD$145.

When quoting visa prices, always lead with the client's local currency, then show GBP equivalent in brackets.

## CONTEXT RETENTION — NON-NEGOTIABLE

Before every response, mentally re-read the ENTIRE conversation history. Never ask for information the client has already given.

- If they mentioned a destination, do not ask where they want to go.
- If they gave their name, use it — don't ask for it again.
- If they mentioned travel dates, party size, or budget, use those. Don't ask again.
- When in doubt: "Let me make sure I have this right — [summary of what you know so far]. Is that correct?" — then proceed, don't stall.

## VISA ENQUIRIES

When a client asks about visas, respond immediately with:
1. Confirmation that Walz Travels handles this visa type
2. Key requirements for their nationality (from your knowledge base above)
3. Approximate processing time and cost
4. A direct call to action: "You can start your application at walztravels.com/visa"
5. Reassurance: "A visa officer will follow up with you within 24 hours."

Never loop back and ask where they're going if they've already told you. Pull the destination from the conversation history.

## PROFESSIONALISM

Never joke about being an AI, about the chat system, or about limitations. If you're uncertain about something, acknowledge it briefly and pivot to what you CAN do.

If the client seems frustrated or the conversation has gone off-track, say:
"Let me make sure I have this right — [accurate summary of what they've shared]. Is that correct?"

Then address their need directly from that summary.

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

const CURRENCY_LABELS: Record<string, string> = {
  NGN: 'Nigerian Naira (₦)',
  GHS: 'Ghanaian Cedi (GH₵)',
  AED: 'UAE Dirham (AED)',
  CAD: 'Canadian Dollar (CAD$)',
  GBP: 'British Pound (£)',
}

function buildSystemPrompt(
  msgCount:    number,
  pageContext: string,
  dna:         TravelDNA,
  isResuming:  boolean,
  profile:     ClientProfile | null,
  lang =       'en',
): string {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let extra = `\n\nToday's date is ${today}. When a user says 'next Friday', 'this weekend', 'tomorrow' etc, calculate the exact date yourself and confirm it back to the user. Never ask the user what today's date is.`
  const currency = profile?.currency ?? 'GBP'

  // Opening instructions
  if (msgCount <= 1 && !profile?.isReturning) {
    extra += '\n\n## OPENING INSTRUCTION\nGreet warmly and ask ONE open question about their travel dream. Maximum 3 sentences total.'
  }
  if (msgCount <= 1 && profile?.isReturning) {
    extra += "\n\n## RETURNING CLIENT INSTRUCTION\nThis client has spoken with Jade before. Do NOT give the standard 'Hi I'm Jade' intro. Greet them like you remember them: 'Good to hear from you again' — and reference what you previously discussed if relevant."
  }
  if (isResuming) {
    extra += "\n\n## AUTO-RESUME INSTRUCTION\nAn agent was handling this conversation but has gone quiet. Resume naturally: \"I see you've been speaking with our team — I'm back and happy to keep helping! Where were we?\" Keep it brief."
  }

  // Closing / conversion
  if (msgCount > 6 || profile?.bookingIntent === 'ready-to-book') {
    extra += '\n\n## CLOSING STAGE\nGuide toward conversion. For ready-to-book intent: collect email for full quote. For planning intent: suggest the clearest next step.'
  }

  // Client profile from memory engine
  if (profile && (profile.name || profile.destinations.length || profile.travelStyle.length)) {
    const lines: string[] = ['## CLIENT PROFILE (extracted from full conversation history)']
    if (profile.name)                   lines.push(`Name: ${profile.name}`)
    if (profile.email)                  lines.push(`Email: ${profile.email}`)
    if (profile.nationality)            lines.push(`Nationality: ${profile.nationality}`)
    if (profile.location)               lines.push(`Location: ${profile.location}`)
    if (profile.travelStyle.length)     lines.push(`Travel style: ${profile.travelStyle.join(', ')}`)
    if (profile.budgetTier)             lines.push(`Budget tier: ${profile.budgetTier}`)
    if (profile.partyType)              lines.push(`Party type: ${profile.partyType}`)
    if (profile.destinations.length)    lines.push(`Destinations mentioned: ${profile.destinations.join(', ')}`)
    if (profile.visaInterests.length)   lines.push(`Visa interests: ${profile.visaInterests.join(', ')}`)
    if (profile.bookingIntent)          lines.push(`Booking intent: ${profile.bookingIntent}`)
    if (profile.isReturning && profile.pastTopics.length) {
      lines.push(`From past sessions: discussed ${profile.pastTopics.join(', ')}`)
    }
    extra += '\n\n' + lines.join('\n')
  } else {
    // Fallback: DNA-only if profile is sparse
    if (dna.style.length || dna.budget || dna.party || dna.destinations.length) {
      extra += `\n\n## TRAVEL DNA PROFILE\nStyle: ${dna.style.join(', ') || 'unknown'} | Budget: ${dna.budget || 'unknown'} | Party: ${dna.party || 'unknown'} | Destinations: ${dna.destinations.join(', ') || 'none yet'}`
    }
  }

  // Open questions to follow up
  if (profile?.openQuestions.length) {
    extra += `\n\n## OPEN QUESTIONS (you asked these — pick up naturally when relevant)\n${profile.openQuestions.slice(0, 3).join('\n')}`
  }

  // Page context
  if (pageContext && pageContext !== 'home') {
    extra += `\n\n## PAGE CONTEXT\nClient is on the "${pageContext}" page — tailor your response accordingly.`
  }

  // Currency instruction (always injected)
  const currencyLabel = CURRENCY_LABELS[currency] ?? CURRENCY_LABELS['GBP']
  extra += `\n\n## CLIENT CURRENCY\nAlways quote prices in ${currencyLabel} first, with GBP in brackets if different. Example: "₦639,200 (about £348)". If client is GBP: normal quoting.`

  // Language rule — injected when client writes in a non-English language
  if (lang !== 'en') {
    const LANG_NAMES: Record<string, string> = {
      fr: 'French', es: 'Spanish', pt: 'Portuguese', ar: 'Arabic',
      yo: 'Yoruba', ha: 'Hausa', ig: 'Igbo', zh: 'Chinese', de: 'German',
    }
    const langName = LANG_NAMES[lang] ?? lang
    extra += `\n\n## LANGUAGE RULE\nRespond ENTIRELY in ${langName}. The client is writing in ${langName}. Use ${langName} for every sentence. English is only permitted for: prices, IATA airport codes, and the brand names "Walz Travels" and "Jade".`
  }

  return JADE_MASTER + extra
}

// ─── AI reply ─────────────────────────────────────────────────────────────────

async function jadeReply(
  messages:        Msg[],
  pageContext:     string,
  dna:             TravelDNA,
  isResuming:      boolean,
  profile:         ClientProfile | null,
  systemOverride?: string,
  lang =           'en',
): Promise<string> {
  const system = systemOverride ?? buildSystemPrompt(messages.length, pageContext, dna, isResuming, profile, lang)
  // Sonnet for early relationship-building (messages 1–10), Haiku for speed+cost on long chats
  const model  = messages.length > 10 ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'

  try {
    const res = await getAnthropic().messages.create({
      model, max_tokens: 600, system,
      messages: messages as Anthropic.MessageParam[],
    })
    return res.content[0].type === 'text' ? res.content[0].text : ''
  } catch (e) { console.error('[Jade] Claude failed:', e) }

  try {
    const res = await getOpenAI().chat.completions.create({
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

// ─── Flow types ────────────────────────────────────────────────────────────────

export interface QuickReply {
  label: string
  value: string
  type:  'message' | 'link'
}

interface FlowResult {
  reply:          string
  quickReplies:   QuickReply[]
  updatedSession: JadeSessionState
}

// ─── Flow intent detector (regex, no Claude — fast path) ──────────────────────

function detectFlowIntent(message: string): 'booking' | 'group_trip' | null {
  const m = message.toLowerCase()
  if (/\b(book (a |the )?flight|search (for )?flights?|fly (to|from)|i want to fly|find (me )?(a )?flight|one.?way|round.?trip|depart|cheapest flight|business class|economy class|first class ticket)\b/.test(m))
    return 'booking'
  if (/\b(group trip|group travel|group (holiday|vacation)|plan.*together|planning (a )?trip (with|for)|friends trip|family trip|group of \d|we (are|'re) (going|traveling)|everyone|trip for \d|hive|can't agree|of us (are )?going)\b/.test(m))
    return 'group_trip'
  return null
}

// ─── Booking param extractor (regex) ─────────────────────────────────────────

interface ExtractedBooking {
  origin:      string | null
  destination: string | null
  date:        string | null
  passengers:  number | null
  cabinClass:  string | null
}

function extractBookingParams(message: string): ExtractedBooking {
  const m    = message.toLowerCase()
  const orig = message // preserved for capital-letter signals

  // City names can be 1–3 words; lazy quantifier + lookahead stops before
  // temporal/direction words so "Lagos next Friday" → "Lagos" not "Lagos next Friday".
  const CITY_STOP = `(?=\\s+(?:from|next|this|on|at|in|by|for|via|with|tomorrow|today|,|\\.)|\\s*$)`
  const CITY_PAT  = `([a-z][a-z'\\-]*(?:\\s+[a-z][a-z'\\-]+){0,2}?)${CITY_STOP}`

  // ── Destination ──────────────────────────────────────────────────────────────

  let destination: string | null = null

  // Pattern A: "[travel verb] to [city]" — fly to, flight to, going to, travel to, trip to, heading to
  const destVerbMatch = m.match(
    new RegExp(
      `(?:fly(?:ing)?|flight|travel(?:l?ing)?|go(?:ing)?|head(?:ing)?|trip|journey|visit(?:ing)?|depart(?:ing)?)\\s+to\\s+${CITY_PAT}`,
    ),
  )
  if (destVerbMatch) destination = destVerbMatch[1].trim()

  // Pattern B: "to [Capitalised City]" — catches "from London to Dubai", "ticket to Lagos"
  if (!destination) {
    const CITY_CAP = `([A-Z][a-zA-Z'\\-]*(?:\\s+[A-Z][a-zA-Z'\\-]+){0,2}?)(?=\\s+(?:from|next|this|[Oo]n|[Aa]t|[Ii]n|[Bb]y|,|\\.)|\\s*$)`
    const destCapMatch = orig.match(new RegExp(`\\bto\\s+${CITY_CAP}`))
    if (destCapMatch) destination = destCapMatch[1].trim().toLowerCase()
  }

  // ── Origin ───────────────────────────────────────────────────────────────────

  let origin: string | null = null

  const ORIG_STOP = `(?=\\s+(?:to|next|this|on|at|in|by|,|\\.)|\\s*$)`
  const ORIG_PAT  = `([a-z][a-z'\\-]*(?:\\s+[a-z][a-z'\\-]+){0,2}?)${ORIG_STOP}`

  const originMatch = m.match(
    new RegExp(
      `(?:departing\\s+from|flying\\s+from|depart\\s+from|leav(?:ing)?\\s+from|out\\s+of|depart(?:ing)?\\s+|from)\\s*${ORIG_PAT}`,
    ),
  )
  if (originMatch) origin = originMatch[1].trim()

  // ── IATA codes as fallback ────────────────────────────────────────────────────

  const iata = orig.match(/\b([A-Z]{3})\b/g) ?? []
  const resolvedOrigin      = origin      ?? (iata[0] ?? null)
  const resolvedDestination = destination ?? (iata[iata.length > 1 ? 1 : 0] ?? null)

  // ── Date ─────────────────────────────────────────────────────────────────────

  const days        = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday'
  const months      = 'january|february|march|april|may|june|july|august|september|october|november|december'
  const monthsShort = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec'

  let date: string | null = null

  // 1. ISO: 2026-07-15
  const isoMatch = m.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoMatch) date = isoMatch[1]

  // 2. "next/this [weekday|weekend|week]"
  if (!date) {
    const relMatch = m.match(new RegExp(`\\b(next|this)\\s+(${days}|weekend|week)\\b`, 'i'))
    if (relMatch) date = relMatch[0]
  }

  // 3. "tomorrow"
  if (!date && /\btomorrow\b/i.test(m)) date = 'tomorrow'

  // 4. "in [n] days/weeks"
  if (!date) {
    const inNMatch = m.match(/\bin\s+(\d+)\s+(days?|weeks?)\b/i)
    if (inNMatch) date = inNMatch[0]
  }

  // 5. Standalone day of week: "friday", "on saturday"
  if (!date) {
    const dowMatch = m.match(new RegExp(`\\b(?:on\\s+)?(${days})\\b`, 'i'))
    if (dowMatch) date = dowMatch[1] ?? dowMatch[0]
  }

  // 6. "[n] [month]" or "[month] [n]", optional year
  if (!date) {
    const specificDate = m.match(
      new RegExp(
        `(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${months}|${monthsShort})(?:\\s+\\d{4})?|(${months}|${monthsShort})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+\\d{4})?`,
        'i',
      ),
    )
    if (specificDate) date = specificDate[0]
  }

  // ── Passengers ───────────────────────────────────────────────────────────────

  const paxMatch = m.match(/(\d+)\s*(?:passenger|adult|pax|person|people|of us)|family\s+of\s+(\d+)/i)
  const passengers = paxMatch ? Number(paxMatch[1] ?? paxMatch[2]) || null : null

  // ── Cabin class ───────────────────────────────────────────────────────────────

  let cabinClass: string | null = null
  if (/first\s+class/i.test(m))             cabinClass = 'FIRST'
  else if (/business(?:\s+class)?/i.test(m)) cabinClass = 'BUSINESS'
  else if (/premium\s+economy/i.test(m))    cabinClass = 'PREMIUM_ECONOMY'
  else if (/economy(?:\s+class)?/i.test(m)) cabinClass = 'ECONOMY'

  return { origin: resolvedOrigin, destination: resolvedDestination, date, passengers, cabinClass }
}

// ─── Booking flow handler ──────────────────────────────────────────────────────

async function handleBookingFlow(
  message: string,
  session: JadeSessionState | null,
): Promise<FlowResult> {
  const existing = session?.bookingContext ?? null
  const ctx = existing ?? {
    searchParams:     null,
    offersReturned:   false,
    selectedOfferId:  null,
    awaitingConfirm:  false,
    confirmedOrderId: null,
    topOfferSummary:  null,
  }

  const baseSession = (): Omit<JadeSessionState, 'bookingContext'> => ({
    intent:              'booking',
    lastMessage:         message,
    conversationHistory: session?.conversationHistory ?? [],
    groupContext:        null,
  })

  // ── Awaiting confirm: user said yes or no ──────────────────────────────────
  if (ctx.awaitingConfirm && ctx.selectedOfferId) {
    const isYes = /\b(yes|yeah|yep|book|confirm|go ahead|do it|book it|proceed|sounds good|let'?s do it|perfect)\b/i.test(message)
    const isNo  = /\b(no|nope|cancel|stop|don'?t|show (all|others?|more)|see all|other (flights?|options?))\b/i.test(message)

    if (isYes) {
      const sp  = ctx.searchParams!
      const url = `/flights/search?from=${encodeURIComponent(sp.origin)}&to=${encodeURIComponent(sp.destination)}&depart=${encodeURIComponent(sp.departureDate)}&cabin=${sp.cabinClass}&adults=${sp.passengers}`
      return {
        reply: `Let's get you booked! Head to our secure checkout to complete your booking:\n\n[Complete booking →](${url})\n\nYour search is pre-filled — just pick your seat and pay. Any questions before you go?`,
        quickReplies: [
          { label: '✈ Complete booking', value: url, type: 'link' },
          { label: '🔍 See all flights',  value: `/flights/search?from=${encodeURIComponent(sp.origin)}&to=${encodeURIComponent(sp.destination)}&depart=${encodeURIComponent(sp.departureDate)}`, type: 'link' },
        ],
        updatedSession: {
          ...baseSession(),
          bookingContext: { ...ctx, awaitingConfirm: false },
        },
      }
    }

    if (isNo) {
      const sp  = ctx.searchParams!
      const url = `/flights/search?from=${encodeURIComponent(sp.origin)}&to=${encodeURIComponent(sp.destination)}&depart=${encodeURIComponent(sp.departureDate)}&cabin=${sp.cabinClass}&adults=${sp.passengers}`
      return {
        reply: `No problem! Here are all available flights for your search:\n\n[View all flights →](${url})\n\nYou can compare times, airlines, and prices in full.`,
        quickReplies: [{ label: '🔍 See all flights', value: url, type: 'link' }],
        updatedSession: {
          ...baseSession(),
          bookingContext: { ...ctx, awaitingConfirm: false },
        },
      }
    }

    // Ambiguous follow-up while awaiting confirm
    return {
      reply: `${ctx.topOfferSummary ?? 'I have a flight recommendation for you.'}\n\nShall I book this one, or would you like to see all options?`,
      quickReplies: [
        { label: '✅ Book this',        value: 'Yes, book it', type: 'message' },
        { label: '🔍 See all flights',  value: 'Show me all flights', type: 'message' },
      ],
      updatedSession: { ...baseSession(), bookingContext: ctx },
    }
  }

  // ── Collect search params ─────────────────────────────────────────────────
  const ex      = extractBookingParams(message)
  const current = ctx.searchParams ?? { origin: '', destination: '', departureDate: '', returnDate: null, passengers: 1, cabinClass: 'ECONOMY' }
  const merged  = {
    origin:        ex.origin        ?? current.origin,
    destination:   ex.destination   ?? current.destination,
    departureDate: ex.date          ?? current.departureDate,
    returnDate:    current.returnDate,
    passengers:    ex.passengers    ?? current.passengers,
    cabinClass:    ex.cabinClass    ?? current.cabinClass,
  }

  if (!merged.destination) {
    return {
      reply: `Where would you like to fly to? Tell me the destination city or country.`,
      quickReplies: [],
      updatedSession: { ...baseSession(), bookingContext: { ...ctx, searchParams: merged.origin ? merged : null } },
    }
  }

  if (!merged.origin) {
    return {
      reply: `Great — flying to **${merged.destination}**! Which city are you departing from?`,
      quickReplies: [],
      updatedSession: { ...baseSession(), bookingContext: { ...ctx, searchParams: merged } },
    }
  }

  if (!merged.departureDate) {
    return {
      reply: `**${merged.origin}** → **${merged.destination}** — when would you like to depart? (e.g. "15 July" or "next Monday")`,
      quickReplies: [],
      updatedSession: { ...baseSession(), bookingContext: { ...ctx, searchParams: merged } },
    }
  }

  // Ask pax/cabin exactly once — only on the turn when the date was just provided
  // (date not yet saved in ctx) and this isn't the very first turn of the flow.
  // If the user already specified pax or cabin in their message, skip the question.
  const dateAlreadySaved = !!ctx.searchParams?.departureDate
  const isFirstBookingTurn = !session?.bookingContext
  if (!ctx.offersReturned && !ex.passengers && !ex.cabinClass && !dateAlreadySaved && !isFirstBookingTurn) {
    return {
      reply: `Almost there! How many passengers, and which cabin class?`,
      quickReplies: [
        { label: '1 · Economy',  value: '1 passenger, economy class',  type: 'message' },
        { label: '2 · Economy',  value: '2 passengers, economy class',  type: 'message' },
        { label: '1 · Business', value: '1 passenger, business class',  type: 'message' },
      ],
      updatedSession: { ...baseSession(), bookingContext: { ...ctx, searchParams: merged } },
    }
  }

  // ── All params present — search flights ────────────────────────────────────
  const isoDate = merged.departureDate
  const params: FlightSearchParams = {
    tripType:   'one-way',
    cabin:      merged.cabinClass as FlightSearchParams['cabin'],
    passengers: { adults: merged.passengers, children: 0, infants: 0 },
    legs: [{ from: merged.origin.toUpperCase().slice(0, 3), to: merged.destination.toUpperCase().slice(0, 3), date: isoDate }],
  }

  let offers: FlightItinerary[] = []
  try {
    if (process.env.DUFFEL_ACCESS_TOKEN) {
      const raw = await searchFlights(params)
      offers    = assignBadges(raw)
    }
  } catch {}

  if (offers.length === 0) {
    const url = `/flights/search?from=${encodeURIComponent(merged.origin)}&to=${encodeURIComponent(merged.destination)}&depart=${encodeURIComponent(merged.departureDate)}&cabin=${merged.cabinClass}&adults=${merged.passengers}`
    return {
      reply: `I wasn't able to pull live fares right now, but your search is ready on our flights page:\n\n[Search ${merged.origin} → ${merged.destination}](${url})\n\nYou'll see all available airlines and real-time prices there.`,
      quickReplies: [{ label: '🔍 View flights', value: url, type: 'link' }],
      updatedSession: {
        ...baseSession(),
        bookingContext: { ...ctx, searchParams: merged, offersReturned: false },
      },
    }
  }

  // Pick best offer: prefer lowest price
  const best = offers.reduce((a, b) => (a.price.total < b.price.total ? a : b))
  const seg  = best.segments[0]

  const airline = seg?.airlineName ?? seg?.airline ?? 'Airlines'
  const origin  = seg?.departureIata ?? merged.origin.toUpperCase().slice(0, 3)
  const dest    = seg?.arrivalIata   ?? merged.destination.toUpperCase().slice(0, 3)
  const depTime = seg?.departureTime ? new Date(seg.departureTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
  const arrTime = seg?.arrivalTime   ? new Date(seg.arrivalTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
  const stops   = best.stops
  const price   = `${best.price.currency} ${best.price.total.toLocaleString()}`
  const cabin   = merged.cabinClass.charAt(0) + merged.cabinClass.slice(1).toLowerCase()

  const summary = `✈ **${airline}** · ${origin} → ${dest}\n🕐 ${depTime} → ${arrTime} · ${stops === 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`}\n💺 ${cabin} · ${merged.passengers} pax\n💷 **${price}**`

  return {
    reply: `I found **${offers.length} flights**. My top pick:\n\n${summary}\n\nShall I book this one, or would you like to see all options?`,
    quickReplies: [
      { label: '✅ Book this',       value: 'Yes, book it',        type: 'message' },
      { label: '🔍 See all flights', value: 'Show me all flights', type: 'message' },
    ],
    updatedSession: {
      ...baseSession(),
      bookingContext: {
        searchParams:     merged,
        offersReturned:   true,
        selectedOfferId:  best.id,
        awaitingConfirm:  true,
        confirmedOrderId: null,
        topOfferSummary:  summary,
      },
    },
  }
}

// ─── Group trip flow handler ───────────────────────────────────────────────────

async function handleGroupFlow(
  message:      string,
  session:      JadeSessionState | null,
  cookieHeader: string,
): Promise<FlowResult> {
  const existing = session?.groupContext ?? null
  const ctx = existing ?? {
    sessionId:   null,
    sessionName: null,
    role:        null,
    currentStep: null,
    memberCount: null,
    inviteLinks: null,
  }

  const mkSession = (): Omit<JadeSessionState, 'groupContext'> => ({
    intent:              'group_trip',
    lastMessage:         message,
    conversationHistory: session?.conversationHistory ?? [],
    bookingContext:      null,
  })

  // ── Bug 2: Carry-over from a prior booking flow ───────────────────────────
  const bookingSearchParams = session?.bookingContext?.searchParams
  const carryOverCount      = bookingSearchParams?.passengers  ?? null
  const carryOverOrigin     = bookingSearchParams?.origin      ?? null
  const carryOverDest       = bookingSearchParams?.destination ?? null

  // ── Bug 4: Extract group size — also accept a bare number reply like "5" ──
  const sizeMatch     = message.match(/\b(\d+)\s*(?:people|person|pax|of us|members?|friends?|family members?)\b/i)
  const plainNumMatch = !sizeMatch ? message.trim().match(/^(\d{1,2})[.!?]?\s*$/) : null
  const extractedCount = sizeMatch
    ? Number(sizeMatch[1])
    : plainNumMatch ? Number(plainNumMatch[1]) : null

  // Final count: current message → saved session → booking carry-over
  const memberCount = extractedCount ?? ctx.memberCount ?? carryOverCount ?? null

  // True only on the first group-turn after switching from booking (no prior group state, no explicit count now)
  const isSwitchingFromBooking = !!carryOverCount && !ctx.memberCount && !extractedCount

  // ── Extract trip name — explicit phrase or plain reply ─────────────────────
  const nameExplicit = message.match(
    /(?:call(?:ed)?|name(?:d)?|trip name|name it|call the trip)\s+["']?([A-Za-z0-9 '&\-]{3,40})["']?/i,
  )
  // Treat a short plain reply as the trip name when we've already collected the count.
  // Must start with a letter so bare numbers ("5", "10") are never mistaken for a name.
  const namePlain = !nameExplicit && ctx.memberCount && !ctx.sessionName
    ? message.trim().match(/^([A-Za-z][A-Za-z0-9 '&\-]{2,49})[.!?]?\s*$/)
    : null
  const sessionName = nameExplicit?.[1]?.trim() ?? namePlain?.[1]?.trim() ?? ctx.sessionName ?? null

  // ── Already created — show status ─────────────────────────────────────────
  if (ctx.sessionId) {
    const step  = ctx.currentStep
    const count = ctx.memberCount ?? memberCount ?? 0

    if (step === 'collecting') {
      const links = (ctx.inviteLinks ?? []).map((url, i) => `**Person ${i + 1}:** ${url}`).join('\n')
      return {
        reply: `Your group trip **${ctx.sessionName}** is live!\n\nSend each person their private link:\n\n${links}\n\nI'll let you know when everyone has submitted.`,
        quickReplies: [
          { label: '📊 Check status', value: 'What is the group status?', type: 'message' },
        ],
        updatedSession: { ...mkSession(), groupContext: ctx },
      }
    }

    if (step === 'voting') {
      return {
        reply: `Voting is open for **${ctx.sessionName}**! Share the vote link and I'll announce the winner once everyone has picked.`,
        quickReplies: [
          { label: '🗳 Vote link', value: `/group/${ctx.sessionId}/vote`, type: 'link' },
        ],
        updatedSession: { ...mkSession(), groupContext: ctx },
      }
    }

    if (step === 'complete') {
      return {
        reply: `Your group itinerary for **${ctx.sessionName}** is ready!`,
        quickReplies: [
          { label: '🗺 View itinerary',    value: `/group/${ctx.sessionId}/itinerary`,  type: 'link' },
          { label: '🛂 Check group visas', value: `/visa/${ctx.sessionId}/results`,     type: 'link' },
        ],
        updatedSession: { ...mkSession(), groupContext: ctx },
      }
    }

    void count // used above
    return { reply: `Your group trip is being set up — I'll update you shortly.`, quickReplies: [], updatedSession: { ...mkSession(), groupContext: ctx } }
  }

  // ── Bug 2: Switching from booking — show carry-over, ask only for name ───
  if (isSwitchingFromBooking && !sessionName) {
    const parts: string[] = []
    if (carryOverOrigin) parts.push(`flying from **${carryOverOrigin}**`)
    if (carryOverDest)   parts.push(`to **${carryOverDest}**`)
    const detailStr = parts.length > 0 ? `, ${parts.join(' ')}` : ''
    return {
      reply: `Got it — let's plan this as a group trip instead.\n\nI already have: **${memberCount}** ${memberCount === 1 ? 'person' : 'people'}${detailStr}. Give your trip a name and I'll create private invite links for everyone.`,
      quickReplies: [],
      updatedSession: { ...mkSession(), groupContext: { ...ctx, memberCount: memberCount! } },
    }
  }

  // ── Collect group size ────────────────────────────────────────────────────
  if (!memberCount) {
    return {
      reply: `I'd love to help plan your group trip! How many people are in the group (including yourself)?`,
      quickReplies: [
        { label: '3 people',  value: '3 people',  type: 'message' },
        { label: '5 people',  value: '5 people',  type: 'message' },
        { label: '8+ people', value: '10 people', type: 'message' },
      ],
      updatedSession: { ...mkSession(), groupContext: ctx },
    }
  }

  // ── Collect trip name ─────────────────────────────────────────────────────
  if (!sessionName) {
    return {
      reply: `A group of **${memberCount}** — love it! What's the trip name? Something like "Lagos Squad 2026" or "Summer Escape".`,
      quickReplies: [],
      updatedSession: { ...mkSession(), groupContext: { ...ctx, memberCount } },
    }
  }

  // ── Both collected — create the group session ────────────────────────────
  const BASE_URL = process.env.NEXTAUTH_URL
    ?? process.env.NEXT_PUBLIC_BASE_URL
    ?? 'https://walztravels.com'

  const members = Array.from({ length: memberCount }, (_, i) => ({ name: `Person ${i + 1}` }))

  let createRes: Response
  try {
    createRes = await fetch(`${BASE_URL}/api/public/group/create`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie:          cookieHeader,
      },
      body: JSON.stringify({ name: sessionName, members }),
    })
  } catch {
    // Network error — fall back to manual link
    const url = `/group/create?name=${encodeURIComponent(sessionName)}`
    return {
      reply: `I hit a snag creating the session automatically. You can set it up here:\n\n[Create group trip →](${url})`,
      quickReplies: [{ label: '🔗 Create trip', value: url, type: 'link' }],
      updatedSession: { ...mkSession(), groupContext: { ...ctx, sessionName, memberCount } },
    }
  }

  // Auth required — user must sign in
  if (createRes.status === 401) {
    return {
      reply: `To create the group session I'll need you to be signed in to your Walz account.\n\n[Sign in →](/login?callbackUrl=/)\n\nOnce you're in, just say "start the group trip" and I'll set it up straight away!`,
      quickReplies: [{ label: '🔑 Sign in', value: '/login', type: 'link' }],
      updatedSession: { ...mkSession(), groupContext: { ...ctx, sessionName, memberCount } },
    }
  }

  if (!createRes.ok) {
    return {
      reply: `Something went wrong creating your trip (${createRes.status}). Please try again or let me know if you need help.`,
      quickReplies: [],
      updatedSession: { ...mkSession(), groupContext: { ...ctx, sessionName, memberCount } },
    }
  }

  const { sessionId, inviteLinks } = await createRes.json() as {
    sessionId:   string
    sessionName: string
    inviteLinks: Array<{ name: string; token: string; url: string }>
  }

  const linkLines = inviteLinks.map((l, i) => `**Person ${i + 1}:** ${l.url}`).join('\n')

  return {
    reply: `**${sessionName}** is ready 🎉\n\nSend each person their private link — they share their preferences privately without seeing each other's answers:\n\n${linkLines}\n\nI'll let you know when everyone has submitted.`,
    quickReplies: [
      { label: '📋 View trip', value: `/group/${sessionId}/itinerary`, type: 'link' },
    ],
    updatedSession: {
      ...mkSession(),
      groupContext: {
        sessionId,
        sessionName,
        role:        'creator',
        currentStep: 'collecting',
        memberCount,
        inviteLinks: inviteLinks.map(l => l.url),
      },
    },
  }
}

// ─── Intent classifier ────────────────────────────────────────────────────────

function classifyIntent(message: string, dna: TravelDNA): string {
  const m = message.toLowerCase()
  if (/\b(visa|passport|embassy|schengen|uk visa|canada visa|us visa|application|approval|rejection|refusal|immigration)\b/.test(m)) return 'visa'
  if (/\b(flight|fly|flying|airline|airport|airfare|ticket|book.*flight|search.*flight)\b/.test(m)) return 'flights'
  if (/\b(hotel|accommodation|stay|resort|bnb|check[\s-]?in|check[\s-]?out|room|suite|lodge)\b/.test(m)) return 'hotels'
  if (/\b(tour|trip|experience|activity|excursion|safari|cruise|adventure|explore|sightseeing|attraction)\b/.test(m)) return 'experiences'
  if (dna.style.includes('beach') || dna.style.includes('adventure')) return 'experiences'
  return 'general'
}

// ─── Claude-based profile extraction (Haiku, runs parallel to main reply) ────

async function extractProfileWithClaude(messages: Msg[]): Promise<Record<string, unknown>> {
  const recent = messages.slice(-8)
  const conv   = recent.map(m => `${m.role === 'user' ? 'Client' : 'Jade'}: ${m.content}`).join('\n')

  const prompt = `Extract ONLY what the CLIENT has explicitly revealed in this conversation. Return valid JSON only:
{
  "name": string|null,
  "nationality": string|null,
  "destinations": string[],
  "visaInterests": string[],
  "budgetTier": "budget"|"mid-range"|"luxury"|null,
  "partyType": "solo"|"couple"|"family"|"group"|null,
  "travelStyle": string[],
  "bookingIntent": "browsing"|"planning"|"ready-to-book"|null,
  "currency": "NGN"|"GHS"|"AED"|"CAD"|"GBP"|null
}
Omit or null any field you are not confident about. No extra text.
CONVERSATION:
${conv}`

  try {
    const res  = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ─── Convert widget profile (from localStorage) to ClientProfile shape ────────

function widgetProfileToClientProfile(raw: Record<string, unknown>, returning: boolean): ClientProfile {
  const arr = (key: string): string[] =>
    Array.isArray(raw[key]) ? (raw[key] as string[]) : []
  return {
    name:          (raw.name          as string) ?? '',
    email:         '',
    phone:         '',
    nationality:   (raw.nationality   as string) ?? '',
    location:      '',
    travelStyle:   arr('travelStyle'),
    budgetTier:    (raw.budgetTier    as string) ?? '',
    partyType:     (raw.partyType     as string) ?? '',
    destinations:  arr('destinations'),
    visaInterests: arr('visaInterests'),
    openQuestions: [],
    bookingIntent: (raw.bookingIntent as ClientProfile['bookingIntent']) ?? 'browsing',
    currency:      (raw.currency      as ClientProfile['currency'])      ?? 'GBP',
    isReturning:   returning,
    pastTopics:    arr('destinations'),
    msgCount:      0,
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: {
    message:             string
    conversationHistory: Msg[]
    sessionId?:          string
    conversationId?:     number | null
    customerName?:       string
    customerEmail?:      string
    pageContext?:        string
    clientLanguage?:     string
    isReturning?:        boolean
    userProfile?:        Record<string, unknown>
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ reply: "Sorry, I couldn't read your message. Please try again.", conversationId: null }, { status: 200 })
  }

  const {
    message,
    conversationHistory = [],
    sessionId,
    conversationId,
    customerName   = '',
    customerEmail  = '',
    pageContext    = '',
    clientLanguage = 'en',
    isReturning    = false,
    userProfile,
  } = body

  if (!message?.trim()) return NextResponse.json({ error: 'Message required' }, { status: 400 })

  const convId = conversationId ?? null
  const sid    = sessionId ?? `web-${Date.now()}`

  // ── Silence check — non-blocking with short timeout ─────────────────────────
  let silenced     = false
  let shouldResume = false
  try {
    const silenceResult = await Promise.race([
      checkJadeSilence(convId),
      new Promise<{ silenced: boolean; shouldResume: boolean }>(resolve =>
        setTimeout(() => resolve({ silenced: false, shouldResume: false }), 4000)
      ),
    ])
    silenced     = silenceResult.silenced
    shouldResume = silenceResult.shouldResume
  } catch {
    // Chatwoot unreachable — don't block Jade
  }

  // When silenced by a human agent — return handoff signal (no AI reply)
  if (silenced) {
    // Try to get the agent's name from the Chatwoot conversation meta
    let agentName: string | null = null
    if (convId) {
      try {
        const conv    = await cwGet(`/accounts/${ACCOUNT_ID}/conversations/${convId}`)
        const assignee = conv?.meta?.assignee ?? conv?.assignee
        if (assignee?.name) agentName = assignee.name as string
      } catch {}
    }
    return NextResponse.json({
      reply:          null,
      handedOff:      true,
      agentName,
      silenced:       true,
      conversationId: convId,
    })
  }

  // ── Fetch memory — non-blocking with short timeout ──────────────────────────
  let profile: ClientProfile | null = null
  let fullHistory: Msg[] = []

  if (convId) {
    try {
      const memResult = await Promise.race([
        fetchClientMemory(convId),
        new Promise<{ profile: null; messages: Msg[] }>(resolve =>
          setTimeout(() => resolve({ profile: null, messages: [] }), 4000)
        ),
      ])
      profile     = memResult.profile
      fullHistory = memResult.messages
    } catch {}
  }

  // Fall back to widget-provided profile when Chatwoot memory is sparse
  if (userProfile && typeof userProfile === 'object' && Object.keys(userProfile).length > 0) {
    const isEmpty = !profile || (!profile.name && !profile.destinations.length && !profile.travelStyle.length)
    if (isEmpty) profile = widgetProfileToClientProfile(userProfile, isReturning)
  }
  // Ensure isReturning flag is reflected in profile (widget knows before Chatwoot does)
  if (isReturning && profile && !profile.isReturning) {
    profile = { ...profile, isReturning: true }
  }

  // Use Chatwoot history when available, otherwise use browser-sent history
  const history  = fullHistory.length > 0
    ? fullHistory
    : conversationHistory.filter(m => m.role === 'user' || m.role === 'assistant')

  const messages: Msg[] = [...history, { role: 'user', content: message }]
  const dna      = buildDNA(history, message)
  const b2b      = isB2BInquiry(message)

  const handover = b2b
    ? { needed: true, reason: 'B2B partnership inquiry — business development team notified', urgency: 'medium' as const, routeTo: 'admin' as const }
    : detectHandover(message, history, dna)

  // ── Load Jade session (flow state for booking / group) ────────────────────────
  const convKey     = convId ? String(convId) : sid
  const jadeSession = await loadJadeSession(convKey).catch(() => null)

  // Human agent has taken over this conversation — stay completely silent
  if (jadeSession?.agentActive === true) {
    return NextResponse.json({
      reply:          null,
      handedOff:      true,
      agentName:      null,
      silenced:       true,
      conversationId: convId,
    })
  }

  // ── Fast-path: route to flow handler if in an active flow ─────────────────────
  const sessionIntent  = jadeSession?.intent ?? null
  const newFlowIntent  = !sessionIntent ? detectFlowIntent(message) : null
  const activeIntent   = sessionIntent ?? newFlowIntent
  const cookieHeader   = req.headers.get('cookie') ?? ''

  if (activeIntent === 'booking' || activeIntent === 'group_trip') {
    const flowResult = activeIntent === 'booking'
      ? await handleBookingFlow(message, jadeSession)
      : await handleGroupFlow(message, jadeSession, cookieHeader)

    // Persist updated session (fire-and-forget)
    if (convKey) {
      void saveJadeSession(convKey, flowResult.updatedSession)
    }

    // Push to Chatwoot async (same pattern as standard path)
    let newConvId: number | null = null
    void (async () => {
      try {
        newConvId = await pushToCharwoot(
          sid, customerName, message, flowResult.reply, convId, dna, handover, profile
        )
      } catch (e) {
        console.error('[Jade→CW] Flow push failed:', String(e).slice(0, 100))
      }
    })()

    return NextResponse.json({
      reply:           flowResult.reply,
      conversationId:  convId,
      dna,
      intent:          activeIntent,
      quickReplies:    flowResult.quickReplies,
      extractedProfile: undefined,
      handover:        null,
      resumed:         shouldResume,
    })
  }

  // ── Standard path: full AI reply + profile extraction ─────────────────────────
  const [reply, extractedProfile] = await Promise.all([
    jadeReply(
      messages, pageContext, dna, shouldResume, profile,
      b2b ? JADE_B2B_PROMPT : undefined,
      clientLanguage,
    ),
    extractProfileWithClaude(messages).catch(() => ({})),
  ])

  const intent = classifyIntent(message, dna)

  // ── Push to Chatwoot asynchronously — never blocks the response ──────────────
  let newConvId: number | null = null
  void (async () => {
    try {
      newConvId = await pushToCharwoot(
        sid, customerName, message, reply, convId, dna, handover, profile
      )
      if (b2b) {
        if (newConvId) void addCwLabel(newConvId, 'b2b-inquiry')
        const companyMatch =
          message.match(/([A-Z][a-zA-Z ]+(?:Tourism|Travel|Agency|Tours|Corp|Ltd|Inc|LLC|Group))/)?.[1]
          ?? (customerName || 'Business Inquiry')
        void sendB2BEmail(companyMatch, message, newConvId)
      }
      if (handover.needed && !b2b) {
        void sendHandoverEmail(customerName, customerEmail, handover, dna, profile, newConvId, message)
      }
    } catch (e) {
      console.error('[Jade→CW] Background push failed:', String(e).slice(0, 100))
    }
  })()

  return NextResponse.json({
    reply,
    conversationId:  convId,
    dna,
    intent,
    quickReplies:    [],
    extractedProfile: Object.keys(extractedProfile).length > 0 ? extractedProfile : undefined,
    handover:         handover.needed ? handover : null,
    resumed:          shouldResume,
  })
}
