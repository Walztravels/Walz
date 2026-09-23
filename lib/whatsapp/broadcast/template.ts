/**
 * WhatsApp Broadcast V1.2.1 — Twilio approved Content Template handling.
 *
 * Pure (no I/O, no env, no Prisma) so every rule here is unit-testable.
 * Replaces the V1/V1.1 Meta template-name/language model — see the git
 * history of this file for that version, still readable via
 * WhatsAppBroadcast.templateName/templateLanguage/templateParams, which
 * this release keeps unmodified for read-compatibility with historical
 * rows but no longer writes.
 *
 * THE NO-FALLBACK GUARANTEE. A broadcast message is ALWAYS built as a
 * Twilio Content Template send (ContentSid + ContentVariables). There is
 * no code path anywhere in lib/whatsapp/broadcast/** or lib/twilio-
 * whatsapp.ts's sendWhatsAppContentTemplate() that can produce a free-form
 * Body send for a broadcast: validateTemplateDefinition() throws the send/
 * schedule request away with a clear error rather than degrading.
 *
 * WHAT CANNOT BE VALIDATED HERE. Twilio (and, beneath it, Meta/WhatsApp)
 * owns template approval. Whether a Content SID actually exists on this
 * Twilio account, is APPROVED (vs PENDING/REJECTED/PAUSED) for the WhatsApp
 * channel, and declares exactly the variable keys this definition maps,
 * can only be confirmed by calling Twilio's Content API with live
 * credentials (GET https://content.twilio.com/v1/Content/{sid}) — see
 * app/api/admin/marketing/whatsapp-broadcast/templates/route.ts, which
 * does that call server-side to populate a catalogue for staff to pick
 * from, rather than accepting an arbitrary hand-typed SID. This module
 * validates everything structurally checkable (SID shape, variable-map
 * shape); the send path surfaces Twilio's own rejection as a PERMANENT
 * per-recipient failure with the real reason attached — never a silent
 * downgrade.
 */

/** A single variable-key MAPPING stored on the broadcast. */
export type TemplateParamMapping =
  | { type: 'static'; value: string }
  | { type: 'lead_field'; field: LeadTemplateField; fallback?: string }

/** Lead columns a template variable is allowed to read. */
export const LEAD_TEMPLATE_FIELDS = ['name', 'destination', 'service', 'travelDate'] as const
export type LeadTemplateField = (typeof LEAD_TEMPLATE_FIELDS)[number]

export interface TemplateDefinition {
  contentSid: string
  /** Keyed by whatever variable keys the selected Content Template declares (commonly "1","2",...). */
  variables: Record<string, TemplateParamMapping>
}

export interface TemplateValidationResult {
  ok: boolean
  errors: string[]
  definition: TemplateDefinition | null
}

/** Twilio Content SIDs: "HX" followed by 32 lowercase hex characters. */
const CONTENT_SID_RE = /^HX[0-9a-f]{32}$/
/** Twilio Content Template variable keys are short alphanumeric identifiers. */
const VARIABLE_KEY_RE = /^[A-Za-z0-9_]{1,64}$/
/** Meta/WhatsApp rejects newlines, tabs and 4+ consecutive spaces inside a variable value. */
const ILLEGAL_PARAM_RE = /[\n\r\t]|\s{4,}/
/** Twilio's practical cap on Content Template variables. */
export const MAX_TEMPLATE_PARAMS = 10

function isLeadField(v: unknown): v is LeadTemplateField {
  return typeof v === 'string' && (LEAD_TEMPLATE_FIELDS as readonly string[]).includes(v)
}

/**
 * Structurally validate a template definition as stored on (or submitted
 * for) a broadcast. Returns every problem at once so the wizard can show
 * them together rather than one per round-trip.
 */
export function validateTemplateDefinition(input: {
  contentSid?: unknown
  variables?: unknown
}): TemplateValidationResult {
  const errors: string[] = []

  const contentSid = typeof input.contentSid === 'string' ? input.contentSid.trim() : ''
  if (!contentSid) {
    errors.push('A WhatsApp template is required — a broadcast can only be sent as an approved template.')
  } else if (!CONTENT_SID_RE.test(contentSid)) {
    errors.push('That does not look like an approved WhatsApp template. Pick one from the template list.')
  }

  const rawVariables = input.variables ?? {}
  const variables: Record<string, TemplateParamMapping> = {}

  if (!rawVariables || typeof rawVariables !== 'object' || Array.isArray(rawVariables)) {
    errors.push('Template variables must be a key-value mapping.')
  } else {
    const entries = Object.entries(rawVariables as Record<string, unknown>)
    if (entries.length > MAX_TEMPLATE_PARAMS) {
      errors.push(`A template may carry at most ${MAX_TEMPLATE_PARAMS} variables.`)
    } else {
      for (const [key, raw] of entries) {
        if (!VARIABLE_KEY_RE.test(key)) {
          errors.push(`Variable key "${key}" is not a valid template variable name.`)
          continue
        }
        if (!raw || typeof raw !== 'object') {
          errors.push(`Variable {{${key}}} is malformed.`)
          continue
        }
        const p = raw as Record<string, unknown>
        if (p.type === 'static') {
          if (typeof p.value !== 'string' || !p.value.trim()) {
            errors.push(`Variable {{${key}}} is a fixed value but has no text.`)
            continue
          }
          if (ILLEGAL_PARAM_RE.test(p.value)) {
            errors.push(`Variable {{${key}}} contains newlines, tabs or 4+ spaces, which WhatsApp rejects.`)
            continue
          }
          variables[key] = { type: 'static', value: p.value }
        } else if (p.type === 'lead_field') {
          if (!isLeadField(p.field)) {
            errors.push(`Variable {{${key}}} reads an unknown lead field. Allowed: ${LEAD_TEMPLATE_FIELDS.join(', ')}.`)
            continue
          }
          if (p.fallback !== undefined && typeof p.fallback !== 'string') {
            errors.push(`Variable {{${key}}} has a malformed fallback.`)
            continue
          }
          if (typeof p.fallback === 'string' && ILLEGAL_PARAM_RE.test(p.fallback)) {
            errors.push(`Variable {{${key}}}'s fallback contains characters WhatsApp rejects.`)
            continue
          }
          variables[key] = {
            type: 'lead_field',
            field: p.field,
            ...(typeof p.fallback === 'string' ? { fallback: p.fallback } : {}),
          }
        } else {
          errors.push(`Variable {{${key}}} must be a fixed value or a lead field.`)
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors, definition: null }
  return { ok: true, errors: [], definition: { contentSid, variables } }
}

/**
 * Resolve the variable VALUES for one lead/identity. Called ONCE, at
 * approval time, and frozen into the recipient row — never re-resolved at
 * send time, so a later edit to the lead cannot change what was approved.
 *
 * A lead_field with no value and no fallback yields '' — which WhatsApp
 * rejects — so resolveTemplateParams reports the missing KEY and the
 * caller treats the recipient as a template failure rather than sending a
 * broken message.
 */
export function resolveTemplateParams(
  variables: Record<string, TemplateParamMapping>,
  lead: Partial<Record<LeadTemplateField, string | null | undefined>>,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, p] of Object.entries(variables)) {
    if (p.type === 'static') {
      values[key] = p.value
      continue
    }
    const raw = lead[p.field]
    const resolved = (typeof raw === 'string' ? raw.trim() : '') || (p.fallback ?? '').trim()
    if (!resolved) missing.push(key)
    // Collapse anything WhatsApp would reject rather than emitting it verbatim.
    values[key] = resolved.replace(/[\n\r\t]+/g, ' ').replace(/\s{4,}/g, '   ')
  }
  return { values, missing }
}
