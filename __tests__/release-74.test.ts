/**
 * @jest-environment node
 *
 * Release 7.4 — Loyalty & Referrals
 *
 * Tests (source-level — no DB/network calls):
 *  1.  referral_converted declared in CommercialEventName (track.ts source)
 *  2.  referral_credit_awarded declared in CommercialEventName (track.ts source)
 *  3.  loyalty_enrolled declared in CommercialEventName (track.ts source)
 *  4.  miles_earned declared in CommercialEventName (track.ts source)
 *  5.  Self-referral prevention: signup route guards referrerId !== newUser.id
 *  6.  Referral credit uses atomic increment:1, not read-then-write
 *  7.  miles_earned only fires when status transitions to CONFIRMED (bookings route)
 *  8.  CANCELLED booking does not contain miles earning code block
 *  9.  MILES_PER_CURRENCY_UNIT comes from process.env, not hardcoded as a constant
 * 10.  Rewards page requires getServerSession (auth guard)
 * 11.  Referral conversion fires only on confirmed booking, never on link click alone
 * 12.  referral_link_generated declared in CommercialEventName (track.ts source)
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

const trackSrc    = readSource('lib/commercial/track.ts')
const signupSrc   = readSource('app/api/auth/signup/route.ts')
const bookingsSrc = readSource('app/api/admin/bookings/[id]/route.ts')
const rewardsSrc  = readSource('app/portal/rewards/page.tsx')

// ── 1. referral_converted in CommercialEventName ─────────────────────────────
test('1. referral_converted is declared in CommercialEventName', () => {
  expect(trackSrc).toContain("'referral_converted'")
})

// ── 2. referral_credit_awarded in CommercialEventName ────────────────────────
test('2. referral_credit_awarded is declared in CommercialEventName', () => {
  expect(trackSrc).toContain("'referral_credit_awarded'")
})

// ── 3. loyalty_enrolled in CommercialEventName ───────────────────────────────
test('3. loyalty_enrolled is declared in CommercialEventName', () => {
  expect(trackSrc).toContain("'loyalty_enrolled'")
})

// ── 4. miles_earned in CommercialEventName ───────────────────────────────────
test('4. miles_earned is declared in CommercialEventName', () => {
  expect(trackSrc).toContain("'miles_earned'")
})

// ── 5. Self-referral prevention: referrer userId must not equal new user id ──
test('5. signup route prevents self-referral by checking referrerId !== user.id', () => {
  // The guard must compare the referral code owner against the newly created user
  expect(signupSrc).toMatch(/referralCode\.userId\s*!==\s*user\.id/)
})

// ── 6. Referral increment is atomic (increment: 1), not read-then-write ──────
test('6. referral uses increment is atomic increment:1, never read-then-write', () => {
  expect(signupSrc).toContain('increment: 1')
  // Must NOT read uses then add 1 manually
  expect(signupSrc).not.toMatch(/uses:\s*referralCode\.uses\s*\+/)
})

// ── 7. miles_earned only fires inside MARK_CONFIRMED block ───────────────────
test('7. miles_earned event is inside the MARK_CONFIRMED action handler', () => {
  // The CONFIRMED block should contain the miles_earned event call
  const confirmedBlockStart = bookingsSrc.indexOf("action === 'MARK_CONFIRMED'")
  const cancelledBlockStart = bookingsSrc.indexOf("action === 'MARK_CANCELLED'")
  expect(confirmedBlockStart).toBeGreaterThan(-1)
  const confirmedBlock = bookingsSrc.slice(confirmedBlockStart, cancelledBlockStart > confirmedBlockStart ? cancelledBlockStart : undefined)
  expect(confirmedBlock).toContain("'miles_earned'")
})

// ── 8. CANCELLED handler does not contain miles earning ──────────────────────
test('8. MARK_CANCELLED handler does not award miles', () => {
  const cancelledStart = bookingsSrc.indexOf("action === 'MARK_CANCELLED'")
  const cancelWithCreditStart = bookingsSrc.indexOf("action === 'CANCEL_WITH_CREDIT'")
  expect(cancelledStart).toBeGreaterThan(-1)
  const cancelledBlock = bookingsSrc.slice(
    cancelledStart,
    cancelWithCreditStart > cancelledStart ? cancelWithCreditStart : undefined
  )
  expect(cancelledBlock).not.toContain('miles_earned')
  expect(cancelledBlock).not.toContain('walzMilesTransaction')
  expect(cancelledBlock).not.toContain('walzRewardsMembership')
})

// ── 9. MILES_PER_CURRENCY_UNIT comes from process.env ───────────────────────
test('9. MILES_PER_CURRENCY_UNIT is read from process.env, not hardcoded', () => {
  expect(bookingsSrc).toContain('process.env.MILES_PER_CURRENCY_UNIT')
  // Must not be defined as a hardcoded literal constant (e.g. const MILES_PER_CURRENCY_UNIT = 1)
  expect(bookingsSrc).not.toMatch(/const\s+MILES_PER_CURRENCY_UNIT\s*=\s*\d/)
})

// ── 10. Rewards page requires auth via getServerSession ──────────────────────
test('10. portal rewards page calls getServerSession to enforce auth', () => {
  expect(rewardsSrc).toContain('getServerSession')
  expect(rewardsSrc).toContain('authOptions')
  // Must redirect unauthenticated users
  expect(rewardsSrc).toContain('redirect(')
})

// ── 11. Referral_converted fires after user is created, not on link click ────
test('11. referral_converted is fired after user creation, not before', () => {
  // trackCommercialEvent('referral_converted') must appear after prisma.user.create
  const userCreateIdx = signupSrc.indexOf('prisma.user.create')
  const eventIdx = signupSrc.indexOf("'referral_converted'")
  expect(userCreateIdx).toBeGreaterThan(-1)
  expect(eventIdx).toBeGreaterThan(-1)
  expect(eventIdx).toBeGreaterThan(userCreateIdx)
})

// ── 12. referral_link_generated in CommercialEventName ──────────────────────
test('12. referral_link_generated is declared in CommercialEventName', () => {
  expect(trackSrc).toContain("'referral_link_generated'")
})
