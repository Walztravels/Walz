'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { SmsCustomerCareConsent } from '@/components/consent/SmsCustomerCareConsent'
import { CONSENT_SOURCE_SMS_CONSENT_PAGE, PRIVACY_POLICY_PATH, TERMS_PATH } from '@/lib/consent/purposes'
import { SMS_SENDER_PHRASE } from '@/lib/config/legal-entities'

type Status =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; last4: string }

const CUSTOMER_CARE_ONLY_NOTE =
  'This opt-in is for customer-care/service communications and does not enroll you in promotional or marketing SMS messages.'
const NO_SHARING_NOTE =
  'Mobile information, including your mobile phone number and SMS opt-in consent, will not be shared with third parties or affiliates for their marketing or promotional purposes.'

const linkCls = 'font-medium text-amber-400 underline underline-offset-2 hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm'

export default function SmsConsentForm() {
  const [phone, setPhone] = useState('')
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const trimmed = phone.trim()
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Please enter your mobile phone number.' })
      return
    }
    if (!checked) {
      setStatus({ kind: 'error', message: 'Please tick the box above to opt in to SMS updates.' })
      return
    }
    setSubmitting(true)
    setStatus({ kind: 'idle' })
    try {
      const res = await fetch('/api/consent/sms-customer-care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: trimmed,
          consent: true,
          capturePage: '/sms-consent',
          source: CONSENT_SOURCE_SMS_CONSENT_PAGE,
        }),
      })
      let body: { recorded?: boolean; reason?: string } | null = null
      try { body = await res.json() } catch { body = null }
      if (res.ok && body?.recorded === true) {
        setStatus({ kind: 'success', last4: trimmed.replace(/\D/g, '').slice(-4) })
      } else if (res.status === 429) {
        setStatus({ kind: 'error', message: 'Too many attempts. Please try again in a few minutes.' })
      } else if (body?.recorded === false && body.reason === 'INVALID_NUMBER') {
        setStatus({ kind: 'error', message: "We couldn't read that number. Please enter it with your country code, e.g. +44 7700 900123." })
      } else {
        setStatus({ kind: 'error', message: 'Something went wrong. Please try again.' })
      }
    } catch {
      setStatus({ kind: 'error', message: 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="text-white/80">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-400">SMS Opt-In</p>
      <h1 className="mb-4 text-3xl font-bold text-white sm:text-4xl">Walz Travels SMS Customer Care Updates</h1>
      <p className="mb-3 leading-relaxed">
        Sign up to receive SMS customer-care/service messages from {SMS_SENDER_PHRASE}. Messages may include travel
        enquiry responses, booking confirmations and updates, itinerary notifications, payment reminders,
        visa-service notifications, appointment or consultation reminders, and customer-support communications.
      </p>
      <p className="mb-8 leading-relaxed">{CUSTOMER_CARE_ONLY_NOTE}</p>

      <section aria-labelledby="how-it-works" className="mb-8">
        <h2 id="how-it-works" className="mb-3 text-xl font-semibold text-white">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 leading-relaxed">
          <li>Enter your mobile phone number.</li>
          <li>Tick the SMS consent box.</li>
          <li>Submit the form.</li>
        </ol>
      </section>

      <form onSubmit={handleSubmit} noValidate className="mb-10 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <label htmlFor="sms-consent-phone" className="mb-1 block text-sm font-medium text-white">
          Mobile phone number
        </label>
        <input
          id="sms-consent-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+1 231 555 0100"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-describedby="sms-consent-phone-help"
          className="min-h-[44px] w-full rounded-lg border border-white/20 bg-[#0a1628] px-3 py-2 text-base text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        />
        <p id="sms-consent-phone-help" className="mb-4 mt-1 text-xs text-white/60">
          Include your country code, e.g. +44… or +234…
        </p>

        <SmsCustomerCareConsent checked={checked} onChange={setChecked} showOptionalNote={false} />

        <button
          type="submit"
          disabled={submitting}
          className="mt-4 min-h-[44px] w-full rounded-lg bg-amber-400 px-5 py-3 font-semibold text-[#0a1628] hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Sign up for SMS updates'}
        </button>

        <div role="status" aria-live="polite" className="mt-4 empty:hidden">
          {status.kind === 'error' && (
            <p className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{status.message}</p>
          )}
          {status.kind === 'success' && (
            <p className="rounded-lg border border-green-400/40 bg-green-500/10 p-3 text-sm text-green-200">
              You&apos;re signed up for Walz Travels SMS customer-care updates. Reply STOP to opt out or HELP for help.
              {status.last4 ? <span className="mt-1 block text-xs text-green-200/80">Number ending in {status.last4}.</span> : null}
            </p>
          )}
        </div>
      </form>

      <section aria-labelledby="program-details" className="mb-8">
        <h2 id="program-details" className="mb-3 text-xl font-semibold text-white">Program details</h2>
        <ul className="space-y-1 leading-relaxed">
          <li><strong className="text-white">Program name:</strong> Walz Travels SMS Customer Care</li>
          <li><strong className="text-white">Sender:</strong> {SMS_SENDER_PHRASE}</li>
          <li><strong className="text-white">Message frequency:</strong> Message frequency varies.</li>
          <li><strong className="text-white">Rates:</strong> Message and data rates may apply.</li>
          <li><strong className="text-white">Opt out:</strong> Reply STOP</li>
          <li><strong className="text-white">Help:</strong> Reply HELP</li>
          <li><strong className="text-white">Consent:</strong> Consent is not a condition of purchase.</li>
        </ul>
      </section>

      <section aria-labelledby="your-privacy" className="mb-8">
        <h2 id="your-privacy" className="mb-3 text-xl font-semibold text-white">Your privacy</h2>
        <p className="leading-relaxed">{NO_SHARING_NOTE}</p>
      </section>

      <section aria-labelledby="opt-out-help" className="mb-8">
        <h2 id="opt-out-help" className="mb-3 text-xl font-semibold text-white">Opt out or get help</h2>
        <p className="leading-relaxed">
          Reply STOP to any message to opt out, or HELP for help. You can also email{' '}
          <a href="mailto:contact@walztravels.com" className={linkCls}>contact@walztravels.com</a>.
        </p>
      </section>

      <nav aria-label="Legal" className="border-t border-white/10 pt-4 text-sm">
        <span className="mr-3 font-semibold text-white">Legal:</span>
        <Link href={PRIVACY_POLICY_PATH} className={`${linkCls} mr-4 inline-block py-2`}>Privacy Policy</Link>
        <Link href={TERMS_PATH} className={`${linkCls} inline-block py-2`}>Terms &amp; Conditions</Link>
      </nav>
    </div>
  )
}
