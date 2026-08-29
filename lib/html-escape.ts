/**
 * HTML escaping for email templates.
 *
 * All user-controlled strings (acceptedBy, clientName, destination,
 * option labels, etc.) MUST be passed through esc() before interpolation
 * into HTML email bodies. Never trust browser-supplied text.
 */
export function esc(value: unknown): string {
  const s = String(value ?? '')
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}
