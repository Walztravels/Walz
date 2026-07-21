import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ── Agent Conference Join ─────────────────────────────────────────────────────
//
// Called by Twilio when an outbound REST API call to the agent is answered.
// Returns TwiML placing the agent into the named conference room.
//
// The conference room was created by the caller's <Dial><Conference> in
// voice-jade. The caller entered with startConferenceOnEnter="false" and
// is hearing hold music. When the agent joins here with
// startConferenceOnEnter="true", the conference starts and music stops.
//
// No-answer / timeout handling is done entirely by the hold-music loop:
// after ~60 s the waitUrl issues <Leave/> → <Dial action> fires in voice-jade
// → handleAfterDial returns the caller to Jade for a retry. No statusCallback
// coordination needed.

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function POST(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room') ?? ''

  if (!room) {
    console.error('[agent-join] missing ?room param')
    return twiml('<Hangup/>')
  }

  console.log(`[agent-join] agent answered — joining conference room="${room}"`)

  // startConferenceOnEnter="true"  → conference starts, hold music stops for caller
  // endConferenceOnExit="true"     → conference ends when agent hangs up
  // beep="false"                   → no jarring join tone for the caller
  return twiml(
    `<Dial>` +
    `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">` +
    `${room}` +
    `</Conference>` +
    `</Dial>`,
  )
}
