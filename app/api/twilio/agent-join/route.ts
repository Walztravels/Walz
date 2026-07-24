import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── Agent conference join + caller bridge ────────────────────────────────────
//
// Called by Twilio when an outbound REST API call to the agent is answered.
//
// With blast-ring (all agents called simultaneously), multiple agents may
// answer the same call. We use VoiceCallClaim as an atomic "first-wins" lock:
//   • First agent to INSERT into VoiceCallClaim wins the call
//   • Every other agent who answers gets a polite hangup
//
// The winning agent:
//   1. Redirects the caller out of the hold Gather loop into the conference
//   2. Returns TwiML that puts themselves into the same conference

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Twilio      = require('twilio') as (sid: string, token: string) => import('twilio').Twilio
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? ''
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN  ?? ''
const BASE_URL    = 'https://www.walztravels.com'

function twiml(inner: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`,
    { headers: { 'Content-Type': 'text/xml; charset=utf-8' } },
  )
}

export async function POST(req: NextRequest) {
  const room      = req.nextUrl.searchParams.get('room')      ?? ''
  const callerSid = req.nextUrl.searchParams.get('callerSid') ?? ''
  const caller    = req.nextUrl.searchParams.get('caller')    ?? ''

  if (!room) {
    console.error('[agent-join] missing ?room param')
    return twiml('<Hangup/>')
  }

  console.log(`[agent-join] agent answered — room="${room}" callerSid="${callerSid}" caller="${caller}"`)

  // ── Atomic first-wins claim ────────────────────────────────────────────────
  // VoiceCallClaim has callSid as PRIMARY KEY so only one INSERT succeeds.
  // Any other agent who answers gets a duplicate-key error → polite hangup.
  if (callerSid) {
    const supabase = getSupabaseAdmin()
    const { error: claimError } = await supabase
      .from('VoiceCallClaim')
      .insert({ callSid: callerSid })

    if (claimError) {
      // Duplicate key = another agent already claimed this call
      console.log(`[agent-join] call ${callerSid} already claimed — declining this agent`)
      return twiml(
        '<Say voice="Polly.Amy-Neural">Your colleague has answered this call. Goodbye.</Say>' +
        '<Hangup/>',
      )
    }

    console.log(`[agent-join] claimed call ${callerSid}`)
  }

  // ── Bridge the caller into the conference ─────────────────────────────────
  // twilio.calls.update() interrupts whatever TwiML the caller is executing
  // (the hold Gather loop) and redirects them to join the same conference room.
  if (callerSid && ACCOUNT_SID && AUTH_TOKEN) {
    const twilioClient  = Twilio(ACCOUNT_SID, AUTH_TOKEN)
    const callerJoinUrl = `${BASE_URL}/api/twilio/caller-join?room=${encodeURIComponent(room)}`

    await twilioClient.calls(callerSid)
      .update({ url: callerJoinUrl, method: 'POST' })
      .then(() => console.log(`[agent-join] redirected caller ${callerSid} into conference`))
      .catch((e: unknown) => console.error(`[agent-join] failed to redirect caller ${callerSid}:`, e))
  }

  // ── Whisper + conference TwiML for the agent ──────────────────────────────
  const whisper = caller
    ? `<Say voice="Polly.Amy-Neural">Transfer from ${caller}</Say>`
    : ''

  return twiml(
    whisper +
    `<Dial action="${BASE_URL}/api/twilio/voice-jade?after=true" method="POST">` +
    `<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" maxParticipants="2">` +
    `${room}` +
    `</Conference>` +
    `</Dial>`,
  )
}
