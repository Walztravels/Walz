/**
 * Secure Application Lookup — canonical verification engine.
 *
 * ONE engine for every channel: staff Admin Inbox, Jade website chat,
 * Jade WhatsApp/Instagram, and Jade voice. No channel has its own
 * verification logic; the LLM never decides record match, OTP validity,
 * or access — every security decision here is deterministic server-side.
 *
 * Core rule: a Walz Reference Number LOCATES an application. It does NOT
 * authenticate the client. Sensitive data unlocks only after verification,
 * and verification is bound to (application, channel, staff/conversation)
 * with a hard expiry — never a permanent unlock, never cross-channel.
 */

import { createHash, randomInt } from 'crypto'
import prisma from '@/lib/db'
import { getResend } from '@/lib/resend'
import {
  maskName, maskEmail, maskPhone, safeStatusLabel,
  normalizeSpokenDigits, normalizeDateAnswer, normalizePassportSuffix,
  normalizeFreeText, normalizeWalzRef,
} from './masking'

// ── Config ────────────────────────────────────────────────────────────────────

export const OTP_TTL_MS            = 10 * 60 * 1000  // 10 minutes
export const MAX_ATTEMPTS          = 5
export const LOCKOUT_MS            = 30 * 60 * 1000  // 30 minutes
export const VERIFIED_SESSION_MS   = 30 * 60 * 1000  // 30 minutes of unlocked access

export type LookupChannel = 'STAFF_SUPPORT' | 'CHAT' | 'WHATSAPP' | 'INSTAGRAM' | 'VOICE'
export type AccessReason  = 'CUSTOMER_SUPPORT' | 'APPLICATION_PROCESSING' | 'MANAGER_REVIEW' | 'DOCUMENT_REVIEW'

export const ACCESS_REASONS: AccessReason[] = ['CUSTOMER_SUPPORT', 'APPLICATION_PROCESSING', 'MANAGER_REVIEW', 'DOCUMENT_REVIEW']

// ── Audit ─────────────────────────────────────────────────────────────────────

/** Security events. OTP plaintext is NEVER logged. */
export async function auditLookupEvent(
  event: string,
  meta: {
    staffEmail?:     string | null
    applicationId?:  string | null
    conversationId?: string | null
    channel?:        string
    method?:         string | null
    detail?:         string
  },
): Promise<void> {
  const parts = [
    meta.applicationId  ? `app=${meta.applicationId}` : null,
    meta.channel        ? `channel=${meta.channel}` : null,
    meta.conversationId ? `conv=${meta.conversationId}` : null,
    meta.method         ? `method=${meta.method}` : null,
    meta.detail ?? null,
  ].filter(Boolean).join(' · ')
  await prisma.activityLog.create({
    data: {
      staffId:   null,
      staffName: meta.staffEmail ?? 'Jade AI',
      action:    event,
      detail:    parts || event,
    },
  }).catch((e: unknown) => console.error('[secure-lookup] audit failed:', e))
}

// ── Masked lookup ─────────────────────────────────────────────────────────────

export interface MaskedApplicationSummary {
  found:           true
  applicationId:   string
  walzRef:         string
  applicationType: string
  destination:     string
  status:          string          // coarse client-safe label ONLY
  maskedName:      string
  maskedEmail:     string | null
  maskedPhone:     string | null
  hasEmail:        boolean
  hasPhone:        boolean
}

export interface LookupNotFound { found: false }

/**
 * Locate an application by exact Walz Reference. Exact match only — no
 * partial or fuzzy matches are ever revealed. Returns masked data only.
 */
export async function lookupApplicationByWalzRef(
  ref: string,
  ctx: { channel: LookupChannel; staffEmail?: string | null; conversationId?: string | null },
): Promise<MaskedApplicationSummary | LookupNotFound> {
  const normalized = normalizeWalzRef(ref)
  await auditLookupEvent('APPLICATION_LOOKUP', {
    staffEmail: ctx.staffEmail, channel: ctx.channel,
    conversationId: ctx.conversationId, detail: `ref=${normalized || '(empty)'}`,
  })
  if (!normalized) return { found: false }

  const app = await prisma.visaApplication.findUnique({
    where:  { referenceNumber: normalized },
    select: {
      id: true, referenceNumber: true, destinationIso2: true, visaType: true,
      status: true, firstName: true, lastName: true, email: true, phone: true,
      isDraft: true,
    },
  })
  if (!app) return { found: false }

  await auditLookupEvent('APPLICATION_FOUND', {
    staffEmail: ctx.staffEmail, applicationId: app.id,
    channel: ctx.channel, conversationId: ctx.conversationId,
  })

  const fullName = [app.firstName, app.lastName].filter(Boolean).join(' ')
  return {
    found:           true,
    applicationId:   app.id,
    walzRef:         app.referenceNumber,
    applicationType: `${(app.destinationIso2 ?? '').toUpperCase()} ${cap(app.visaType ?? 'visa')} Visa`.trim(),
    destination:     (app.destinationIso2 ?? '').toUpperCase(),
    status:          safeStatusLabel(app.status),
    maskedName:      maskName(fullName),
    maskedEmail:     maskEmail(app.email),
    maskedPhone:     maskPhone(app.phone),
    hasEmail:        !!app.email,
    hasPhone:        !!app.phone,
  }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

// ── Verification lifecycle ────────────────────────────────────────────────────

function hashOtp(code: string, verificationId: string): string {
  return createHash('sha256').update(`${code}:${verificationId}`).digest('hex')
}

export async function createApplicationVerification(opts: {
  applicationId:   string
  channel:         LookupChannel
  staffEmail?:     string | null
  conversationId?: string | null
}): Promise<{ verificationId: string }> {
  const row = await prisma.applicationVerification.create({
    data: {
      applicationId:  opts.applicationId,
      channel:        opts.channel,
      staffEmail:     opts.staffEmail ?? null,
      conversationId: opts.conversationId ?? null,
      status:         'pending',
    },
    select: { id: true },
  })
  await auditLookupEvent('VERIFICATION_STARTED', {
    staffEmail: opts.staffEmail, applicationId: opts.applicationId,
    channel: opts.channel, conversationId: opts.conversationId,
  })
  return { verificationId: row.id }
}

async function loadVerification(verificationId: string) {
  return prisma.applicationVerification.findUnique({ where: { id: verificationId } })
}

function isLocked(v: { status: string; lockedUntil: Date | null }): boolean {
  return v.status === 'locked' && !!v.lockedUntil && v.lockedUntil.getTime() > Date.now()
}

/**
 * Generate + deliver a 6-digit OTP. Server-generated (crypto), stored only
 * as a hash, 10-minute expiry, single-use. Staff/Jade never see the code or
 * the full destination.
 */
export async function sendApplicationOtp(opts: {
  verificationId: string
  method:         'EMAIL' | 'PHONE'
}): Promise<{ ok: boolean; maskedDestination?: string | null; error?: string }> {
  const v = await loadVerification(opts.verificationId)
  if (!v) return { ok: false, error: 'VERIFICATION_NOT_FOUND' }
  if (isLocked(v)) return { ok: false, error: 'LOCKED' }

  const app = await prisma.visaApplication.findUnique({
    where:  { id: v.applicationId },
    select: { email: true, phone: true, referenceNumber: true, firstName: true },
  })
  if (!app) return { ok: false, error: 'APPLICATION_NOT_FOUND' }

  if (opts.method === 'PHONE') {
    // No SMS provider is configured in this stack. Phone delivery is
    // declined deterministically rather than pretending to send.
    return { ok: false, error: 'PHONE_DELIVERY_UNAVAILABLE' }
  }
  if (!app.email) return { ok: false, error: 'NO_EMAIL_ON_RECORD' }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await prisma.applicationVerification.update({
    where: { id: v.id },
    data: {
      method:       'EMAIL_OTP',
      otpHash:      hashOtp(code, v.id),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  })

  const resend = getResend()
  try {
    await resend.emails.send({
      from:    'Walz Travels <hello@walztravels.com>',
      to:      app.email,
      subject: `Your Walz Travels verification code`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <p style="color:#0B1F3A;font-size:15px">Hello${app.firstName ? ` ${app.firstName}` : ''},</p>
        <p style="color:#444;font-size:14px">Your verification code for application <strong>${app.referenceNumber}</strong> is:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:800;color:#0B1F3A;text-align:center;background:#f6f3ec;border-radius:8px;padding:16px">${code}</p>
        <p style="color:#888;font-size:12px">This code expires in 10 minutes and can be used once. Walz Travels staff will never ask you for your password. If you did not request this, you can ignore this email.</p>
      </div>`,
    })
  } catch (e) {
    console.error('[secure-lookup] OTP email failed:', e)
    return { ok: false, error: 'DELIVERY_FAILED' }
  }

  await auditLookupEvent('VERIFICATION_OTP_SENT', {
    staffEmail: v.staffEmail, applicationId: v.applicationId,
    channel: v.channel, conversationId: v.conversationId, method: 'EMAIL_OTP',
  })
  return { ok: true, maskedDestination: maskEmail(app.email) }
}

/** Shared failure bookkeeping: attempts, lockout, audit. */
async function recordFailure(v: { id: string; attemptCount: number; staffEmail: string | null; applicationId: string; channel: string; conversationId: string | null; method: string | null }) {
  const attempts = v.attemptCount + 1
  const lock     = attempts >= MAX_ATTEMPTS
  await prisma.applicationVerification.update({
    where: { id: v.id },
    data: {
      attemptCount: attempts,
      ...(lock ? { status: 'locked', lockedUntil: new Date(Date.now() + LOCKOUT_MS) } : {}),
    },
  })
  await auditLookupEvent(lock ? 'VERIFICATION_LOCKED' : 'VERIFICATION_FAILED', {
    staffEmail: v.staffEmail, applicationId: v.applicationId,
    channel: v.channel, conversationId: v.conversationId, method: v.method,
    detail: `attempt=${attempts}/${MAX_ATTEMPTS}`,
  })
  return lock
}

async function markVerified(v: { id: string; staffEmail: string | null; applicationId: string; channel: string; conversationId: string | null; method: string | null }) {
  const now = new Date()
  await prisma.applicationVerification.update({
    where: { id: v.id },
    data: {
      status:        'verified',
      verifiedAt:    now,
      verifiedUntil: new Date(now.getTime() + VERIFIED_SESSION_MS),
      otpHash:       null,   // single-use: consumed on success
      otpExpiresAt:  null,
    },
  })
  await auditLookupEvent('VERIFICATION_SUCCESS', {
    staffEmail: v.staffEmail, applicationId: v.applicationId,
    channel: v.channel, conversationId: v.conversationId, method: v.method,
  })
}

export interface VerifyResult {
  verified: boolean
  locked?:  boolean
  error?:   string
  verifiedUntil?: string
}

/**
 * Deterministic OTP check. Accepts spoken-digit input ("four eight two…").
 * Wrong code counts an attempt; 5 failures lock for 30 minutes; the hash is
 * consumed on success so a code can never be replayed.
 */
export async function verifyApplicationOtp(opts: {
  verificationId: string
  code:           string
}): Promise<VerifyResult> {
  const v = await loadVerification(opts.verificationId)
  if (!v) return { verified: false, error: 'VERIFICATION_NOT_FOUND' }
  if (isLocked(v)) return { verified: false, locked: true, error: 'LOCKED' }
  if (!v.otpHash) return { verified: false, error: 'NO_ACTIVE_OTP' }
  if (!v.otpExpiresAt || v.otpExpiresAt.getTime() < Date.now()) {
    return { verified: false, error: 'OTP_EXPIRED' }
  }

  const normalized = /^\d{6}$/.test(opts.code.trim())
    ? opts.code.trim()
    : normalizeSpokenDigits(opts.code)

  if (normalized.length === 6 && hashOtp(normalized, v.id) === v.otpHash) {
    await markVerified(v)
    const fresh = await loadVerification(v.id)
    return { verified: true, verifiedUntil: fresh?.verifiedUntil?.toISOString() }
  }

  const locked = await recordFailure(v)
  return { verified: false, locked, error: locked ? 'LOCKED' : 'INVALID_CODE' }
}

// ── Fallback verification (record-specific questions only) ────────────────────

export interface FallbackQuestion { questionId: string; questionText: string }

const FALLBACK_QUESTIONS: Record<string, string> = {
  dob:              'What is the date of birth on the application?',
  passport_last4:   'What are the last four characters of the passport number used?',
  destination:      'Which country is the application for?',
  application_type: 'What type of visa was applied for?',
  email_domain:     'What is the domain of the email address on the application (e.g. gmail.com)?',
}

/**
 * Pick an answerable record-specific question. The stored answer NEVER
 * leaves the server — callers receive only questionId + questionText.
 * Only record-derived questions exist — no generic "security questions".
 */
export async function getFallbackQuestion(verificationId: string): Promise<FallbackQuestion | { error: string }> {
  const v = await loadVerification(verificationId)
  if (!v) return { error: 'VERIFICATION_NOT_FOUND' }
  if (isLocked(v)) return { error: 'LOCKED' }

  const app = await prisma.visaApplication.findUnique({
    where:  { id: v.applicationId },
    select: { dateOfBirth: true, passportNumber: true, destinationIso2: true, visaType: true, email: true },
  })
  if (!app) return { error: 'APPLICATION_NOT_FOUND' }

  const candidates: string[] = []
  if (app.dateOfBirth)                        candidates.push('dob')
  if (app.passportNumber && app.passportNumber.length >= 4) candidates.push('passport_last4')
  if (app.email?.includes('@'))               candidates.push('email_domain')
  if (app.destinationIso2)                    candidates.push('destination')
  if (app.visaType)                           candidates.push('application_type')
  if (candidates.length === 0) return { error: 'NO_FALLBACK_AVAILABLE' }

  // Prefer the strongest available question (dob > passport > email domain)
  const questionId = candidates[0]
  await prisma.applicationVerification.update({
    where: { id: v.id },
    data:  { questionId, method: 'FALLBACK' },
  })
  return { questionId, questionText: FALLBACK_QUESTIONS[questionId] }
}

/**
 * Deterministic fallback answer check with channel-appropriate normalization
 * (typed and spoken forms normalize identically). The stored value is never
 * returned to any caller.
 */
export async function verifyApplicationFallback(opts: {
  verificationId: string
  answer:         string
}): Promise<VerifyResult> {
  const v = await loadVerification(opts.verificationId)
  if (!v) return { verified: false, error: 'VERIFICATION_NOT_FOUND' }
  if (isLocked(v)) return { verified: false, locked: true, error: 'LOCKED' }
  if (!v.questionId) return { verified: false, error: 'NO_ACTIVE_QUESTION' }

  const app = await prisma.visaApplication.findUnique({
    where:  { id: v.applicationId },
    select: { dateOfBirth: true, passportNumber: true, destinationIso2: true, visaType: true, email: true },
  })
  if (!app) return { verified: false, error: 'APPLICATION_NOT_FOUND' }

  let pass = false
  switch (v.questionId) {
    case 'dob': {
      const expected = app.dateOfBirth?.toISOString().slice(0, 10)
      const given    = normalizeDateAnswer(opts.answer)
      pass = !!expected && !!given && expected === given
      break
    }
    case 'passport_last4': {
      const expected = (app.passportNumber ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-4)
      const given    = normalizePassportSuffix(opts.answer).slice(-4)
      pass = expected.length === 4 && given === expected
      break
    }
    case 'destination': {
      pass = destinationMatches(app.destinationIso2 ?? '', opts.answer)
      break
    }
    case 'application_type': {
      pass = !!app.visaType && normalizeFreeText(opts.answer).includes(normalizeFreeText(app.visaType))
      break
    }
    case 'email_domain': {
      const expected = (app.email?.split('@')[1] ?? '').toLowerCase()
      pass = !!expected && normalizeFreeText(opts.answer).replace(/\s/g, '') === expected
      break
    }
  }

  if (pass) {
    await markVerified(v)
    const fresh = await loadVerification(v.id)
    return { verified: true, verifiedUntil: fresh?.verifiedUntil?.toISOString() }
  }
  const locked = await recordFailure(v)
  return { verified: false, locked, error: locked ? 'LOCKED' : 'INCORRECT_ANSWER' }
}

const ISO_COUNTRY_NAMES: Record<string, string[]> = {
  GB: ['uk', 'united kingdom', 'britain', 'great britain', 'england'],
  US: ['usa', 'united states', 'america', 'us'],
  CA: ['canada'], AE: ['uae', 'dubai', 'united arab emirates'], SH: ['schengen'],
}
function destinationMatches(iso2: string, answer: string): boolean {
  const a = normalizeFreeText(answer)
  if (!a) return false
  const code = iso2.toUpperCase()
  if (a === code.toLowerCase()) return true
  return (ISO_COUNTRY_NAMES[code] ?? []).some(n => a === n || a.includes(n))
}

// ── Verified views (session-bound, channel-appropriate DTOs) ──────────────────

export interface JadeVerifiedApplicationView {
  walzRef:                 string
  applicationType:         string
  destination:             string
  clientVisibleStatus:     string
  submittedAt?:            string | null
  appointmentAt?:          string | null
  outstandingRequirements: string[]
  nextAction?:             string | null
  lastPublicUpdate?:       string | null
}

/**
 * Validate a verification for use RIGHT NOW by a specific caller.
 * Session-bound: same staff member (STAFF_SUPPORT) or same conversation
 * (Jade channels), unexpired, verified. One channel's verification never
 * unlocks another channel.
 */
export async function assertVerifiedAccess(opts: {
  verificationId:  string
  staffEmail?:     string | null
  conversationId?: string | null
}): Promise<{ ok: true; applicationId: string; channel: string; verifiedUntil: Date } | { ok: false; error: string }> {
  const v = await loadVerification(opts.verificationId)
  if (!v) return { ok: false, error: 'VERIFICATION_NOT_FOUND' }
  if (v.status !== 'verified' || !v.verifiedUntil) return { ok: false, error: 'NOT_VERIFIED' }
  if (v.verifiedUntil.getTime() < Date.now()) return { ok: false, error: 'VERIFICATION_EXPIRED' }
  // Binding: staff verifications belong to the verifying staff member only
  if (v.channel === 'STAFF_SUPPORT') {
    if (!opts.staffEmail || opts.staffEmail.toLowerCase() !== (v.staffEmail ?? '').toLowerCase()) {
      return { ok: false, error: 'NOT_YOUR_VERIFICATION' }
    }
  } else {
    // Jade channels: bound to the same conversation/call session
    if (!opts.conversationId || opts.conversationId !== v.conversationId) {
      return { ok: false, error: 'WRONG_CONVERSATION' }
    }
  }
  return { ok: true, applicationId: v.applicationId, channel: v.channel, verifiedUntil: v.verifiedUntil }
}

/**
 * Narrow Jade DTO — client-safe fields only. Never includes passport
 * numbers, bank/financial data, raw documents, internal or staff notes,
 * or supplier identifiers. This is the ONLY application shape that may
 * enter the LLM context.
 */
export async function getJadeVerifiedApplicationView(opts: {
  verificationId: string
  conversationId: string
}): Promise<JadeVerifiedApplicationView | { error: string }> {
  const access = await assertVerifiedAccess({ verificationId: opts.verificationId, conversationId: opts.conversationId })
  if (!access.ok) return { error: access.error }

  const app = await prisma.visaApplication.findUnique({
    where:  { id: access.applicationId },
    select: {
      referenceNumber: true, destinationIso2: true, visaType: true, status: true,
      statusMessage: true, appointmentDate: true, updatedAt: true, createdAt: true,
    },
  }).catch(() => null)
  if (!app) return { error: 'APPLICATION_NOT_FOUND' }

  await auditLookupEvent('JADE_APPLICATION_STATUS_DISCLOSED', {
    applicationId: access.applicationId, channel: access.channel, conversationId: opts.conversationId,
  })

  // Outstanding requirements come from the client-visible status message only
  // (the status source of truth) — never invented, never from internal notes.
  const coarse = safeStatusLabel(app.status)
  const outstanding = coarse === 'Documents Required' && app.statusMessage ? [app.statusMessage] : []
  return {
    walzRef:                 app.referenceNumber,
    applicationType:         `${(app.destinationIso2 ?? '').toUpperCase()} ${cap(app.visaType ?? 'visa')} Visa`,
    destination:             (app.destinationIso2 ?? '').toUpperCase(),
    clientVisibleStatus:     coarse,
    submittedAt:             app.createdAt?.toISOString() ?? null,
    appointmentAt:           app.appointmentDate?.toISOString() ?? null,
    outstandingRequirements: outstanding,
    nextAction:              outstanding.length > 0 ? outstanding[0] : null,
    lastPublicUpdate:        app.statusMessage ?? app.updatedAt?.toISOString() ?? null,
  }
}
