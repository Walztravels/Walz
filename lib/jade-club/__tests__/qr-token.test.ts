/**
 * Jade Travel Club — QR verification token tests.
 * Covers section 22/25 of the Jade Travel Club Phase 1 brief: QR forgery,
 * QR replay/rotation, malformed tokens.
 */

process.env.JADE_CLUB_QR_SECRET = 'test-secret-for-jade-club-qr-tokens-only'

import {
  createMembershipVerificationToken,
  verifyMembershipVerificationTokenSignature,
} from '../qr-token'

describe('createMembershipVerificationToken / verifyMembershipVerificationTokenSignature', () => {
  it('round-trips a valid token', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const result = verifyMembershipVerificationTokenSignature(token)
    expect(result.valid).toBe(true)
    expect(result.membershipId).toBe('membership_123')
    expect(result.tokenVersion).toBe(1)
  })

  it('does not embed userId, email, or any recognizable PII in the token', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const [b64] = token.split('.')
    const decoded = Buffer.from(b64, 'base64url').toString('utf8')
    expect(decoded).not.toMatch(/@/) // no email
    expect(decoded).toBe(JSON.stringify({ membershipId: 'membership_123', ver: 1 }))
  })

  it('rejects a tampered payload (forged membershipId)', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const [, sig] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ membershipId: 'someone_elses_membership', ver: 1 })).toString('base64url')
    const forged = `${forgedPayload}.${sig}`
    const result = verifyMembershipVerificationTokenSignature(forged)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('invalid_signature')
  })

  it('rejects a token signed with a different secret (forgery without server secret)', () => {
    const token = createMembershipVerificationToken('membership_123', 1)
    const [b64] = token.split('.')
    // Attacker without the server secret cannot produce a valid signature —
    // simulate by supplying a random 64-hex-char signature.
    const forged = `${b64}.${'a'.repeat(64)}`
    const result = verifyMembershipVerificationTokenSignature(forged)
    expect(result.valid).toBe(false)
  })

  it('rejects a malformed token (no dot separator)', () => {
    expect(verifyMembershipVerificationTokenSignature('not-a-real-token').valid).toBe(false)
  })

  it('rejects an empty/missing token', () => {
    expect(verifyMembershipVerificationTokenSignature('').valid).toBe(false)
    // @ts-expect-error — exercising runtime guard against non-string input
    expect(verifyMembershipVerificationTokenSignature(undefined).valid).toBe(false)
  })

  it('rejects garbled base64 payload', () => {
    const result = verifyMembershipVerificationTokenSignature('!!!not-base64!!!.' + 'a'.repeat(64))
    expect(result.valid).toBe(false)
  })

  it('different membershipId/version pairs produce different tokens (no replay across memberships)', () => {
    const t1 = createMembershipVerificationToken('membership_123', 1)
    const t2 = createMembershipVerificationToken('membership_456', 1)
    expect(t1).not.toBe(t2)
  })

  it('rotating the version changes the token (old QR invalidated by version bump)', () => {
    const v1 = createMembershipVerificationToken('membership_123', 1)
    const v2 = createMembershipVerificationToken('membership_123', 2)
    expect(v1).not.toBe(v2)
    // The v1 token's signature is still internally valid (it WAS legitimately
    // issued) — staleness against the CURRENT db version is checked by the
    // caller (lib/jade-club/verify.ts), not by signature verification alone.
    const v1Result = verifyMembershipVerificationTokenSignature(v1)
    expect(v1Result.valid).toBe(true)
    expect(v1Result.tokenVersion).toBe(1)
  })
})
