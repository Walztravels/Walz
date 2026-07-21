import { NextRequest, NextResponse } from 'next/server'
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
  const form      = await req.formData()
  const from      = form.get('From')?.toString()      ?? ''
  const to        = form.get('To')?.toString()        ?? ''
  const callSid   = form.get('CallSid')?.toString()   ?? ''
  const direction = form.get('Direction')?.toString()  ?? ''

  const supabase = getSupabaseAdmin()

  // ── Outbound: browser SDK (From = "client:<email>") or REST API (Direction = "outbound-api")
  if (from.startsWith('client:') || direction === 'outbound-api') {
    await supabase.from('CallLog').upsert(
      { callSid, direction: 'outbound', from: from.replace('client:', ''), to, status: 'initiated' },
      { onConflict: 'callSid' },
    )
    return twiml(`<Dial callerId="${VOICE_NUMBER}"><Number>${to}</Number></Dial>`)
  }

  // ── Inbound: Jade answers first, transfers to agent if needed ──────────────
  await supabase.from('CallLog').upsert(
    { callSid, direction: 'inbound', from, to, status: 'jade-handling' },
    { onConflict: 'callSid' },
  )

  return twiml(
    `<Gather input="speech" action="https://www.walztravels.com/api/twilio/voice-jade" method="POST" ` +
    `speechTimeout="auto" language="en-GB" ` +
    `hints="flight,visa,hotel,booking,passport,Schengen,Canada,USA,Australia,UAE,airline,insurance,tour,package,eSIM,refund,cancel">` +
    `<Say voice="Polly.Amy-Neural">Walz Travels, Jade speaking — how can I help?</Say>` +
    `</Gather>` +
    `<Redirect method="POST">https://www.walztravels.com/api/twilio/voice-jade?noInput=true</Redirect>`,
  )
}
