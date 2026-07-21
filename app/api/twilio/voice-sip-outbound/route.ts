import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── SIP Domain outbound calling ───────────────────────────────────────────────
//
// Twilio fires this endpoint when an authenticated Zoiper agent places an
// outbound call via the SIP Domain (walzteam.sip.twilio.com).
//
// MANUAL STEP REQUIRED IN TWILIO CONSOLE (one-time):
//   Twilio Console → Elastic SIP Trunking / Voice → SIP Domains
//   → walzteam.sip.twilio.com
//   → Voice Configuration → A Call Comes In
//   → Webhook: https://www.walztravels.com/api/twilio/voice-sip-outbound
//   → HTTP Method: POST
//
// Parameter shape Twilio sends for a SIP-originated call (differs from
// browser SDK and REST API):
//   From:      sip:gloryn-reservations@walzteam.sip.twilio.com
//   To:        sip:+447712345678@walzteam.sip.twilio.com
//   Direction: inbound  ← inbound TO the SIP domain, NOT outbound-api
//
// The existing /api/twilio/voice cannot handle this safely — 'direction'
// is 'inbound' so it would fall into the Jade/caller path.

const VOICE_NUMBER = process.env.TWILIO_VOICE_NUMBER ?? ''
const BASE_URL     = 'https://www.walztravels.com'

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

// Extract the destination number from a SIP URI.
//   "sip:+447712345678@walzteam.sip.twilio.com" → "+447712345678"
//   "+447712345678" (already plain)               → "+447712345678"
function parseSipDest(sipTo: string): string {
  const match = sipTo.match(/^sip:([^@]+)@/)
  return match ? match[1] : sipTo.replace(/^sip:/, '')
}

// Extract the agent identifier from their SIP From address.
//   "sip:gloryn-reservations@walzteam.sip.twilio.com" → "gloryn-reservations"
function parseSipAgent(sipFrom: string): string {
  const match = sipFrom.match(/^(?:sip:)?([^@<>\s]+)@/)
  return match ? match[1] : sipFrom
}

async function handleAfterDial(req: NextRequest): Promise<NextResponse> {
  const form       = await req.formData()
  const callSid    = form.get('CallSid')?.toString()        ?? ''
  const dialStatus = form.get('DialCallStatus')?.toString() ?? ''
  const duration   = parseInt(form.get('DialCallDuration')?.toString() ?? '0', 10) || null

  const supabase = getSupabaseAdmin()
  const termStatus = dialStatus === 'completed' ? 'completed' : 'missed'

  supabase
    .from('CallLog')
    .update({ status: termStatus, ...(duration ? { duration } : {}) })
    .eq('callSid', callSid)
    .then(({ error }) => {
      if (error) console.error(`[voice-sip-outbound] ${callSid} DB after-dial error:`, error)
    })

  console.log(`[voice-sip-outbound] after-dial callSid=${callSid} DialCallStatus=${dialStatus}`)

  // Nothing more to say — agent's SIP channel handles its own goodbye UI
  return twiml('<Hangup/>')
}

export async function POST(req: NextRequest) {
  // Post-dial callback — before consuming form body
  if (req.nextUrl.searchParams.get('after') === 'true') {
    return handleAfterDial(req)
  }

  const form    = await req.formData()
  const sipTo   = form.get('To')?.toString()      ?? ''
  const sipFrom = form.get('From')?.toString()    ?? ''
  const callSid = form.get('CallSid')?.toString() ?? ''

  const destination = parseSipDest(sipTo)
  const agentId     = parseSipAgent(sipFrom)

  console.log(`[voice-sip-outbound] ${callSid} agent="${agentId}" → "${destination}"`)

  if (!destination || destination.length < 5) {
    console.error(`[voice-sip-outbound] ${callSid} invalid destination from To="${sipTo}"`)
    return twiml(
      `<Say voice="Polly.Amy-Neural">Sorry, we couldn't work out the number to dial. Please try again.</Say>` +
      `<Hangup/>`,
    )
  }

  // Log to CallLog — fire-and-forget so the TwiML response isn't held up
  const supabase = getSupabaseAdmin()
  supabase
    .from('CallLog')
    .upsert(
      { callSid, direction: 'outbound', from: agentId, to: destination, status: 'initiated' },
      { onConflict: 'callSid' },
    )
    .then(({ error }) => {
      if (error) console.error(`[voice-sip-outbound] ${callSid} DB error:`, error)
    })

  const afterUrl = `${BASE_URL}/api/twilio/voice-sip-outbound?after=true`

  // action + method="POST" required — same lesson as the Jade transfer fix.
  // statusCallbackMethod="POST" prevents Twilio falling back to a GET status
  // callback on individual dial legs.
  return twiml(
    `<Dial callerId="${VOICE_NUMBER}" timeout="30" ` +
    `action="${afterUrl}" method="POST" ` +
    `statusCallback="${BASE_URL}/api/twilio/voice/status" statusCallbackMethod="POST">` +
    `<Number>${destination}</Number>` +
    `</Dial>`,
  )
}
