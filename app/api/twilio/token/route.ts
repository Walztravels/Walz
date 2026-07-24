import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_TWIML_APP_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
  } = process.env

  if (!TWILIO_ACCOUNT_SID || !TWILIO_TWIML_APP_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) {
    return NextResponse.json({ error: 'Twilio Voice credentials not configured' }, { status: 500 })
  }

  const twilio      = await import('twilio')
  const AccessToken = twilio.default.jwt.AccessToken
  const VoiceGrant  = AccessToken.VoiceGrant

  // Identity is the staff email — must match what the phone panel registers as
  const identity = session.email

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity,
    ttl: 3600,
  })

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  }))

  console.log(`[twilio/token] device registered identity="${identity}"`)
  return NextResponse.json({ token: token.toJwt(), identity })
}
