/**
 * Client Profile Completeness (Client Action Centre — shared layer).
 *
 * Every commercial Action Centre feature (Request Payment, Create Quote,
 * Visa Form; Itinerary Request to follow) needs an answer to TWO distinct
 * questions that earlier releases conflated into one:
 *
 *   1. IDENTITY STATE — "who is this customer?" (resolveClientActionContext
 *      in lib/inbox/client-context.ts: VERIFIED / LINKED / HEURISTIC /
 *      UNRESOLVED). Unchanged by this module.
 *   2. PROFILE COMPLETENESS — "do we have the data THIS action needs?" A
 *      VERIFIED/LINKED client can legitimately have an incomplete profile
 *      (e.g. linked via OTP verification with no phone on file yet). Prior
 *      to this module, Create Quote and Visa Form answered "no" to this by
 *      returning CLIENT_IDENTITY_REQUIRED with "link the client first" —
 *      wrong: the client IS already linked, the PROFILE is what's thin.
 *
 * This module is the ONE place that (a) resolves a canonical name/email/
 * phone for a conversation's linked client (blending the Chatwoot-derived
 * ctx.contact with whichever CRM record is actually linked) and (b)
 * evaluates that canonical profile against a caller-supplied requirement
 * list. It does not decide requirements itself — each feature's own
 * provider/action rules stay in that feature's own file (this is a shared
 * EVALUATOR, not a new source of business rules).
 *
 * Precedence (derived from the existing identity-linking architecture, not
 * invented here):
 *   - lib/inbox/client-context.ts's LINKED branch hydrates at most ONE of
 *     ctx.user / ctx.clientAccount / ctx.prismaLead per conversation today
 *     — see lib/inbox/client-link.ts and the client-context route's
 *     link_existing ('user'|'clientAccount'|'lead' sets exactly one FK) and
 *     create_new (prismaLeadId only) branches. A User account is a
 *     registered platform login (strongest claim), a ClientAccount is a
 *     portal-only account, a Lead is a prospect record (weakest) — so this
 *     module resolves ties in that order: user > clientAccount > prismaLead.
 *   - Chatwoot's own ctx.contact is consulted LAST, only for fields none of
 *     the linked records carry — it is transient per-message metadata, not
 *     a durable CRM record.
 *   - Structurally at most one of the three linked records should be
 *     non-null per conversation (see above), so a cross-record VALUE
 *     disagreement should never happen in practice — but this module
 *     checks for it defensively rather than assuming the invariant holds
 *     forever, and NEVER silently picks a winner when it does disagree.
 */

import prisma from '@/lib/db'
import type { ClientActionContext } from '@/lib/inbox/client-context'

export type ProfileField = 'name' | 'email' | 'phone'
export type LinkedRecordKind = 'user' | 'clientAccount' | 'prismaLead' | 'visaApplication'

export interface LinkedRecordRef { kind: LinkedRecordKind; id: string }

export interface CanonicalFieldValue { value: string; source: LinkedRecordKind | 'contact' }

export interface CanonicalContactResult {
  /** Best-known value per field, and which source it came from — for
   *  display/prefill AND for the actual value features should USE (not
   *  ctx.contact alone, which may be thinner than the canonical profile). */
  fields: Record<ProfileField, CanonicalFieldValue | null>
  /** The ONE record a mutation may write missing fields into. Null only
   *  when the conversation carries NONE of user/clientAccount/prismaLead/
   *  application (e.g. a HEURISTIC-only resolution never reaches this
   *  module at all — VERIFIED/LINKED always carries at least a link row).
   *  A 'visaApplication' target (see below) covers the OTP-VERIFIED-only
   *  case — see the visaApplication branch in resolveCanonicalContact. */
  target: LinkedRecordRef | null
  /** Populated only if two linked records disagree on the SAME field's
   *  value — a data-integrity conflict this module refuses to resolve by
   *  guessing. Structurally should stay empty (see file header). */
  crossRecordConflicts: Array<{ field: ProfileField; values: Partial<Record<LinkedRecordKind, string>> }>
}

export interface ProfileCompleteness {
  complete: boolean
  missingFields: ProfileField[]
  /** Every field we DO have (whether required or not), for display/prefill. */
  availableFields: Partial<Record<ProfileField, string>>
  /** QA gap fix: threaded straight from CanonicalContactResult.crossRecordConflicts
   *  (see its doc comment) — a genuine cross-record data-integrity disagreement,
   *  distinct from an ordinarily-missing field. Structurally should stay empty;
   *  callers must render this as a distinct warning, never as plain "missing". */
  crossRecordConflicts: CanonicalContactResult['crossRecordConflicts']
}

const FIELDS: ProfileField[] = ['name', 'email', 'phone']

function blank(s: string | null | undefined): boolean {
  return s == null || s.trim() === ''
}

/**
 * Resolve the canonical name/email/phone for a conversation's ALREADY-
 * resolved ClientActionContext. Read-only (one extra targeted prisma read
 * per linked record, only for the field client-context.ts's own DTOs don't
 * already carry — phone). Never mutates anything.
 */
export async function resolveCanonicalContact(ctx: ClientActionContext): Promise<CanonicalContactResult> {
  type Rec = { kind: LinkedRecordKind; id: string; name: string | null; email: string | null; phone: string | null }
  const records: Rec[] = []

  // Fail closed on the EXTRA phone read only (never throw) — a lookup
  // failure degrades to "phone unknown for this record", exactly like the
  // rest of this identity layer degrades rather than throws (see
  // resolveClientActionContext's own .catch(() => null) hydration calls).
  if (ctx.user) {
    let phone: string | null = null
    try {
      const row = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { phone: true } })
      phone = row?.phone ?? null
    } catch { /* degrade to null — never throw */ }
    records.push({ kind: 'user', id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, phone })
  }
  if (ctx.clientAccount) {
    let phone: string | null = null
    try {
      const row = await prisma.clientAccount.findUnique({ where: { id: ctx.clientAccount.id }, select: { phone: true } })
      phone = row?.phone ?? null
    } catch { /* degrade to null — never throw */ }
    records.push({ kind: 'clientAccount', id: ctx.clientAccount.id, name: ctx.clientAccount.name, email: ctx.clientAccount.email, phone })
  }
  if (ctx.prismaLead) {
    let phone: string | null = null
    try {
      const row = await prisma.lead.findUnique({ where: { id: ctx.prismaLead.id }, select: { whatsapp: true } })
      phone = row?.whatsapp ?? null
    } catch { /* degrade to null — never throw */ }
    records.push({ kind: 'prismaLead', id: ctx.prismaLead.id, name: ctx.prismaLead.name, email: ctx.prismaLead.email, phone })
  }

  // Task A gap fix: a client VERIFIED purely via OTP against a specific
  // VisaApplication carries a ConversationClientLink with ONLY
  // visaApplicationId set — no userId/clientAccountId/prismaLeadId at all.
  // Traced end to end: lib/secure-lookup/service.ts's markVerified() (the
  // completion of EVERY OTP/fallback verification) unconditionally calls
  // persistLinkOnVerificationSuccess({ applicationId, ... }) in
  // lib/inbox/client-link.ts, which writes a link row with only
  // visaApplicationId — never userId/clientAccountId/prismaLeadId, because
  // none of those are ever passed in. lib/inbox/client-context.ts's LINKED
  // branch hydrates ctx.application from exactly that column. So this is
  // not a rare edge case — it is the standard OTP-verification-against-an-
  // existing-case path, and until this fix it had NO writable canonical
  // target (resolveCanonicalContact's `target` stayed null, and
  // updateClientProfile failed closed with NO_LINKED_RECORD for it).
  //
  // Only reached when NONE of the three stronger identity types resolved
  // above are present — this never changes precedence for a real
  // User/ClientAccount/Lead, it only fills the previously-unhandled gap.
  if (records.length === 0 && ctx.application) {
    let row: { firstName: string | null; middleName: string | null; lastName: string | null; email: string | null; phone: string | null } | null = null
    try {
      row = await prisma.visaApplication.findUnique({
        where: { id: ctx.application.id },
        select: { firstName: true, middleName: true, lastName: true, email: true, phone: true },
      })
    } catch { /* degrade to null — never throw */ }
    if (row) {
      // Canonical display name is firstName+lastName only (matches the
      // convention already used when a case is CREATED — see
      // lib/action-centre/visa-form.ts's createVisaCase nameParts split —
      // middleName is a distinct passport-form field, not part of the
      // conversational "name").
      const joinedName = [row.firstName, row.lastName].filter(p => p && p.trim()).join(' ').trim()
      records.push({
        kind: 'visaApplication', id: ctx.application.id,
        name: joinedName || null, email: row.email, phone: row.phone,
      })
    }
  }

  const PRECEDENCE: LinkedRecordKind[] = ['user', 'clientAccount', 'prismaLead', 'visaApplication']
  const ordered = PRECEDENCE
    .map(kind => records.find(r => r.kind === kind))
    .filter((r): r is Rec => !!r)

  const fields = {} as Record<ProfileField, CanonicalFieldValue | null>
  const crossRecordConflicts: CanonicalContactResult['crossRecordConflicts'] = []

  for (const field of FIELDS) {
    const distinctValues: Partial<Record<LinkedRecordKind, string>> = {}
    for (const r of ordered) {
      if (!blank(r[field])) distinctValues[r.kind] = r[field]!.trim()
    }
    const uniqueVals = new Set(Object.values(distinctValues))
    if (uniqueVals.size > 1) {
      // Two linked records disagree — never guess a winner (see file header:
      // structurally this shouldn't happen, but if it ever does, surface it).
      crossRecordConflicts.push({ field, values: distinctValues })
      fields[field] = null
      continue
    }

    const fromRecord = ordered.find(r => !blank(r[field]))
    if (fromRecord) {
      fields[field] = { value: fromRecord[field]!.trim(), source: fromRecord.kind }
    } else if (!blank(ctx.contact?.[field] ?? null)) {
      fields[field] = { value: ctx.contact![field]!.trim(), source: 'contact' }
    } else {
      fields[field] = null
    }
  }

  const target: LinkedRecordRef | null = ordered.length > 0 ? { kind: ordered[0].kind, id: ordered[0].id } : null

  return { fields, target, crossRecordConflicts }
}

/**
 * Evaluate a canonical contact against a caller-specified requirement list.
 * Pure — no I/O. `required` is provider/action-specific and lives with each
 * feature (e.g. Paystack VA requires all three; Stripe/Flutterwave require
 * none; Create Quote and Visa Form require name+email) — this function
 * never invents or hard-codes any feature's requirements.
 */
export function evaluateProfileCompleteness(
  canonical: CanonicalContactResult,
  required: ProfileField[],
): ProfileCompleteness {
  const availableFields: Partial<Record<ProfileField, string>> = {}
  for (const f of FIELDS) {
    const v = canonical.fields[f]
    if (v) availableFields[f] = v.value
  }
  const missingFields = required.filter(f => !canonical.fields[f])
  return { complete: missingFields.length === 0, missingFields, availableFields, crossRecordConflicts: canonical.crossRecordConflicts }
}
