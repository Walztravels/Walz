import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { consentCaptureRateLimit } from '@/lib/rate-limit'
import {
  decideConsentWrite,
  CONSENT_SOURCE_BOOKING_CHECKOUT,
  SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
} from '@/lib/consent/purposes'

/**
 * POST /api/consent/sms-customer-care
 *
 * Records an affirmative SMS_CUSTOMER_CARE consent — and nothing else.
 *
 * ── WHY THIS IS A SEPARATE ROUTE, NOT PART OF /api/booking/confirm ──────
 *  1. TIMING. The user ticks the box at step 1 of /book (passenger
 *     details), long before payment. /api/booking/confirm runs only AFTER
 *     a Stripe/Flutterwave payment verifies. Recording consent there would
 *     (a) mis-date it — stamping the payment time, not the moment of the
 *     affirmative act — and (b) silently lose the consent of everyone who
 *     ticks the box and then abandons checkout, even though they did
 *     genuinely consent.
 *  2. NON-ENTANGLEMENT. /api/booking/confirm verifies payments with two
 *     gateways, writes the booking and sends customer + admin email. A
 *     consent write living inside that function shares its failure modes
 *     in both directions: a consent DB error could surface as a failed
 *     booking confirmation, which is exactly backwards for something the
 *     disclosure calls "not a condition of purchase".
 *  3. REUSE. Any other public form that drops in
 *     <SmsCustomerCareConsent /> posts here unchanged. Folding this into a
 *     flight-booking route would have made the next form copy the logic.
 *
 * The client calls this fire-and-forget: a failure here NEVER blocks the
 * booking. Consent is explicitly not a condition of purchase.
 *
 * ── THE GUARANTEE ──────────────────────────────────────────────────────
 * A row is written ONLY when `consent === true` arrives from a human who
 * ticked the box. An unchecked box, an absent field, a string 'false', a
 * string 'true', 0, 1 or {} all return 200 with `recorded: false` and
 * write NOTHING — not a GRANTED row, not a NOT_GRANTED row, nothing. The
 * absence of a row is the honest "never answered" state.
 *
 * This route also NEVER reads Lead, VisaApplication, Client or any other
 * store to discover numbers. The only number it will ever write is the one
 * posted alongside a tick in the same request.
 */

export const dynamic = 'force-dynamic'

const schema = z.object({
  /**
   * The phone number exactly as the user typed it. Normalized SERVER-SIDE
   * below with the repo's existing normalizePhoneE164() — the client's
   * idea of the number is never stored.
   */
  phone: z.string().min(1).max(32),
  /**
   * The checkbox state. Typed `unknown` ON PURPOSE — this is the trust
   * boundary, and a schema that coerced it to a boolean would be the very
   * bug this feature exists to prevent. decideConsentWrite() applies a
   * strict `=== true`; anything else is simply not consent and is not an
   * error either, so a malformed value fails SAFE (no row) rather than
   * 400-ing and drawing attention away from the booking.
   */
  consent: z.unknown().optional(),
  /** Page the box was ticked on, e.g. '/book'. Audit context only. */
  capturePage: z.string().max(200).optional(),
  /** Short proof pointer, e.g. a booking reference. Audit context only. */
  evidence: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const limit = consentCaptureRateLimit(ip)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // Server-side normalization, using the SAME utility the WhatsApp
  // Broadcast audience resolver uses. There is deliberately no second
  // normalizer in this feature: two normalizers means two ideas of who a
  // number belongs to, and consent that cannot be matched back to the
  // number we message is not consent.
  const normalizedNumber = normalizePhoneE164(parsed.data.phone)

  const decision = decideConsentWrite({
    checked: parsed.data.consent,
    normalizedNumber,
  })

  if (!decision.write) {
    // 200, not an error: the submission legitimately succeeded, there is
    // simply no consent to record. NOTHING is written — creating a
    // NOT_GRANTED row here would manufacture a record for every visitor
    // who ignored an optional checkbox.
    return NextResponse.json({ recorded: false, reason: decision.reason })
  }

  const now = new Date()

  try {
    // Upsert on the (number, purpose) pair: a person who books twice and
    // ticks twice has one row, re-dated. It can only ever touch the
    // SMS_CUSTOMER_CARE slot for this number — SMS_MARKETING and
    // WHATSAPP_MARKETING are different rows this route never addresses.
    await prisma.consentRecord.upsert({
      where: {
        normalizedNumber_purpose: {
          normalizedNumber: decision.normalizedNumber,
          purpose: 'SMS_CUSTOMER_CARE',
        },
      },
      create: {
        normalizedNumber: decision.normalizedNumber,
        purpose: 'SMS_CUSTOMER_CARE',
        status: decision.status,
        source: CONSENT_SOURCE_BOOKING_CHECKOUT,
        capturePage: parsed.data.capturePage ?? null,
        disclosureVersion: SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
        ipAddress: ip,
        userAgent: req.headers.get('user-agent') ?? null,
        evidence: parsed.data.evidence ?? null,
        consentedAt: now,
      },
      update: {
        status: decision.status,
        source: CONSENT_SOURCE_BOOKING_CHECKOUT,
        capturePage: parsed.data.capturePage ?? null,
        disclosureVersion: SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
        ipAddress: ip,
        userAgent: req.headers.get('user-agent') ?? null,
        evidence: parsed.data.evidence ?? null,
        consentedAt: now,
        // A fresh affirmative tick clears a previous revocation.
        revokedAt: null,
      },
    })
  } catch (err) {
    // Never surfaced to the user as a blocking failure — the caller treats
    // this route as fire-and-forget, because consent is not a condition of
    // purchase and a booking must not fail over a compliance side-write.
    console.error('[consent/sms-customer-care] write failed:', err)
    return NextResponse.json({ recorded: false, reason: 'WRITE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ recorded: true, purpose: 'SMS_CUSTOMER_CARE', status: 'GRANTED' })
}
