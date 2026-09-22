/**
 * WhatsApp Broadcast V1 — Meta approved-template handling.
 *
 * Pure (no I/O, no env, no Prisma) so every rule here is unit-testable.
 *
 * THE NO-FALLBACK GUARANTEE. A broadcast message is ALWAYS built as
 * Meta's `type: 'template'` payload. There is deliberately no code path
 * anywhere in lib/whatsapp/broadcast/** that can produce a `type: 'text'`
 * payload: buildTemplatePayload() is the only payload builder, it takes a
 * validated template definition, and validateTemplateDefinition() throws
 * the send/schedule request away with a clear error rather than degrading
 * to free-form text. The broadcast record's legacy `message` column is
 * kept purely as the human-readable internal description of the campaign
 * and is NEVER sent to Meta.
 *
 * WHAT CANNOT BE VALIDATED HERE. Meta owns template approval. Whether a
 * template NAME actually exists on the WhatsApp Business Account, whether
 * it is in APPROVED (vs PENDING/REJECTED/PAUSED/DISABLED) status, and
 * whether its real body has exactly N placeholders can only be confirmed
 * by calling Meta's Message Templates API with live credentials
 * (GET /{waba-id}/message_templates). That call is impossible in this
 * sandbox, so this module validates everything that is structurally
 * checkable and the send path surfaces Meta's own rejection (error code
 * 132000/132001/132012/132015) as a PERMANENT per-recipient failure with
 * the real reason attached — never as a silent downgrade.
 */

/** A single ordered body parameter MAPPING stored on the broadcast. */
export type TemplateParamMapping =
  | { type: 'static'; value: string }
  | { type: 'lead_field'; field: LeadTemplateField; fallback?: string }

/** Lead columns a template parameter is allowed to read. */
export const LEAD_TEMPLATE_FIELDS = ['name', 'destination', 'service', 'travelDate'] as const
export type LeadTemplateField = (typeof LEAD_TEMPLATE_FIELDS)[number]

export interface TemplateDefinition {
  name: string
  language: string
  params: TemplateParamMapping[]
}

export interface TemplateValidationResult {
  ok: boolean
  errors: string[]
  definition: TemplateDefinition | null
}

/**
 * Meta template names: lowercase letters, digits and underscores only,
 * 1-512 chars. Documented constraint, and cheap to enforce before we
 * waste a Meta call.
 */
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/
/** e.g. 'en', 'en_US', 'pt_BR'. */
const TEMPLATE_LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/
/** Meta rejects newlines, tabs and 4+ consecutive spaces inside a parameter. */
const ILLEGAL_PARAM_RE = /[\n\r\t]|\s{4,}/
/** Meta's hard cap on body parameters. */
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
  name?: unknown
  language?: unknown
  params?: unknown
}): TemplateValidationResult {
  const errors: string[] = []

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) {
    errors.push('Template name is required — a broadcast can only be sent as an approved Meta template.')
  } else if (!TEMPLATE_NAME_RE.test(name)) {
    errors.push('Template name must be lowercase letters, digits and underscores only (Meta requirement).')
  }

  const language = typeof input.language === 'string' ? input.language.trim() : ''
  if (!language) {
    errors.push('Template language is required (e.g. "en" or "en_US").')
  } else if (!TEMPLATE_LANGUAGE_RE.test(language)) {
    errors.push('Template language must look like "en" or "en_US".')
  }

  const rawParams = input.params ?? []
  const params: TemplateParamMapping[] = []

  if (!Array.isArray(rawParams)) {
    errors.push('Template parameters must be an ordered list.')
  } else if (rawParams.length > MAX_TEMPLATE_PARAMS) {
    errors.push(`A template body may carry at most ${MAX_TEMPLATE_PARAMS} parameters.`)
  } else {
    rawParams.forEach((raw, i) => {
      const position = i + 1
      if (!raw || typeof raw !== 'object') {
        errors.push(`Parameter {{${position}}} is malformed.`)
        return
      }
      const p = raw as Record<string, unknown>
      if (p.type === 'static') {
        if (typeof p.value !== 'string' || !p.value.trim()) {
          errors.push(`Parameter {{${position}}} is a fixed value but has no text.`)
          return
        }
        if (ILLEGAL_PARAM_RE.test(p.value)) {
          errors.push(`Parameter {{${position}}} contains newlines, tabs or 4+ spaces, which Meta rejects.`)
          return
        }
        params.push({ type: 'static', value: p.value })
      } else if (p.type === 'lead_field') {
        if (!isLeadField(p.field)) {
          errors.push(
            `Parameter {{${position}}} reads an unknown lead field. Allowed: ${LEAD_TEMPLATE_FIELDS.join(', ')}.`,
          )
          return
        }
        if (p.fallback !== undefined && typeof p.fallback !== 'string') {
          errors.push(`Parameter {{${position}}} has a malformed fallback.`)
          return
        }
        if (typeof p.fallback === 'string' && ILLEGAL_PARAM_RE.test(p.fallback)) {
          errors.push(`Parameter {{${position}}}'s fallback contains characters Meta rejects.`)
          return
        }
        params.push({
          type: 'lead_field',
          field: p.field,
          ...(typeof p.fallback === 'string' ? { fallback: p.fallback } : {}),
        })
      } else {
        errors.push(`Parameter {{${position}}} must be a fixed value or a lead field.`)
      }
    })
  }

  if (errors.length > 0) return { ok: false, errors, definition: null }
  return { ok: true, errors: [], definition: { name, language, params } }
}

/**
 * Resolve the ordered parameter VALUES for one lead. Called ONCE, at
 * approval time, and frozen into the recipient row — never re-resolved at
 * send time, so a later edit to the lead cannot change what was approved.
 *
 * A lead_field with no value and no fallback yields '' — which Meta
 * rejects — so resolveTemplateParams reports it and the caller treats the
 * recipient as a template failure rather than sending a broken message.
 */
export function resolveTemplateParams(
  params: TemplateParamMapping[],
  lead: Partial<Record<LeadTemplateField, string | null | undefined>>,
): { values: string[]; missing: number[] } {
  const values: string[] = []
  const missing: number[] = []
  params.forEach((p, i) => {
    if (p.type === 'static') {
      values.push(p.value)
      return
    }
    const raw = lead[p.field]
    const resolved = (typeof raw === 'string' ? raw.trim() : '') || (p.fallback ?? '').trim()
    if (!resolved) missing.push(i + 1)
    // Collapse anything Meta would reject rather than emitting it verbatim.
    values.push(resolved.replace(/[\n\r\t]+/g, ' ').replace(/\s{4,}/g, '   '))
  })
  return { values, missing }
}

/** Meta Cloud API `type: 'template'` message payload. The ONLY shape sent. */
export interface MetaTemplatePayload {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components?: Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }>
  }
}

/**
 * Build the outbound payload. Note the total absence of any `text` branch:
 * there is no argument, flag or data shape that makes this emit a
 * free-form message.
 */
export function buildTemplatePayload(input: {
  to: string
  templateName: string
  templateLanguage: string
  paramValues: string[]
}): MetaTemplatePayload {
  const payload: MetaTemplatePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.templateLanguage },
    },
  }
  if (input.paramValues.length > 0) {
    payload.template.components = [
      { type: 'body', parameters: input.paramValues.map(text => ({ type: 'text', text })) },
    ]
  }
  return payload
}
