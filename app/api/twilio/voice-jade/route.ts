import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from '@/lib/supabase'
import { routeConversation } from '@/lib/conversation-router'

export const dynamic = 'force-dynamic'

const VOICE_NUMBER = process.env.TWILIO_VOICE_NUMBER ?? ''
const BASE_URL     = 'https://www.walztravels.com'

type History = Array<{ role: 'user' | 'assistant'; content: string }>
type JadeDecision = { response: string; action: 'continue' | 'transfer' | 'end'; specialism?: string }

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

function gather(prompt: string) {
  return twiml(
    `<Say voice="Polly.Joanna">${prompt}</Say>` +
    `<Gather input="speech" action="${BASE_URL}/api/twilio/voice-jade" method="POST" ` +
    `speechTimeout="auto" language="en-GB" ` +
    `hints="flight,visa,hotel,booking,passport,Schengen,Canada,USA,Australia,airline,insurance,tour,package,transfer"/>` +
    `<Redirect method="POST">${BASE_URL}/api/twilio/voice-jade?noInput=true</Redirect>`,
  )
}

const SYSTEM_PROMPT = `You are Jade, a friendly and professional voice assistant for Walz Travels, a UK-based premium travel agency.

You help customers with: flights, hotels, visa applications, tour packages, travel insurance, eSIM, and general travel advice.

VOICE RULES — follow these strictly:
- Keep every response to 1–3 short sentences. This is a phone call.
- Ask only ONE question at a time.
- Never read lists or bullet points aloud.
- Be warm, calm, and efficient.

WHEN TO HANDLE YOURSELF:
- General visa requirements, documents needed, processing times
- Flight route information, airline info, general pricing ballpark
- Destination advice, what to pack, entry requirements
- Simple FAQs

WHEN TO TRANSFER TO AN AGENT:
- Customer wants to make, change, or cancel a booking
- Payment issues or refunds
- Complaints or escalations
- Needs an exact price quote
- Requests to speak to a human

Always reply with valid JSON only — no other text, no markdown:
{"response":"what to say","action":"continue","specialism":"flight"}

action must be one of: "continue", "transfer", "end"
specialism (required when action is "transfer"): "flight", "visa", "hotel", "tour", "support"`

export async function POST(req: NextRequest) {
  const form     = await req.formData()
  const speech   = form.get('SpeechResult')?.toString() ?? ''
  const callSid  = form.get('CallSid')?.toString()      ?? ''
  const from     = form.get('From')?.toString()         ?? ''
  const noInput  = req.nextUrl.searchParams.get('noInput')

  const supabase = getSupabaseAdmin()

  // No speech detected
  if (noInput || !speech.trim()) {
    return gather("Sorry, I didn't catch that. Could you say that again?")
  }

  // Fetch conversation history from CallLog
  const { data: logRow } = await supabase
    .from('CallLog')
    .select('jadeHistory')
    .eq('callSid', callSid)
    .maybeSingle()

  const history: History =
    (logRow as { jadeHistory?: History } | null)?.jadeHistory ?? []

  history.push({ role: 'user', content: speech })

  // Call Claude
  const anthropic = new Anthropic()
  let decision: JadeDecision = { response: "Let me connect you with our team.", action: 'transfer', specialism: 'support' }

  try {
    const completion = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system:     SYSTEM_PROMPT,
      messages:   history,
    })

    const raw = completion.content[0]?.type === 'text' ? completion.content[0].text.trim() : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) decision = JSON.parse(match[0]) as JadeDecision
    history.push({ role: 'assistant', content: raw })
  } catch {
    history.push({ role: 'assistant', content: JSON.stringify(decision) })
  }

  // Persist updated history
  await supabase
    .from('CallLog')
    .update({ jadeHistory: history })
    .eq('callSid', callSid)

  const { response, action, specialism } = decision

  // ── End call ────────────────────────────────────────────────────────────────
  if (action === 'end') {
    return twiml(`<Say voice="Polly.Joanna">${response}</Say><Hangup/>`)
  }

  // ── Transfer to agent ────────────────────────────────────────────────────────
  if (action === 'transfer') {
    const routeMsg  = `Voice call from ${from}. Customer said: "${speech}". Specialism: ${specialism ?? 'support'}`
    const routeKey  = `twilio_jade_${callSid}`
    const agentDecision = await routeConversation(routeKey, routeMsg, 'voice')

    if (!agentDecision) {
      return twiml(
        `<Say voice="Polly.Joanna">${response} ` +
        `Unfortunately all our agents are currently unavailable. ` +
        `Please send us a WhatsApp message and we will follow up shortly.</Say><Hangup/>`,
      )
    }

    const { data: agentRow } = await supabase
      .from('RoutingAgent')
      .select('sipAddress')
      .eq('email', agentDecision.agentEmail ?? '')
      .maybeSingle()

    const agentSip = (agentRow as { sipAddress?: string } | null)?.sipAddress
    const clientId = agentDecision.agentEmail ?? agentDecision.agentName

    const dialTargets = agentSip
      ? `<Client>${clientId}</Client><Sip>${agentSip}</Sip>`
      : `<Client>${clientId}</Client>`

    return twiml(
      `<Say voice="Polly.Joanna">${response}</Say>` +
      `<Dial callerId="${VOICE_NUMBER}" timeout="30">${dialTargets}</Dial>`,
    )
  }

  // ── Continue conversation ────────────────────────────────────────────────────
  return gather(response)
}
