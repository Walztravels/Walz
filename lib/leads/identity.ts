/**
 * Race-safe Prisma Lead creation by messaging identity (INBOX-0S.4A).
 *
 * The DB-enforced UNIQUE index on ("source", "sourceId") is the real
 * guarantee; this helper is the application half of the contract:
 * create first, and when the database reports the unique-constraint
 * conflict (P2002 — a concurrent request won the race), fetch and
 * return the canonical row instead. Check-then-create is never the
 * sole protection.
 *
 * Two simultaneous Jade/WhatsApp requests for the same (source,
 * sourceId) therefore converge on ONE Lead: exactly one create
 * succeeds; the loser resolves to the winner's row and reports
 * created: false so callers apply their update path to it.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export interface LeadIdentityResult {
  id: string
  created: boolean
}

export async function createLeadRaceSafe(
  db: Db,
  source: string,
  sourceId: string,
  data: Prisma.LeadUncheckedCreateInput,
): Promise<LeadIdentityResult> {
  try {
    const created = await db.lead.create({
      data: { ...data, source, sourceId },
      select: { id: true },
    })
    return { id: created.id, created: true }
  } catch (e) {
    if ((e as { code?: string })?.code !== 'P2002') throw e
    // A concurrent request created this identity first — resolve to it.
    const existing = await db.lead.findFirst({
      where: { source, sourceId },
      select: { id: true },
    })
    if (!existing) {
      // Pathological (winner deleted between conflict and fetch) — surface it.
      throw e
    }
    return { id: existing.id, created: false }
  }
}
