/**
 * Walz Consent Foundation V1 — the purpose taxonomy and the write decision.
 *
 * Pure. No Prisma, no env, no I/O — so the one rule that actually matters
 * ("a consent record exists ONLY because a human affirmatively checked a
 * box") is a deterministic function that can be exhaustively unit-tested.
 *
 * ── WHY THIS TABLE IS SEPARATE FROM WhatsAppConsent ─────────────────────
 * WhatsAppConsent (lib/whatsapp/broadcast/consent.ts) remains the SOLE
 * source of truth for WhatsApp marketing broadcast eligibility. Nothing in
 * this module is read by that decision path, and nothing here writes that
 * table. WHATSAPP_MARKETING appears in the taxonomy below only so that a
 * future unified consent report has a name for the channel — it is NOT an
 * alternate eligibility source, and wiring it into the broadcast gate is an
 * explicit, separate, owner-approved decision that has not been made.
 *
 * ── THE CONSENT POSITION (inherited deliberately) ───────────────────────
 * Exactly as WhatsAppConsent treats "no row" as UNKNOWN and therefore NOT
 * eligible, a (number, purpose) pair with no row here has NO consent. The
 * presence of a phone number anywhere else in the system — a Lead, a
 * VisaApplication, a Client, a booking made years ago — is NOT consent and
 * must never mint a row here. There is deliberately no backfill path, and
 * `decideConsentWrite` is the only sanctioned way to reach a write.
 */

import { SMS_SENDER_PHRASE, SMS_SENDER_ENTITY_NAME, BRAND_NAME } from '@/lib/config/legal-entities'

// ── Purpose taxonomy ────────────────────────────────────────────────────

/**
 * The three consent purposes. CHECK-constrained in SQL (TEXT + CHECK, this
 * repo's convention — widening a CHECK is a trivial idempotent ALTER;
 * ALTER TYPE ... ADD VALUE is not). Mirrors WhatsAppConsent.status's style.
 *
 * Each is INDEPENDENT: consent is keyed on (normalized number, purpose), so
 * one person can be GRANTED for SMS_CUSTOMER_CARE while having no row at
 * all for SMS_MARKETING. Granting one NEVER implies another.
 */
export const CONSENT_PURPOSES = [
  'SMS_CUSTOMER_CARE',
  'SMS_MARKETING',
  'WHATSAPP_MARKETING',
] as const

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]

/**
 * Stored status vocabulary (CHECK-constrained in SQL).
 *  - GRANTED     — an affirmative, logged, timestamped user action.
 *  - NOT_GRANTED — an explicitly recorded negative (reserved; the booking
 *                  checkout does NOT write this, see decideConsentWrite).
 *  - REVOKED     — a previously granted consent withdrawn (STOP, request).
 *
 * Absence of a row is a FOURTH, distinct state: "never asked / never
 * answered". It is not NOT_GRANTED and must not be conflated with it.
 */
export const CONSENT_STATUSES = ['GRANTED', 'NOT_GRANTED', 'REVOKED'] as const

export type ConsentStatus = (typeof CONSENT_STATUSES)[number]

export function isConsentPurpose(v: unknown): v is ConsentPurpose {
  return typeof v === 'string' && (CONSENT_PURPOSES as readonly string[]).includes(v)
}

export function isConsentStatus(v: unknown): v is ConsentStatus {
  return typeof v === 'string' && (CONSENT_STATUSES as readonly string[]).includes(v)
}

// ── Provenance ──────────────────────────────────────────────────────────

/**
 * Free-text provenance, matching WhatsAppConsent.source's own convention
 * (deliberately not an enum — capture surfaces are added over time).
 */
export const CONSENT_SOURCE_BOOKING_CHECKOUT = 'booking_checkout_sms_customer_care'

/** RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release; for a future separate Marketing campaign. Default source for an SMS_MARKETING tick when the caller names none. */
export const CONSENT_SOURCE_BOOKING_CHECKOUT_MARKETING = 'booking_checkout_sms_marketing'

/**
 * Allowlisted capture surfaces. A caller may name the surface the box was
 * ticked on; anything outside this list is IGNORED (the purpose's default
 * source is stamped instead) so the audit column can never be filled with
 * arbitrary client-supplied text. Surface names are purpose-neutral: the
 * `purpose` column already says which consent the row is.
 */
export const CONSENT_SOURCE_TOUR_BOOKING = 'tour_booking_sms'
export const CONSENT_SOURCE_HOTEL_BOOKING = 'hotel_booking_sms'
export const CONSENT_SOURCE_VISA_APPLICATION = 'visa_application_sms'
export const CONSENT_SOURCE_CONTACT_FORM = 'contact_form_sms'
export const CONSENT_SOURCE_WEB_FORM = 'web_form_sms'
export const CONSENT_SOURCE_SMS_CONSENT_PAGE = 'sms_consent_page'

export const CONSENT_SOURCE_ALLOWLIST = [
  CONSENT_SOURCE_BOOKING_CHECKOUT,
  CONSENT_SOURCE_BOOKING_CHECKOUT_MARKETING,
  CONSENT_SOURCE_TOUR_BOOKING,
  CONSENT_SOURCE_HOTEL_BOOKING,
  CONSENT_SOURCE_VISA_APPLICATION,
  CONSENT_SOURCE_CONTACT_FORM,
  CONSENT_SOURCE_WEB_FORM,
  CONSENT_SOURCE_SMS_CONSENT_PAGE,
] as const

export type ConsentSource = (typeof CONSENT_SOURCE_ALLOWLIST)[number]

/** Returns the source if allowlisted, otherwise `fallback`. Never throws. */
export function resolveConsentSource(v: unknown, fallback: ConsentSource): ConsentSource {
  return typeof v === 'string' && (CONSENT_SOURCE_ALLOWLIST as readonly string[]).includes(v)
    ? (v as ConsentSource)
    : fallback
}

/**
 * Stamped onto every record so a later audit can tell WHICH wording a
 * person actually agreed to. Bump when the disclosure changes materially.
 * v2: the sender is now named as the registered legal entity
 * (The Walz Travels Inc., operating as Walz Travels) — Twilio error 30907.
 */
export const SMS_CUSTOMER_CARE_DISCLOSURE_VERSION = 'sms-customer-care-v2'
/** RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release; for a future separate Marketing campaign. */
export const SMS_MARKETING_DISCLOSURE_VERSION = 'sms-marketing-v1'

// ── The disclosures ─────────────────────────────────────────────────────

/**
 * The A2P 10DLC CUSTOMER_CARE consent disclosure, verbatim. The sender is
 * the legal entity that owns the registered campaign
 * (SMS_SENDER_PHRASE = "The Walz Travels Inc., operating as Walz Travels").
 *
 * This constant is the single source of truth: the checkbox renders it, and
 * the consent tests assert every carrier-required element is present in it.
 * The Terms & Conditions / Privacy Policy links are rendered by the
 * component next to this text.
 */
export const SMS_CUSTOMER_CARE_DISCLOSURE_BODY =
  `I agree to receive SMS messages from ${SMS_SENDER_PHRASE}, regarding my travel enquiries, ` +
  'bookings, payments, itinerary updates, visa-service updates and customer support. ' +
  'Message frequency varies. Message and data rates may apply. ' +
  'Reply STOP to opt out or HELP for help. ' +
  'Consent is not a condition of purchase.'

/** Plain-language equivalent for audit / non-HTML surfaces (links named). */
export const SMS_CUSTOMER_CARE_DISCLOSURE =
  SMS_CUSTOMER_CARE_DISCLOSURE_BODY + ' See our Terms & Conditions and Privacy Policy.'

/** RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release; for a future separate Marketing campaign. The separate promotional-SMS disclosure. */
export const SMS_MARKETING_DISCLOSURE_BODY =
  `I agree to receive recurring promotional SMS messages from ${SMS_SENDER_PHRASE}, ` +
  'including travel deals, offers and promotions. ' +
  'Message frequency varies. Message and data rates may apply. ' +
  'Reply STOP to opt out or HELP for help. ' +
  'Consent is not a condition of purchase.'

/** RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release; for a future separate Marketing campaign. */
export const SMS_MARKETING_DISCLOSURE =
  SMS_MARKETING_DISCLOSURE_BODY + ' See our Terms & Conditions and Privacy Policy.'

/**
 * Every element Twilio's A2P 10DLC review looks for, as a substring of
 * SMS_CUSTOMER_CARE_DISCLOSURE. Named so a failing test names the exact
 * missing compliance element rather than "string did not match".
 */
export const REQUIRED_DISCLOSURE_ELEMENTS: Record<string, string> = {
  'sender legal entity: The Walz Travels Inc.': SMS_SENDER_ENTITY_NAME,
  'brand identified by name': `operating as ${BRAND_NAME}`,
  'customer-care (service, not marketing) message types': 'bookings, payments, itinerary updates, visa-service updates and customer support',
  'message frequency varies': 'Message frequency varies.',
  'message and data rates may apply': 'Message and data rates may apply.',
  'STOP instruction': 'Reply STOP to opt out',
  'HELP instruction': 'HELP for help',
  'consent is not a condition of purchase': 'Consent is not a condition of purchase.',
  'terms link': 'Terms & Conditions',
  'privacy link': 'Privacy Policy',
}

/** RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release; for a future separate Marketing campaign. Same, for SMS_MARKETING_DISCLOSURE. */
export const REQUIRED_MARKETING_DISCLOSURE_ELEMENTS: Record<string, string> = {
  'sender legal entity: The Walz Travels Inc.': SMS_SENDER_ENTITY_NAME,
  'brand identified by name': `operating as ${BRAND_NAME}`,
  'promotional wording': 'recurring promotional SMS messages',
  'promotional content described': 'travel deals, offers and promotions',
  'message frequency varies': 'Message frequency varies.',
  'message and data rates may apply': 'Message and data rates may apply.',
  'STOP instruction': 'Reply STOP to opt out',
  'HELP instruction': 'HELP for help',
  'consent is not a condition of purchase': 'Consent is not a condition of purchase.',
  'terms link': 'Terms & Conditions',
  'privacy link': 'Privacy Policy',
}

/** The real, publicly-reachable destinations the disclosure links to. */
export const PRIVACY_POLICY_PATH = '/privacy'
export const TERMS_PATH = '/terms'

// ── The write decision ──────────────────────────────────────────────────

export interface ConsentWriteInput {
  /**
   * The checkbox state as it arrived from the client. Typed `unknown`
   * ON PURPOSE: this is the trust boundary. Anything that is not the
   * boolean `true` — undefined, null, 'false', 'true', 1, {} — is NOT an
   * affirmative action and must not produce a record.
   */
  checked: unknown
  /** normalizePhoneE164() output — null when the number is unusable. */
  normalizedNumber: string | null
}

export type ConsentWriteDecision =
  | { write: true; status: Extract<ConsentStatus, 'GRANTED'>; normalizedNumber: string }
  | { write: false; reason: 'NOT_CHECKED' | 'INVALID_NUMBER' }

/**
 * THE ONLY SANCTIONED PATH TO A CONSENT ROW — evaluated in this order.
 *
 *  1. `checked` is not strictly the boolean `true`  → NOT_CHECKED, no write
 *     of ANY status. An unchecked box is the "never answered" state, which
 *     is the absence of a row — NOT a NOT_GRANTED row. Writing NOT_GRANTED
 *     here would silently create a record for every visitor who ignored the
 *     checkbox, which is data collection nobody consented to.
 *     Checked FIRST and with `=== true`, so no truthy-coercion ('false',
 *     'off', 0, '') and no default can ever manufacture consent.
 *  2. No usable normalized number                   → INVALID_NUMBER, no write.
 *     A consent record we cannot key to a dialable endpoint is not
 *     auditable consent.
 *  3. otherwise                                     → write GRANTED.
 *
 * There is no fourth branch, no `force` parameter, and no caller that
 * bypasses step 1.
 */
export function decideConsentWrite(input: ConsentWriteInput): ConsentWriteDecision {
  // 1 — strict boolean true, never a truthy coercion. Nothing else is consent.
  if (input.checked !== true) return { write: false, reason: 'NOT_CHECKED' }

  // 2 — an unaddressable number is not auditable consent.
  if (!input.normalizedNumber) return { write: false, reason: 'INVALID_NUMBER' }

  // 3 — affirmative, logged, addressable.
  return { write: true, status: 'GRANTED', normalizedNumber: input.normalizedNumber }
}

/**
 * Deliberately NOT exported as anything resembling
 * `hasConsent(phoneNumberExistsSomewhere)`. The existence of a phone number
 * in a Lead, VisaApplication, Client or booking says nothing about consent.
 * The only correct reading of this model is: a GRANTED row for THIS
 * (number, purpose) pair, or no consent.
 */
export function isGranted(
  record: { status: string; purpose: string } | null | undefined,
  purpose: ConsentPurpose,
): boolean {
  if (!record) return false
  if (record.purpose !== purpose) return false
  return record.status === 'GRANTED'
}
