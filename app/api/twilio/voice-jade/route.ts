import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Twilio = require('twilio') as (sid: string, token: string) => import('twilio').Twilio

export const dynamic = 'force-dynamic'

const VOICE_NUMBER  = process.env.TWILIO_VOICE_NUMBER ?? ''
const BASE_URL      = 'https://www.walztravels.com'
const ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID ?? ''
const AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN  ?? ''

type History      = Array<{ role: 'user' | 'assistant'; content: string }>
type JadeDecision = {
  response:    string
  action:      'continue' | 'transfer' | 'end'
  language:    string
  specialism?: string
}

const VOICE: Record<string, string> = {
  en: 'Polly.Amy-Neural',
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

// ── After-transfer callback ───────────────────────────────────────────────────
// Twilio POSTs here when <Dial> completes (agent hung up, no-answer, busy, failed).
// Without this explicit action, Twilio falls back to the phone number Voice URL
// using GET → 405 → call dropped.
async function handleAfterDial(req: NextRequest): Promise<NextResponse> {
  const form       = await req.formData()
  const callSid    = form.get('CallSid')?.toString()        ?? ''
  const dialStatus = form.get('DialCallStatus')?.toString() ?? ''

  const supabase = getSupabaseAdmin()
  const { data: logRow } = await supabase
    .from('CallLog')
    .select('detectedLanguage')
    .eq('callSid', callSid)
    .maybeSingle()

  const lang = (logRow as { detectedLanguage?: string } | null)?.detectedLanguage ?? 'en'

  console.log(`[voice-jade] after-dial callSid=${callSid} DialCallStatus=${dialStatus} lang=${lang}`)

  // Agent answered and call completed normally → hang up
  if (dialStatus === 'completed') {
    return twiml(say(
      lang === 'fr' ? 'Merci d\'avoir appelé Walz Travels. Au revoir.'
      : lang === 'es' ? 'Gracias por llamar a Walz Travels. Hasta luego.'
      : lang === 'ar' ? 'شكراً لاتصالك بـ Walz Travels. مع السلامة.'
      : 'Thanks for calling Walz Travels. Take care, bye.',
      lang,
    ) + '<Hangup/>')
  }

  // Agent didn't answer (no-answer, busy, failed, canceled) → return caller to Jade
  const retry =
    lang === 'fr' ? 'Notre agent n\'a pas pu prendre votre appel. Puis-je vous aider autrement ?'
    : lang === 'es' ? 'Nuestro agente no pudo atenderte. ¿Puedo ayudarte en algo más?'
    : lang === 'ar' ? 'لم يتمكن وكيلنا من الرد. هل يمكنني مساعدتك بطريقة أخرى؟'
    : 'Our agent wasn\'t able to pick up. Is there anything I can help you with in the meantime?'

  return gather(retry, lang)
}

// ─── System prompt ────────────────────────────────────────────────────────────
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

// ── Voice-only routing ───────────────────────────────────────────────────────
// Returns ALL active agents who have a SIP address — caller goes to whoever
// answers first. Completely separate from Chatwoot/chat routing.
type VoiceAgent = {
  id:         string
  name:       string
  email:      string
  sipAddress: string
}

async function getVoiceAgents(): Promise<VoiceAgent[]> {
  const supabase = getSupabaseAdmin()
  const { data: agents, error } = await supabase
    .from('RoutingAgent')
    .select('id, name, email, sipAddress')
    .eq('active', true)
    .eq('isEscalation', false)
    .not('sipAddress', 'is', null)
    .order('roundRobinPosition', { ascending: true })

  if (error) console.error('[voice-routing] error fetching agents:', error?.message)
  return (agents ?? []) as VoiceAgent[]
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const t0 = Date.now()

  // Post-dial callback — must be handled before reading form data again
  if (req.nextUrl.searchParams.get('after') === 'true') {
    return handleAfterDial(req)
  }

  const form    = await req.formData()
  const speech  = form.get('SpeechResult')?.toString() ?? ''
  const callSid = form.get('CallSid')?.toString()      ?? ''
  const from    = form.get('From')?.toString()         ?? ''
  const noInput = req.nextUrl.searchParams.get('noInput')

  if (noInput || !speech.trim()) {
    console.log(`[voice-jade] ${callSid} no-input prompt`)
    return gather("Take your time — I'm here. What can I help you with?")
  }

  const supabase = getSupabaseAdmin()

  // ── Stage 1: DB read ─────────────────────────────────────────────────────────
  const tDbRead0 = Date.now()
  const { data: logRow } = await supabase
    .from('CallLog')
    .select('jadeHistory, detectedLanguage')
    .eq('callSid', callSid)
    .maybeSingle()
  const tDbRead1 = Date.now()

  const history: History =
    (logRow as { jadeHistory?: History } | null)?.jadeHistory ?? []
  const prevLang =
    (logRow as { detectedLanguage?: string } | null)?.detectedLanguage ?? 'en'

  history.push({ role: 'user', content: speech })

  console.log(`[voice-jade] ${callSid} DB-read=${tDbRead1 - tDbRead0}ms turns=${history.length}`)

  // ── Stage 2: Claude (Haiku — minimum latency) ────────────────────────────────
  const anthropic = new Anthropic()
  let decision: JadeDecision = {
    response:   "Let me get someone from the team for you right now.",
    action:     'transfer',
    language:   prevLang,
    specialism: 'support',
  }

  const tClaude0 = Date.now()
  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 180,
      system:     SYSTEM,
      messages:   history,
    })
    const tClaude1 = Date.now()
    const raw      = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const match    = raw.match(/\{[\s\S]*?\}/)
    if (match) decision = { ...decision, ...JSON.parse(match[0]) }
    history.push({ role: 'assistant', content: raw })
    console.log(
      `[voice-jade] ${callSid} claude=${tClaude1 - tClaude0}ms` +
      ` in=${msg.usage.input_tokens}tok out=${msg.usage.output_tokens}tok` +
      ` action=${decision.action} lang=${decision.language}`,
    )
  } catch (err) {
    console.error(`[voice-jade] ${callSid} claude-error=${Date.now() - tClaude0}ms`, err)
    history.push({ role: 'assistant', content: JSON.stringify(decision) })
  }

  const lang = decision.language ?? prevLang

  // ── Stage 3: DB write (fire-and-forget) ──────────────────────────────────────
  // RISK: if a future turn's DB-read fires before this write lands, it reads stale
  // history. Observed in production: one write took 12.5 s (Supabase cold-start).
  // To eliminate the race, convert to `await` here and remove the fire-and-forget —
  // adds ~10–50 ms to server-total but is safe. Keep as-is only while latency is
  // the bigger concern and the 12.5 s write is confirmed anomalous, not systematic.
  const tWrite0 = Date.now()
  supabase
    .from('CallLog')
    .update({ jadeHistory: history, detectedLanguage: lang })
    .eq('callSid', callSid)
    .then(({ error }) => {
      if (error) console.error(`[voice-jade] ${callSid} DB-write-error=`, error)
      else console.log(`[voice-jade] ${callSid} DB-write=${Date.now() - tWrite0}ms`)
    })

  // ── Total server time (excludes Twilio STT + TTS, which happen outside) ──────
  console.log(`[voice-jade] ${callSid} server-total=${Date.now() - t0}ms`)

  const { response, action } = decision

  // ── End call ─────────────────────────────────────────────────────────────────
  if (action === 'end') {
    return twiml(say(response, lang) + '<Hangup/>')
  }

  // ── Transfer to live agent ────────────────────────────────────────────────────
  if (action === 'transfer') {
    const tRoute0 = Date.now()
    const agents  = await getVoiceAgents()
    console.log(`[voice-jade] ${callSid} route=${Date.now() - tRoute0}ms pool=${agents.length} agents=[${agents.map(a => a.name).join(', ')}]`)

    if (!agents.length) {
      const unavailable =
        lang === 'fr' ? `${response} Notre équipe est occupée — nous vous enverrons un WhatsApp dans quelques instants.`
        : lang === 'es' ? `${response} Nuestro equipo está ocupado — le enviaremos un WhatsApp enseguida.`
        : lang === 'ar' ? `${response} فريقنا مشغول — سنرسل لك واتساب في أقرب وقت.`
        : `${response} Our team's all on calls right now — we'll drop you a WhatsApp and follow up straight away.`
      return twiml(say(unavailable, lang) + '<Hangup/>')
    }

    // ── Conference room + hold Gather loop ───────────────────────────────────
    // ALL agents are called simultaneously via REST API. Whoever answers first
    // gets connected to the caller. The conference maxParticipants cap ensures
    // only one agent joins; any other agent who answers late hears a brief
    // "conference full" tone and their leg ends automatically.
    const roomName     = `walz-${callSid}`
    const agentJoinUrl = `${BASE_URL}/api/twilio/agent-join?room=${encodeURIComponent(roomName)}&callerSid=${encodeURIComponent(callSid)}&caller=${encodeURIComponent(from)}`

    if (ACCOUNT_SID && AUTH_TOKEN) {
      const twilioClient   = Twilio(ACCOUNT_SID, AUTH_TOKEN)
      const statusCallback = `${BASE_URL}/api/twilio/agent-ring-status`
      const outboundBase   = {
        url:                  agentJoinUrl,
        method:               'POST' as const,
        timeout:              30,
        statusCallback,
        statusCallbackMethod: 'POST' as const,
        statusCallbackEvent:  ['initiated', 'ringing', 'answered', 'completed', 'failed', 'no-answer', 'busy', 'canceled'] as string[],
      }

      // Ring every agent's SIP phone AND browser panel at the same time
      const ringCalls = agents.flatMap(agent => {
        const agentSip = agent.sipAddress.startsWith('sip:')
          ? agent.sipAddress
          : `sip:${agent.sipAddress}`

        return [
          twilioClient.calls
            .create({ ...outboundBase, to: `client:${agent.email}`, from: VOICE_NUMBER })
            .then(c => console.log(`[voice-jade] ${callSid} browser-ring sid=${c.sid} to=client:${agent.email} (${agent.name})`))
            .catch((err: unknown) => console.error(`[voice-jade] ${callSid} browser-ring error ${agent.name}:`, err)),
          twilioClient.calls
            .create({ ...outboundBase, to: agentSip, from: VOICE_NUMBER })
            .then(c => console.log(`[voice-jade] ${callSid} sip-ring sid=${c.sid} to=${agentSip} (${agent.name})`))
            .catch((err: unknown) => console.error(`[voice-jade] ${callSid} sip-ring error ${agent.name}:`, err)),
        ]
      })

      await Promise.all(ringCalls)
    } else {
      console.error(`[voice-jade] ${callSid} TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set`)
    }

    // Redirect caller into the hold Gather loop — they hear music + ads and can
    // press a key at any time to choose hold or callback.
    // & in XML must be &amp; — Twilio's XML parser rejects raw & in URLs
    const holdUrl = `${BASE_URL}/api/twilio/hold-music?callSid=${encodeURIComponent(callSid)}&amp;room=${encodeURIComponent(roomName)}&amp;l=0`
    return twiml(say(response, lang) + `<Redirect method="GET">${holdUrl}</Redirect>`)
  }

  // ── Continue conversation ─────────────────────────────────────────────────────
  return gather(response, lang)
}
