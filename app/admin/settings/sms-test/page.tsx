'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, ShieldCheck, ShieldAlert, MessageSquare } from 'lucide-react'
import { normalizeSmsNumber } from '@/lib/sms/normalize'
import { maskRecipient, SMS_ACCEPTANCE_TEST_MESSAGE } from '@/lib/sms/acceptance-test-shared'

const INPUT = 'h-10 px-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/20 bg-white transition-colors w-full'

interface Readiness {
  ready: boolean
  twilioAccountSid: string
  twilioAuthToken: string
  messagingServiceSid: string
}

interface Result {
  accepted: boolean
  recipientMasked?: string
  messageId?: string | null
  twilioSidMasked?: string | null
  status?: string | null
  duplicate?: boolean
  message: string
}

export default function SmsAcceptanceTestPage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [phone, setPhone] = useState('')
  const [inputError, setInputError] = useState('')
  // The attempt key is created when the confirmation opens — one per explicit
  // attempt — so a double-click / re-render can never mint a second send.
  const [pending, setPending] = useState<{ e164: string; masked: string; key: string } | null>(null)
  const [sending, setSending] = useState(false)
  const inFlight = useRef(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    fetch('/api/admin/settings/sms-test')
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setForbidden(true); return }
        const j = await r.json()
        setReadiness(j.readiness)
      })
      .catch(() => setReadiness(null))
  }, [])

  function review() {
    setResult(null)
    setInputError('')
    const n = normalizeSmsNumber(phone)
    if (!n.ok) {
      setInputError('Enter a full international number, e.g. +12317902336.')
      return
    }
    setPending({ e164: n.e164, masked: maskRecipient(n.e164), key: crypto.randomUUID() })
  }

  async function confirmSend() {
    if (!pending || inFlight.current) return
    inFlight.current = true
    setSending(true)
    try {
      const res = await fetch('/api/admin/settings/sms-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pending.e164, clientKey: pending.key }),
      })
      const j = (await res.json().catch(() => null)) as Result | null
      setResult(j ?? { accepted: false, message: `Unexpected response (${res.status}). Check the SMS log before retrying.` })
    } catch {
      // Never auto-retry: the request may or may not have reached the server.
      setResult({ accepted: false, message: 'Network error. The message may or may not have been sent; check the SMS log before retrying.' })
    } finally {
      setPending(null)
      setSending(false)
      inFlight.current = false
    }
  }

  if (forbidden) {
    return <div className="p-6 text-sm text-gray-600">This page is available to Super Admins only.</div>
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="w-5 h-5 text-[#0B1F3A]" />
        <h1 className="text-xl font-bold text-[#0B1F3A]">SMS Acceptance Test</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Sends ONE fixed customer-care test SMS through the production sender. It is not a composer:
        the message and class are fixed, and the normal consent gate applies.
      </p>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Configuration</p>
        {readiness ? (
          <ul className="text-sm space-y-1">
            {([['Twilio account SID', readiness.twilioAccountSid], ['Twilio auth token', readiness.twilioAuthToken], ['SMS Messaging Service SID', readiness.messagingServiceSid]] as const).map(([label, v]) => (
              <li key={label} className="flex items-center gap-2">
                {v === 'PRESENT' ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-red-500" />}
                <span className="text-gray-700">{label}:</span>
                <span className={v === 'PRESENT' ? 'text-emerald-700' : 'text-red-600'}>{v}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">Checking…</p>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 text-sm text-amber-900">
        <p className="font-semibold mb-1">Before you send</p>
        <p>
          The number must first opt in at{' '}
          <a className="underline" href="/sms-consent" target="_blank" rel="noreferrer">/sms-consent</a>.
          Without consent (or after STOP) the service refuses and nothing is sent.
        </p>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm space-y-3">
        <label htmlFor="sms-test-phone" className="text-sm font-medium text-[#0B1F3A]">Recipient (owner-controlled number)</label>
        <input
          id="sms-test-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          className={INPUT}
          placeholder="+12317902336"
          value={phone}
          disabled={sending || !!pending}
          onChange={(e) => setPhone(e.target.value)}
        />
        {inputError && <p className="text-sm text-red-600">{inputError}</p>}
        <div className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
          <p className="font-medium text-gray-600 mb-1">Fixed test message</p>
          <p>{SMS_ACCEPTANCE_TEST_MESSAGE}</p>
        </div>
        {!pending && (
          <button
            type="button"
            onClick={review}
            disabled={sending || !phone.trim()}
            className="h-10 px-4 rounded-xl bg-[#0B1F3A] text-white text-sm font-semibold disabled:opacity-50"
          >
            Review test send
          </button>
        )}
        {pending && (
          <div className="border border-[#C9A84C]/50 bg-[#C9A84C]/5 rounded-xl p-3 space-y-3">
            <p className="text-sm font-medium text-[#0B1F3A]">Send one CUSTOMER_CARE test SMS to {pending.masked}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmSend}
                disabled={sending}
                className="h-10 px-4 rounded-xl bg-[#0B1F3A] text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sending ? 'Sending…' : 'Confirm and send'}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={sending}
                className="h-10 px-4 rounded-xl border border-gray-200 text-sm text-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div
          role="status"
          className={`rounded-2xl border p-4 text-sm ${result.accepted ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'}`}
        >
          <p className="font-semibold mb-1">{result.accepted ? 'Accepted' : 'Refused / not sent'}</p>
          <p>{result.message}</p>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            {result.recipientMasked && (<><dt className="text-gray-500">Recipient</dt><dd>{result.recipientMasked}</dd></>)}
            {result.messageId && (<><dt className="text-gray-500">SMS record</dt><dd className="font-mono">{result.messageId}</dd></>)}
            {result.twilioSidMasked && (<><dt className="text-gray-500">Twilio SID</dt><dd className="font-mono">{result.twilioSidMasked}</dd></>)}
            {result.status && (<><dt className="text-gray-500">Initial status</dt><dd>{result.status}</dd></>)}
          </dl>
        </div>
      )}
    </div>
  )
}
