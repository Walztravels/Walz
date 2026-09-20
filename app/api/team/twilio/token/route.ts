/**
 * Walz Team Hub V1 — Twilio Access Token issuance for INTERNAL staff-to-staff
 * calling.
 *
 * ISOLATION (explicit owner mandate — do not weaken this): this route is a
 * completely separate calling configuration from the client-facing
 * telephony under app/api/twilio/**. It must never fall back to, reuse, or
 * be confused with any client-call credential, TwiML Application, or
 * identity space. Only the underlying Twilio ACCOUNT itself is shared.
 *
 * ── ENVIRONMENT VARIABLES ───────────────────────────────────────────────────
 * NEW — required, NOT YET SET anywhere, and NOT fabricated here:
 *   TWILIO_TEAMHUB_TWIML_APP_SID
 *     A brand-new TwiML Application must be created in the Twilio Console
 *     with its Voice Request URL (and Voice Status Callback URL, if used)
 *     pointed at:
 *         https://walztravels.com/api/team/twilio/voice
 *     Do NOT point it at, or clone configuration from, the existing
 *     client-calling TwiML Application (env TWILIO_TWIML_APP_SID) — that
 *     app is untouched and its env var is never read in this file.
 *
 * REUSED — safe to reuse as-is (confirmed by reading
 * app/api/twilio/token/route.ts, the existing client-calling token route):
 *   TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET
 *     These identify the Twilio ACCOUNT and the API Key used to sign Access
 *     Tokens — issuing a Voice grant for a *different* TwiML Application
 *     does not require a new API Key, only a new `outgoingApplicationSid`.
 *   TWILIO_AUTH_TOKEN
 *     Already set for the existing client-calling/WhatsApp webhooks
 *     (see app/api/webhooks/twilio-whatsapp/route.ts) — reused here ONLY to
 *     verify the X-Twilio-Signature on the SIBLING voice webhook
 *     (app/api/team/twilio/voice/route.ts), never to issue a token or grant.
 *
 * NEW — optional (see app/api/team/twilio/voice/route.ts for where it's
 * used; falls back to reconstructing the URL from forwarded headers if
 * unset, per lib/webhooks/verify.ts's externalWebhookUrl):
 *   TWILIO_TEAMHUB_WEBHOOK_URL
 *     Pin this to the EXACT Voice Request URL configured on the
 *     TwiML Application above (https://walztravels.com/api/team/twilio/voice)
 *     for X-Twilio-Signature verification to match reliably behind Vercel's
 *     proxy — mirrors TWILIO_WEBHOOK_URL's role for the WhatsApp webhook.
 *
 * If TWILIO_TEAMHUB_TWIML_APP_SID (or any of the three reused Access-Token
 * env vars) is missing, this route returns 500 "Team Hub calling is not yet
 * configured" — it NEVER falls back to TWILIO_TWIML_APP_SID (the
 * client-calling app) under any circumstances.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-auth'
import { currentStaffId } from '@/lib/team/authz'

export const dynamic = 'force-dynamic'

async function issueToken(): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_TEAMHUB_TWIML_APP_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
  } = process.env

  if (!TWILIO_ACCOUNT_SID || !TWILIO_TEAMHUB_TWIML_APP_SID || !TWILIO_API_KEY_SID || !TWILIO_API_KEY_SECRET) {
    // Never fall back to the client-calling TWILIO_TWIML_APP_SID here —
    // Team Hub calling must stay fully isolated even when unconfigured.
    return NextResponse.json({ error: 'Team Hub calling is not yet configured' }, { status: 500 })
  }

  const twilio      = await import('twilio')
  const AccessToken = twilio.default.jwt.AccessToken
  const VoiceGrant  = AccessToken.VoiceGrant

  // Identity is ALWAYS server-resolved from the session's Staff.id — never
  // client-suppliable — and namespaced with a "staff-" prefix so it can
  // never collide with, or be mistaken for, the client-calling identity
  // space (which registers raw staff email as the Twilio Client identity).
  const identity = `staff-${currentStaffId(session)}`

  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity,
    ttl: 3600,
  })

  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: TWILIO_TEAMHUB_TWIML_APP_SID,
    incomingAllow: true,
  }))

  return NextResponse.json({ token: token.toJwt(), identity })
}

export async function POST(_req: NextRequest) {
  return issueToken()
}

export async function GET(_req: NextRequest) {
  return issueToken()
}
