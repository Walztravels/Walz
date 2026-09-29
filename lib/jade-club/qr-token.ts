// lib/jade-club/qr-token.ts — Signed, rotatable Jade Card verification tokens.
//
// Modeled directly on lib/checkout/token.ts's HMAC-signed opaque token
// pattern (this repo's existing convention for a non-authentication,
// server-verifiable public token).
//
// Format: base64url(payload_json) + "." + HMAC-SHA256(secret, payload_b64, hex)
//
// WHY HMAC instead of a stored-hash lookup token (e.g. the
// CreditCardAuthorization.secureTokenHash pattern): the Digital Jade Card
// must show the SAME QR value to its owner every time they open it (and,
// eventually, a printed physical card's QR must stay stable) — that
// requires the server to reproduce the exact same token on demand, which a
// one-way hash cannot do. HMAC lets the server deterministically regenerate
// the current valid token from (membershipId, qrTokenVersion) without
// storing the raw token anywhere. Rotation = bump qrTokenVersion on the
// JadeClubMembership row (see rotateVerificationToken in membership.ts) —
// every token signed with a stale version fails verification immediately,
// with no separate revocation list needed.
//
// SECURITY PROPERTIES:
//   - Does NOT contain userId, membership DB id pattern beyond an opaque
//     cuid the token itself doesn't expose any more than the membershipId
//     already does internally, session token, auth token, Miles balance, or
//     any PII. The membershipId is an internal identifier used ONLY to look
//     up the membership server-side at verify time — it is never rendered
//     to the viewer of the verification result (see lib/jade-club/verify.ts).
//   - Forgery-proof: requires the server-side secret to produce a valid
//     signature; a client cannot construct a token for a foreign
//     membershipId or an arbitrary tier/status (those are looked up fresh
//     from the DB at verify time, never trusted from the token payload).
//   - Does NOT log the viewer into the account and does NOT expose bookings,
//     passport data, Miles transactions, payment information, or any other
//     account details — see lib/jade-club/verify.ts for the minimal public
//     view returned.

import { createHmac, timingSafeEqual } from 'crypto'

function secret(): string {
  const s = process.env.JADE_CLUB_QR_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('JADE_CLUB_QR_SECRET or NEXTAUTH_SECRET must be set')
  return s
}

interface QrTokenPayload {
  membershipId: string
  ver: number
}

export function createMembershipVerificationToken(membershipId: string, tokenVersion: number): string {
  const payload: QrTokenPayload = { membershipId, ver: tokenVersion }
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret()).update(b64).digest('hex')
  return `${b64}.${sig}`
}

export interface QrTokenVerifyResult {
  valid: boolean
  membershipId?: string
  tokenVersion?: number
  reason?: string
}

// Verifies ONLY the signature + shape of the token. Callers MUST separately
// compare the returned tokenVersion against the membership's CURRENT
// qrTokenVersion in the database before treating the token as live — this
// function has no DB access and cannot detect a rotated/stale token itself.
export function verifyMembershipVerificationTokenSignature(token: string): QrTokenVerifyResult {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' }

  const dotIdx = token.lastIndexOf('.')
  if (dotIdx < 1) return { valid: false, reason: 'malformed' }

  const b64 = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)

  let expected: string
  try {
    expected = createHmac('sha256', secret()).update(b64).digest('hex')
  } catch {
    return { valid: false, reason: 'config_error' }
  }

  if (sig.length !== 64 || expected.length !== 64) {
    return { valid: false, reason: 'sig_length' }
  }
  const sigOk = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  if (!sigOk) return { valid: false, reason: 'invalid_signature' }

  let payload: QrTokenPayload
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'parse_error' }
  }

  if (typeof payload.membershipId !== 'string' || !payload.membershipId) {
    return { valid: false, reason: 'bad_payload' }
  }
  if (typeof payload.ver !== 'number' || !Number.isFinite(payload.ver)) {
    return { valid: false, reason: 'bad_payload' }
  }

  return { valid: true, membershipId: payload.membershipId, tokenVersion: payload.ver }
}
