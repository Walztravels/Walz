// lib/checkout/token.ts
// Short-lived, owner-scoped, HMAC-signed checkout tokens for Jade trip review URLs.
//
// These are NOT authentication tokens. They prove that:
//   1. The server ran a successful revalidation for a specific trip
//   2. The URL was generated for a specific owner (userId or sessionId)
//   3. The window is still live (30-minute TTL)
//
// Format: base64url(payload_json) + "." + HMAC-SHA256(secret, payload_b64, hex)

import { createHmac, timingSafeEqual } from 'crypto'

const TTL_MS = 30 * 60 * 1000  // 30 minutes

function secret(): string {
  const s = process.env.WALZ_CHECKOUT_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('WALZ_CHECKOUT_SECRET or NEXTAUTH_SECRET must be set')
  return s
}

interface TokenPayload {
  tripId:  string
  ownerId: string  // userId (authenticated) OR sessionId (anonymous)
  exp:     number  // unix ms
}

export function createCheckoutToken(tripId: string, ownerId: string): string {
  const payload: TokenPayload = { tripId, ownerId, exp: Date.now() + TTL_MS }
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = createHmac('sha256', secret()).update(b64).digest('hex')
  return `${b64}.${sig}`
}

export interface TokenVerifyResult {
  valid:    boolean
  payload?: TokenPayload
  reason?:  string
}

// Verifies signature + expiry + that this token belongs to the given trip/owner.
export function verifyCheckoutToken(
  token:   string,
  tripId:  string,
  ownerId: string,
): TokenVerifyResult {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' }

  const dotIdx = token.lastIndexOf('.')
  if (dotIdx < 1) return { valid: false, reason: 'malformed' }

  const b64 = token.slice(0, dotIdx)
  const sig  = token.slice(dotIdx + 1)

  const expected = createHmac('sha256', secret()).update(b64).digest('hex')

  // HMAC-SHA256 always produces 64 hex chars — guard against length mismatch
  if (sig.length !== 64 || expected.length !== 64) {
    return { valid: false, reason: 'sig_length' }
  }
  const sigOk = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  if (!sigOk) return { valid: false, reason: 'invalid_signature' }

  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'parse_error' }
  }

  if (payload.tripId  !== tripId)  return { valid: false, reason: 'trip_mismatch' }
  if (payload.ownerId !== ownerId) return { valid: false, reason: 'owner_mismatch' }
  if (payload.exp < Date.now())    return { valid: false, reason: 'expired' }

  return { valid: true, payload }
}

// Decode without verification — use only for non-security purposes (display)
export function decodeCheckoutToken(token: string): TokenPayload | null {
  try {
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx < 1) return null
    return JSON.parse(Buffer.from(token.slice(0, dotIdx), 'base64url').toString('utf8'))
  } catch {
    return null
  }
}
