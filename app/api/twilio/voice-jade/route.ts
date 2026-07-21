import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'
import { routeConversation } from '@/lib/conversation-router'

export const dynamic = 'force-dynamic'

const VOICE_NUMBER = process.env.TWILIO_VOICE_NUMBER ?? ''
const BASE_URL     = 'https://www.walztravels.com'

type History     = Array<{ role: 'user' | 'assistant'; content: string }>
type JadeDecision = {
  response:    string
  action:      'continue' | 'transfer' | 'end'
  language:    string
  specialism?: string
}

// Neural voices — human-quality, low-latency
const VOICE: Record<string, string> = {
  en: 'Polly.Amy-Neural',     // British English
  fr: 'Polly.Lea-Neural',
  es: 'Polly.Lucia-Neural',
  de: 'Polly.Vicki-Neural',
  it: 'Polly.Bianca-Neural',
  pt: 'Polly.Ines-Neural',
  nl: 'Polly.Lotte-Neural',
  ar: 'Polly.Hala-Neural',
  ja: 'Polly.Kazuha-Neural',
  ko: 'Polly.Seoyeon-Neural',
}

// Twilio STT language codes
const STT: Record<string, string> = {
  en: 'en-GB',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  ar: 'ar-AE',
  ja: 'ja-JP',
  ko: 'ko-KR',
}

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function say(text: string, lang = 'en') {
  const voice = VOICE[lang] ?? VOICE.en
  return `<Say voice="${voice}">${esc(text)}</Say>`
}

function gather(text: string, lang = 'en') {
  const stt = STT[lang] ?? 'en-GB'
  return twiml(
    say(text, lang) +
    `<Gather input="speech" action="${BASE_URL}/api/twilio/voice-jade" method="POST" ` +
    `speechTimeout="auto" language="${stt}" ` +
    `hints="flight,visa,hotel,booking,passport,Schengen,Canada,USA,Australia,UAE,airline,insurance,tour,package,refund,cancel,transfer,eSIM"/>` +
    `<Redirect method="POST">${BASE_URL}/api/twilio/voice-jade?noInput=true</Redirect>`,
  )
}

// ─── Jade's persona and intelligence ──────────────────────────────────────────
const SYSTEM = `You are Jade — a senior travel consultant at Walz Travels, London. You have been taking calls for over a decade. You are on a live phone call right now.

VOICE AND PERSONALITY
Natural British English. Warm, calm, completely confident. You sound like a real person — not a call centre script, not a bot. Use contractions naturally (you'll, we've, it's, that's, I'll). Vary your sentence openers — never start two replies in a row the same way. Mirror the caller's energy: if they're anxious, be reassuring; if they're in a hurry, be crisp and efficient.

Natural openers you can use (vary them): "Right,", "So,", "Brilliant,", "Absolutely,", "Of course,", "Got you,", "Perfect,", "No problem at all,", "Leave it with me —"

Never say: "Great question!", "Certainly!", "I'd be happy to help!", "As a virtual assistant", "As an AI". These are robotic. Never use them.

DEEP EXPERTISE — you know all of this cold
Visas: UK Standard Visitor, Schengen (all 27 countries), US B1/B2 and ESTA, Canada eTA and visitor visa, Australia ETA and tourist visa, UAE, student visas, work permits, skilled worker routes, refused application strategies, document checklists, processing times, VFS and TLScontact centres.
Flights: alliances (Star, oneworld, SkyTeam), cabin classes, baggage rules, transit visa requirements, minimum connection times, PNR management, seat selection, check-in windows, airline lounges.
Hotels, package holidays, group travel, tours, transfers, travel insurance cover levels, eSIM data plans.
UK travel regulations, FCDO advisories, destination entry requirements.

LANGUAGE INTELLIGENCE
The moment a caller speaks French, Arabic, Spanish, German, Italian, Portuguese, Dutch, Japanese, Korean — or any other language — switch to that language immediately and continue the entire call in it. Do not slip back into English. Your responses should be fluent and natural in that language, not translated-sounding.

WHAT YOU HANDLE AND RESOLVE YOURSELF
Visa eligibility, document requirements, processing times, success factors.
Flight route options, airline comparisons, baggage allowances, transit rules.
Destination entry requirements, travel advisories, what documents to carry.
Ballpark pricing ("Schengen applications typically run £90 to £120 for the fee alone").
Quick factual questions you know the answer to.
Reassuring callers who are anxious about their trip.

WHEN TO BRING IN THE TEAM — do this warmly and immediately
Caller wants to make, amend or cancel a booking.
Exact price quote needed for a specific itinerary.
Payment issue, refund request, or complaint.
Caller explicitly asks to speak to someone.
You genuinely don't know the specific answer — say "Let me get someone from the team who can pull that up" and transfer.

PHONE CALL DISCIPLINE
Two to three short sentences maximum per turn. Never longer.
One question at a time — never stack two questions.
Never read lists aloud. Convert lists into a single question ("Is it the visa documents you need, or the flight side of things?").
If the caller is unclear, ask one targeted clarifying question.
If they go silent, say something simple: "Take your time — I'm here."
If asked whether you're human, say "I'm Jade from the Walz Travels team" and move straight on.

OUTPUT FORMAT — respond with valid JSON only. No other text, no markdown, no explanation:
{"response":"what you say on the call","action":"continue","language":"en"}

For transfer: {"response":"what you say before transferring","action":"transfer","language":"en","specialism":"visa"}
For end: {"response":"goodbye","action":"end","language":"en"}

action: "continue" | "transfer" | "end"
language: ISO 639-1 code of the language the caller used (en, fr, es, ar, de, pt, it, nl, ja, ko — or any other)
specialism (only when action is transfer): "flight" | "visa" | "hotel" | "tour" | "support"`

// ─── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const form    = await req.formData()
  const speech  = form.get('SpeechResult')?.toString() ?? ''
  const callSid = form.get('CallSid')?.toString()      ?? ''
  const from    = form.get('From')?.toString()         ?? ''
  const noInput = req.nextUrl.searchParams.get('noInput')

  const supabase = getSupabaseAdmin()

  if (noInput || !speech.trim()) {
    return gather("Take your time — I'm here. What can I help you with?")
  }

  // Fetch history + detected language in one query
  const { data: logRow } = await supabase
    .from('CallLog')
    .select('jadeHistory, detectedLanguage')
    .eq('callSid', callSid)
    .maybeSingle()

  const history: History =
    (logRow as { jadeHistory?: History } | null)?.jadeHistory ?? []
  const prevLang =
    (logRow as { detectedLanguage?: string } | null)?.detectedLanguage ?? 'en'

  history.push({ role: 'user', content: speech })

  // Jade thinks — Claude Haiku for minimum latency
  const anthropic = new Anthropic()
  let decision: JadeDecision = {
    response:   "Let me get someone from the team for you right now.",
    action:     'transfer',
    language:   prevLang,
    specialism: 'support',
  }

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 180,
      system:     SYSTEM,
      messages:   history,
    })
    const raw   = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const match = raw.match(/\{[\s\S]*?\}/)
    if (match) decision = { ...decision, ...JSON.parse(match[0]) }
    history.push({ role: 'assistant', content: raw })
  } catch {
    history.push({ role: 'assistant', content: JSON.stringify(decision) })
  }

  const lang = decision.language ?? prevLang

  // Persist conversation state — don't block the response
  supabase
    .from('CallLog')
    .update({ jadeHistory: history, detectedLanguage: lang })
    .eq('callSid', callSid)
    .then(() => {/* fire and forget */})

  const { response, action, specialism } = decision

  // ── End call ────────────────────────────────────────────────────────────────
  if (action === 'end') {
    return twiml(say(response, lang) + '<Hangup/>')
  }

  // ── Transfer to live agent ───────────────────────────────────────────────────
  if (action === 'transfer') {
    const routeMsg  = `Voice call from ${from}. Caller: "${speech}". Needs: ${specialism ?? 'support'}`
    const matched   = await routeConversation(`twilio_jade_${callSid}`, routeMsg, 'voice')

    if (!matched) {
      const unavailable = lang === 'fr'
        ? `${response} Notre équipe est actuellement occupée. Nous vous enverrons un message WhatsApp dans quelques instants.`
        : lang === 'es'
        ? `${response} Nuestro equipo está ocupado ahora mismo. Le enviaremos un mensaje de WhatsApp en breve.`
        : lang === 'ar'
        ? `${response} فريقنا مشغول الآن. سنرسل لك رسالة واتساب في أقرب وقت.`
        : `${response} Our team's all on calls right now — we'll drop you a WhatsApp and follow up straight away.`
      return twiml(say(unavailable, lang) + '<Hangup/>')
    }

    const { data: agentRow } = await supabase
      .from('RoutingAgent')
      .select('sipAddress')
      .eq('email', matched.agentEmail ?? '')
      .maybeSingle()

    const agentSip    = (agentRow as { sipAddress?: string } | null)?.sipAddress
    const clientId    = matched.agentEmail ?? matched.agentName
    const dialTargets = agentSip
      ? `<Client>${clientId}</Client><Sip>${agentSip}</Sip>`
      : `<Client>${clientId}</Client>`

    return twiml(
      say(response, lang) +
      `<Dial callerId="${VOICE_NUMBER}" timeout="30">${dialTargets}</Dial>`,
    )
  }

  // ── Continue ─────────────────────────────────────────────────────────────────
  return gather(response, lang)
}
