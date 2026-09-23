/**
 * WhatsApp Broadcast V1.2 P1 FIX — send a proof-of-possession OTP.
 *
 * POST /api/whatsapp/preferences/send-code
 * Body: { phone: string, consent: true }
 *
 * Step 1 of Enter number → consent checkbox → Send verification code →
 * Verify code → SUBSCRIBED. This route NEVER writes WhatsAppConsent —
 * only verify-code's success path does, and only after this route's code
 * is correctly returned.
 *
 * The affirmative consent checkbox must ALREADY be true before a code is
 * even sent — sending a code is itself an action taken because someone
 * asked to subscribe, so requiring the checkbox here (not deferred to
 * verify-code) keeps the "actively selects the consent checkbox" moment
 * where the disclosure text is actually on screen.
 *
 * Anti-enumeration: COOLDOWN and MAX_SENDS_EXCEEDED are safe to report
 * distinctly (see lib/whatsapp/consent-otp.ts's sendOtp() doc comment —
 * both are facts about requests already made by whoever is asking now,
 * not about whether Walz has any record of this number). Every other
 * outcome — valid send, Meta-side delivery failure, unnormalizable number
 * — answers with the SAME generic { ok: true } shape.
 */

import { NextRequest, NextResponse } from 'next/server'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { whatsappOtpSendRateLimit } from '@/lib/rate-limit'
import { sendOtp } from '@/lib/whatsapp/consent-otp'
import { DISCLOSURE_VERSION } from '@/lib/whatsapp/preferences-disclosure'

export const dynamic = 'force-dynamic'

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = whatsappOtpSendRateLimit(ip)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const r = (body ?? {}) as Record<string, unknown>
  const phoneRaw = r.phone
  const consent = r.consent

  // Malformed REQUEST SHAPE — about the caller's request, safe to answer
  // distinctly. Strict `=== true`, no truthy coercion (matches the SMS
  // Customer Care consent route's decideConsentWrite()).
  if (typeof phoneRaw !== 'string' || !phoneRaw.trim() || consent !== true) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const normalizedNumber = normalizePhoneE164(phoneRaw)
  if (!normalizedNumber) {
    // Same generic success shape as an unnormalizable number gets
    // everywhere else in this feature — never a distinct "bad number"
    // signal here either.
    return NextResponse.json({ ok: true })
  }

  const outcome = await sendOtp({
    normalizedNumber,
    capturePage: '/whatsapp/preferences',
    disclosureVersion: DISCLOSURE_VERSION,
    ipAddress: ip,
    userAgent: req.headers.get('user-agent') ?? null,
  })

  switch (outcome.outcome) {
    case 'SENT':
      return NextResponse.json({ ok: true })
    case 'COOLDOWN':
      return NextResponse.json({ error: 'Please wait before requesting another code', retryAfterMs: outcome.retryAfterMs }, { status: 429 })
    case 'MAX_SENDS_EXCEEDED':
      return NextResponse.json({ error: 'Too many codes requested for this number. Please try again later.' }, { status: 429 })
    case 'NOT_CONFIGURED':
      return NextResponse.json({ error: 'Verification is not available right now. Please try again later.' }, { status: 503 })
  }
}
