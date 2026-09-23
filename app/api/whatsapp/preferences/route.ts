/**
 * WhatsApp Broadcast V1.2 — public WhatsApp marketing preferences.
 *
 * POST /api/whatsapp/preferences
 * Body: { phone: string, action: 'UNSUBSCRIBE' }
 *
 * ── P1 SECURITY FIX ───────────────────────────────────────────────────────
 * This route ONLY accepts 'UNSUBSCRIBE'. It used to also accept
 * 'SUBSCRIBE' and write WhatsAppConsent.SUBSCRIBED directly — independent
 * security review found that let ANY caller fabricate affirmative consent
 * for a phone number they do not control, with zero proof of possession.
 * Subscribing now REQUIRES a WhatsApp-delivered OTP:
 *   app/api/whatsapp/preferences/send-code/route.ts  (step 1)
 *   app/api/whatsapp/preferences/verify-code/route.ts (step 2 — the ONLY
 *     code path anywhere in this feature allowed to write SUBSCRIBED)
 * A request with `action: 'SUBSCRIBE'` here now 400s rather than silently
 * subscribing anyone — see isAction() below.
 *
 * UNSUBSCRIBE stays here, immediate, unauthenticated, by deliberate design
 * (see the P1 fix instruction: "Keep unsubscribe fail-safe... may remain
 * immediate"). The inbound STOP/UNSUBSCRIBE webhook
 * (app/api/webhooks/whatsapp/route.ts) remains the AUTHORITATIVE
 * unsubscribe channel; this form is a convenience, not a replacement.
 *
 * ── ANTI-ENUMERATION, ON PURPOSE ─────────────────────────────────────────
 * This endpoint must never let a caller learn whether a given phone number
 * exists anywhere in Walz's systems, or what its current WhatsApp consent
 * status is. So:
 *   - The response is the SAME generic `{ ok: true }` shape and the SAME
 *     200 status on every outcome that isn't a malformed request: a brand
 *     new number, an already-opted-out number, and a syntactically invalid
 *     phone number all return the identical body. A phone number that
 *     fails E.164 normalization is silently no-op'd rather than surfaced
 *     as a distinct error.
 *   - Only a malformed REQUEST SHAPE (missing phone, action not exactly
 *     'UNSUBSCRIBE') 400s — that is about the caller's request, never
 *     about any phone number's existence.
 *
 * Rate-limited per IP (whatsappPreferenceRateLimit) — same posture as the
 * SMS Customer Care consent route: generous for a genuine person, tight
 * against mass-writing or probing.
 *
 * Never blocks, never throws to the caller: any unexpected error is
 * swallowed and still answered with the generic success shape.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { whatsappPreferenceRateLimit } from '@/lib/rate-limit'
import { DISCLOSURE_VERSION } from '@/lib/whatsapp/preferences-disclosure'

export const dynamic = 'force-dynamic'

// A FRESH response every call — NextResponse bodies are single-use streams,
// so a module-level shared instance would throw "Body has already been
// read" on its second caller.
function genericOk() {
  return NextResponse.json({ ok: true })
}

type Action = 'UNSUBSCRIBE'

function isAction(v: unknown): v is Action {
  return v === 'UNSUBSCRIBE'
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = whatsappPreferenceRateLimit(ip)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const r = (body ?? {}) as Record<string, unknown>
  const phoneRaw = r.phone
  const action = r.action

  // Malformed REQUEST SHAPE — about the caller's request, not about any
  // number's existence. Safe to answer distinctly. `action: 'SUBSCRIBE'`
  // lands here too now — it is a shape this route no longer accepts at all.
  if (typeof phoneRaw !== 'string' || !phoneRaw.trim() || !isAction(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const normalizedNumber = normalizePhoneE164(phoneRaw)
    if (normalizedNumber) {
      const userAgent = req.headers.get('user-agent') ?? null
      await prisma.whatsAppConsent.upsert({
        where: { normalizedNumber },
        create: {
          normalizedNumber,
          status: 'OPTED_OUT',
          source: 'whatsapp_preferences_page',
          optedOutAt: new Date(),
          capturePage: '/whatsapp/preferences',
          disclosureVersion: DISCLOSURE_VERSION,
          ipAddress: ip,
          userAgent,
        },
        update: {
          status: 'OPTED_OUT',
          source: 'whatsapp_preferences_page',
          optedOutAt: new Date(),
          capturePage: '/whatsapp/preferences',
          disclosureVersion: DISCLOSURE_VERSION,
          ipAddress: ip,
          userAgent,
        },
      })
    }
  } catch (err) {
    // Never surface this to the caller — see file header.
    console.error('[whatsapp-preferences] write failed:', (err as Error)?.message)
  }

  return genericOk()
}
