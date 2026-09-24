'use client'

/**
 * RESERVED — not exposed or used by any public UI or route in the customer-care (A2P 30907) release; for a future separate Marketing campaign.
 * Nothing in app/ or components/ may import this component until then.
 *
 * SMS Marketing consent checkbox — promotional SMS, a SEPARATE opt-in from
 * SmsCustomerCareConsent (service messages).
 *
 * Structural rules (same as the customer-care box, defended by tests):
 *  1. UNCHECKED BY DEFAULT — controlled input, no default-checked anywhere;
 *     call sites initialise state to `false`.
 *  2. INDEPENDENT — its own id/name, its own state, never nested in or
 *     driven by any other control (no select-all / group prop). Ticking it
 *     never ticks the customer-care box, and vice versa.
 *  3. OPTIONAL — never marked mandatory (no required / aria-required):
 *     consent is not a condition of purchase.
 *  4. REAL LINKS — /terms and /privacy, opened in a new tab.
 *
 * Wording is RENDERED FROM SMS_MARKETING_DISCLOSURE_BODY in
 * lib/consent/purposes.ts so it cannot drift from the audited string.
 * Post the state to POST /api/consent/sms-marketing (or use useSmsConsent).
 */

import Link from 'next/link'
import {
  SMS_MARKETING_DISCLOSURE_BODY,
  SMS_MARKETING_DISCLOSURE_VERSION,
  PRIVACY_POLICY_PATH,
  TERMS_PATH,
} from '@/lib/consent/purposes'

export interface SmsMarketingConsentProps {
  /** Current state. Call sites MUST initialise this to `false`. */
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  name?: string
  disabled?: boolean
  className?: string
  /** Show the "Optional — ..." note under the box. Default true. */
  showOptionalNote?: boolean
}

export const SMS_MARKETING_CONSENT_ID = 'sms-marketing-consent'

export function SmsMarketingConsent({
  checked,
  onChange,
  id = SMS_MARKETING_CONSENT_ID,
  name = SMS_MARKETING_CONSENT_ID,
  disabled = false,
  className = '',
  showOptionalNote = true,
}: SmsMarketingConsentProps) {
  return (
    <div
      className={`rounded-xl border border-walz-border bg-white p-4 ${className}`}
      data-consent-purpose="SMS_MARKETING"
      data-disclosure-version={SMS_MARKETING_DISCLOSURE_VERSION}
    >
      <div className="flex items-start gap-3">
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
          {SMS_MARKETING_DISCLOSURE_BODY} See our{' '}
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
          Optional — leaving this unticked will not affect your booking.
        </p>
      )}
    </div>
  )
}

export default SmsMarketingConsent
