import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/db'
import { normalizePhoneE164 } from '@/lib/identity/normalize'
import { consentCaptureRateLimit } from '@/lib/rate-limit'
import {
  decideConsentWrite,
  resolveConsentSource,
  type ConsentPurpose,
  type ConsentSource,
} from '@/lib/consent/purposes'

/**
 * Shared, purpose-parameterised implementation behind POST
 * /api/consent/sms-customer-care (the only route in the customer-care A2P
 * 30907 release; a future marketing route would be a ~10-line file).
 * Each route file passes exactly ONE purpose, so a route can only ever address its own (number, purpose) row:
 * granting one purpose never creates, modifies or implies the other.
 *
 * THE GUARANTEE (unchanged from the original single route): a row is
 * written ONLY when `consent === true` arrives from a human who ticked the
 * box. Absent / false / 'true' / 1 / {} all return 200 `recorded: false`
 * and write NOTHING (no GRANTED, no NOT_GRANTED row). This helper NEVER
 * reads Lead, VisaApplication, Client or any other store to discover
 * numbers; the only number written is the one posted with the tick.
 * The client calls it fire-and-forget: consent is not a condition of
 * purchase, so a failure here must never block a booking.
 */

export interface ConsentCaptureConfig {
  /** The single purpose this route may write. */
  purpose: Extract<ConsentPurpose, 'SMS_CUSTOMER_CARE' | 'SMS_MARKETING'>
  /** Wording version stamped onto the row. */
  disclosureVersion: string
  /** Source stamped when the caller sends none / an unknown one. */
  defaultSource: ConsentSource
  /** Log tag. */
  logTag: string
}

const schema = z.object({
  /** As typed by the user; normalized SERVER-SIDE with normalizePhoneE164. */
  phone: z.string().min(1).max(32),
  /**
   * Typed `unknown` ON PURPOSE (trust boundary): decideConsentWrite applies
   * a strict `=== true`, so a malformed value fails SAFE (no row).
   */
  consent: z.unknown().optional(),
  /** Page the box was ticked on, e.g. '/book'. Audit context only. */
  capturePage: z.string().max(200).optional(),
  /** Short proof pointer, e.g. a booking reference. Audit context only. */
  evidence: z.string().max(200).optional(),
  /**
   * Optional capture surface. `unknown` so an unrecognised value never
   * 400s; resolveConsentSource() ignores anything not on the allowlist.
   */
  source: z.unknown().optional(),
})

export async function handleConsentCapture(req: NextRequest, cfg: ConsentCaptureConfig) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const limit = consentCaptureRateLimit(ip, cfg.purpose)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // One normalizer for the whole repo — the SAME utility the WhatsApp
  // Broadcast audience resolver uses.
  const normalizedNumber = normalizePhoneE164(parsed.data.phone)

  const decision = decideConsentWrite({
    checked: parsed.data.consent,
    normalizedNumber,
  })

  if (!decision.write) {
    // 200, not an error: nothing to record. NOTHING is written.
    return NextResponse.json({ recorded: false, reason: decision.reason })
  }

  const now = new Date()
  const source = resolveConsentSource(parsed.data.source, cfg.defaultSource)
  const userAgent = req.headers.get('user-agent') ?? null

  try {
    // Upsert on the (number, purpose) pair: a repeat tick re-dates one row.
    await prisma.consentRecord.upsert({
      where: {
        normalizedNumber_purpose: {
          normalizedNumber: decision.normalizedNumber,
          purpose: cfg.purpose,
        },
      },
      create: {
        normalizedNumber: decision.normalizedNumber,
        purpose: cfg.purpose,
        status: decision.status,
        source,
        capturePage: parsed.data.capturePage ?? null,
        disclosureVersion: cfg.disclosureVersion,
        ipAddress: ip,
        userAgent,
        evidence: parsed.data.evidence ?? null,
        consentedAt: now,
      },
      update: {
        status: decision.status,
        source,
        capturePage: parsed.data.capturePage ?? null,
        disclosureVersion: cfg.disclosureVersion,
        ipAddress: ip,
        userAgent,
        evidence: parsed.data.evidence ?? null,
        consentedAt: now,
        // A fresh affirmative tick clears a previous revocation.
        revokedAt: null,
      },
    })
  } catch (err) {
    // Code only — a full Prisma error can echo the invocation arguments,
    // which include the phone number.
    console.error(`[${cfg.logTag}] write failed:`, (err as { code?: string } | null)?.code ?? 'unknown')
    return NextResponse.json({ recorded: false, reason: 'WRITE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ recorded: true, purpose: cfg.purpose, status: 'GRANTED' })
}
