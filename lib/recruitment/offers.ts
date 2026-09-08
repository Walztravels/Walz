/**
 * Walz Recruitment Hub — offers & talent pool (Release 9).
 *
 * Offers are created, sent and withdrawn only by management-role humans.
 * The candidate responds through a hashed, expiring token link; their
 * response is recorded, and staff — not the response handler — move the
 * pipeline stage. Nothing here writes stageKey.
 */

import { randomBytes } from 'crypto'
import prisma from '@/lib/db'
import { hashToken } from '@/lib/recruitment/applications'

export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'withdrawn', 'expired'] as const
export const OFFER_TOKEN_TTL_DAYS = 14
export const OFFER_COMP_TYPES = ['salary', 'hourly', 'commission', 'mixed'] as const

export function newOfferToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(24).toString('base64url')
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + OFFER_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  }
}

export function validateOfferInput(body: Record<string, unknown>):
  | { ok: true; value: { compensationType: string; compensationAmount: number | null; currency: string; compensationNotes: string | null; startDate: Date | null; terms: string | null } }
  | { ok: false; error: string } {
  const compensationType = typeof body.compensationType === 'string' ? body.compensationType : 'salary'
  if (!(OFFER_COMP_TYPES as readonly string[]).includes(compensationType)) {
    return { ok: false, error: `compensationType must be one of: ${OFFER_COMP_TYPES.join(', ')}` }
  }
  let compensationAmount: number | null = null
  if (body.compensationAmount !== undefined && body.compensationAmount !== null && body.compensationAmount !== '') {
    const n = Number(body.compensationAmount)
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      return { ok: false, error: 'compensationAmount must be a non-negative number' }
    }
    compensationAmount = n
  }
  const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : 'NGN'
  let startDate: Date | null = null
  if (body.startDate) {
    const d = new Date(String(body.startDate))
    if (isNaN(d.getTime())) return { ok: false, error: 'startDate must be a valid date' }
    startDate = d
  }
  const strOrNull = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
  return {
    ok: true,
    value: {
      compensationType,
      compensationAmount,
      currency,
      compensationNotes: strOrNull(body.compensationNotes, 5000),
      startDate,
      terms: strOrNull(body.terms, 10_000),
    },
  }
}

export async function findOfferByToken(token: string) {
  if (!token || token.length < 16 || token.length > 128) return null
  return prisma.jobOffer.findUnique({ where: { tokenHash: hashToken(token) } })
}

export function offerExpired(offer: { tokenExpiresAt: Date | null }): boolean {
  return !!offer.tokenExpiresAt && offer.tokenExpiresAt.getTime() < Date.now()
}

/**
 * Records the candidate's response. Only 'sent' offers within their token
 * window can be answered, exactly once. Never touches the pipeline stage —
 * staff act on the recorded response.
 */
export async function respondToOffer(token: string, decision: unknown, note: unknown):
  Promise<{ ok: true; status: 'accepted' | 'declined' } | { ok: false; error: string; status: number }> {
  if (decision !== 'accepted' && decision !== 'declined') {
    return { ok: false, error: 'decision must be "accepted" or "declined"', status: 400 }
  }
  const offer = await findOfferByToken(typeof token === 'string' ? token : '')
  if (!offer) return { ok: false, error: 'This offer link is not valid', status: 404 }
  if (offer.status === 'withdrawn') return { ok: false, error: 'This offer was withdrawn', status: 410 }
  if (offer.status === 'accepted' || offer.status === 'declined') {
    return { ok: false, error: 'This offer has already been answered', status: 409 }
  }
  if (offer.status !== 'sent') return { ok: false, error: 'This offer is not open for a response', status: 409 }
  if (offerExpired(offer)) return { ok: false, error: 'This offer link has expired — contact us', status: 410 }

  await prisma.jobOffer.update({
    where: { id: offer.id },
    data: {
      status: decision,
      respondedAt: new Date(),
      candidateNote: typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null,
    },
  })
  return { ok: true, status: decision }
}
