import { Resend as ResendBase } from 'resend'

/**
 * Deliverability-hardened Resend client — the ONLY way the app talks to
 * Resend (an import-lint test pins every module to this wrapper).
 *
 * Spam filters score HTML-only messages down because legitimate senders
 * almost always include a text/plain alternative and spam almost never
 * does. Most of our ~60 send sites were html-only, so every outgoing
 * email is now guaranteed a plain-text part: sites that set `text`
 * keep it, and html-only payloads get one derived from the HTML.
 *
 * The derivation must never break sending — any failure falls back to
 * the original payload untouched.
 */

/** Very small HTML → text conversion for the multipart alternative. */
export function htmlToPlainText(html: string): string {
  let s = html
    // Drop non-content blocks entirely.
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Keep link destinations: "label (https://…)" — but not self-labelled ones.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, '').trim()
        if (!text) return href
        return text === href || href.startsWith('mailto:') ? text : `${text} (${href})`
      })
    // Block-level boundaries become line breaks before tags are stripped.
    .replace(/<\/(p|div|tr|table|h[1-6]|li|ul|ol|blockquote)>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
  // Decode the entities our templates actually use.
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, code: string) => {
      const n = Number(code)
      return Number.isFinite(n) && n >= 32 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
    })
  // Collapse the whitespace debris HTML leaves behind.
  return s
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type SendPayload = { html?: string; text?: string } & Record<string, unknown>

export class Resend extends ResendBase {
  constructor(apiKey?: string) {
    super(apiKey)
    const original = this.emails.send.bind(this.emails)
    // Signature-preserving wrapper: only the payload is (maybe) augmented.
    this.emails.send = ((payload: SendPayload, ...rest: unknown[]) => {
      try {
        if (payload && typeof payload.html === 'string' && payload.html && !payload.text) {
          const text = htmlToPlainText(payload.html)
          if (text) payload = { ...payload, text }
        }
      } catch { /* never block a send over the text derivation */ }
      return (original as (...a: unknown[]) => unknown)(payload, ...rest)
    }) as unknown as typeof this.emails.send
  }
}
