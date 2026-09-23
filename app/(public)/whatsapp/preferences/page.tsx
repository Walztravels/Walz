'use client'

/**
 * WhatsApp Broadcast V1.2 — public WhatsApp marketing preferences.
 *
 * /whatsapp/preferences
 *
 * ── P1 SECURITY FIX: SUBSCRIBE NOW REQUIRES OTP PROOF-OF-POSSESSION ──────
 * Enter number → consent checkbox → Send verification code → Verify code
 * → SUBSCRIBED. Clicking the main button no longer immediately subscribes
 * anyone — it only sends a WhatsApp-delivered code to the entered number,
 * and only entering that code correctly (app/api/whatsapp/preferences/
 * verify-code/route.ts) can ever create a SUBSCRIBED WhatsAppConsent row.
 * See that route and lib/whatsapp/consent-otp.ts for why.
 *
 * The "Subscribe" checkbox is unchecked by default (never pre-ticked).
 * "Stop WhatsApp marketing messages" stays immediate and unauthenticated
 * by deliberate design (fail-safe direction — see
 * app/api/whatsapp/preferences/route.ts's header comment) — the
 * confirmation shown is the SAME generic message regardless of the
 * number's prior state, and this page never reveals whether a number
 * already exists in Walz's systems.
 */

import { useState } from 'react'
import {
  WHATSAPP_MARKETING_DISCLOSURE,
  WHATSAPP_UNSUBSCRIBE_CONFIRMATION,
} from '@/lib/whatsapp/preferences-disclosure'

type Step = 'form' | 'code' | 'done-subscribed' | 'done-unsubscribed'

async function postJson(url: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  } catch {
    // A network hiccup must not trap the visitor — treat it like a
    // generic, retryable failure rather than crashing the page.
    return { status: 0, data: {} }
  }
}

export default function WhatsAppPreferencesPage() {
  const [phone, setPhone] = useState('')
  const [subscribe, setSubscribe] = useState(false) // unchecked by default — never pre-ticked
  const [step, setStep] = useState<Step>('form')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim()) {
      setError('Please enter your WhatsApp number.')
      return
    }

    if (!subscribe) {
      // Unchecked box + submit == the immediate, fail-safe unsubscribe
      // path. No OTP required for this direction.
      setBusy(true)
      await postJson('/api/whatsapp/preferences', { phone, action: 'UNSUBSCRIBE' })
      setBusy(false)
      setStep('done-unsubscribed')
      return
    }

    // Checked box + submit == step 1 of the OTP flow. This call ONLY ever
    // sends a code — it can never subscribe anyone by itself.
    setBusy(true)
    const { status, data } = await postJson('/api/whatsapp/preferences/send-code', { phone, consent: true })
    setBusy(false)
    if (status === 429 && typeof data.retryAfterMs === 'number') {
      setCooldownUntil(Date.now() + data.retryAfterMs)
      setError('Please wait a moment before requesting another code.')
      return
    }
    if (status === 429) {
      setError('Too many codes requested for this number. Please try again later.')
      return
    }
    if (status === 503) {
      setError('Verification is not available right now. Please try again later.')
      return
    }
    // Any other outcome (including a genuinely invalid number, which is
    // never distinguished from success — see the route's doc comment)
    // moves forward to the code-entry step.
    setStep('code')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code we sent you.')
      return
    }
    setBusy(true)
    const { status } = await postJson('/api/whatsapp/preferences/verify-code', { phone, code: code.trim() })
    setBusy(false)
    if (status === 200) {
      setStep('done-subscribed')
      return
    }
    setError('Invalid or expired code. Please check the code or request a new one.')
  }

  async function handleResend() {
    setError('')
    setBusy(true)
    const { status, data } = await postJson('/api/whatsapp/preferences/send-code', { phone, consent: true })
    setBusy(false)
    if (status === 429 && typeof data.retryAfterMs === 'number') {
      setCooldownUntil(Date.now() + data.retryAfterMs)
      setError('Please wait a moment before requesting another code.')
      return
    }
    if (status === 429) {
      setError('Too many codes requested for this number. Please try again later.')
      return
    }
    setError('A new code has been sent.')
  }

  const inCooldown = cooldownUntil !== null && cooldownUntil > Date.now()

  if (step === 'done-subscribed' || step === 'done-unsubscribed') {
    return (
      <main className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold mb-4">Preferences saved</h1>
        <p className="text-gray-700">
          {step === 'done-subscribed'
            ? 'Thank you. Your WhatsApp marketing preference has been saved.'
            : WHATSAPP_UNSUBSCRIBE_CONFIRMATION}
        </p>
        <button
          type="button"
          className="mt-8 text-sm text-gray-500 underline"
          onClick={() => { setStep('form'); setPhone(''); setSubscribe(false); setCode(''); setError('') }}
        >
          Update preferences for a different number
        </button>
      </main>
    )
  }

  if (step === 'code') {
    return (
      <main className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold mb-2">Enter your verification code</h1>
        <p className="text-gray-600 mb-8">
          We sent a 6-digit code to your WhatsApp number. Enter it below to confirm you'd like to receive
          WhatsApp marketing messages from Walz Travels.
        </p>
        <form onSubmit={handleVerifyCode} className="space-y-6">
          <div>
            <label htmlFor="wa-code" className="block text-sm font-medium text-gray-700 mb-1">
              Verification code
            </label>
            <input
              id="wa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 tracking-widest text-lg"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-walz-gold text-white rounded-lg py-3 font-medium disabled:opacity-60"
          >
            {busy ? 'Verifying…' : 'Verify code'}
          </button>
        </form>
        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || inCooldown}
            className="text-gray-500 underline disabled:opacity-50"
          >
            Resend code
          </button>
          <button type="button" onClick={() => { setStep('form'); setCode(''); setError('') }} className="text-gray-400 underline">
            Change number
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold mb-2">WhatsApp Marketing Preferences</h1>
      <p className="text-gray-600 mb-8">
        Manage whether Walz Travels sends you WhatsApp messages about offers, promotions and travel deals.
      </p>

      <form onSubmit={handleSubmitForm} className="space-y-6">
        <div>
          <label htmlFor="wa-phone" className="block text-sm font-medium text-gray-700 mb-1">
            Your WhatsApp number
          </label>
          <input
            id="wa-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+234 800 000 0000"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={subscribe}
            onChange={e => setSubscribe(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm text-gray-700">{WHATSAPP_MARKETING_DISCLOSURE}</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-walz-gold text-white rounded-lg py-3 font-medium disabled:opacity-60"
        >
          {busy ? 'Please wait…' : subscribe ? 'Send verification code' : 'Save preferences'}
        </button>
      </form>

      <div className="mt-10 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-600 mb-2">
          Already receive WhatsApp marketing messages and just want them to stop?
        </p>
        <button
          type="button"
          onClick={async () => {
            setError('')
            if (!phone.trim()) {
              setError('Please enter your WhatsApp number above first, then choose Stop WhatsApp marketing messages.')
              return
            }
            setBusy(true)
            await postJson('/api/whatsapp/preferences', { phone, action: 'UNSUBSCRIBE' })
            setBusy(false)
            setStep('done-unsubscribed')
          }}
          disabled={busy}
          className="text-sm font-medium text-red-600 underline disabled:opacity-60"
        >
          Stop WhatsApp marketing messages
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-10">
        See our{' '}
        <a href="/privacy" className="underline">Privacy Policy</a> and{' '}
        <a href="/terms" className="underline">Terms of Service</a>.
      </p>
    </main>
  )
}
