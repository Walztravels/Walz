import type { ConsentSource } from '@/lib/consent/purposes'

/**
 * Browser-side, fire-and-forget consent posting. Pure of React so it is
 * unit-testable; components/consent/useSmsConsent.tsx wraps it.
 *
 * The customer-care A2P (30907) release exposes ONE consent only. A POST is
 * made ONLY if the box is strictly `true`; nothing is ever sent for an
 * unticked box. Never throws and never returns a promise a caller could be
 * blocked on — consent is not a condition of purchase.
 */

export const SMS_CUSTOMER_CARE_ENDPOINT = '/api/consent/sms-customer-care'

export interface PostSmsConsentsInput {
  phone: string
  capturePage: string
  evidence?: string
  source?: ConsentSource
  customerCare: boolean
}

type FetchLike = (input: string, init: RequestInit) => Promise<unknown>

export function postSmsConsents(input: PostSmsConsentsInput, fetchImpl?: FetchLike): void {
  try {
    const doFetch: FetchLike | undefined =
      fetchImpl ?? (typeof fetch === 'function' ? (fetch as unknown as FetchLike) : undefined)
    if (!doFetch || !input.phone) return

    if (input.customerCare !== true) return

    const p = doFetch(SMS_CUSTOMER_CARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: input.phone,
        consent: true,
        capturePage: input.capturePage,
        ...(input.evidence ? { evidence: input.evidence } : {}),
        ...(input.source ? { source: input.source } : {}),
      }),
      keepalive: true,
    })
    void Promise.resolve(p).catch(() => {})
  } catch {
    /* swallowed: never block the caller's flow */
  }
}
