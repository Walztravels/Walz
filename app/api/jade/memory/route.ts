import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CHATWOOT_BASE  = 'https://chat.walztravels.com'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN ?? '1rnd6Rp9GNVKtbJ8238Vg2S1'
const ACCOUNT_ID     = '1'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientProfile {
  name:          string
  email:         string
  phone:         string
  nationality:   string
  location:      string
  travelStyle:   string[]  // luxury | budget | adventure | beach | romantic | family | business
  budgetTier:    string    // luxury | mid-range | budget | ''
  partyType:     string    // solo | couple | family | group | ''
  destinations:  string[]
  visaInterests: string[]
  openQuestions: string[]  // Jade's last unanswered questions
  bookingIntent: 'browsing' | 'planning' | 'ready-to-book' | 'follow-up' | ''
  currency:      'NGN' | 'GHS' | 'AED' | 'CAD' | 'GBP'
  isReturning:   boolean
  pastTopics:    string[]
  msgCount:      number
}

export interface ConvMessage {
  role:    'user' | 'assistant'
  content: string
}

export interface MemoryResult {
  profile:   ClientProfile
  messages:  ConvMessage[]
  contactId: number | null
}

// ─── Chatwoot helpers ─────────────────────────────────────────────────────────

async function cwGet(path: string) {
  const ac = new AbortController()
  const t  = setTimeout(() => ac.abort(), 8000)
  try {
    const res = await fetch(`${CHATWOOT_BASE}/api/v1${path}`, {
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', 'api_access_token': CHATWOOT_TOKEN },
    })
    clearTimeout(t)
    if (!res.ok) return null
    return res.json()
  } catch { clearTimeout(t); return null }
}

// ─── Fetch current conversation messages ─────────────────────────────────────

async function fetchConversationMessages(conversationId: number): Promise<{
  messages:   ConvMessage[]
  contactId:  number | null
}> {
  const [msgData, convData] = await Promise.all([
    cwGet(`/accounts/${ACCOUNT_ID}/conversations/${conversationId}/messages`),
    cwGet(`/accounts/${ACCOUNT_ID}/conversations/${conversationId}`),
  ])

  const contactId: number | null = convData?.meta?.sender?.id ?? null

  if (!msgData?.payload) return { messages: [], contactId }

  const rawMessages: Array<{
    content?:      string
    message_type?: number
    private?:      boolean
    sender?:       { type?: string }
  }> = Array.isArray(msgData.payload) ? msgData.payload : (msgData.payload.messages ?? [])

  // message_type: 0=incoming(user), 1=outgoing(jade/agent), 2=activity
  const messages: ConvMessage[] = rawMessages
    .filter(m => !m.private && m.message_type !== 2 && m.content?.trim())
    .map(m => ({
      role:    m.message_type === 0 ? 'user' : 'assistant',
      content: (m.content ?? '').trim(),
    }))

  return { messages, contactId }
}

// ─── Fetch past conversation summaries ───────────────────────────────────────

async function fetchPastSummaries(contactId: number, excludeConvId: number): Promise<string[]> {
  const data = await cwGet(`/accounts/${ACCOUNT_ID}/contacts/${contactId}/conversations`)
  if (!data?.payload?.conversations) return []

  const convs = data.payload.conversations as Array<{
    id:       number
    messages?: Array<{ content?: string; message_type?: number; private?: boolean }>
  }>

  const summaries: string[] = []
  for (const conv of convs) {
    if (conv.id === excludeConvId) continue
    const msgs = (conv.messages ?? [])
      .filter(m => !m.private && m.message_type !== 2 && m.content?.trim())
    if (msgs.length > 0) {
      const preview = msgs
        .slice(-5)
        .map(m => (m.content ?? '').trim())
        .join(' | ')
        .slice(0, 300)
      summaries.push(preview)
    }
  }
  return summaries.slice(0, 5)
}

// ─── Profile extraction ────────────────────────────────────────────────────────

const KNOWN_DESTINATIONS = [
  'dubai','london','paris','new york','tokyo','bali','maldives','istanbul',
  'barcelona','rome','amsterdam','singapore','bangkok','cairo','morocco','cancun','zanzibar',
  'lagos','accra','nairobi','johannesburg','abu dhabi','miami','toronto','canada',
  'uk','usa','europe','schengen','nigeria','ghana','kenya','south africa','turkey','greece',
  'spain','italy','france','germany','netherlands','portugal','uae','saudi','qatar','india',
  'sri lanka','malaysia','australia','new zealand','jamaica','barbados','cuba','mexico',
  'seychelles','mauritius','cape town','marrakech','lisbon','vienna','prague','budapest',
  'doha','bahrain','oman','jordan','rwanda','tanzania','uganda','ethiopia','senegal',
]

const VISA_DESTINATIONS = [
  'uk','canada','usa','schengen','uae','dubai','australia','nigeria','ghana',
  'france','germany','italy','spain','netherlands','portugal','turkey','malaysia',
  'philippines','indonesia','thailand','india','china','russia','brazil','mexico',
]

function extractProfile(
  messages:     ConvMessage[],
  pastSummaries: string[],
  dbLead?:      { name?: string | null; email?: string | null; phone?: string | null }
): ClientProfile {
  const allText  = messages.map(m => m.content).join(' ').toLowerCase()
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ').toLowerCase()
  const jadeMsgs = messages.filter(m => m.role === 'assistant').map(m => m.content)

  // ── Name ──
  let name = ''
  if (dbLead?.name && dbLead.name !== 'Unknown' && dbLead.name !== 'Website Visitor') {
    name = dbLead.name
  }
  if (!name) {
    const m = userText.match(/(?:i'm|i am|my name is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)
    if (m) name = m[1]
  }

  // ── Email ──
  let email = dbLead?.email ?? ''
  if (!email) {
    const m = userText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (m) email = m[0]
  }

  // ── Phone ──
  let phone = dbLead?.phone ?? ''
  if (!phone) {
    const m = userText.match(/(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4,}/)
    if (m) phone = m[0]
  }

  // ── Nationality / location ──
  let nationality = ''
  let location    = ''
  const locMatch = userText.match(/(?:i'm from|i am from|based in|living in|i live in|i'm in|from)\s+([a-z\s]+?)(?:\.|,|\n|$)/i)
  if (locMatch) location = locMatch[1].trim()
  if (/nigeri/.test(allText))             nationality = 'Nigerian'
  else if (/ghanaian|ghana/.test(allText)) nationality = 'Ghanaian'
  else if (/canadian|canada/.test(allText)) nationality = 'Canadian'
  else if (/british|uk passport/.test(allText)) nationality = 'British'
  else if (/emirati|uae resident/.test(allText)) nationality = 'UAE Resident'

  // ── Travel style ──
  const travelStyle: string[] = []
  if (/luxury|5[\s-]?star|premium|first class|suite|vip|high.?end/.test(allText)) travelStyle.push('luxury')
  if (/budget|cheap|affordable|low.?cost/.test(allText))                           travelStyle.push('budget')
  if (/adventure|hiking|trek|safari|extreme|outdoor/.test(allText))                travelStyle.push('adventure')
  if (/beach|island|sea|ocean|coast|resort|snorkel/.test(allText))                 travelStyle.push('beach')
  if (/honeymoon|romantic|anniversary|proposal/.test(allText))                     travelStyle.push('romantic')
  if (/\b(kids|children|family|son|daughter|toddler|baby)\b/.test(allText))        travelStyle.push('family')
  if (/corporate|business travel|work trip|conference/.test(allText))              travelStyle.push('business')

  // ── Budget tier ──
  let budgetTier = ''
  if (/ultra|10[k\s]000|fifteen|twenty[\s-]?thousand/.test(allText))  budgetTier = 'luxury'
  else if (/luxury|5[\s-]?star|business class|first class/.test(allText)) budgetTier = 'luxury'
  else if (/budget|cheap|affordable/.test(allText))                    budgetTier = 'budget'
  else if (/mid.?range|moderate|reasonable/.test(allText))             budgetTier = 'mid-range'

  // ── Party type ──
  let partyType = ''
  if (/\b(just me|solo|alone|by myself|travelling alone)\b/.test(allText))         partyType = 'solo'
  else if (/\b(partner|wife|husband|boyfriend|girlfriend|couple|two of us|honeymoon)\b/.test(allText)) partyType = 'couple'
  else if (/\b(kids|children|family|son|daughter|toddler|baby)\b/.test(allText))   partyType = 'family'
  else if (/\b(group|friends|colleagues|team|corporate|10\+|large party)\b/.test(allText)) partyType = 'group'

  // ── Destinations ──
  const destinations = [...new Set(KNOWN_DESTINATIONS.filter(d => userText.includes(d)))]

  // ── Visa interests ──
  const visaInterests = [...new Set(VISA_DESTINATIONS.filter(c =>
    userText.includes(`${c} visa`) ||
    userText.includes(`visa for ${c}`) ||
    userText.includes(`visa to ${c}`)
  ))]

  // ── Open questions (last Jade message's unanswered questions) ──
  const openQuestions: string[] = []
  if (jadeMsgs.length > 0) {
    const lastJadeMsg = jadeMsgs[jadeMsgs.length - 1]
    const qs = lastJadeMsg.match(/[^.!?]*\?/g)
    if (qs) {
      qs.forEach(q => {
        const trimmed = q.trim()
        if (trimmed.length > 10) openQuestions.push(trimmed)
      })
    }
  }

  // ── Booking intent ──
  let bookingIntent: ClientProfile['bookingIntent'] = 'browsing'
  if (/book now|ready to book|how do i pay|take my details|let's book|confirm booking|i want to book|ready to proceed/.test(userText)) {
    bookingIntent = 'ready-to-book'
  } else if (/following up|you mentioned|we spoke|still available|as we discussed/.test(userText)) {
    bookingIntent = 'follow-up'
  } else if (/\b(when|date|depart|arrive|check.?in|check.?out|travel|going)\b/.test(userText) && destinations.length > 0) {
    bookingIntent = 'planning'
  }

  // ── Currency ──
  let currency: ClientProfile['currency'] = 'GBP'
  if (/₦|ngn|\bnigeria\b|\bnigerian\b|\blagos\b|\babuja\b|\bport harcourt\b|\benugu\b/.test(allText)) currency = 'NGN'
  else if (/gh[₵¢]|ghs|\bghana\b|\bghanaian\b|\baccra\b|\bkumasi\b/.test(allText)) currency = 'GHS'
  else if (/\baed\b|\bdirham\b|\bdubai resident\b|\bsharjah\b/.test(allText))        currency = 'AED'
  else if (/\bcad\b|\bcanadian dollar\b|\btoronto\b|\bvancouver\b|\bcalgary\b/.test(allText)) currency = 'CAD'

  // ── Past topics ──
  const pastText   = pastSummaries.join(' ').toLowerCase()
  const pastTopics = [...new Set(KNOWN_DESTINATIONS.filter(d => pastText.includes(d)))]

  return {
    name, email, phone, nationality, location,
    travelStyle, budgetTier, partyType,
    destinations, visaInterests, openQuestions,
    bookingIntent, currency,
    isReturning: pastSummaries.length > 0,
    pastTopics,
    msgCount: messages.length,
  }
}

// ─── Public: fetch client memory (called by jade/chatwoot/route.ts) ───────────

export async function fetchClientMemory(conversationId: number | null): Promise<MemoryResult> {
  const emptyProfile: ClientProfile = {
    name: '', email: '', phone: '', nationality: '', location: '',
    travelStyle: [], budgetTier: '', partyType: '',
    destinations: [], visaInterests: [], openQuestions: [],
    bookingIntent: '', currency: 'GBP',
    isReturning: false, pastTopics: [], msgCount: 0,
  }

  if (!conversationId) return { profile: emptyProfile, messages: [], contactId: null }

  try {
    const { messages: rawMessages, contactId } = await fetchConversationMessages(conversationId)
    // Sliding window: last 30 messages for performance
    const messages = rawMessages.slice(-30)

    // Fetch past conversations for returning client detection
    const pastSummaries = contactId
      ? await fetchPastSummaries(contactId, conversationId)
      : []

    // Cross-reference with Supabase lead record
    let dbLead: { name?: string | null; email?: string | null; phone?: string | null } | undefined
    try {
      const { data } = await getSupabaseAdmin()
        .from('leads')
        .select('name, email, phone')
        .eq('chatwoot_conversation_id', conversationId)
        .maybeSingle()
      if (data) dbLead = data
    } catch {}

    const profile = extractProfile(messages, pastSummaries, dbLead)
    return { profile, messages, contactId }
  } catch (e) {
    console.error('[Jade/Memory] Failed:', e)
    return { profile: emptyProfile, messages: [], contactId: null }
  }
}

// ─── API route (direct calls, e.g. for admin tools) ──────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const convId = searchParams.get('conversationId')
  if (!convId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const result = await fetchClientMemory(Number(convId))
  return NextResponse.json(result)
}
