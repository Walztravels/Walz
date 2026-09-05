'use client'

// components/admin/ApplicationLookupDrawer.tsx
//
// Secure Application Lookup — staff drawer for Admin Inbox / CRM.
// Search by Walz Ref → masked summary only → identity verification
// (OTP to masked destination, or record-specific fallback question) →
// compact verified summary + "Open Full Record".
//
// Nothing sensitive renders before the server confirms verification, and
// the verified state carries a visible expiry. Staff never see OTP codes,
// full destinations, or expected fallback answers.

import { useState } from 'react'
import { Search, ShieldCheck, ShieldAlert, X, Loader2, Mail, Phone, FileSearch } from 'lucide-react'

interface MaskedSummary {
  walzRef: string; applicationType: string; destination: string; status: string
  maskedName: string; maskedEmail: string | null; maskedPhone: string | null
  hasEmail: boolean; hasPhone: boolean
}

interface FullView {
  verifiedUntil: string
  application: {
    id: string; walzRef: string; applicationType: string; status: string
    statusMessage: string | null; clientName: string; email: string | null
    phone: string | null; appointmentAt: string | null; adminUrl: string
    updatedAt: string
  }
}

type Stage = 'search' | 'masked' | 'otp_sent' | 'fallback' | 'verified' | 'locked'

export function ApplicationLookupDrawer({ conversationId, onClose }: { conversationId?: string; onClose: () => void }) {
  const [stage,   setStage]   = useState<Stage>('search')
  const [ref,     setRef]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [summary, setSummary] = useState<MaskedSummary | null>(null)
  const [verifId, setVerifId] = useState<string | null>(null)
  const [otpDest, setOtpDest] = useState<string | null>(null)
  const [code,    setCode]    = useState('')
  const [question, setQuestion] = useState<string | null>(null)
  const [answer,  setAnswer]  = useState('')
  const [full,    setFull]    = useState<FullView | null>(null)

  async function call(path: string, body: Record<string, unknown>) {
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  }

  async function doLookup() {
    if (!ref.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const { data } = await call('/api/admin/applications/lookup', { ref: ref.trim(), conversationId })
      if (data.found) {
        setSummary(data.summary); setVerifId(data.verificationId); setStage('masked')
      } else {
        setError(data.message ?? data.error ?? 'No application found for this reference.')
      }
    } finally { setBusy(false) }
  }

  async function doSendOtp(method: 'EMAIL' | 'PHONE') {
    if (!verifId || busy) return
    setBusy(true); setError(null)
    try {
      const { data } = await call('/api/admin/applications/verification', { verificationId: verifId, action: 'send_otp', method })
      if (data.ok) { setOtpDest(data.maskedDestination ?? null); setStage('otp_sent') }
      else if (data.error === 'PHONE_DELIVERY_UNAVAILABLE') setError('SMS delivery is not available — send to email or use manual verification.')
      else setError('Could not send the code — try manual verification.')
    } finally { setBusy(false) }
  }

  async function doVerifyOtp() {
    if (!verifId || !code.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const { data } = await call('/api/admin/applications/verification', { verificationId: verifId, action: 'verify_otp', code: code.trim() })
      await afterVerifyResult(data)
    } finally { setBusy(false) }
  }

  async function doGetFallback() {
    if (!verifId || busy) return
    setBusy(true); setError(null)
    try {
      const { data } = await call('/api/admin/applications/verification', { verificationId: verifId, action: 'get_fallback' })
      if (data.questionText) { setQuestion(data.questionText); setStage('fallback') }
      else setError('No manual verification question is available for this record.')
    } finally { setBusy(false) }
  }

  async function doVerifyFallback() {
    if (!verifId || !answer.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const { data } = await call('/api/admin/applications/verification', { verificationId: verifId, action: 'verify_fallback', answer: answer.trim() })
      await afterVerifyResult(data)
    } finally { setBusy(false) }
  }

  async function afterVerifyResult(data: { verified?: boolean; locked?: boolean }) {
    if (data.verified) {
      const res  = await fetch(`/api/admin/applications/secure-view?verificationId=${verifId}&reason=CUSTOMER_SUPPORT`)
      const view = await res.json()
      if (res.ok) { setFull(view); setStage('verified'); return }
      setError(view.error ?? 'Verified, but the record could not be loaded (check your permissions).')
    } else if (data.locked) {
      setStage('locked')
    } else {
      setError('Verification failed. Do not disclose application details.')
      setCode(''); setAnswer('')
    }
  }

  function openFullRecord() {
    if (!full) return
    void fetch('/api/admin/applications/secure-view', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verificationId: verifId, applicationId: full.application.id }),
    })
    window.open(full.application.adminUrl, '_blank', 'noopener')
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-y-0 right-0 z-[90] w-full max-w-md bg-[#0a1929] border-l border-[#2a3f5f] shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2f4a] bg-[#0B1F3A]">
        <div className="flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-[#C9A84C]" />
          <h2 className="text-white font-bold text-sm">Application Lookup</h2>
          {stage === 'verified' && full && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              <ShieldCheck className="w-3 h-3" /> Client Verified · until {fmtTime(full.verifiedUntil)}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Close"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Search */}
        {stage === 'search' && (
          <>
            <p className="text-xs text-gray-400">Ask the client for their Walz Reference Number. The reference locates the application — it does not verify identity.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={ref} onChange={e => setRef(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void doLookup()}
                placeholder="WALZ-XXXXXX"
                className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#C9A84C] font-mono uppercase"
              />
            </div>
            <button onClick={() => void doLookup()} disabled={busy || !ref.trim()}
              className="w-full py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Search Application
            </button>
          </>
        )}

        {/* Masked summary + verification gate */}
        {summary && stage !== 'search' && stage !== 'verified' && (
          <div className="rounded-xl border border-[#2a3f5f] bg-[#0d2035] p-4 space-y-1.5">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Application found</p>
            <p className="text-sm text-white font-mono">{summary.walzRef}</p>
            <p className="text-sm text-white">{summary.applicationType}</p>
            <p className="text-sm text-gray-300">{summary.maskedName}</p>
            {summary.maskedEmail && <p className="text-xs text-gray-400 flex items-center gap-1.5"><Mail className="w-3 h-3" />{summary.maskedEmail}</p>}
            {summary.maskedPhone && <p className="text-xs text-gray-400 flex items-center gap-1.5"><Phone className="w-3 h-3" />{summary.maskedPhone}</p>}
            <p className="text-xs text-[#C9A84C] font-semibold pt-1">Status: {summary.status}</p>
          </div>
        )}

        {stage === 'masked' && summary && (
          <>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-xs text-amber-300 font-semibold">Verify Client Identity</p>
              <p className="text-[11px] text-amber-200/70 mt-1">Full details unlock only after the client passes verification. Send a one-time code:</p>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {summary.hasEmail && (
                <button onClick={() => void doSendOtp('EMAIL')} disabled={busy}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2a3f5f] text-sm text-white hover:border-[#C9A84C] disabled:opacity-50">
                  <Mail className="w-4 h-4 text-[#C9A84C]" /> Send code to {summary.maskedEmail}
                </button>
              )}
              {summary.hasPhone && (
                <button onClick={() => void doSendOtp('PHONE')} disabled={busy}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2a3f5f] text-sm text-white hover:border-[#C9A84C] disabled:opacity-50">
                  <Phone className="w-4 h-4 text-[#C9A84C]" /> Send code to {summary.maskedPhone}
                </button>
              )}
              <button onClick={() => void doGetFallback()} disabled={busy}
                className="text-xs text-gray-400 hover:text-white underline text-left px-1 pt-1">
                Use Manual Verification instead
              </button>
            </div>
          </>
        )}

        {stage === 'otp_sent' && (
          <>
            <p className="text-xs text-gray-400">Code sent to <span className="text-white">{otpDest}</span>. Ask the client to read it to you. Expires in 10 minutes.</p>
            <input
              value={code} onChange={e => setCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void doVerifyOtp()}
              placeholder="6-digit code" inputMode="numeric" maxLength={6}
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5 text-lg text-white tracking-[8px] text-center font-mono focus:outline-none focus:border-[#C9A84C]"
            />
            <button onClick={() => void doVerifyOtp()} disabled={busy || code.trim().length < 6}
              className="w-full py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Verify Code
            </button>
            <button onClick={() => void doGetFallback()} disabled={busy}
              className="w-full text-xs text-gray-400 hover:text-white underline">Client can’t receive the code? Use Manual Verification</button>
          </>
        )}

        {stage === 'fallback' && question && (
          <>
            <div className="rounded-xl border border-[#2a3f5f] bg-[#0d2035] p-4">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Ask the client</p>
              <p className="text-sm text-white">{question}</p>
              <p className="text-[10px] text-gray-500 mt-2">The stored answer is never shown. Enter exactly what the client says — the server compares it.</p>
            </div>
            <input
              value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void doVerifyFallback()}
              placeholder="Client's answer"
              className="w-full bg-[#0d2035] border border-[#2a3f5f] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#C9A84C]"
            />
            <button onClick={() => void doVerifyFallback()} disabled={busy || !answer.trim()}
              className="w-full py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Check Answer
            </button>
          </>
        )}

        {stage === 'verified' && full && (
          <div className="rounded-xl border border-emerald-500/30 bg-[#0d2035] p-4 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-emerald-300 text-xs font-bold"><ShieldCheck className="w-4 h-4" /> Identity Verified</p>
            <p className="text-sm text-white font-mono">{full.application.walzRef}</p>
            <p className="text-sm text-white">{full.application.applicationType}</p>
            <p className="text-sm text-gray-300">{full.application.clientName}</p>
            <p className="text-xs text-gray-400">Status: <span className="text-white">{full.application.status}</span></p>
            {full.application.statusMessage && <p className="text-xs text-gray-400">{full.application.statusMessage}</p>}
            <p className="text-xs text-gray-500">Last update: {new Date(full.application.updatedAt).toLocaleDateString('en-GB')}</p>
            <button onClick={openFullRecord}
              className="w-full mt-2 py-2.5 rounded-xl bg-[#C9A84C] text-[#0B1F3A] text-sm font-bold">
              Open Full Record →
            </button>
            <p className="text-[10px] text-gray-500 text-center">Verified until {fmtTime(full.verifiedUntil)} — access is logged.</p>
          </div>
        )}

        {stage === 'locked' && (
          <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-300 font-bold">Verification failed. Do not disclose application details.</p>
              <p className="text-xs text-red-200/70 mt-1">
                Verification is locked for 30 minutes. Safe response: “We’re unable to verify the
                account at this time. Please use the contact details registered on the application
                or contact our support team.”
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </div>
  )
}
