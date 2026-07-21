import { NextRequest, NextResponse } from 'next/server'
import { routeConversation } from '@/lib/conversation-router'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Configure in Twilio Console: TwiML App Voice Request URL and Phone Number Voice URL
// → POST https://walztravels.com/api/twilio/voice

const VOICE_NUMBER = process.env.TWILIO_VOICE_NUMBER ?? ''

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function POST(req: NextRequest) {
  const form     = await req.formData()
  const from     = form.get('From')?.toString()    ?? ''
  const to       = form.get('To')?.toString()      ?? ''
  const callSid  = form.get('CallSid')?.toString() ?? ''

  const supabase = getSupabaseAdmin()

  // ── Outbound: call from browser SDK ──────────────────────────────────────
  // From is "client:<staff-email>" when initiated via device.connect()
  if (from.startsWith('client:')) {
    await supabase.from('CallLog').upsert(
      { callSid, direction: 'outbound', from: from.replace('client:', ''), to, status: 'initiated' },
      { onConflict: 'callSid' },
    )
    return twiml(`<Dial callerId="${VOICE_NUMBER}"><Number>${to}</Number></Dial>`)
  }

  // ── Inbound: real phone call to Twilio number — route to an agent ─────────
  const routeKey = `twilio_${callSid}`
  const decision = await routeConversation(routeKey, `Inbound call from ${from}`, 'voice')

  await supabase.from('CallLog').upsert(
    {
      callSid,
      direction:      'inbound',
      from,
      to,
      status:         decision ? 'ringing' : 'missed',
      assignedTo:     decision?.agentEmail  ?? null,
      assignedToName: decision?.agentName   ?? null,
    },
    { onConflict: 'callSid' },
  )

  if (!decision) {
    return twiml(
      `<Say voice="Polly.Joanna">` +
      `Sorry, our team is currently unavailable. ` +
      `Please send us a WhatsApp message and we will call you back shortly.` +
      `</Say><Hangup/>`,
    )
  }

  // Agent's Twilio Client identity = their email (set when the access token is issued)
  const clientId = decision.agentEmail ?? decision.agentName
  return twiml(`<Dial timeout="20"><Client>${clientId}</Client></Dial>`)
}
