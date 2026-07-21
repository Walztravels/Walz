import { NextRequest, NextResponse } from 'next/server'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Twilio = require('twilio') as (sid: string, token: string) => import('twilio').Twilio

export const dynamic = 'force-dynamic'

// ── Agent Conference Join ─────────────────────────────────────────────────────
//
// Two modes, selected via query params:
//
// 1. Normal (no ?noAnswer): called by Twilio when the outbound REST API call to
//    the agent is answered. Returns TwiML placing the agent in the conference room.
//
// 2. ?noAnswer=true: status callback when the agent's outbound call finishes
//    without being answered (no-answer, busy, failed). Redirects the caller
//    back into the voice-jade retry flow via calls(parentCallSid).update().

const BASE_URL     = 'https://www.walztravels.com'
const ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID ?? ''
const AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN  ?? ''

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams

  // ── Mode 2: agent no-answer / busy / failed ──────────────────────────────
  if (params.get('noAnswer') === 'true') {
    const parentCallSid = params.get('parentCallSid') ?? ''
    const lang          = params.get('lang') ?? 'en'
    const form          = await req.formData()
    const callStatus    = form.get('CallStatus')?.toString() ?? ''

    console.log(`[agent-join] no-answer callback parentCallSid=${parentCallSid} CallStatus=${callStatus}`)

    // Only redirect the caller when the agent genuinely didn't answer.
    // 'completed' means the agent answered AND the call finished normally —
    // in that case the conference action URL (handleAfterDial) fires instead.
    if (['no-answer', 'busy', 'failed', 'canceled'].includes(callStatus)) {
      if (!ACCOUNT_SID || !AUTH_TOKEN || !parentCallSid) {
        console.error('[agent-join] missing credentials or parentCallSid — cannot redirect caller')
        return NextResponse.json({ ok: false })
      }

      const noAgentUrl =
        `${BASE_URL}/api/twilio/voice-jade?noAgent=true&lang=${encodeURIComponent(lang)}`

      try {
        const client = Twilio(ACCOUNT_SID, AUTH_TOKEN)
        await client.calls(parentCallSid).update({ url: noAgentUrl, method: 'POST' as const })
        console.log(`[agent-join] redirected caller ${parentCallSid} to no-agent handler`)
      } catch (err) {
        console.error(`[agent-join] failed to redirect caller ${parentCallSid}:`, err)
      }
    }

    return NextResponse.json({ ok: true })
  }

  // ── Mode 1: agent answered — join the conference ─────────────────────────
  const room = params.get('room') ?? ''
  if (!room) {
    console.error('[agent-join] missing room param')
    return twiml('<Hangup/>')
  }

  console.log(`[agent-join] agent joining conference room="${room}"`)

  // startConferenceOnEnter="true" → conference starts (hold music stops for caller)
  // endConferenceOnExit="true"    → conference ends when agent hangs up
  // beep="false"                  → no jarring join tone
  return twiml(
    `<Dial>` +
    `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">` +
    `${room}` +
    `</Conference>` +
    `</Dial>`,
  )
}
