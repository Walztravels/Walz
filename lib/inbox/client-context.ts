/**
 * Conversation → client resolution (UX-4.1A — Client Action Centre foundation).
 *
 * ONE server-authoritative answer to "which client is this conversation
 * about?", shared by the client-context API route (and, in 4.1B, the Quick
 * Actions). Decision order is strict:
 *
 *   1. AUTHZ FIRST — the caller must pass the existing inbox RBAC
 *      (checkInboxPermission + checkConversationAccess). Indeterminate
 *      access DENIES. No identity data is touched before this gate.
 *   2. LINK TABLE — an active ConversationClientLink row is the truth.
 *      resolution LINKED, upgraded to VERIFIED when the row carries a
 *      verificationId whose ApplicationVerification is status 'verified'.
 *   3. HEURISTICS (no link row) — conservative, exact-match-only:
 *        - Supabase leads by chatwoot_conversation_id (service-role client,
 *          same as the inbox routes). Multiple candidate rows → UNRESOLVED.
 *        - Exact-normalized email → Prisma User / ClientAccount / Lead, and
 *          ONLY when exactly one row matches (the customer-identity
 *          ambiguity philosophy: never guess between candidates).
 *        - Phone values that are PSID-shaped are never treated as phones,
 *          and there is NO phone-suffix/tail matching of any kind.
 *      Every heuristic derivation is recorded in ambiguityReasons.
 *   4. FAIL CLOSED — any resolver error yields UNRESOLVED, never a guess
 *      and never a throw.
 */

import type { AdminSession } from '@/lib/admin-auth'
import prisma from '@/lib/db'
import { getSupabaseAdmin } from '@/lib/supabase'
import { adminChatwootOrNull } from '@/lib/chatwoot/config'
import { checkInboxPermission, checkConversationAccess } from '@/lib/inbox/authz'
import { safeStatusLabel } from '@/lib/secure-lookup/masking'
import { normalizeEmail, normalizePhoneE164, isPsidLike } from '@/lib/identity/normalize'

// ── DTOs (the ONLY shapes that may leave the server for this feature) ────────

export type ClientResolution = 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'

export interface ClientContactDTO { name: string | null; email: string | null; phone: string | null }
export interface ClientLeadDTO    { id: string; name: string | null; email: string | null; phone: string | null }
export interface ClientPersonDTO  { id: string; name: string | null; email: string | null }
export interface ClientApplicationDTO {
  id: string; walzRef: string; applicationType: string; status: string  // coarse client-safe label only
}
export interface ClientLinkDTO {
  id: string; linkMethod: string; linkedBy: string | null
  verificationId: string | null; createdAt: string
}

export interface ClientActionContext {
  conversationId:   number
  contact:          ClientContactDTO | null
  // Identity fields below are populated ONLY at LINKED/VERIFIED resolution.
  // Heuristic derivations live in heuristicCandidates so no consumer can
  // mistake a guess for an established identity by checking `user != null`
  // instead of `resolution` (security review L2).
  supabaseLead:     ClientLeadDTO | null
  prismaLead:       ClientPersonDTO | null
  user:             ClientPersonDTO | null
  clientAccount:    ClientPersonDTO | null
  application:      ClientApplicationDTO | null
  link:             ClientLinkDTO | null
  heuristicCandidates: {
    supabaseLead:  ClientLeadDTO | null
    prismaLead:    ClientPersonDTO | null
    user:          ClientPersonDTO | null
    clientAccount: ClientPersonDTO | null
  } | null
  resolution:       ClientResolution
  ambiguityReasons: string[]
}

export type ResolveClientActionResult =
  | { ok: true; context: ClientActionContext }
  | { ok: false; status: 401 | 403; error: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }

async function fetchChatwootContact(conversationId: number): Promise<ClientContactDTO | null> {
  const cw = adminChatwootOrNull()
  if (!cw) return null
  try {
    const res = await fetch(
      `${cw.base}/api/v1/accounts/${cw.accountId}/conversations/${conversationId}`,
      { headers: { api_access_token: cw.token }, signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return null
    const raw = await res.json() as {
      meta?: { sender?: { name?: string; email?: string; phone_number?: string } }
    }
    const sender = raw?.meta?.sender
    if (!sender) return null
    const rawPhone = sender.phone_number ?? null
    return {
      name:  sender.name ?? null,
      email: normalizeEmail(sender.email) ?? sender.email?.trim() ?? null,
      // PSID-shaped values are Meta ids, not telephone numbers.
      phone: rawPhone && !isPsidLike(rawPhone) ? (normalizePhoneE164(rawPhone) ?? rawPhone) : null,
    }
  } catch {
    return null
  }
}

async function loadApplicationDTO(applicationId: string | null | undefined): Promise<ClientApplicationDTO | null> {
  if (!applicationId) return null
  try {
    const app = await prisma.visaApplication.findUnique({
      where:  { id: applicationId },
      select: { id: true, referenceNumber: true, destinationIso2: true, visaType: true, status: true },
    })
    if (!app) return null
    return {
      id:              app.id,
      walzRef:         app.referenceNumber,
      applicationType: `${(app.destinationIso2 ?? '').toUpperCase()} ${cap(app.visaType ?? 'visa')} Visa`.trim(),
      status:          safeStatusLabel(app.status),
    }
  } catch {
    return null
  }
}

type SupabaseLeadRow = Record<string, unknown>

function leadDTOFromRow(row: SupabaseLeadRow, reasons: string[]): ClientLeadDTO {
  const pick = (k: string): string | null => (typeof row[k] === 'string' && row[k] ? row[k] as string : null)
  const rawPhone = pick('whatsapp_number') ?? pick('whatsapp')
  let phone: string | null = null
  if (rawPhone) {
    if (isPsidLike(rawPhone)) {
      reasons.push('lead_phone_column_holds_a_psid_not_a_phone')
    } else {
      phone = normalizePhoneE164(rawPhone) ?? rawPhone
    }
  }
  return {
    id:    String(row.id ?? ''),
    name:  pick('name'),
    email: normalizeEmail(pick('email')),
    phone,
  }
}

// ── Resolver ─────────────────────────────────────────────────────────────────

export async function resolveClientActionContext(
  conversationId: number,
  session: AdminSession | null,
): Promise<ResolveClientActionResult> {
  // (1) Authz first — same mechanisms as every other inbox conversation
  // route; never weakened, never bypassed, checked before ANY identity read.
  if (!session) return { ok: false, status: 401, error: 'Unauthorized' }
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return { ok: false, status: 403, error: 'Invalid conversation.' }
  }
  const perm = checkInboxPermission(session, 'inbox_view')
  if (!perm.allowed) return { ok: false, status: perm.status, error: perm.error }
  const access = await checkConversationAccess(session, String(conversationId))
  if (!access.allowed) return { ok: false, status: access.status, error: access.error }

  const reasons: string[] = []
  const context: ClientActionContext = {
    conversationId,
    contact: null, supabaseLead: null, prismaLead: null,
    user: null, clientAccount: null, application: null, link: null,
    heuristicCandidates: null,
    resolution: 'UNRESOLVED', ambiguityReasons: reasons,
  }

  try {
    context.contact = await fetchChatwootContact(conversationId)
    if (!context.contact) reasons.push('chatwoot_contact_unavailable')

    // (2) Link table — the persisted truth wins over every heuristic.
    let link: {
      id: string; linkMethod: string; linkedBy: string | null
      verificationId: string | null; visaApplicationId: string | null
      supabaseLeadId: string | null; prismaLeadId: string | null
      userId: string | null; clientAccountId: string | null; createdAt: Date
    } | null = null
    try {
      link = await prisma.conversationClientLink.findFirst({
        where:   { chatwootConversationId: conversationId, active: true },
        orderBy: { createdAt: 'desc' },
      })
    } catch (e) {
      console.warn('[client-context] link table read failed:', e)
      reasons.push('link_table_unavailable')
    }

    if (link) {
      context.link = {
        id:             link.id,
        linkMethod:     link.linkMethod,
        linkedBy:       link.linkedBy,
        verificationId: link.verificationId,
        createdAt:      link.createdAt.toISOString(),
      }
      context.resolution  = 'LINKED'
      context.application = await loadApplicationDTO(link.visaApplicationId)

      if (link.verificationId) {
        // CONTRACT (security review M2): resolution VERIFIED means the link
        // was ESTABLISHED through a completed client verification (OTP or
        // fallback) — a durable identity claim. It deliberately does NOT
        // track the 30-minute verifiedUntil viewing window: that window
        // gates access to sensitive application DATA (assertVerifiedAccess),
        // not the identity binding itself. Actions needing a FRESH
        // verification must check verifiedUntil themselves.
        try {
          const verification = await prisma.applicationVerification.findUnique({
            where:  { id: link.verificationId },
            select: { status: true },
          })
          if (verification?.status === 'verified') context.resolution = 'VERIFIED'
        } catch (e) {
          console.warn('[client-context] verification read failed:', e)
          reasons.push('verification_lookup_failed')
        }
      }

      // Hydrate the other linked identities (best-effort, never a guess).
      if (link.userId) {
        context.user = await prisma.user.findUnique({
          where: { id: link.userId }, select: { id: true, name: true, email: true },
        }).catch(() => null)
      }
      if (link.clientAccountId) {
        context.clientAccount = await prisma.clientAccount.findUnique({
          where: { id: link.clientAccountId }, select: { id: true, name: true, email: true },
        }).catch(() => null)
      }
      if (link.prismaLeadId) {
        context.prismaLead = await prisma.lead.findUnique({
          where: { id: link.prismaLeadId }, select: { id: true, name: true, email: true },
        }).catch(() => null)
      }
      if (link.supabaseLeadId) {
        try {
          const { data } = await getSupabaseAdmin()
            .from('leads').select('*').eq('id', link.supabaseLeadId).maybeSingle()
          if (data) context.supabaseLead = leadDTOFromRow(data as SupabaseLeadRow, reasons)
        } catch { reasons.push('linked_supabase_lead_unavailable') }
      }
      return { ok: true, context }
    }

    // (3) Heuristics — only reached when NO link row exists.
    let ambiguous = false
    let derived   = false

    // 3a. Supabase leads by chatwoot_conversation_id (service-role client,
    //     same client the inbox admin routes use).
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('leads')
        .select('*')
        .eq('chatwoot_conversation_id', conversationId)
        .limit(5)
      if (error) {
        reasons.push('supabase_lead_lookup_failed')
      } else if ((data?.length ?? 0) > 1) {
        ambiguous = true
        reasons.push('multiple_supabase_leads_for_conversation')
      } else if (data && data.length === 1) {
        context.supabaseLead = leadDTOFromRow(data[0] as SupabaseLeadRow, reasons)
        reasons.push('supabase_lead_matched_by_chatwoot_conversation_id')
        derived = true
      }
    } catch (e) {
      console.warn('[client-context] supabase lead heuristic failed:', e)
      reasons.push('supabase_lead_lookup_failed')
    }

    // 3b. Exact-normalized email → exactly-one-match rules (mirrors
    //     lib/portal/customer-identity.ts: ambiguous matches are skipped,
    //     never guessed). NO phone-based matching exists in this resolver.
    const candidateEmail =
      normalizeEmail(context.contact?.email) ?? context.supabaseLead?.email ?? null
    if (candidateEmail) {
      try {
        const users = await prisma.user.findMany({
          where:  { email: { equals: candidateEmail, mode: 'insensitive' } },
          select: { id: true, name: true, email: true },
        })
        if (users.length === 1) {
          context.user = users[0]
          reasons.push('user_matched_by_exact_normalized_email')
          derived = true
        } else if (users.length > 1) {
          ambiguous = true
          reasons.push('multiple_users_for_email')
        }

        const accounts = await prisma.clientAccount.findMany({
          where:  { email: { equals: candidateEmail, mode: 'insensitive' } },
          select: { id: true, name: true, email: true },
        })
        if (accounts.length === 1) {
          context.clientAccount = accounts[0]
          reasons.push('client_account_matched_by_exact_normalized_email')
          derived = true
        } else if (accounts.length > 1) {
          ambiguous = true
          reasons.push('multiple_client_accounts_for_email')
        }

        const prismaLeads = await prisma.lead.findMany({
          where:  { email: { equals: candidateEmail, mode: 'insensitive' } },
          select: { id: true, name: true, email: true },
          take:   3,
        })
        if (prismaLeads.length === 1) {
          context.prismaLead = prismaLeads[0]
          reasons.push('prisma_lead_matched_by_exact_normalized_email')
          derived = true
        } else if (prismaLeads.length > 1) {
          ambiguous = true
          reasons.push('multiple_prisma_leads_for_email')
        }
      } catch (e) {
        console.warn('[client-context] email heuristic failed:', e)
        reasons.push('email_heuristic_failed')
      }
    } else {
      reasons.push('no_exact_email_available')
    }

    // (4) Verdict: any multi-candidate ambiguity collapses the whole
    // resolution to UNRESOLVED — a partially-guessed identity is not an
    // identity. Heuristic hits are surfaced but clearly labelled.
    if (ambiguous) {
      context.resolution    = 'UNRESOLVED'
      context.user          = null
      context.clientAccount = null
      context.prismaLead    = null
      context.supabaseLead  = null
    } else if (derived) {
      // HEURISTIC: derivations are candidates, never identity — move them
      // out of the primary fields so only resolution LINKED/VERIFIED ever
      // populates those (L2).
      context.resolution = 'HEURISTIC'
      context.heuristicCandidates = {
        supabaseLead:  context.supabaseLead,
        prismaLead:    context.prismaLead,
        user:          context.user,
        clientAccount: context.clientAccount,
      }
      context.user          = null
      context.clientAccount = null
      context.prismaLead    = null
      context.supabaseLead  = null
    } else {
      context.resolution = 'UNRESOLVED'
    }
    return { ok: true, context }
  } catch (e) {
    // Fail closed: errors never produce identity guesses and never throw.
    console.warn('[client-context] resolver error — returning UNRESOLVED:', e)
    return {
      ok: true,
      context: {
        conversationId,
        contact: null, supabaseLead: null, prismaLead: null,
        user: null, clientAccount: null, application: null, link: null,
        heuristicCandidates: null,
        resolution: 'UNRESOLVED',
        ambiguityReasons: ['resolver_error'],
      },
    }
  }
}
