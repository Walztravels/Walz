import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ── Caller conference join ────────────────────────────────────────────────────
//
// Called when agent-join does twilio.calls.update(callerSid, { url: THIS_URL }).
// That interrupts the caller's hold Gather loop and executes this TwiML,
// joining them into the conference the agent has just started.
//
// The conference was created (startConferenceOnEnter="true") by the agent a
// moment earlier, so the caller enters an already-live conference — they hear
// the agent immediately, no hold music.

const BASE_URL = 'https://www.walztravels.com'

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function POST(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room') ?? ''

  if (!room) {
    console.error('[caller-join] missing ?room param')
    return twiml('<Hangup/>')
  }

  console.log(`[caller-join] caller joining conference room="${room}"`)

  return twiml(
    `<Dial action="${BASE_URL}/api/twilio/voice-jade?after=true" method="POST">` +
    `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">` +
    `${room}` +
    `</Conference>` +
    `</Dial>`,
  )
}
