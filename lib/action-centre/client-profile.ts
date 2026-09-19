/**
 * Complete Client Profile (Client Action Centre — shared layer).
 *
 * The ONE mutation for "fill in a missing name/email/phone on the
 * conversation's already-linked client" — shared by Request Payment,
 * Create Quote, Visa Form, and Itinerary Request.
 * Not a new profile system: it writes into the SAME User/ClientAccount/
 * Lead/VisaApplication columns lib/inbox/client-profile.ts already reads,
 * through the SAME identity gate every other Action Centre mutation uses.
 * VisaApplication is the fourth target — used only when a client is
 * VERIFIED purely via OTP against a specific case (no User/ClientAccount/
 * Lead linked at all); see resolveCanonicalContact's comment for the
 * traced evidence this is a common, not rare, production path.
 *
 * Hard rules:
 *  - Identity comes ONLY from the server-resolved ConversationClientLink
 *    for this conversationId — a browser-supplied id of any kind (user,
 *    clientAccount, lead, application) has zero effect on which record is
 *    touched; none is even accepted as input.
 *  - VERIFIED or LINKED only (HEURISTIC/UNRESOLVED blocked) — same
 *    invariant as payment-request.ts / visa-form.ts / the quotes route.
 *  - A field is only EVER filled when it is currently blank on the
 *    canonical linked record. A different existing value is never
 *    overwritten — it comes back as CONTACT_CONFLICT with both values so
 *    staff can resolve it deliberately.
 *  - Phone reuses the EXACT normalizePhoneE164 / isPsidLike guards UX-4.1C
 *    uses everywhere else in this identity layer.
 *  - Never performs, triggers, or is called from any commercial action —
 *    it only edits contact fields. No message send, no payment, no quote,
 *    no visa case, ever originates here.
 */

import prisma from '@/lib/db'
import type { AdminSession } from '@/lib/admin-auth'
import { resolveClientActionContext } from '@/lib/inbox/client-context'
import { resolveCanonicalContact, type ProfileField } from '@/lib/inbox/client-profile'
import { deriveChannelIdentity } from '@/lib/inbox/client-identity'
import { normalizeEmail, normalizePhoneE164, isPsidLike } from '@/lib/identity/normalize'

export interface ProfileConflict { field: ProfileField; existing: string; attempted: string }

export type UpdateClientProfileResult =
  | { ok: true; fields: Partial<Record<ProfileField, string>> }
  | {
      ok: false
      code: 'CLIENT_IDENTITY_REQUIRED' | 'NO_LINKED_RECORD' | 'INVALID_INPUT' | 'CONTACT_CONFLICT' | 'PERSIST_FAILED'
      error: string
      conflicts?: ProfileConflict[]
    }

export interface UpdateClientProfileInput {
  session: AdminSession
  conversationId: number
  name?: string
  email?: string
  phone?: string
}

export async function updateClientProfile(input: UpdateClientProfileInput): Promise<UpdateClientProfileResult> {
  const { session, conversationId } = input

  // (1) Fresh, server-side re-resolution — never trust a browser-supplied
  //     client/user/application id (none is even accepted, see the route).
  //     Same hard invariant as every other Action Centre mutation.
  const resolved = await resolveClientActionContext(conversationId, session)
  if (!resolved.ok) {
    return { ok: false, code: 'CLIENT_IDENTITY_REQUIRED', error: resolved.error }
  }
  const ctx = resolved.context
  if (ctx.resolution !== 'VERIFIED' && ctx.resolution !== 'LINKED') {
    return {
      ok: false, code: 'CLIENT_IDENTITY_REQUIRED',
      error: 'Verify the client identity before editing their profile.',
    }
  }

  if (input.name === undefined && input.email === undefined && input.phone === undefined) {
    return { ok: false, code: 'INVALID_INPUT', error: 'Provide at least one field to update.' }
  }

  // (2) Canonical contact + the ONE record fields may be written to.
  const canonical = await resolveCanonicalContact(ctx)
  if (!canonical.target) {
    return {
      ok: false, code: 'NO_LINKED_RECORD',
      error: 'This conversation is not linked to an editable client record yet.',
    }
  }
  const target = canonical.target

  // (3) Validate + normalize each provided field, and classify it as a
  //     blank-fill (write) or a conflict (existing value differs) — NEVER
  //     both, and NEVER a silent overwrite.
  const conflicts: ProfileConflict[] = []
  const toWrite: Record<string, string | null> = {}
  const resultFields: Partial<Record<ProfileField, string>> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { ok: false, code: 'INVALID_INPUT', error: 'Enter a valid name.' }
    const existing = canonical.fields.name
    if (existing) {
      if (existing.value !== name) conflicts.push({ field: 'name', existing: existing.value, attempted: name })
      else resultFields.name = existing.value
    } else if (target.kind === 'visaApplication') {
      // VisaApplication has no single `name` column — split into
      // firstName/lastName, same convention already used when a case is
      // CREATED (see lib/action-centre/visa-form.ts's createVisaCase
      // nameParts split).
      const nameParts = name.split(/\s+/)
      toWrite.firstName = nameParts[0]
      toWrite.lastName = nameParts.slice(1).join(' ') || null
      resultFields.name = name
    } else {
      toWrite.name = name
      resultFields.name = name
    }
  }

  if (input.email !== undefined) {
    const email = normalizeEmail(input.email)
    if (!email) return { ok: false, code: 'INVALID_INPUT', error: 'Enter a valid email address.' }
    const existing = canonical.fields.email
    if (existing) {
      if (normalizeEmail(existing.value) !== email) conflicts.push({ field: 'email', existing: existing.value, attempted: email })
      else resultFields.email = existing.value
    } else {
      toWrite.email = email
      resultFields.email = email
    }
  }

  if (input.phone !== undefined) {
    const raw = input.phone.trim()
    if (!raw || isPsidLike(raw)) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Enter a valid phone number.' }
    }
    const normalizedPhone = normalizePhoneE164(raw)
    if (!normalizedPhone) {
      return { ok: false, code: 'INVALID_INPUT', error: 'Enter a valid phone number.' }
    }
    const existing = canonical.fields.phone
    if (existing) {
      // Security review MEDIUM fix: mirror the email pattern exactly —
      // normalize BOTH sides before comparing. A legacy record stored in a
      // non-canonical phone format (e.g. missing '+', stray punctuation, an
      // international '00' prefix instead of '+') must not spuriously
      // report CONTACT_CONFLICT when staff resubmit the exact same real
      // number in E.164 form — resubmitting the same value must stay a
      // no-op success, exactly like email already guarantees.
      if (normalizePhoneE164(existing.value) !== normalizedPhone) conflicts.push({ field: 'phone', existing: existing.value, attempted: normalizedPhone })
      else resultFields.phone = existing.value
    } else if (target.kind === 'prismaLead') {
      // Lead.whatsapp doubles as a message-routing identity key elsewhere
      // (Jade's saveLead resolves/updates leads by exact whatsapp match —
      // see lib/inbox/client-identity.ts's deriveChannelIdentity comment).
      // Guard exactly like the create_new client-identity flow: only
      // accept a staff-typed number here when it does not contradict the
      // conversation's OWN server-derived channel phone.
      const channel = await deriveChannelIdentity(conversationId)
      if (channel.whatsapp && channel.whatsapp !== normalizedPhone) {
        conflicts.push({ field: 'phone', existing: channel.whatsapp, attempted: normalizedPhone })
      } else {
        toWrite.whatsapp = normalizedPhone
        resultFields.phone = normalizedPhone
      }
    } else {
      toWrite.phone = normalizedPhone
      resultFields.phone = normalizedPhone
    }
  }

  // (4) Any conflict fails the WHOLE request closed — nothing is written,
  //     ever, when a supplied value contradicts an existing one.
  if (conflicts.length > 0) {
    return {
      ok: false, code: 'CONTACT_CONFLICT',
      error: 'The details you entered do not match what is already on file for this client.',
      conflicts,
    }
  }

  // (5) Nothing left to persist (every provided field already matched the
  //     canonical value) — a no-op success, not an error.
  if (Object.keys(toWrite).length === 0) {
    return { ok: true, fields: resultFields }
  }

  // (6) Persist — ONLY the blank-and-now-filled fields, on the ONE
  //     server-resolved authoritative record. No commercial action of any
  //     kind is triggered here.
  try {
    if (target.kind === 'user') {
      await prisma.user.update({ where: { id: target.id }, data: toWrite })
    } else if (target.kind === 'clientAccount') {
      await prisma.clientAccount.update({ where: { id: target.id }, data: toWrite })
    } else if (target.kind === 'prismaLead') {
      await prisma.lead.update({ where: { id: target.id }, data: toWrite })
    } else {
      // 'visaApplication' — Task A gap fix (see resolveCanonicalContact):
      // only ever the target when an OTP-VERIFIED link carries nothing but
      // visaApplicationId. Writes ONLY the blank-and-now-filled contact
      // columns already on VisaApplication — never touches case status,
      // tokens, or document requests.
      await prisma.visaApplication.update({ where: { id: target.id }, data: toWrite })
    }
  } catch (e) {
    console.error('[action-centre] client-profile PERSIST_FAILED:', (e as Error).message)
    return { ok: false, code: 'PERSIST_FAILED', error: 'Could not save these details. Please try again.' }
  }

  return { ok: true, fields: resultFields }
}
