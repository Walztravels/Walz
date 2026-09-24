'use client'

/**
 * SMS Customer Care consent checkbox — A2P 10DLC (CUSTOMER_CARE) disclosure.
 *
 * Built because Twilio rejected the Walz CUSTOMER_CARE campaign with error
 * 30896: "the public opt-in page did not display adequate SMS consent
 * language". Carriers will not route SMS for the campaign until a page that
 * renders every required element is live.
 *
 * ── THE RULES THIS COMPONENT ENFORCES STRUCTURALLY ──────────────────────
 *  1. UNCHECKED BY DEFAULT. It is a CONTROLLED input (`checked={checked}`)
 *     with no `defaultChecked` anywhere, so it renders exactly the state the
 *     parent holds — and every call site is required to initialise that
 *     state to `false`. There is no "start checked" prop to misuse.
 *  2. ITS OWN INDEPENDENT CHECKBOX. It renders one <input type="checkbox">
 *     that nothing else toggles. It is never nested inside a Terms
 *     acceptance control, never driven by a "select all", and deliberately
 *     takes no `groupOnChange`/`selectAll` prop that would let a caller wire
 *     one. A user must click THIS box.
 *  3. NEVER REQUIRED. No `required` attribute and no aria-required: consent
 *     is explicitly "not a condition of purchase", so a form must be
 *     submittable with this box left alone.
 *  4. REAL LINKS. /privacy and /terms are real, publicly-reachable pages in
 *     this app (app/privacy/page.tsx, app/terms/page.tsx) — never '#'.
 *
 * The wording itself lives in lib/consent/purposes.ts
 * (SMS_CUSTOMER_CARE_DISCLOSURE_BODY) and is RENDERED FROM that constant, so
 * the sentence a person sees cannot drift from the audited string. The
 * sender is named as the registered entity: "The Walz Travels Inc.,
 * operating as Walz Travels". The two links follow the constant.
 *
 * Reusable: drop it into any public form that collects a phone number, pass
 * the checked state through to POST /api/consent/sms-customer-care.
 */

import Link from 'next/link'
import {
  SMS_CUSTOMER_CARE_DISCLOSURE_BODY,
  SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
  PRIVACY_POLICY_PATH,
  TERMS_PATH,
} from '@/lib/consent/purposes'

export interface SmsCustomerCareConsentProps {
  /** Current state. Call sites MUST initialise this to `false`. */
  checked: boolean
  /** Receives the new state on every user toggle. */
  onChange: (checked: boolean) => void
  /** DOM id / form field name. Defaults are unique enough for one per form. */
  id?: string
  name?: string
  disabled?: boolean
  className?: string
  /** Show the "Optional — ..." note under the box. Default true. */
  showOptionalNote?: boolean
}

/** Exported so call sites and tests refer to one id, not a literal. */
export const SMS_CUSTOMER_CARE_CONSENT_ID = 'sms-customer-care-consent'

export function SmsCustomerCareConsent({
  checked,
  onChange,
  id = SMS_CUSTOMER_CARE_CONSENT_ID,
  name = SMS_CUSTOMER_CARE_CONSENT_ID,
  disabled = false,
  className = '',
  showOptionalNote = true,
}: SmsCustomerCareConsentProps) {
  return (
    <div
      className={`rounded-xl border border-walz-border bg-white p-4 ${className}`}
      data-consent-purpose="SMS_CUSTOMER_CARE"
      data-disclosure-version={SMS_CUSTOMER_CARE_DISCLOSURE_VERSION}
    >
      <div className="flex items-start gap-3">
        {/*
          A native checkbox on purpose: it is unambiguous to a carrier
          reviewer, keyboard-operable and screen-reader-labelled for free.
          Controlled — `checked` is the parent's state, never a default.
          No `required`: consent is not a condition of purchase.
        */}
        <input
          type="checkbox"
          id={id}
          name={name}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-walz-gold"
        />
        <label htmlFor={id} className="cursor-pointer text-xs leading-relaxed text-walz-deep-navy/80">
          {SMS_CUSTOMER_CARE_DISCLOSURE_BODY} See our{' '}
          <Link
            href={TERMS_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-walz-gold underline underline-offset-2"
          >
            Terms &amp; Conditions
          </Link>{' '}
          and{' '}
          <Link
            href={PRIVACY_POLICY_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-walz-gold underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </label>
      </div>
      {showOptionalNote && (
        <p className="mt-2 pl-7 text-[11px] leading-relaxed text-walz-muted">
          Optional — leaving this unticked will not affect your booking or enquiry.
        </p>
      )}
    </div>
  )
}

export default SmsCustomerCareConsent
