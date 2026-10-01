/**
 * Jade Travel Club — QR verification token tests.
 * Covers section 22/25 of the Jade Travel Club Phase 1 brief: QR
 * confidentiality (AES-256-GCM, "v2" format), forgery/tampering rejection,
 * replay/rotation, malformed tokens, and backward compatibility with
 * already-issued legacy (signed-but-readable) tokens.
 */

import { createHmac } from 'crypto'

process.env.JADE_CLUB_QR_SECRET = 'test-secret-for-jade-club-qr-tokens-only'

import {
  createMembershipVerificationToken,
  verifyMembershipVerificationTokenSignature,
} from '../qr-token'

// Builds a legacy-format token exactly as the pre-upgrade implementation
// did, so backward-compatibility tests don't depend on any legacy-creation
// code path still existing in qr-token.ts (new tokens are NEVER issued in
// this format anymore).
function makeLegacyToken(membershipId: string, ver: number, secret = process.env.JADE_CLUB_QR_SECRET!): string {
  const b64 = Buffer.from(JSON.stringify({ membershipId, ver })).toString('base64url')
  const sig = createHmac('sha256', secret).update(b64).digest('hex')
  return `${b64}.${sig}`
}

describe('createMembershipVerificationToken / verifyMembershipVerificationTokenSignature — v2 (AES-256-GCM)', () => {
  it('round-trips a valid token', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const result = verifyMembershipVerificationTokenSignature(token)
    expect(result.valid).toBe(true)
    expect(result.membershipId).toBe('membership_123')
    expect(result.tokenVersion).toBe(1)
  })

  it('always issues the current "v2." prefixed format', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    expect(token.startsWith('v2.')).toBe(true)
  })

  it('does NOT reveal the membershipId when the token is decoded/inspected without the server secret', () => {
    const token = createMembershipVerificationToken('membership_super_secret_id', 1)
    const [, blob] = token.split(/\.(.+)/) // split on first dot only
    // A naive base64url-decode of the ciphertext blob must NOT reproduce the
    // plaintext JSON or the membershipId in any recognizable form — this is
    // the exact property the legacy format was missing.
    const rawDecoded = Buffer.from(blob, 'base64url').toString('utf8')
    expect(rawDecoded).not.toContain('membership_super_secret_id')
    expect(rawDecoded).not.toContain('membershipId')
    // Deliberately NOT asserting "no '@' substring" here: rawDecoded is a
    // utf8-decode of raw AES-GCM ciphertext bytes (IV + authTag + encrypted
    // data), not plaintext — by design, those bytes are indistinguishable
    // from random noise, so any single byte value (including 0x40, '@') can
    // legitimately appear by chance. Such a check only means something
    // against structured plaintext, which is exactly what a v2 token no
    // longer is — that's the point of this upgrade. Asserting it here would
    // be flaky (fails roughly 1 run in a few hundred, purely from random
    // byte content) and would be testing randomness, not confidentiality.
    // The two toContain() checks above are the real, deterministic proof
    // that the membershipId itself isn't recoverable from the blob.
  })

  it('rejects a token with a tampered ciphertext byte', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const [prefix, blob] = token.split(/\.(.+)/)
    const bytes = Buffer.from(blob, 'base64url')
    bytes[bytes.length - 1] ^= 0xff // flip the last byte (inside the ciphertext region)
    const tampered = `${prefix}.${bytes.toString('base64url')}`
    const result = verifyMembershipVerificationTokenSignature(tampered)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a token with a tampered auth tag', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const [prefix, blob] = token.split(/\.(.+)/)
    const bytes = Buffer.from(blob, 'base64url')
    bytes[12] ^= 0xff // byte 12 is inside the 16-byte auth tag (after the 12-byte IV)
    const tampered = `${prefix}.${bytes.toString('base64url')}`
    const result = verifyMembershipVerificationTokenSignature(tampered)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a token with a tampered IV', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const [prefix, blob] = token.split(/\.(.+)/)
    const bytes = Buffer.from(blob, 'base64url')
    bytes[0] ^= 0xff // byte 0 is inside the 12-byte IV
    const tampered = `${prefix}.${bytes.toString('base64url')}`
    const result = verifyMembershipVerificationTokenSignature(tampered)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a token encrypted/signed with a different secret (forgery without the server secret)', () => {
    const originalSecret = process.env.JADE_CLUB_QR_SECRET
    process.env.JADE_CLUB_QR_SECRET = 'a-completely-different-secret'
    const tokenFromAttacker = createMembershipVerificationToken('membership_123', 1)
    process.env.JADE_CLUB_QR_SECRET = originalSecret

    // Verified back under the REAL server secret — must fail.
    const result = verifyMembershipVerificationTokenSignature(tokenFromAttacker)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a malformed v2 token (truncated blob, shorter than IV+authTag)', () => {
    const result = verifyMembershipVerificationTokenSignature('v2.' + Buffer.from('short').toString('base64url'))
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('malformed')
  })

  it('rejects a v2 token with an empty blob', () => {
    const result = verifyMembershipVerificationTokenSignature('v2.')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('malformed')
  })

  it('rejects garbled non-base64 input after the v2 prefix', () => {
    const result = verifyMembershipVerificationTokenSignature('v2.!!!not-base64!!!')
    expect(result.valid).toBe(false)
  })

  it('rejects an empty/missing token', () => {
    expect(verifyMembershipVerificationTokenSignature('').valid).toBe(false)
    // @ts-expect-error — exercising runtime guard against non-string input
    expect(verifyMembershipVerificationTokenSignature(undefined).valid).toBe(false)
  })

  it('rejects a completely unstructured string', () => {
    expect(verifyMembershipVerificationTokenSignature('not-a-real-token').valid).toBe(false)
  })

  it('different membershipId/version pairs produce different tokens (no replay across memberships)', () => {
    const t1 = createMembershipVerificationToken('membership_123', 1)
    const t2 = createMembershipVerificationToken('membership_456', 1)
    expect(t1).not.toBe(t2)
  })

  it('the same membershipId/version produces a DIFFERENT token on each call (random IV — not deterministic/replayable ciphertext)', () => {
    const a = createMembershipVerificationToken('membership_123', 1)
    const b = createMembershipVerificationToken('membership_123', 1)
    expect(a).not.toBe(b)
    // Both must still independently verify to the same logical identity.
    expect(verifyMembershipVerificationTokenSignature(a)).toMatchObject({ valid: true, membershipId: 'membership_123', tokenVersion: 1 })
    expect(verifyMembershipVerificationTokenSignature(b)).toMatchObject({ valid: true, membershipId: 'membership_123', tokenVersion: 1 })
  })

  it('rotating the version changes the token (old QR invalidated by version bump at the caller level)', () => {
    const v1 = createMembershipVerificationToken('membership_123', 1)
    const v2 = createMembershipVerificationToken('membership_123', 2)
    expect(v1).not.toBe(v2)
    // The v1 token's own authenticity is still intact (it WAS legitimately
    // issued) — staleness against the CURRENT db version is checked by the
    // caller (lib/jade-club/verify.ts), not by this function alone.
    const v1Result = verifyMembershipVerificationTokenSignature(v1)
    expect(v1Result.valid).toBe(true)
    expect(v1Result.tokenVersion).toBe(1)
  })
})

describe('legacy (pre-v2) token backward compatibility', () => {
  it('still verifies a legacy-format token issued before the AEAD upgrade', () => {
    const legacy = makeLegacyToken('membership_old_card', 3)
    const result = verifyMembershipVerificationTokenSignature(legacy)
    expect(result.valid).toBe(true)
    expect(result.membershipId).toBe('membership_old_card')
    expect(result.tokenVersion).toBe(3)
  })

  it('still rejects a tampered legacy token (forged payload, stale signature)', () => {
    const legacy = makeLegacyToken('membership_old_card', 1)
    const [, sig] = legacy.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ membershipId: 'someone_elses_membership', ver: 1 })).toString('base64url')
    const forged = `${forgedPayload}.${sig}`
    const result = verifyMembershipVerificationTokenSignature(forged)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('still rejects a legacy token signed with a different secret', () => {
    const legacy = makeLegacyToken('membership_old_card', 1, 'a-different-secret')
    const result = verifyMembershipVerificationTokenSignature(legacy)
    expect(result.valid).toBe(false)
  })

  it('a legacy token never starts with the v2 prefix, so it is unambiguously routed to legacy verification', () => {
    const legacy = makeLegacyToken('membership_old_card', 1)
    expect(legacy.startsWith('v2.')).toBe(false)
  })
})
