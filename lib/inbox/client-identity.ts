/**
 * Client identity search + duplicate detection (UX-4.1C).
 *
 * Extends the UX-4.1A ConversationClientLink surface to cover first-time
 * and legacy customers — this is NOT a second identity system: it only
 * adds two staff-initiated, explicit-selection actions on top of the same
 * link table and the same fail-closed philosophy as the automatic
 * heuristic resolver in client-context.ts:
 *
 *   - searchExistingClients: an EXPLICIT staff search (never automatic
 *     resolution). Staff types a query, reviews candidates, and picks
 *     exactly one to link — this is a fundamentally different trust model
 *     from the resolver's silent heuristics, so phone search is safe here
 *     even though the automatic resolver deliberately never does
 *     phone-tail matching. Matching is still EXACT-normalized only —
 *     never partial/tail — and PSID-shaped values are never treated as
 *     phones.
 *   - findCredibleDuplicate: run before creating a new Lead. Exact
 *     normalized email OR exact normalized phone match. Zero matches →
 *     safe to create. Exactly one → direct staff to link it instead
 *     (never auto-link). More than one → ambiguous, staff must resolve
 *     manually. Mirrors lib/portal/customer-identity.ts's philosophy.
 */

import prisma from '@/lib/db'
import { normalizeEmail, normalizePhoneE164, isPsidLike } from '@/lib/identity/normalize'
import { fetchChatwootContact } from '@/lib/inbox/client-context'

// ── Client-facing reference ─────────────────────────────────────────────────

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Same algorithm/charset as lib/visa-config.ts generateVisaRef, distinct
 *  prefix — a CRM client reference, not a visa application reference. */
export function generateClientReference(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  let ref = 'WALZ-C-'
  for (let i = 0; i < 6; i++) ref += REF_CHARS[bytes[i] % REF_CHARS.length]
  return ref
}

// ── Search (explicit, staff-reviewed — see file header) ─────────────────────

export type ClientCandidateType = 'user' | 'clientAccount' | 'lead' | 'application' | 'booking'

export interface ClientCandidate {
  type: ClientCandidateType
  id: string
  name: string | null
  email: string | null
  phone: string | null
  /** A WALZ/booking reference, when this candidate carries one. */
  reference: string | null
  /** Short context line for display, e.g. "GB Tourist Visa · In review". */
  detail: string | null
}

function dtoName(...parts: (string | null | undefined)[]): string | null {
  const joined = parts.filter(Boolean).join(' ').trim()
  return joined || null
}

/**
 * Explicit staff search across the identity surfaces the Action Centre
 * can link to. Case-insensitive `contains` on name/email; EXACT match on
 * normalized phone and on reference-shaped queries — never a guess, staff
 * always reviews the list and picks one.
 */
export async function searchExistingClients(query: string): Promise<ClientCandidate[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const contains = { contains: q, mode: 'insensitive' as const }
  const normalizedPhone = normalizePhoneE164(q)

  const [apps, users, accounts, leads, booking] = await Promise.all([
    prisma.visaApplication.findMany({
      where: {
        isDraft: false,
        OR: [
          { referenceNumber: contains }, { firstName: contains },
          { lastName: contains }, { email: contains },
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ],
      },
      orderBy: { updatedAt: 'desc' }, take: 10,
      select: {
        id: true, referenceNumber: true, firstName: true, lastName: true,
        email: true, phone: true, destinationIso2: true, visaType: true, status: true,
      },
    }),
    prisma.user.findMany({
      where: { OR: [{ name: contains }, { email: contains }, ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])] },
      take: 10, select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.clientAccount.findMany({
      where: { OR: [{ name: contains }, { email: contains }, ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])] },
      take: 10, select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.lead.findMany({
      where: { OR: [{ name: contains }, { email: contains }, ...(normalizedPhone ? [{ whatsapp: normalizedPhone }] : [])] },
      take: 10, select: { id: true, name: true, email: true, whatsapp: true, service: true, status: true },
    }),
    prisma.booking.findFirst({
      where: { bookingReference: contains },
      select: { id: true, bookingReference: true, userId: true, user: { select: { name: true, email: true, phone: true } } },
    }).catch(() => null),
  ])

  const results: ClientCandidate[] = []
  for (const a of apps) {
    results.push({
      type: 'application', id: a.id,
      name: dtoName(a.firstName, a.lastName) ?? a.email, email: a.email, phone: a.phone,
      reference: a.referenceNumber,
      detail: `${(a.destinationIso2 ?? '').toUpperCase()} ${a.visaType ?? 'Visa'} · ${a.status}`,
    })
  }
  for (const u of users) {
    results.push({ type: 'user', id: u.id, name: u.name, email: u.email, phone: u.phone, reference: null, detail: 'Registered client' })
  }
  for (const c of accounts) {
    results.push({ type: 'clientAccount', id: c.id, name: c.name, email: c.email, phone: c.phone, reference: null, detail: 'Visa portal account' })
  }
  for (const l of leads) {
    results.push({ type: 'lead', id: l.id, name: l.name, email: l.email, phone: l.whatsapp, reference: null, detail: `${l.service} · ${l.status}` })
  }
  if (booking) {
    results.push({
      type: 'booking', id: booking.id, name: booking.user?.name ?? null,
      email: booking.user?.email ?? null, phone: booking.user?.phone ?? null,
      reference: booking.bookingReference, detail: 'Booking',
    })
  }
  return results.slice(0, 20)
}

// ── Duplicate detection (before creating a new Lead) ────────────────────────

export interface DuplicateCheckInput { email?: string | null; phone?: string | null }
export type DuplicateCheckResult =
  | { status: 'none' }
  | { status: 'found'; candidate: ClientCandidate }
  | { status: 'ambiguous'; candidates: ClientCandidate[] }

/**
 * EXACT normalized email OR EXACT normalized phone match across
 * User/ClientAccount/Lead. Never partial, never tail-matched, PSID-guarded.
 * Zero matches → safe to create. One → direct staff to link it. More than
 * one → fail closed, staff must resolve manually (never auto-pick).
 */
export async function findCredibleDuplicate(input: DuplicateCheckInput): Promise<DuplicateCheckResult> {
  const email = normalizeEmail(input.email)
  const phone = input.phone && !isPsidLike(input.phone) ? normalizePhoneE164(input.phone) : null
  if (!email && !phone) return { status: 'none' }

  const emailWhere = email ? { equals: email, mode: 'insensitive' as const } : undefined

  const [users, accounts, leads, apps] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [...(emailWhere ? [{ email: emailWhere }] : []), ...(phone ? [{ phone }] : [])] },
      take: 5, select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.clientAccount.findMany({
      where: { OR: [...(emailWhere ? [{ email: emailWhere }] : []), ...(phone ? [{ phone }] : [])] },
      take: 5, select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.lead.findMany({
      where: { OR: [...(emailWhere ? [{ email: emailWhere }] : []), ...(phone ? [{ whatsapp: phone }] : [])] },
      take: 5, select: { id: true, name: true, email: true, whatsapp: true },
    }),
    // Security review M1: a guest applicant can have a real VisaApplication
    // with no backing User/ClientAccount at all (both FKs nullable) — without
    // this branch, the duplicate check would miss them entirely and create
    // an orphan Lead instead of directing staff to their existing case.
    prisma.visaApplication.findMany({
      where: {
        isDraft: false,
        OR: [...(emailWhere ? [{ email: emailWhere }] : []), ...(phone ? [{ phone }] : [])],
      },
      take: 5,
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, referenceNumber: true },
    }),
  ])

  const candidates: ClientCandidate[] = [
    ...users.map(u => ({ type: 'user' as const, id: u.id, name: u.name, email: u.email, phone: u.phone, reference: null, detail: 'Registered client' })),
    ...accounts.map(c => ({ type: 'clientAccount' as const, id: c.id, name: c.name, email: c.email, phone: c.phone, reference: null, detail: 'Visa portal account' })),
    ...leads.map(l => ({ type: 'lead' as const, id: l.id, name: l.name, email: l.email, phone: l.whatsapp, reference: null, detail: 'Existing lead' })),
    ...apps.map(a => ({
      type: 'application' as const, id: a.id, name: dtoName(a.firstName, a.lastName) ?? a.email,
      email: a.email, phone: a.phone, reference: a.referenceNumber, detail: 'Existing visa application',
    })),
  ]

  if (candidates.length === 0) return { status: 'none' }
  if (candidates.length === 1) return { status: 'found', candidate: candidates[0] }
  return { status: 'ambiguous', candidates }
}

// ── Reference resolution for a link target ──────────────────────────────────

/**
 * Reuse an existing WALZ reference when the target already has one
 * (never regenerate/duplicate a reference that already exists elsewhere).
 */
export async function resolveExistingReference(type: ClientCandidateType, id: string): Promise<string | null> {
  try {
    if (type === 'application') {
      const app = await prisma.visaApplication.findUnique({ where: { id }, select: { referenceNumber: true } })
      return app?.referenceNumber ?? null
    }
    if (type === 'user') {
      const app = await prisma.visaApplication.findFirst({
        where: { userId: id }, orderBy: { updatedAt: 'desc' }, select: { referenceNumber: true },
      })
      return app?.referenceNumber ?? null
    }
    if (type === 'clientAccount') {
      const app = await prisma.visaApplication.findFirst({
        where: { clientAccountId: id }, orderBy: { updatedAt: 'desc' }, select: { referenceNumber: true },
      })
      return app?.referenceNumber ?? null
    }
    return null   // leads/bookings carry no visa reference to reuse
  } catch {
    return null
  }
}

// ── Server-derived channel identity for a brand-new Lead ────────────────────

export interface DerivedChannelIdentity { sourceId: string; whatsapp: string | null }

/**
 * The identifiers that tie a NEW Lead to THIS conversation for future
 * matching — derived from the conversation's own server-resolved Chatwoot
 * contact, NEVER from staff-typed form fields (identity mandate). If the
 * conversation has no resolvable phone, a conversation-scoped synthetic id
 * is used so the Lead is still uniquely addressable without ever trusting
 * a browser-supplied phone as a system identifier.
 */
export async function deriveChannelIdentity(conversationId: number): Promise<DerivedChannelIdentity> {
  const contact = await fetchChatwootContact(conversationId)
  if (contact?.phone) return { sourceId: contact.phone, whatsapp: contact.phone }
  return { sourceId: `inbox-conv-${conversationId}`, whatsapp: null }
}
