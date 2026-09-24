import { NextRequest } from 'next/server'
import { handleConsentCapture } from '@/lib/consent/capture'
import {
  CONSENT_SOURCE_BOOKING_CHECKOUT,
  SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
} from '@/lib/consent/purposes'

/**
 * POST /api/consent/sms-customer-care
 *
 * Records an affirmative SMS_CUSTOMER_CARE consent — and nothing else. The
 * logic (rate limit, server-side normalization, strict `consent === true`,
 * single-row upsert, never reading Lead/VisaApplication/Client) lives in
 * lib/consent/capture.ts, shared and purpose-parameterised; this
 * route can only ever address the SMS_CUSTOMER_CARE row.
 *
 * Separate from /api/booking/confirm on purpose: consent is ticked at step 1
 * long before payment, must not share failure modes with payment
 * verification, and any public form can reuse it. Callers fire-and-forget:
 * consent is not a condition of purchase.
 *
 * Optional body field `source` is limited to the allowlist in
 * lib/consent/purposes.ts; unknown values are ignored (the default
 * CONSENT_SOURCE_BOOKING_CHECKOUT is stamped instead).
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  return handleConsentCapture(req, {
    purpose: 'SMS_CUSTOMER_CARE',
    disclosureVersion: SMS_CUSTOMER_CARE_DISCLOSURE_VERSION,
    defaultSource: CONSENT_SOURCE_BOOKING_CHECKOUT,
    logTag: 'consent/sms-customer-care',
  })
}
