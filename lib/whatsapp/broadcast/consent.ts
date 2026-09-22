/**
 * WhatsApp Broadcast V1 — the eligibility decision tree.
 *
 * Pure. No Prisma, no env, no I/O — the single source of truth for "may we
 * send this person a marketing broadcast?", so it can be exhaustively
 * unit-tested and read in one sitting.
 *
 * ── THE CONSENT POSITION ────────────────────────────────────────────────
 * `Lead.marketingOptOut` is a Boolean defaulting to FALSE. It records that
 * someone asked to STOP; it records nothing whatsoever about anyone having
 * asked to START. Treating `marketingOptOut === false` as consent would
 * silently enrol every lead the business has ever touched — including
 * people who only ever sent one inbound WhatsApp message — into marketing
 * broadcasts. That is exactly the failure this module exists to prevent.
 *
 * Affirmative consent therefore lives in its own table (WhatsAppConsent),
 * keyed on the phone number, carrying a status, a source, evidence and a
 * timestamp. Absence of a row is UNKNOWN, and UNKNOWN is NOT eligible.
 *
 * At the time of writing NOTHING in the product writes WhatsAppConsent, so
 * the honest eligible count for any audience is currently ZERO. That is
 * the correct output of this code, not a bug to be loosened around.
 */

/** Stored consent status vocabulary (CHECK-constrained in SQL). */
export type ConsentStatus = 'SUBSCRIBED' | 'UNKNOWN' | 'OPTED_OUT'

/** Why a matched lead did not make it into the send set. */
export type SkipReason = 'OPT_OUT' | 'NO_CONSENT' | 'INVALID_NUMBER'

/** The recipient-row status each skip reason maps to. */
export const SKIP_REASON_TO_STATUS: Record<SkipReason, string> = {
  OPT_OUT: 'SKIPPED_OPT_OUT',
  NO_CONSENT: 'SKIPPED_NO_CONSENT',
  INVALID_NUMBER: 'SKIPPED_INVALID_NUMBER',
}

export interface EligibilityInput {
  /** Lead.marketingOptOut — the hard, never-bypassable override. */
  marketingOptOut: boolean
  /** normalizePhoneE164() output, or null when there is no usable number. */
  normalizedNumber: string | null
  /** The WhatsAppConsent row for that number, or null when none exists. */
  consent: { status: ConsentStatus } | null
}

export type EligibilityDecision =
  | { eligible: true }
  | { eligible: false; reason: SkipReason }

/**
 * THE DECISION TREE — evaluated strictly in this order.
 *
 *  1. Lead.marketingOptOut === true          → OPT_OUT.      HARD OVERRIDE.
 *     Checked FIRST and unconditionally, so no consent row, however
 *     recent or however affirmative, can ever re-enrol someone who has
 *     explicitly opted out. There is no parameter, flag or caller that
 *     skips this branch.
 *  2. No usable normalized number            → INVALID_NUMBER.
 *     Checked before consent because a person we cannot address is not a
 *     consent question. (Order between 2 and 3 changes only which bucket
 *     the count lands in; neither is ever sendable.)
 *  3. consent === null                       → NO_CONSENT.  (UNKNOWN)
 *  4. consent.status === 'OPTED_OUT'         → OPT_OUT.
 *  5. consent.status !== 'SUBSCRIBED'        → NO_CONSENT.
 *     Written as a positive allowlist, not `!== 'UNKNOWN'`: a future or
 *     unrecognised status value fails CLOSED.
 *  6. otherwise                              → eligible.
 */
export function decideEligibility(input: EligibilityInput): EligibilityDecision {
  // 1 — hard override, always first, never bypassable.
  if (input.marketingOptOut === true) return { eligible: false, reason: 'OPT_OUT' }

  // 2 — no addressable WhatsApp number.
  if (!input.normalizedNumber) return { eligible: false, reason: 'INVALID_NUMBER' }

  // 3 — no consent record at all is UNKNOWN, which is not consent.
  if (!input.consent) return { eligible: false, reason: 'NO_CONSENT' }

  // 4 — an explicit consent-side opt-out.
  if (input.consent.status === 'OPTED_OUT') return { eligible: false, reason: 'OPT_OUT' }

  // 5 — fail closed on anything that is not an explicit subscription.
  if (input.consent.status !== 'SUBSCRIBED') return { eligible: false, reason: 'NO_CONSENT' }

  // 6 — affirmative, auditable consent and a usable number.
  return { eligible: true }
}

/**
 * Deliberately NOT exported as anything resembling
 * `isOptedIn(lead.marketingOptOut)`. The only correct reading of
 * marketingOptOut is this one: it can EXCLUDE, it can never INCLUDE.
 */
export function isHardExcluded(marketingOptOut: boolean): boolean {
  return marketingOptOut === true
}
