/**
 * Webhook request verification (INBOX-0S.4, corrected 2026-09-27 — see
 * P1 "Jade not responding on WhatsApp" incident).
 *
 * One place for every provider's authentication mechanism. All functions
 * are pure/deterministic (crypto only, no fetch, no env reads) so they
 * are unit-testable; routes read the env and pass secrets in. Secrets
 * are never logged and never appear in return values.
 *
 * Provider mechanisms (provider-supported, none invented here):
 *  - Chatwoot (self-hosted 4.15.x) signs both account-level integration
 *    webhooks AND Agent Bot outgoing webhooks with:
 *      X-Chatwoot-Signature:  "sha256=" + HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 *      X-Chatwoot-Timestamp:  unix seconds the request was signed
 *      X-Chatwoot-Delivery:   unique delivery id (when available)
 *    (confirmed against Chatwoot's own published webhook-verification
 *    docs; the PRIOR comment here — "Chatwoot sends NO signature" — was
 *    incorrect and led directly to the P1 incident: the AgentBot route
 *    was built to check a bearer token that Chatwoot never actually
 *    sends, and the account-webhook's HMAC path computed the signature
 *    over the raw body ALONE, omitting the required timestamp prefix, so
 *    it could never have verified a genuine Chatwoot signature either).
 *    A legacy shared-token mode (`?token=` / x-chatwoot-token) remains
 *    supported as an independent, optional mechanism for callers that
 *    choose to configure it — but is no longer relied on for the AgentBot
 *    route, which now requires a valid signature.
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

// Replay-protection window for Chatwoot's X-Chatwoot-Timestamp. No existing
// project policy specifies a stricter figure for this provider, so this
// uses the 5-minute tolerance requested for this fix — generous enough to
// absorb ordinary clock skew and Chatwoot's own delivery/retry latency,
// tight enough that a captured signature+body pair is useless to a replay
// attacker after a few minutes.
const CHATWOOT_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

// A syntactically well-formed lowercase-or-uppercase-hex SHA-256 digest —
// checked BEFORE any crypto call so a malformed signature is rejected
// cheaply and safely rather than handed to createHmac/timingSafeEqual.
const HEX_SHA256_RE = /^[0-9a-f]{64}$/i

/**
 * Verifies Chatwoot's HMAC-SHA256 webhook signature.
 *   expected = HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 * Both the signature AND the timestamp header are REQUIRED together —
 * a signature with no timestamp (or vice versa) is rejected rather than
 * silently treated as unsigned, and a timestamp outside the tolerance
 * window is rejected even if the signature itself is otherwise valid
 * (replay protection: a captured signature+body+timestamp triple from
 * outside the window can never be replayed successfully).
 */
function verifyChatwootHmac(
  rawBody:         string,
  headerSig:       string | null,
  headerTimestamp: string | null,
  hmacSecret:      string,
  nowSeconds?:     number,
): 'ok' | 'invalid' {
  if (!headerSig || !headerTimestamp) return 'invalid'

  const [algo, hex] = headerSig.split('=')
  if (algo !== 'sha256' || !hex || !HEX_SHA256_RE.test(hex)) return 'invalid'

  const timestamp = Number(headerTimestamp)
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp) || timestamp <= 0) return 'invalid'

  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > CHATWOOT_TIMESTAMP_TOLERANCE_SECONDS) return 'invalid'

  // The raw X-Chatwoot-Timestamp STRING is part of the signed material —
  // not the parsed/re-stringified number — so any reformatting (leading
  // zeros, different width) can never accidentally match or mismatch.
  const expected = createHmac('sha256', hmacSecret).update(`${headerTimestamp}.${rawBody}`).digest('hex')
  // Normalize case before comparing — createHmac always emits lowercase,
  // and the syntax check above (HEX_SHA256_RE, case-insensitive) otherwise
  // accepts but then rejects a correctly-signed uppercase-hex header. This
  // matches verifyMetaSignature's own hex.toLowerCase() below. Fail-safe
  // either way (over-rejection, never a bypass) — this just avoids a
  // spurious reject on an otherwise-valid signature.
  return safeEqual(hex.toLowerCase(), expected) ? 'ok' : 'invalid'
}

/**
 * FAIL CLOSED: 'unconfigured' when neither mechanism has a secret set at
 * all — the route must reject, never process. When an HMAC secret is
 * configured, Chatwoot's signature (see verifyChatwootHmac above) must
 * verify. When a legacy shared token is ALSO configured, it is checked
 * independently (query param `token` or x-chatwoot-token header) — either
 * configured mechanism passing is sufficient, but a configured mechanism
 * failing never falls through to an implicit allow.
 */
export function verifyChatwootRequest(input: {
  rawBody:          string
  headerToken:      string | null   // x-chatwoot-token (legacy shared-token mode)
  queryToken:       string | null   // ?token= (legacy shared-token mode)
  headerSig:        string | null   // x-chatwoot-signature ("sha256=<hex>")
  headerTimestamp:  string | null   // x-chatwoot-timestamp (unix seconds; required alongside headerSig)
  tokenSecret:      string | undefined
  hmacSecret:       string | undefined
  /** Test-only: overrides "now" for replay-window checks. Never read from a request. */
  nowSecondsForTest?: number
}): ChatwootVerifyResult {
  const tokenSecret = (input.tokenSecret ?? '').trim()
  const hmacSecret  = (input.hmacSecret ?? '').trim()
  if (!tokenSecret && !hmacSecret) return 'unconfigured'

  if (hmacSecret) {
    const verdict = verifyChatwootHmac(input.rawBody, input.headerSig, input.headerTimestamp, hmacSecret, input.nowSecondsForTest)
    if (verdict === 'ok') return 'ok'
  }
  if (tokenSecret) {
    const provided = input.queryToken ?? input.headerToken
    if (provided && safeEqual(provided, tokenSecret)) return 'ok'
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
