/**
 * Walz Recruitment Hub — communication templates (Release 8).
 *
 * Templates are plain text with {{placeholders}}. Rendering escapes every
 * substituted value, refuses unknown placeholders (typos surface instead of
 * leaking braces to candidates), and produces both text and simple branded
 * HTML. Sending is ALWAYS an explicit human action — no template goes out
 * automatically on a stage move, and AI never sends anything.
 */

export const TEMPLATE_VARS = [
  'firstName', 'lastName', 'jobTitle', 'reference', 'companyName', 'senderName',
] as const
export type TemplateVar = typeof TEMPLATE_VARS[number]
export type TemplateVars = Partial<Record<TemplateVar, string>>

export const COMPANY_NAME = 'Walz Travels'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Lists the {{placeholders}} used in a template string. */
export function placeholdersIn(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g), m => m[1])))
}

/** Substitutes known placeholders; returns unknown ones instead of leaking them. */
export function renderTemplate(text: string, vars: TemplateVars):
  { ok: true; rendered: string } | { ok: false; unknown: string[] } {
  const unknown = placeholdersIn(text).filter(p => !(TEMPLATE_VARS as readonly string[]).includes(p))
  if (unknown.length > 0) return { ok: false, unknown }
  const rendered = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) =>
    (vars[name as TemplateVar] ?? '').toString())
  return { ok: true, rendered }
}

/** Plain text → simple branded HTML email body. */
export function textToHtml(text: string): string {
  const paragraphs = escapeHtml(text).split(/\n{2,}/).map(p => p.replace(/\n/g, '<br>'))
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333;font-size:14px;line-height:1.6">
    ${paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('\n    ')}
    <p style="color:#999;font-size:12px;margin-top:20px">${escapeHtml(COMPANY_NAME)} Recruitment</p>
  </div>`
}

export interface SeedTemplate { key: string; name: string; subject: string; body: string }

/** Default templates — every one sent only by explicit staff action. */
export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    key: 'under_review',
    name: 'Application progressing',
    subject: 'Your {{jobTitle}} application is progressing ({{reference}})',
    body:
`Dear {{firstName}},

Thank you for your patience. Your application for the {{jobTitle}} role (reference {{reference}}) has progressed to the next stage of our review, and a member of our team will contact you about the next steps soon.

You can check your application status any time using the link from your confirmation email.

Kind regards,
{{senderName}}
{{companyName}}`,
  },
  {
    key: 'request_more_info',
    name: 'Request more information',
    subject: 'A quick question about your {{jobTitle}} application ({{reference}})',
    body:
`Dear {{firstName}},

Thank you for applying for the {{jobTitle}} role (reference {{reference}}). To continue reviewing your application, we need a little more information from you.

[Describe what you need here before sending.]

Simply reply to this email with the details and we will pick your application straight back up.

Kind regards,
{{senderName}}
{{companyName}}`,
  },
  {
    key: 'rejection_after_review',
    name: 'Rejection after human review',
    subject: 'Update on your {{jobTitle}} application ({{reference}})',
    body:
`Dear {{firstName}},

Thank you for the time and care you put into your application for the {{jobTitle}} role (reference {{reference}}), and for your interest in {{companyName}}.

After careful review by our recruitment team, we have decided not to move forward with your application on this occasion. This was a considered decision made by our staff, and it reflects the strength of the field rather than any single shortcoming.

We would be glad to keep your details on file and contact you if a role matching your experience opens up. If you would rather we did not, just reply to this email and we will remove them.

We wish you every success in your search.

Kind regards,
{{senderName}}
{{companyName}}`,
  },
  {
    key: 'talent_pool_added',
    name: 'Added to talent pool',
    subject: 'Keeping in touch — {{companyName}} opportunities',
    body:
`Dear {{firstName}},

Thank you again for applying for the {{jobTitle}} role (reference {{reference}}). While we did not have a matching opening this time, our team was impressed by your profile and we have added you to our talent pool.

This means we will reach out directly when a suitable role opens. If you would prefer not to be contacted about future opportunities, just reply to this email and we will remove your details.

Kind regards,
{{senderName}}
{{companyName}}`,
  },
]

export function validateTemplateInput(body: Record<string, unknown>, partial = false):
  { ok: true; value: Record<string, string | boolean> } | { ok: false; error: string } {
  const out: Record<string, string | boolean> = {}
  const need = (f: string) => body[f] !== undefined || !partial

  for (const [field, max] of [['name', 120], ['subject', 200], ['body', 10000]] as const) {
    if (need(field)) {
      const v = typeof body[field] === 'string' ? (body[field] as string).trim() : ''
      if (!v || v.length > max) return { ok: false, error: `${field} is required (max ${max} chars)` }
      out[field] = v
    }
  }
  for (const field of ['subject', 'body'] as const) {
    if (typeof out[field] === 'string') {
      const unknown = placeholdersIn(out[field] as string)
        .filter(p => !(TEMPLATE_VARS as readonly string[]).includes(p))
      if (unknown.length > 0) {
        return { ok: false, error: `Unknown placeholder(s): ${unknown.join(', ')}. Allowed: ${TEMPLATE_VARS.join(', ')}` }
      }
    }
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return { ok: false, error: 'isActive must be a boolean' }
    out.isActive = body.isActive
  }
  return { ok: true, value: out }
}
