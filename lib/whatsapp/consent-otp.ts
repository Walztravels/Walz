/**
 * WhatsApp Broadcast V1.2 P1 FIX — proof-of-possession OTP engine for the
 * public /whatsapp/preferences SUBSCRIBE flow.
 *
 * Added after independent security review found the original flow wrote
 * WhatsAppConsent.SUBSCRIBED for any phone number an unauthenticated
 * caller typed in, with zero proof the submitter controls that number.
 * ONLY verifyOtp()'s success path may cause a SUBSCRIBED write — see
 * app/api/whatsapp/preferences/verify-code/route.ts, the sole caller.
 *
 * Conventions mirror lib/secure-lookup/service.ts's already-reviewed
 * ApplicationVerification OTP flow (6-digit crypto.randomInt code,
 * sha256(code + ':' + rowId) hashing so every row's hash is unique without
 * a separate server-wide pepper, bounded attempts, lockout) — a genuinely
 * different table for a genuinely different purpose (phone-number
 * possession here vs. visa-application identity there), so NOT reused
 * directly, but deliberately not reinvented differently either.
 *
 * ── WHAT THIS FILE NEVER DOES ────────────────────────────────────────────
 *  - Never stores the plaintext code — only codeHash.
 *  - Never logs a phone number or a code (only a masked number, via
 *    lib/secure-lookup/masking.ts's maskPhone).
 *  - Never writes WhatsAppConsent itself — callers do that only after this
 *    module reports { verified: true }.
 *  - Never reveals, to a caller of sendOtp()/verifyOtp(), whether a number
 *    has any prior history — every outcome that isn't a malformed request
 *    is reported through the same shape by the route layer.
 */

import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto'
import prisma from '@/lib/db'
import { sendOtpViaTwilio, twilioOtpConfigured } from '@/lib/twilio-whatsapp'
import { maskPhone } from '@/lib/secure-lookup/masking'

export const OTP_PURPOSE = 'WHATSAPP_MARKETING_SUBSCRIBE' as const
export const OTP_TTL_MS = 10 * 60 * 1000 // ~10 minutes
export const OTP_MAX_ATTEMPTS = 5
/** Minimum time between two sends to the SAME number. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000
/** Hard cap on how many codes one number may be sent in the window below. */
export const OTP_MAX_SENDS_PER_WINDOW = 5
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function hashOtp(code: string, verificationId: string): string {
  return createHash('sha256').update(`${code}:${verificationId}`).digest('hex')
}

function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export type SendOtpOutcome =
  | { outcome: 'SENT' }
  | { outcome: 'COOLDOWN'; retryAfterMs: number }
  | { outcome: 'MAX_SENDS_EXCEEDED' }
  | { outcome: 'NOT_CONFIGURED' }

/**
 * Generate, persist (hashed), and attempt delivery of a fresh OTP.
 *
 * WhatsApp Broadcast V1.2.1: delivery moved from direct Meta Cloud API to
 * Twilio (the provider actually used for the rest of Walz's WhatsApp
 * infrastructure — see lib/twilio-whatsapp.ts's sendOtpViaTwilio()). The
 * OTP security engine below (hashing, expiry, attempts, lockout, resend
 * cooldown, atomic consumption) is completely UNCHANGED by this — only the
 * transport call changed.
 *
 * FAILS CLOSED: returns NOT_CONFIGURED (never a silent free-text send, never
 * a fake success) when either Twilio's credentials or the approved OTP
 * Content Template (TWILIO_WHATSAPP_OTP_CONTENT_SID) are not configured —
 * see sendOtpViaTwilio()'s doc comment for why this must be an approved
 * template, never free text.
 *
 * Deliberately does NOT distinguish "Twilio rejected this specific number"
 * from a genuine send — both return SENT to the caller, and the route
 * layer answers the HTTP caller identically either way, so a failed Twilio
 * delivery for an exotic reason never becomes a signal about the number.
 * COOLDOWN and MAX_SENDS_EXCEEDED are safe to report distinctly: both are
 * facts about requests already made (by whoever is calling now), not about
 * Walz's own data on that number.
 */
export async function sendOtp(input: {
  normalizedNumber: string
  capturePage: string | null
  disclosureVersion: string | null
  ipAddress: string | null
  userAgent: string | null
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}): Promise<SendOtpOutcome> {
  if (!twilioOtpConfigured()) return { outcome: 'NOT_CONFIGURED' }

  const now = Date.now()
  const recent = await prisma.whatsAppConsentVerification.findMany({
    where: { normalizedNumber: input.normalizedNumber, purpose: OTP_PURPOSE, createdAt: { gte: new Date(now - OTP_SEND_WINDOW_MS) } },
    select: { createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: OTP_MAX_SENDS_PER_WINDOW + 1,
  })
  if (recent.length > 0) {
    const sinceLast = now - recent[0].createdAt.getTime()
    if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
      return { outcome: 'COOLDOWN', retryAfterMs: OTP_RESEND_COOLDOWN_MS - sinceLast }
    }
  }
  if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
    return { outcome: 'MAX_SENDS_EXCEEDED' }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const verificationId = randomUUID()
  const codeHash = hashOtp(code, verificationId)

  await prisma.whatsAppConsentVerification.create({
    data: {
      id: verificationId,
      normalizedNumber: input.normalizedNumber,
      purpose: OTP_PURPOSE,
      codeHash,
      expiresAt: new Date(now + OTP_TTL_MS),
      maxAttempts: OTP_MAX_ATTEMPTS,
      capturePage: input.capturePage,
      disclosureVersion: input.disclosureVersion,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  })

  try {
    const result = await sendOtpViaTwilio(input.normalizedNumber, code, input.fetchImpl)
    if (!result.ok) {
      // NEVER log the code or the full number — masked only.
      console.warn('[whatsapp-otp] Twilio send failed for', maskPhone(input.normalizedNumber), result.errorCode, result.errorMessage)
    }
  } catch (e) {
    console.warn('[whatsapp-otp] Twilio send threw for', maskPhone(input.normalizedNumber), (e as Error)?.message)
  }
  // Outcome is SENT regardless of the Twilio result above — see doc comment.
  return { outcome: 'SENT' }
}

export type VerifyOtpOutcome =
  | { outcome: 'VERIFIED'; capturePage: string | null; disclosureVersion: string | null }
  | { outcome: 'INVALID' }

/**
 * Check a submitted code against the MOST RECENT verification row for this
 * number. Every failure path (no row, expired, locked, wrong code,
 * exceeded attempts, already consumed, lost the concurrent-consume race)
 * returns the SAME `{ outcome: 'INVALID' }` — deliberately un-differentiated
 * so no combination of requests can be used to fingerprint which failure
 * mode occurred, which would leak more than "the code you typed didn't work".
 */
export async function verifyOtp(input: { normalizedNumber: string; code: string }): Promise<VerifyOtpOutcome> {
  if (!/^\d{6}$/.test(input.code)) return { outcome: 'INVALID' }

  const row = await prisma.whatsAppConsentVerification.findFirst({
    where: { normalizedNumber: input.normalizedNumber, purpose: OTP_PURPOSE },
    orderBy: { createdAt: 'desc' },
  })
  if (!row) return { outcome: 'INVALID' }
  if (row.consumedAt) return { outcome: 'INVALID' }
  if (row.lockedAt) return { outcome: 'INVALID' }
  if (row.attempts >= row.maxAttempts) return { outcome: 'INVALID' }
  if (row.expiresAt.getTime() < Date.now()) return { outcome: 'INVALID' }

  if (!hashesEqual(hashOtp(input.code, row.id), row.codeHash)) {
    const updated = await prisma.whatsAppConsentVerification.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { attempts: { increment: 1 } },
    })
    if (updated.count > 0) {
      const fresh = await prisma.whatsAppConsentVerification.findUnique({ where: { id: row.id }, select: { attempts: true, maxAttempts: true, lockedAt: true } })
      if (fresh && fresh.attempts >= fresh.maxAttempts && !fresh.lockedAt) {
        await prisma.whatsAppConsentVerification.updateMany({
          where: { id: row.id, lockedAt: null },
          data: { lockedAt: new Date() },
        })
      }
    }
    return { outcome: 'INVALID' }
  }

  // ── THE CONCURRENCY GUARD ────────────────────────────────────────────
  // Exactly one concurrent request can win this guarded update — a second
  // simultaneous submission of the SAME correct code finds consumedAt
  // already non-null (count === 0) and is correctly turned away, even
  // though its own code comparison above also matched.
  const consumed = await prisma.whatsAppConsentVerification.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  if (consumed.count === 0) return { outcome: 'INVALID' }

  return { outcome: 'VERIFIED', capturePage: row.capturePage, disclosureVersion: row.disclosureVersion }
}
