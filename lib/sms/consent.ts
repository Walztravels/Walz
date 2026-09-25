import prisma from '@/lib/db'
import { normalizeSmsNumber } from '@/lib/sms/normalize'
import { SMS_CUSTOMER_CARE } from '@/lib/sms/types'

/**
 * SMS_CUSTOMER_CARE consent — the single authority for send-time gating and
 * for every state change made by SMS-side code.
 *
 * ConsentRecord = CURRENT state per (number, purpose).
 * ConsentEvent  = append-only history; original proof is never destroyed.
 *
 * Fail-closed: any doubt (no record, wrong purpose, revoked, DB error) means
 * NOT allowed. Nothing here reads Lead/Client/Visa tables to "discover"
 * consent, and nothing backfills or manufactures it.
 */

const PURPOSE = SMS_CUSTOMER_CARE

// ── Gate ─────────────────────────────────────────────────────────────────────

export type SmsConsentReason =
  | 'OK'
  | 'INVALID_NUMBER'
  | 'NO_RECORD'
  | 'WRONG_PURPOSE'
  | 'NUMBER_MISMATCH'
  | 'REVOKED'
  | 'NOT_GRANTED'
  | 'LOOKUP_FAILED'

export interface SmsConsentDecision {
  allowed: boolean
  reason: SmsConsentReason
  /** Canonical recipient when normalisation succeeded. */
  e164?: string
}

/** Pure decision over an already-loaded record (unit-testable, no I/O). */
export function evaluateSmsConsent(
  record:
    | { purpose: string; status: string; revokedAt: Date | null; normalizedNumber: string }
    | null
    | undefined,
  e164: string,
): SmsConsentDecision {
  if (!record) return { allowed: false, reason: 'NO_RECORD', e164 }
  if (record.purpose !== PURPOSE) return { allowed: false, reason: 'WRONG_PURPOSE', e164 }
  if (record.normalizedNumber !== e164) return { allowed: false, reason: 'NUMBER_MISMATCH', e164 }
  if (record.revokedAt !== null || record.status === 'REVOKED') {
    return { allowed: false, reason: 'REVOKED', e164 }
  }
  if (record.status !== 'GRANTED') return { allowed: false, reason: 'NOT_GRANTED', e164 }
  return { allowed: true, reason: 'OK', e164 }
}

/**
 * THE gate. Called before EVERY outbound Customer Care SMS:
 * normalise → look up (number, SMS_CUSTOMER_CARE) → purpose/status/revokedAt/
 * number checks. Never throws; a lookup error is a refusal.
 */
export async function hasSmsCustomerCareConsent(rawRecipient: string): Promise<SmsConsentDecision> {
  const n = normalizeSmsNumber(rawRecipient)
  if (!n.ok) return { allowed: false, reason: 'INVALID_NUMBER' }
  try {
    const record = await prisma.consentRecord.findUnique({
      where: { normalizedNumber_purpose: { normalizedNumber: n.e164, purpose: PURPOSE } },
      select: { purpose: true, status: true, revokedAt: true, normalizedNumber: true },
    })
    return evaluateSmsConsent(record, n.e164)
  } catch {
    return { allowed: false, reason: 'LOOKUP_FAILED', e164: n.e164 }
  }
}

// ── Web grant (public consent form) — append-only, no anonymous re-grant ────

export type GrantOutcome = 'GRANTED_NEW' | 'ALREADY_GRANTED' | 'REGRANT_BLOCKED'

export interface GrantInput {
  e164: string
  source: string
  capturePage: string | null
  disclosureVersion: string
  ipAddress: string | null
  userAgent: string | null
  evidence: string | null
  now?: Date
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002'
}

/**
 * Apply a human tick to (number, SMS_CUSTOMER_CARE):
 *  - no row              → create GRANTED + event GRANTED
 *  - NOT_GRANTED row     → set GRANTED + event GRANTED
 *  - GRANTED row         → event GRANTED only; the ORIGINAL proof (ip, UA,
 *                          consentedAt, evidence) on the row is preserved
 *  - REVOKED row         → event REGRANT_BLOCKED; row UNCHANGED. An anonymous
 *                          POST can never undo an opt-out (anyone can type
 *                          anyone's number); re-consent needs a verified path.
 */
export async function applySmsCustomerCareGrant(input: GrantInput): Promise<GrantOutcome> {
  const now = input.now ?? new Date()
  const eventBase = {
    normalizedNumber: input.e164,
    purpose: PURPOSE,
    source: input.source,
    capturePage: input.capturePage,
    disclosureVersion: input.disclosureVersion,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    evidence: input.evidence,
    occurredAt: now,
  }
  const run = () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.consentRecord.findUnique({
        where: { normalizedNumber_purpose: { normalizedNumber: input.e164, purpose: PURPOSE } },
      })
      if (existing && (existing.revokedAt !== null || existing.status === 'REVOKED')) {
        await tx.consentEvent.create({
          data: { ...eventBase, eventType: 'REGRANT_BLOCKED', fromStatus: existing.status, toStatus: existing.status },
        })
        return 'REGRANT_BLOCKED' as const
      }
      if (existing && existing.status === 'GRANTED') {
        await tx.consentEvent.create({
          data: { ...eventBase, eventType: 'GRANTED', fromStatus: 'GRANTED', toStatus: 'GRANTED' },
        })
        return 'ALREADY_GRANTED' as const
      }
      const rowData = {
        status: 'GRANTED',
        source: input.source,
        capturePage: input.capturePage,
        disclosureVersion: input.disclosureVersion,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        evidence: input.evidence,
        consentedAt: now,
        revokedAt: null,
      }
      if (existing) {
        try {
          // Guarded: if a STOP landed between our read and this write, the row
          // is REVOKED now and must not be overwritten (P2025 = no match).
          await tx.consentRecord.update({
            where: { id: existing.id, status: { not: 'REVOKED' }, revokedAt: null },
            data: rowData,
          })
        } catch (e) {
          if ((e as { code?: string } | null)?.code !== 'P2025') throw e
          await tx.consentEvent.create({
            data: { ...eventBase, eventType: 'REGRANT_BLOCKED', fromStatus: 'REVOKED', toStatus: 'REVOKED' },
          })
          return 'REGRANT_BLOCKED' as const
        }
      } else {
        await tx.consentRecord.create({
          data: { normalizedNumber: input.e164, purpose: PURPOSE, ...rowData },
        })
      }
      await tx.consentEvent.create({
        data: { ...eventBase, eventType: 'GRANTED', fromStatus: existing?.status ?? null, toStatus: 'GRANTED' },
      })
      return 'GRANTED_NEW' as const
    })
  try {
    return await run()
  } catch (e) {
    // Two concurrent first-time ticks: the loser re-reads and takes the
    // ALREADY_GRANTED path instead of failing.
    if (isUniqueViolation(e)) return run()
    throw e
  }
}

// ── Provider-originated changes (inbound SMS) ───────────────────────────────

export type RevokeOutcome = 'REVOKED' | 'ALREADY_REVOKED' | 'DUPLICATE'

/**
 * Inbound STOP → mirror Twilio's opt-out into Walz consent.
 *  - Idempotent under Twilio retries: (providerMessageSid, 'REVOKED') is unique,
 *    so a repeat delivery is a DUPLICATE no-op.
 *  - Original proof preserved: only status + revokedAt change on the row;
 *    consentedAt / ip / UA / evidence / source stay as originally captured.
 *    The revocation provenance lives on the appended event.
 *  - A STOP from a number with no row creates a REVOKED row (honour the
 *    opt-out; fail-closed) — it is never a grant.
 */
export async function revokeSmsCustomerCare(input: {
  e164: string
  providerMessageSid: string
  source?: string
  evidence?: string | null
  now?: Date
}): Promise<RevokeOutcome> {
  const now = input.now ?? new Date()
  const source = input.source ?? 'inbound_sms_stop'
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.consentRecord.findUnique({
        where: { normalizedNumber_purpose: { normalizedNumber: input.e164, purpose: PURPOSE } },
      })
      // Unique (sid, type): a Twilio retry throws P2002 here and rolls back.
      await tx.consentEvent.create({
        data: {
          normalizedNumber: input.e164,
          purpose: PURPOSE,
          eventType: 'REVOKED',
          fromStatus: existing?.status ?? null,
          toStatus: 'REVOKED',
          source,
          evidence: input.evidence ?? null,
          providerMessageSid: input.providerMessageSid,
          occurredAt: now,
        },
      })
      if (!existing) {
        await tx.consentRecord.create({
          data: { normalizedNumber: input.e164, purpose: PURPOSE, status: 'REVOKED', source, revokedAt: now },
        })
        return 'REVOKED' as const
      }
      if (existing.status === 'REVOKED' && existing.revokedAt !== null) return 'ALREADY_REVOKED' as const
      await tx.consentRecord.update({
        where: { id: existing.id },
        data: { status: 'REVOKED', revokedAt: now },
      })
      return 'REVOKED' as const
    })
  } catch (e) {
    if (isUniqueViolation(e)) return 'DUPLICATE'
    throw e
  }
}

/**
 * START / HELP received: record the provider event ONLY. START never restores
 * Walz consent (Twilio may unblock the number at carrier level, but Walz stays
 * fail-closed until a valid SMS_CUSTOMER_CARE consent exists).
 */
export async function recordProviderSmsEvent(input: {
  e164: string
  type: 'PROVIDER_START' | 'PROVIDER_HELP'
  providerMessageSid: string
  now?: Date
}): Promise<'RECORDED' | 'DUPLICATE'> {
  try {
    await prisma.consentEvent.create({
      data: {
        normalizedNumber: input.e164,
        purpose: PURPOSE,
        eventType: input.type,
        source: input.type === 'PROVIDER_START' ? 'inbound_sms_start' : 'inbound_sms_help',
        providerMessageSid: input.providerMessageSid,
        occurredAt: input.now ?? new Date(),
      },
    })
    return 'RECORDED'
  } catch (e) {
    if (isUniqueViolation(e)) return 'DUPLICATE'
    throw e
  }
}
