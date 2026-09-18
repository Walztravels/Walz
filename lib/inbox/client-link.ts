/**
 * ConversationClientLink persistence (UX-4.1A).
 *
 * The ONLY writer for the server-authoritative conversation→client link
 * table. Append-only philosophy: a changed link deactivates the old row
 * (active=false) and inserts a NEW row — history is never deleted. The DB
 * enforces at most one active row per conversation via the partial unique
 * index uq_conversation_client_link_active, which also makes the
 * create-catch-conflict path here race-safe.
 *
 * This module deliberately imports ONLY prisma so the secure-lookup
 * verification path can call it without pulling inbox authz / Chatwoot /
 * Supabase modules into that dependency graph.
 */

import prisma from '@/lib/db'

export type ConversationLinkMethod =
  | 'otp_verified' | 'fallback_verified' | 'admin_manual' | 'webhook_backfill'

export interface UpsertConversationClientLinkInput {
  chatwootConversationId: number
  linkMethod:             ConversationLinkMethod
  linkedBy?:              string | null
  verificationId?:        string | null
  visaApplicationId?:     string | null
  supabaseLeadId?:        string | null
  prismaLeadId?:          string | null
  userId?:                string | null
  clientAccountId?:       string | null
}

export type UpsertConversationClientLinkResult =
  | { ok: true; linkId: string; replacedLinkId?: string }
  | { ok: false; error: string }

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null
  return err?.code === 'P2002' || /unique|duplicate key|23505/i.test(err?.message ?? '')
}

/**
 * Race-safe upsert: create the active row; on a unique-index conflict
 * (another writer won), re-read and update/replace the active row instead.
 * Never throws — callers treat a failure as non-fatal (verification
 * responses must not fail because a link write failed).
 */
export async function upsertConversationClientLink(
  input: UpsertConversationClientLinkInput,
): Promise<UpsertConversationClientLinkResult> {
  try {
    if (!Number.isInteger(input.chatwootConversationId) || input.chatwootConversationId <= 0) {
      return { ok: false, error: 'INVALID_CONVERSATION_ID' }
    }

    const data = {
      chatwootConversationId: input.chatwootConversationId,
      linkMethod:             input.linkMethod,
      linkedBy:               input.linkedBy ?? null,
      verificationId:         input.verificationId ?? null,
      visaApplicationId:      input.visaApplicationId ?? null,
      supabaseLeadId:         input.supabaseLeadId ?? null,
      prismaLeadId:           input.prismaLeadId ?? null,
      userId:                 input.userId ?? null,
      clientAccountId:        input.clientAccountId ?? null,
      active:                 true,
    }

    const applyOverExisting = async (): Promise<UpsertConversationClientLinkResult> => {
      const existing = await prisma.conversationClientLink.findFirst({
        where:   { chatwootConversationId: input.chatwootConversationId, active: true },
        orderBy: { createdAt: 'desc' },
      })
      if (!existing) {
        const created = await prisma.conversationClientLink.create({ data, select: { id: true } })
        return { ok: true, linkId: created.id }
      }
      const sameTarget =
        (existing.visaApplicationId ?? null) === (data.visaApplicationId ?? null)
      if (sameTarget) {
        // Method precedence: a manual re-link never downgrades a row that
        // was established through client verification — the verified
        // metadata (linkMethod + verificationId) is the stronger claim.
        if (existing.verificationId && !data.verificationId) {
          return { ok: true, linkId: existing.id }
        }
        // Same application — refresh the verification/actor metadata in place.
        const updated = await prisma.conversationClientLink.update({
          where: { id: existing.id },
          data:  {
            linkMethod:     data.linkMethod,
            linkedBy:       data.linkedBy,
            verificationId: data.verificationId ?? existing.verificationId,
            supabaseLeadId: data.supabaseLeadId ?? existing.supabaseLeadId,
            prismaLeadId:   data.prismaLeadId ?? existing.prismaLeadId,
            userId:         data.userId ?? existing.userId,
            clientAccountId: data.clientAccountId ?? existing.clientAccountId,
          },
          select: { id: true },
        })
        return { ok: true, linkId: updated.id }
      }
      // Different target — append-only: deactivate old row + insert new row
      // ATOMICALLY (security review M3) so a mid-sequence failure can never
      // leave the conversation with zero active link rows.
      const [, created] = await prisma.$transaction([
        prisma.conversationClientLink.update({
          where: { id: existing.id },
          data:  { active: false },
        }),
        prisma.conversationClientLink.create({ data, select: { id: true } }),
      ])
      return { ok: true, linkId: created.id, replacedLinkId: existing.id }
    }

    // Bounded retry: any create can lose a race to a concurrent writer
    // (partial unique index on active rows is the backstop); one converge
    // pass after a conflict is enough — a second conflict returns failure.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const existing = await prisma.conversationClientLink.findFirst({
          where: { chatwootConversationId: input.chatwootConversationId, active: true },
          select: { id: true },
        })
        if (existing) return await applyOverExisting()
        const created = await prisma.conversationClientLink.create({ data, select: { id: true } })
        return { ok: true, linkId: created.id }
      } catch (e) {
        if (!isUniqueViolation(e)) throw e
        // A concurrent writer won — loop once and converge on their row.
      }
    }
    return { ok: false, error: 'LINK_WRITE_CONFLICT' }
  } catch (e) {
    console.warn('[client-context] ConversationClientLink upsert failed:', e)
    return { ok: false, error: 'LINK_WRITE_FAILED' }
  }
}

/**
 * Persist-on-verify hook — called from the secure-lookup verification
 * success path. Additive and failure-tolerant by contract: it never
 * throws and its failure never fails the verification response. Skips
 * silently when the verification has no numeric Chatwoot conversation
 * binding (e.g. Jade voice call sessions).
 */
export async function persistLinkOnVerificationSuccess(v: {
  id:             string
  applicationId:  string
  staffEmail:     string | null
  conversationId: string | null
  method:         string | null
}): Promise<void> {
  try {
    const convId = Number(v.conversationId)
    if (!v.conversationId || !Number.isInteger(convId) || convId <= 0) return
    const linkMethod: ConversationLinkMethod =
      v.method === 'FALLBACK' ? 'fallback_verified' : 'otp_verified'
    const result = await upsertConversationClientLink({
      chatwootConversationId: convId,
      linkMethod,
      linkedBy:          v.staffEmail ?? null,
      verificationId:    v.id,
      visaApplicationId: v.applicationId,
    })
    if (!result.ok) {
      console.warn('[client-context] persist-on-verify link write skipped:', result.error)
    }
  } catch (e) {
    console.warn('[client-context] persist-on-verify failed (verification unaffected):', e)
  }
}
