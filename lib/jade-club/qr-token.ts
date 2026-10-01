// lib/jade-club/qr-token.ts — Signed, encrypted, rotatable Jade Card
// verification tokens.
//
// FORMAT (current, "v2"): "v2." + base64url(iv(12) || authTag(16) || ciphertext)
//   AES-256-GCM authenticated encryption of { membershipId, ver } as JSON.
//   The key is SHA-256(JADE_CLUB_QR_SECRET) — reuses the existing secret,
//   no new env var, no migration.
//
// FORMAT (legacy, kept for backward compatibility — see below):
//   base64url(payload_json) + "." + HMAC-SHA256(secret, payload_b64, hex)
//   Signed but NOT encrypted: membershipId is plainly readable by decoding
//   the base64url segment, without the server secret. The HMAC only proves
//   the token wasn't forged/tampered — it never hid the payload.
//
// WHY THE UPGRADE: the legacy format's membershipId is an internal DB cuid,
// not itself PII, but it IS an internal identifier, and the Phase 1 QR
// security requirement is that no internal ID be recoverable without the
// server secret. AES-256-GCM gives both properties the legacy format was
// missing: the payload is unreadable without the key, AND any tampering
// (ciphertext, IV, or tag) is rejected by the authentication tag check
// before any plaintext is ever produced — there is no "decrypts to garbage"
// state to reason about separately from "signature failed".
//
// BACKWARD COMPATIBILITY — WHY LEGACY VERIFICATION IS KEPT:
// Digital Jade Card QR codes are recomputed live on every page load (see
// getJadeClubCardView in membership.ts) — nothing is persisted — so once
// this file ships, every freshly-rendered card immediately gets a v2 token.
// But a customer may have already saved, printed, or screenshotted an
// old-format QR code before this change shipped, and that image is static —
// it cannot retroactively become a v2 token. Refusing to verify legacy
// tokens would silently break every such already-issued card with no
// warning and no customer-initiated action. So verification accepts EITHER
// format; only *creation* was upgraded. New tokens are NEVER issued in the
// legacy format again. A customer can still force themselves onto v2 at any
// time via the existing self-service "regenerate QR" rotation action
// (rotateOwnVerificationToken in membership.ts), which already bumps
// qrTokenVersion and produces a brand-new (now v2) token.
//
// WHY HMAC/AEAD instead of a stored-hash lookup token (e.g. the
// CreditCardAuthorization.secureTokenHash pattern): the Digital Jade Card
// must show the SAME QR value to its owner every time they open it, which
// requires the server to deterministically reproduce the current valid
// token from (membershipId, qrTokenVersion) — a one-way hash cannot do
// that. Rotation = bump qrTokenVersion on the JadeClubMembership row; every
// token signed/encrypted with a stale version fails verification
// immediately, with no separate revocation list needed. This property is
// unchanged by the v2 upgrade.
//
// SECURITY PROPERTIES (v2):
//   - membershipId is NOT recoverable without the server secret (AES-256-GCM
//     confidentiality) — unlike the legacy format.
//   - Forgery-proof and tamper-evident: GCM's authentication tag rejects any
//     modification to the ciphertext, IV, or tag before any plaintext is
//     produced; a client cannot construct a token for a foreign
//     membershipId or an arbitrary tier/status (those are looked up fresh
//     from the DB at verify time, never trusted from the token payload).
//   - Does NOT contain userId, session token, auth token, Miles balance,
//     payment information, bookings, or any other PII — only
//     {membershipId, ver}, exactly as before.
//   - Does NOT log the viewer into the account and does NOT create a
//     session/cookie — see lib/jade-club/verify.ts for the minimal public
//     view returned.
//   - Rotation/version semantics unchanged: a verified-authentic token whose
//     embedded version no longer matches the membership's current
//     qrTokenVersion is rejected as stale by the caller (verify.ts), exactly
//     as with the legacy format.

import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

function secret(): string {
  const s = process.env.JADE_CLUB_QR_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('JADE_CLUB_QR_SECRET or NEXTAUTH_SECRET must be set')
  return s
}

// AES-256-GCM needs a 32-byte key. SHA-256 here is a convenience KDF over an
// already-high-entropy platform secret (not a password hash) — it just
// reshapes JADE_CLUB_QR_SECRET into the exact key length GCM requires,
// without introducing a second secret to provision/rotate.
function encryptionKey(): Buffer {
  return createHash('sha256').update(secret()).digest()
}

const V2_PREFIX = 'v2.'
const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 16

interface QrTokenPayload {
  membershipId: string
  ver: number
}

function isValidPayloadShape(payload: unknown): payload is QrTokenPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.membershipId === 'string' && p.membershipId.length > 0 &&
    typeof p.ver === 'number' && Number.isFinite(p.ver)
  )
}

/** Always issues the current (v2, encrypted) format. See file header. */
export function createMembershipVerificationToken(membershipId: string, tokenVersion: number): string {
  const payload: QrTokenPayload = { membershipId, ver: tokenVersion }
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const iv = randomBytes(GCM_IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  // base64url is URL-safe by construction (no '+', '/', or '=' padding),
  // so this token embeds directly into a QR payload/URL with no further
  // encoding step.
  const blob = Buffer.concat([iv, authTag, ciphertext]).toString('base64url')
  return `${V2_PREFIX}${blob}`
}

export interface QrTokenVerifyResult {
  valid: boolean
  membershipId?: string
  tokenVersion?: number
  reason?: string
}

// Verifies ONLY the token's own authenticity + shape. Callers MUST
// separately compare the returned tokenVersion against the membership's
// CURRENT qrTokenVersion in the database before treating the token as live —
// this function has no DB access and cannot detect a rotated/stale token
// itself.
export function verifyMembershipVerificationTokenSignature(token: string): QrTokenVerifyResult {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' }
  return token.startsWith(V2_PREFIX) ? verifyV2Token(token) : verifyLegacyToken(token)
}

function verifyV2Token(token: string): QrTokenVerifyResult {
  const b64 = token.slice(V2_PREFIX.length)
  if (!b64) return { valid: false, reason: 'malformed' }

  let blob: Buffer
  try {
    blob = Buffer.from(b64, 'base64url')
  } catch {
    return { valid: false, reason: 'malformed' }
  }
  if (blob.length <= GCM_IV_LENGTH + GCM_TAG_LENGTH) {
    return { valid: false, reason: 'malformed' }
  }

  const iv = blob.subarray(0, GCM_IV_LENGTH)
  const authTag = blob.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH)
  const ciphertext = blob.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH)

  let plaintext: Buffer
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
    decipher.setAuthTag(authTag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    // Wrong key, tampered ciphertext/IV/tag, or truncated input all land
    // here as one outcome — GCM's tag verification happens before any
    // plaintext is released, so there is no partial-decrypt state to
    // distinguish. This collapses every integrity violation into a single,
    // uninformative failure reason by design.
    return { valid: false, reason: 'invalid_signature' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(plaintext.toString('utf8'))
  } catch {
    return { valid: false, reason: 'parse_error' }
  }
  if (!isValidPayloadShape(payload)) return { valid: false, reason: 'bad_payload' }

  return { valid: true, membershipId: payload.membershipId, tokenVersion: payload.ver }
}

// ─── Legacy (pre-encryption) format — verification only, never issued again ─
// Signed-but-readable tokens created before the v2 AEAD upgrade. Kept
// indefinitely so QR codes already printed/saved by customers before this
// change keep working — see the file header's "BACKWARD COMPATIBILITY" note.
function verifyLegacyToken(token: string): QrTokenVerifyResult {
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

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))
  } catch {
    return { valid: false, reason: 'parse_error' }
  }
  if (!isValidPayloadShape(payload)) return { valid: false, reason: 'bad_payload' }

  return { valid: true, membershipId: payload.membershipId, tokenVersion: payload.ver }
}
