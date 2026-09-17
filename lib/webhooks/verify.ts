/**
 * Webhook request verification (INBOX-0S.4).
 *
 * One place for every provider's authentication mechanism. All functions
 * are pure/deterministic (crypto only, no fetch, no env reads) so they
 * are unit-testable; routes read the env and pass secrets in. Secrets
 * are never logged and never appear in return values.
 *
 * Provider mechanisms (provider-supported, none invented here):
 *  - Chatwoot (self-hosted 4.15.x) sends NO signature for account
 *    webhooks. The supported pattern is a shared secret carried in the
 *    webhook URL (?token=...) — configured on the Chatwoot side as part
 *    of the callback URL — or an x-chatwoot-token header where a proxy
 *    adds one. An HMAC check (x-chatwoot-signature) is honored when a
 *    secret for it is configured.
 *  - Meta (Messenger/Instagram/WhatsApp Cloud): X-Hub-Signature-256 =
 *    'sha256=' + HMAC-SHA256(app secret, raw body).
 *  - Twilio: X-Twilio-Signature = base64(HMAC-SHA1(auth token,
 *    url + sorted-concatenated POST params)).
 */

import { createHmac, timingSafeEqual } from 'crypto'

const safeEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  try { return timingSafeEqual(ba, bb) } catch { return false }
}

// ── Chatwoot ─────────────────────────────────────────────────────────────────

export type ChatwootVerifyResult = 'ok' | 'invalid' | 'unconfigured'

/**
 * FAIL CLOSED: 'unconfigured' when no verification secret is set at all —
 * the route must reject, never process. When a token is configured it must
 * match (query param `token` or x-chatwoot-token header); when an HMAC
 * secret is configured the x-chatwoot-signature must verify. Either
 * configured mechanism passing is sufficient; a configured mechanism
 * failing no longer falls through to allow.
 */
export function verifyChatwootRequest(input: {
  rawBody:        string
  headerToken:    string | null   // x-chatwoot-token
  queryToken:     string | null   // ?token=
  headerSig:      string | null   // x-chatwoot-signature ("sha256=<hex>")
  tokenSecret:    string | undefined
  hmacSecret:     string | undefined
}): ChatwootVerifyResult {
  const tokenSecret = (input.tokenSecret ?? '').trim()
  const hmacSecret  = (input.hmacSecret ?? '').trim()
  if (!tokenSecret && !hmacSecret) return 'unconfigured'

  if (tokenSecret) {
    const provided = input.queryToken ?? input.headerToken
    if (provided && safeEqual(provided, tokenSecret)) return 'ok'
  }
  if (hmacSecret && input.headerSig) {
    const [algo, hex] = input.headerSig.split('=')
    if (algo === 'sha256' && hex) {
      const expected = createHmac('sha256', hmacSecret).update(input.rawBody).digest('hex')
      if (safeEqual(hex, expected)) return 'ok'
    }
  }
  return 'invalid'
}

// ── Meta (X-Hub-Signature-256) ───────────────────────────────────────────────

export function verifyMetaSignature(
  rawBody:   string,
  signature: string | null,   // "sha256=<hex>"
  appSecret: string,
): boolean {
  if (!appSecret || !signature) return false
  const [algo, hex] = signature.split('=')
  if (algo !== 'sha256' || !hex) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return safeEqual(hex.toLowerCase(), expected)
}

// ── Twilio (X-Twilio-Signature) ──────────────────────────────────────────────

/**
 * Twilio signs: full request URL (exactly as configured in the Twilio
 * console) + each POST param appended as name+value in lexicographic
 * name order; HMAC-SHA1, base64. The URL must be the externally visible
 * one — pass an explicit configured URL, never a guessed proxy URL.
 */
export function verifyTwilioSignature(
  url:       string,
  params:    Record<string, string>,
  signature: string | null,
  authToken: string,
): boolean {
  if (!authToken || !signature) return false
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('')
  const expected = createHmac('sha1', authToken).update(data, 'utf8').digest('base64')
  return safeEqual(signature, expected)
}

/**
 * The externally visible URL for a request behind Vercel's proxy.
 * Prefers the explicitly configured URL (exact match with the Twilio
 * console) and otherwise reconstructs from forwarded headers — never
 * from req.url's internal host.
 */
export function externalWebhookUrl(
  configuredUrl: string | undefined,
  headers: { get(name: string): string | null },
  pathname: string,
): string | null {
  const configured = (configuredUrl ?? '').trim()
  if (configured) return configured
  const host  = headers.get('x-forwarded-host') ?? headers.get('host')
  if (!host) return null
  const proto = headers.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}${pathname}`
}

// ── Log hygiene ──────────────────────────────────────────────────────────────

/** Mask an identifier for diagnostics: keep the last 4 characters. */
export function maskId(value: string | null | undefined): string {
  if (!value) return '(none)'
  const s = String(value)
  return s.length <= 4 ? '****' : `…${s.slice(-4)}`
}
