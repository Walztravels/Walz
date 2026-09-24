'use client'

/**
 * useSmsConsent — one hook for any public form that collects a phone number
 * and offers SMS consent. The customer-care A2P 10DLC (30907) release
 * exposes ONE unticked-by-default checkbox (customer-care SMS) and records
 * it, fire-and-forget, only if ticked.
 *
 *   const sms = useSmsConsent()
 *   ...
 *   <form>{... phone input ...}{sms.fields}</form>
 *   // on submit (after / alongside your own submit — never awaited):
 *   sms.record({ phone, capturePage: '/tours/book' })
 *
 * Guarantees: the box starts false; it is never mandatory; record() never
 * throws, never blocks, and sends nothing when unticked.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { SmsCustomerCareConsent } from '@/components/consent/SmsCustomerCareConsent'
import { postSmsConsents } from '@/lib/consent/client'
import type { ConsentSource } from '@/lib/consent/purposes'

export interface RecordSmsConsentInput {
  phone: string
  capturePage: string
  evidence?: string
  source?: ConsentSource
}

export interface UseSmsConsent {
  customerCare: boolean
  setCustomerCare: (checked: boolean) => void
  /** Ready-to-render customer-care consent box (with its optional note). */
  fields: ReactNode
  /** Fire-and-forget; POSTs only if ticked. Never throws. */
  record: (input: RecordSmsConsentInput) => Promise<void>
  /** Untick the box. */
  reset: () => void
}

export function useSmsConsent(): UseSmsConsent {
  const [customerCare, setCustomerCare] = useState(false)

  const record = useCallback(
    async (input: RecordSmsConsentInput): Promise<void> => {
      // Synchronous fire-and-forget; the returned promise resolves at once.
      postSmsConsents({ ...input, customerCare })
    },
    [customerCare],
  )

  const reset = useCallback(() => {
    setCustomerCare(false)
  }, [])

  const fields = useMemo(
    () => <SmsCustomerCareConsent checked={customerCare} onChange={setCustomerCare} />,
    [customerCare],
  )

  return { customerCare, setCustomerCare, fields, record, reset }
}

export default useSmsConsent
