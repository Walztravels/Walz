/**
 * WhatsApp Broadcast V1.2 P1 FIX — verify a proof-of-possession OTP and,
 * ONLY on success, write WhatsAppConsent.SUBSCRIBED.
 *
 * POST /api/whatsapp/preferences/verify-code
 * Body: { phone: string, code: string }
 *
 * This is the ONLY code path in the whole feature allowed to set
 * WhatsAppConsent.status = 'SUBSCRIBED'. The pre-P1-fix
 * /api/whatsapp/preferences route no longer accepts a SUBSCRIBE action at
 * all — see that file.
 *
 * Anti-enumeration: verifyOtp() already collapses every failure mode
 * (wrong code, expired, locked, already consumed, no such number ever
 * requested a code, lost the concurrent-consume race) into one
 * undifferentiated INVALID outcome — this route just forwards that as one
 * generic error, never distinguishing "this number never requested a
 * code" from "the code was wrong".
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { whatsappOtpVerifyRateLimit } from '@/lib/rate-limit'
import { verifyOtp } from '@/lib/whatsapp/consent-otp'

export const dynamic = 'force-dynamic'

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = whatsappOtpVerifyRateLimit(ip)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const r = (body ?? {}) as Record<string, unknown>
  const phoneRaw = r.phone
  const codeRaw = r.code

  if (typeof phoneRaw !== 'string' || !phoneRaw.trim() || typeof codeRaw !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const normalizedNumber = normalizePhoneE164(phoneRaw)
  if (!normalizedNumber) {
    return NextResponse.json({ verified: false, error: 'Invalid or expired code' }, { status: 400 })
  }

  const result = await verifyOtp({ normalizedNumber, code: codeRaw.trim() })

  if (result.outcome === 'INVALID') {
    return NextResponse.json({ verified: false, error: 'Invalid or expired code' }, { status: 400 })
  }

  // ── ONLY this branch may ever write SUBSCRIBED ──────────────────────
  const userAgent = req.headers.get('user-agent') ?? null
  await prisma.whatsAppConsent.upsert({
    where: { normalizedNumber },
    create: {
      normalizedNumber,
      status: 'SUBSCRIBED',
      source: 'whatsapp_preferences_page_otp_verified',
      consentedAt: new Date(),
      capturePage: result.capturePage,
      disclosureVersion: result.disclosureVersion,
      ipAddress: ip,
      userAgent,
    },
    update: {
      status: 'SUBSCRIBED',
      source: 'whatsapp_preferences_page_otp_verified',
      consentedAt: new Date(),
      optedOutAt: null,
      capturePage: result.capturePage,
      disclosureVersion: result.disclosureVersion,
      ipAddress: ip,
      userAgent,
    },
  })

  return NextResponse.json({ verified: true })
}
