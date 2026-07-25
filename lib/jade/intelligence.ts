// lib/jade/intelligence.ts
// Jade v4 Master Intelligence Library — 7 world-first features

import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const SITE = process.env.NEXT_PUBLIC_BASE_URL || 'https://walztravels.com'

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — EMOTIONAL RESONANCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export type EmotionState =
  | 'excited' | 'anxious' | 'grieving' | 'frustrated' | 'celebratory'
  | 'lonely' | 'overwhelmed' | 'urgent' | 'nostalgic' | 'romantic'
  | 'corporate' | 'neutral'

const EMOTION_PATTERNS: [EmotionState, RegExp][] = [
  ['grieving',    /\b(passed away|funeral|death|died|loss|memorial|mourn|tribute|bereavement|RIP|in memory)\b/i],
  ['urgent',      /\b(asap|urgent|emergency|immediately|today|tonight|right now|as soon as|last.?minute|few hours)\b/i],
  ['frustrated',  /\b(frustrated|annoyed|upset|angry|ridiculous|terrible|awful|waste|useless|fail|disappoint)\b/i],
  ['anxious',     /\b(worried|nervous|scared|not sure|afraid|anxious|concern|stress|hope|what if|unsure|doubt)\b/i],
  ['celebratory', /\b(birthday|anniversary|honeymoon|graduation|wedding|celebrate|milestone|engagement|proposal|baby shower)\b/i],
  ['romantic',    /\b(surprise|romantic|partner|love|proposal|couple|together|our|sweetheart|date night|getaway)\b/i],
  ['nostalgic',   /\b(years ago|childhood|used to|remember when|back home|grew up|haven.?t been|long time|hometown)\b/i],
  ['excited',     /\b(can.?t wait|so excited|amazing|finally|dream|omg|yay|thrilled|pumped|countdown|buzzing)\b/i],
  ['corporate',   /\b(business|corporate|meeting|conference|team|client|company|colleagues|work trip|expense|invoice|receipt)\b/i],
  ['lonely',      /\b(alone|by myself|solo|no one|just me|single|lonely|miss|missing|no friends|nobody)\b/i],
  ['overwhelmed', /\b(overwhelmed|too much|confused|don.?t know where|lost|help me figure|so many options|complicated)\b/i],
]

const EMOTION_TONE: Record<EmotionState, string> = {
  excited:     "Match their energy — be equally enthusiastic and use momentum to close faster.",
  anxious:     "Slow down. Be reassuring and calm. Say 'I completely understand' BEFORE offering solutions. Never rush them.",
  grieving:    "Be gentle and warm above all else. Acknowledge the reason for travel first. Offer to handle all the details so they don't have to think.",
  frustrated:  "Acknowledge immediately: 'That sounds really frustrating.' Solve first, explain second. Be direct and fast.",
  celebratory: "Match the celebration! This is a special occasion — make them feel the excitement. Recommend an upgrade or memorable add-on.",
  lonely:      "Be warm and personal. This trip may mean a great deal emotionally. Make them feel genuinely looked after.",
  overwhelmed: "Simplify everything radically. ONE question at a time. Be the expert who makes the decision FOR them. 'Leave it to me.'",
  urgent:      "Zero small talk. Get to the solution in 2-3 sentences. Lead with what CAN be done right now.",
  nostalgic:   "Connect with the emotional journey first. Ask about the memory before the logistics. This trip is about more than travel.",
  romantic:    "Be warm and imaginative. Help them picture the moment. Suggest one special detail that elevates the trip.",
  corporate:   "Be professional and efficient. Lead with logistics: cost, timing, what's included. Skip the narrative.",
  neutral:     "Standard warm, professional consultation approach.",
}

export function detectEmotion(text: string, recentHistory: string[] = []): EmotionState {
  const combined = [...recentHistory.slice(-3), text].join(' ')
  for (const [emotion, pattern] of EMOTION_PATTERNS) {
    if (pattern.test(combined)) return emotion
  }
  return 'neutral'
}

export function emotionToToneInstruction(emotion: EmotionState): string {
  return EMOTION_TONE[emotion]
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — PREDICTIVE TRIP PROPOSER
// ═══════════════════════════════════════════════════════════════════════════════

export interface SurpriseTripProposal {
  destination:    string
  title:          string
  tagline:        string
  costEstimate:   string
  personalReason: string
  highlights:     string[]
  bookingLink:    string
}

export function shouldPropose(
  messageCount: number,
  dna: { destinations?: string[]; budget?: string; style?: string[]; interests?: string[] },
): boolean {
  if (messageCount < 3 || messageCount > 8) return false
  const hasDest   = (dna.destinations?.length ?? 0) > 0
  const hasBudget = !!dna.budget
  const hasStyle  = (dna.style?.length ?? 0) > 0
  return (hasDest || hasBudget) && hasStyle
}

export async function generateSurpriseTrip(
  dna: { destinations?: string[]; budget?: string; party?: string; style?: string[]; interests?: string[] },
  recentHistory: string[],
): Promise<SurpriseTripProposal | null> {
  const context = [
    `Destinations mentioned: ${dna.destinations?.join(', ') || 'none'}`,
    `Budget tier: ${dna.budget || 'unknown'}`,
    `Party type: ${dna.party || 'unknown'}`,
    `Travel style: ${dna.style?.join(', ') || 'unknown'}`,
    `Interests: ${dna.interests?.join(', ') || 'unknown'}`,
    `Recent conversation: ${recentHistory.slice(-4).join(' | ')}`,
  ].join('\n')

  const prompt = `You are a world-class travel consultant. Based on this client DNA, propose ONE specific trip they have NOT asked about that would genuinely delight them. Be specific, personal, unexpected.

${context}

Return valid JSON ONLY:
{
  "destination": "specific city or region",
  "title": "catchy trip title (4-7 words)",
  "tagline": "one evocative sentence about this trip",
  "costEstimate": "e.g. from £899 per person",
  "personalReason": "one sentence explaining WHY this fits THIS specific client — reference something they actually said",
  "highlights": ["3 specific highlights matched to their interests"],
  "bookingLink": "/packages or /tours or /flights"
}`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    return JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as SurpriseTripProposal
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — PRICE GUARDIAN
// ═══════════════════════════════════════════════════════════════════════════════

export interface PriceWatchInput {
  conversationId: string
  contactPhone:   string | null
  origin:         string
  destination:    string
  departureDate:  string
  cabin?:         string
  quotedPrice:    number
  quotedCurrency?: string
}

export async function createPriceWatch(opts: PriceWatchInput): Promise<string> {
  const supabase = getSupabaseAdmin()
  const id = `pw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const { error } = await supabase.from('price_watches').insert({
    id,
    conversation_id: opts.conversationId,
    contact_phone:   opts.contactPhone,
    origin:          opts.origin.toUpperCase(),
    destination:     opts.destination.toUpperCase(),
    departure_date:  opts.departureDate,
    cabin:           opts.cabin?.toUpperCase() ?? 'ECONOMY',
    quoted_price:    opts.quotedPrice,
    quoted_currency: opts.quotedCurrency ?? 'GBP',
    is_active:       true,
    last_checked:    new Date().toISOString(),
  })
  if (error) throw new Error(`createPriceWatch: ${error.message}`)
  return id
}

export async function checkAllPriceWatches(
  sendAlert: (conversationId: string, message: string) => Promise<void>,
): Promise<{ checked: number; alerted: number }> {
  const supabase = getSupabaseAdmin()
  const { data: watches, error } = await supabase
    .from('price_watches').select('*').eq('is_active', true)
  if (error || !watches?.length) return { checked: 0, alerted: 0 }

  let alerted = 0
  for (const watch of watches) {
    try {
      const res = await fetch(`${SITE}/api/search/flights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: watch.origin, destination: watch.destination,
          departureDate: watch.departure_date, adults: 1,
          cabinClass: watch.cabin,
        }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const offers: any[] = Array.isArray(data) ? data : data.offers || data.data || []
      if (!offers.length) continue

      const lowest = Math.min(...offers.map((o: any) =>
        Number(o.price?.amount ?? o.displayPrice?.amount ?? o.total_amount ?? Infinity)
      ))
      const quoted = Number(watch.quoted_price)
      const drop   = quoted - lowest
      const rise   = lowest - quoted

      let msg: string | null = null
      if (drop > 10) {
        msg = `🎉 Price drop! Your watched ${watch.origin}→${watch.destination} flight on ${watch.departure_date} dropped from ${watch.quoted_currency} ${quoted} → ${watch.quoted_currency} ${lowest.toFixed(0)}. Book now: ${SITE}/flights/search?origin=${watch.origin}&destination=${watch.destination}&date=${watch.departure_date}`
      } else if (quoted > 0 && rise / quoted > 0.15) {
        msg = `⚠️ Fare alert! Your watched ${watch.origin}→${watch.destination} price has risen ${rise.toFixed(0)} ${watch.quoted_currency} to ${lowest.toFixed(0)}. Lock it in now: ${SITE}/flights/search?origin=${watch.origin}&destination=${watch.destination}&date=${watch.departure_date}`
      }

      if (msg) {
        await sendAlert(String(watch.conversation_id), msg)
        await supabase.from('price_watches').update({ is_active: false }).eq('id', watch.id)
        alerted++
      } else {
        await supabase.from('price_watches').update({ last_checked: new Date().toISOString() }).eq('id', watch.id)
      }
    } catch (e) {
      console.error(`[price-guardian] watch ${watch.id} error:`, e)
    }
  }
  return { checked: watches.length, alerted }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4 — GROUP HIVE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

export interface GroupMember {
  name:           string
  contactPhone?:  string
  preferences?:   string
}

export interface GroupHiveInput {
  name:                  string
  creatorId:             string
  members:               GroupMember[]
  destination?:          string
  dates?:                string
}

export interface GroupProposal {
  title:       string
  destination: string
  dates:       string
  highlights:  string[]
  priceEst:    string
  whyItWorks:  string
}

export async function createGroupHive(opts: GroupHiveInput): Promise<{ id: string; shareLink: string }> {
  const supabase = getSupabaseAdmin()
  const id = `hive_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const { error } = await supabase.from('group_hives').insert({
    id, name: opts.name, creator_id: opts.creatorId,
    destination: opts.destination ?? null, dates: opts.dates ?? null,
    members: opts.members, status: 'collecting',
  })
  if (error) throw new Error(`createGroupHive: ${error.message}`)
  return { id, shareLink: `${SITE}/group-hive/${id}` }
}

export async function synthesizeGroupConsensus(hiveId: string): Promise<GroupProposal[] | null> {
  const supabase = getSupabaseAdmin()
  const { data: hive } = await supabase.from('group_hives').select('*').eq('id', hiveId).single()
  if (!hive) return null

  const membersStr = (hive.members as GroupMember[])
    .map(m => `- ${m.name}: ${m.preferences || 'no preferences yet'}`).join('\n')

  const prompt = `You are an expert group travel planner. Find 3 creative trips that genuinely satisfy all group members.

Group: ${hive.name}
Members & preferences:
${membersStr}
Destination hint: ${hive.destination || 'flexible'}
Dates hint: ${hive.dates || 'flexible'}

Return a JSON array ONLY with exactly 3 proposals:
[{"title":"catchy trip name","destination":"specific place","dates":"suggested dates","highlights":["3 highlights for this group"],"priceEst":"from £X per person","whyItWorks":"how it satisfies everyone"}]`

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
    const proposals = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as GroupProposal[]
    await supabase.from('group_hives').update({ proposals, status: 'voting' }).eq('id', hiveId)
    return proposals
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5 — JADE VISION (document reading)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentData {
  documentType:    'passport' | 'visa' | 'boarding_pass' | 'hotel_confirmation' | 'unknown'
  fullName?:       string
  dateOfBirth?:    string
  passportNumber?: string
  expiryDate?:     string
  nationality?:    string
  visaType?:       string
  visaCountry?:    string
  flightNumber?:   string
  departureDate?:  string
  departureTime?:  string
  arrivalDate?:    string
  origin?:         string
  destination?:    string
  hotelName?:      string
  checkIn?:        string
  checkOut?:       string
  bookingRef?:     string
  rawExtracted:    Record<string, string>
}

export async function extractDocumentData(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
): Promise<DocumentData> {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 600,
    messages: [{
      role: 'user',
      content: [{
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: imageBase64 },
      }, {
        type: 'text',
        text: `Extract ALL visible information from this travel document. Return valid JSON ONLY, no other text:
{
  "documentType": "passport|visa|boarding_pass|hotel_confirmation|unknown",
  "fullName": "...", "dateOfBirth": "YYYY-MM-DD", "passportNumber": "...",
  "expiryDate": "YYYY-MM-DD", "nationality": "...", "visaType": "...", "visaCountry": "...",
  "flightNumber": "...", "departureDate": "YYYY-MM-DD", "departureTime": "HH:MM",
  "arrivalDate": "YYYY-MM-DD", "origin": "city or IATA", "destination": "city or IATA",
  "hotelName": "...", "checkIn": "YYYY-MM-DD", "checkOut": "YYYY-MM-DD", "bookingRef": "...",
  "rawExtracted": {"any other visible field": "value"}
}
Omit null/unknown fields entirely. Only include what you can actually see in the image.`,
      }],
    }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : '{}'
  const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(clean) as DocumentData
  } catch {
    return { documentType: 'unknown', rawExtracted: {} }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 6 — CROSS-CHANNEL MEMORY INHERITANCE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ClientIdentifiers {
  phone?:       string
  email?:       string
  instagramId?: string
  facebookId?:  string
  chatwootId?:  string
}

export interface UnifiedClient {
  clientId:              string
  identifiers:           ClientIdentifiers
  channels:              string[]
  lifetimeDna:           Record<string, unknown>
  conversationSummaries: string[]
  lastInteraction:       string
}

export async function findUnifiedClient(ids: ClientIdentifiers): Promise<UnifiedClient | null> {
  const supabase = getSupabaseAdmin()
  const pairs = Object.entries(ids).filter(([, v]) => v)
  for (const [key, value] of pairs) {
    const { data } = await supabase
      .from('unified_clients')
      .select('*')
      .eq(`identifiers->>${key}`, value)
      .maybeSingle()
    if (data) return {
      clientId:              data.client_id,
      identifiers:           data.identifiers as ClientIdentifiers,
      channels:              data.channels as string[],
      lifetimeDna:           data.life_time_dna as Record<string, unknown>,
      conversationSummaries: data.conversation_summaries as string[],
      lastInteraction:       data.last_interaction,
    }
  }
  return null
}

export async function mergeClientIdentity(
  clientId: string, newIds: ClientIdentifiers, newChannel?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('unified_clients').select('identifiers,channels').eq('client_id', clientId).single()
  if (!data) return
  const merged   = { ...(data.identifiers as ClientIdentifiers), ...newIds }
  const channels = Array.from(new Set([...(data.channels as string[]), ...(newChannel ? [newChannel] : [])]))
  await supabase.from('unified_clients').update({ identifiers: merged, channels, last_interaction: new Date().toISOString() }).eq('client_id', clientId)
}

export async function createUnifiedClient(ids: ClientIdentifiers, channel: string, dna?: Record<string, unknown>): Promise<string> {
  const supabase = getSupabaseAdmin()
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  await supabase.from('unified_clients').insert({
    client_id: clientId, identifiers: ids, channels: [channel],
    life_time_dna: dna ?? {}, conversation_summaries: [],
  })
  return clientId
}

export function buildMemoryInheritanceContext(client: UnifiedClient): string {
  const lines = [
    '# RETURNING CLIENT — CROSS-CHANNEL MEMORY',
    `This client has spoken with Jade before on: ${client.channels.join(', ')}.`,
    `Last contact: ${new Date(client.lastInteraction).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
  ]
  const d = client.lifetimeDna
  if (d.destinations)  lines.push(`Past destinations: ${JSON.stringify(d.destinations)}`)
  if (d.budget)        lines.push(`Budget tier: ${d.budget}`)
  if (d.party)         lines.push(`Travel party: ${d.party}`)
  if (d.visaInterests) lines.push(`Visa interests: ${JSON.stringify(d.visaInterests)}`)
  if (client.conversationSummaries.length) {
    lines.push(`Previous conversations:\n${client.conversationSummaries.slice(-3).map(s => `- ${s}`).join('\n')}`)
  }
  lines.push('Do NOT give the standard greeting — you already know this person. Reference what you discussed before naturally.')
  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 7 — PROACTIVE JOURNEY COMPANION
// ═══════════════════════════════════════════════════════════════════════════════

export interface BookingInfo {
  bookingRef:          string
  passengerName:       string
  origin:              string
  destination:         string
  departureDate:       string
  departureTime?:      string
  returnDate?:         string
  hotelName?:          string
  hotelCheckIn?:       string
  visaRequired?:       boolean
}

export async function scheduleJourneyAlerts(
  booking: BookingInfo, conversationId: string, contactPhone: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const depTime = booking.departureTime || '09:00'
  const dep = new Date(`${booking.departureDate}T${depTime}:00Z`)
  const now = new Date()
  const alerts: any[] = []

  const push = (type: string, ms: number, msg: string) => {
    const t = new Date(dep.getTime() - ms)
    if (t > now) alerts.push({
      id: `ja_${type}_${booking.bookingRef}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
      booking_id: booking.bookingRef, conversation_id: conversationId,
      contact_phone: contactPhone, alert_type: type,
      scheduled_for: t.toISOString(), message: msg,
    })
  }

  push('document_checklist', 48 * 3_600_000,
    `✈️ Your flight to ${booking.destination} is in 48 hours! Quick checklist:\n\n✅ Passport (valid 6+ months)\n${booking.visaRequired ? '✅ Visa in passport\n' : ''}✅ Travel insurance\n✅ Booking confirmation\n✅ Hotel address saved offline\n\nAll set? Have an amazing trip! 🌍`)

  push('online_checkin', 24 * 3_600_000,
    `🎫 Online check-in is now open for your ${booking.origin}→${booking.destination} flight! Pick your seat now and skip the airport queues. Booking ref: ${booking.bookingRef}`)

  push('airport_reminder', 3 * 3_600_000,
    `🛫 Time to head to the airport! Your ${booking.origin}→${booking.destination} flight departs at ${booking.departureTime || 'your scheduled time'}. Allow 2–3 hours. Safe travels! ✨`)

  if (booking.hotelName && booking.hotelCheckIn) {
    const hotelBefore = new Date(`${booking.hotelCheckIn}T09:00:00Z`)
    hotelBefore.setDate(hotelBefore.getDate() - 1)
    if (hotelBefore > now) alerts.push({
      id: `ja_hotel_${booking.bookingRef}_${Date.now()}`,
      booking_id: booking.bookingRef, conversation_id: conversationId,
      contact_phone: contactPhone, alert_type: 'hotel_reminder',
      scheduled_for: hotelBefore.toISOString(),
      message: `🏨 Your ${booking.hotelName} check-in is tomorrow! Standard check-in is 3pm — arriving earlier? They can store your luggage. Have your confirmation ready. Enjoy! 🌟`,
    })
  }

  if (booking.returnDate) {
    const returnNext = new Date(`${booking.returnDate}T10:00:00Z`)
    returnNext.setDate(returnNext.getDate() + 1)
    if (returnNext > now) alerts.push({
      id: `ja_welcome_${booking.bookingRef}_${Date.now()}`,
      booking_id: booking.bookingRef, conversation_id: conversationId,
      contact_phone: contactPhone, alert_type: 'welcome_home',
      scheduled_for: returnNext.toISOString(),
      message: `🏡 Welcome home from ${booking.destination}! Hope it was everything you dreamed of. Whenever you're ready for your next adventure, I'm here — Jade ✈️`,
    })
  }

  if (alerts.length) await supabase.from('journey_alerts').insert(alerts)
}

export async function dispatchDueAlerts(
  sendMessage: (conversationId: string, message: string) => Promise<void>,
): Promise<number> {
  const supabase = getSupabaseAdmin()
  const { data: due } = await supabase
    .from('journey_alerts').select('*')
    .eq('sent', false).lte('scheduled_for', new Date().toISOString())
  if (!due?.length) return 0

  let sent = 0
  for (const alert of due) {
    try {
      await sendMessage(String(alert.conversation_id), alert.message)
      await supabase.from('journey_alerts').update({ sent: true, sent_at: new Date().toISOString() }).eq('id', alert.id)
      sent++
    } catch (e) {
      console.error(`[journey-companion] alert ${alert.id} failed:`, e)
    }
  }
  return sent
}
