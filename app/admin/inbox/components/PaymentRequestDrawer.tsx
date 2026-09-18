'use client'

// PaymentRequestDrawer — INBOX UX-4.1B (Client Action Centre).
//
// Right-side sheet at ALL widths (the ApplicationLookupDrawer precedent for
// inbox utility drawers), with the DetailsDrawer a11y contract: scrim +
// Esc close, focus in on open / restore on close, Tab trapped inside,
// chrome z-scale, safe-area padding, motion-safe slide.
//
// Commercial discipline:
//  - the form only ENABLES for a server-resolved VERIFIED/LINKED client
//    (the server enforces it again — this is presentation, not authz);
//  - 'Generate payment link' NEVER sends a message;
//  - after generation: Copy link · Insert into Reply (ComposerDraftContext
//    insertDraft — no send) · Send to client (explicit second action via
//    the page's EXISTING composer send path, passed in as onSendMessage);
//  - failure preserves everything entered, with Retry;
//  - one idempotencyKey per form-open, reused across retries, so a
//    double-click can never mint two live payment requests;
//  - status is whatever the server says — never optimistic, never color-only.

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Copy, MessageSquarePlus, Send, RefreshCw } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'
import { useComposerDraft } from '@/app/admin/inbox/ComposerDraftContext'
import {
  PAYMENT_PURPOSES, PURPOSE_LABELS,
  ACTION_CENTRE_PROVIDERS, PROVIDER_LABELS, PROVIDER_CURRENCIES,
  type ActionCentreProvider, type PaymentPurpose,
} from '@/lib/action-centre/constants'

interface ContextSlice {
  resolution: 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
  contact: { name: string | null; email: string | null; phone: string | null } | null
  application: { id: string; walzRef: string; applicationType: string; status: string } | null
}

interface RequestDTO {
  id: string; txRef: string; provider: string
  amount: number; baseAmount: number | null; currency: string
  purpose: string | null; description: string | null; status: string
  paymentUrl: string | null; accountNumber: string | null; bankName: string | null
  feeLabel: string | null; createdAt: string
}

export interface PaymentRequestDrawerProps {
  open: boolean
  onClose: () => void
  conversationId: number
  /** Explicit send through the page's EXISTING composer send path.
      Resolves false when the send failed (the page toasts the error). */
  onSendMessage: (text: string) => Promise<boolean>
}

const STATUS_GLYPH: Record<string, string> = {
  paid: '✓ Paid', pending: '⏳ Pending', failed: '✗ Failed',
  expired: 'Expired', cancelled: 'Cancelled', reconciliation_required: '⚠ Needs review',
}

function statusLabel(s: string): string { return STATUS_GLYPH[s] ?? s }

/** The client-facing message for a generated request (staff can edit in composer). */
export function buildPaymentMessage(r: RequestDTO): string {
  const what = r.description || (r.purpose ? PURPOSE_LABELS[r.purpose as PaymentPurpose] ?? r.purpose : 'your booking')
  const amount = `${r.currency} ${r.amount.toLocaleString()}`
  if (r.paymentUrl) {
    return `Hello! Here is your secure payment link for ${what} (${amount}):\n${r.paymentUrl}\n\nThe link is issued by Walz Travels — please complete the payment there and we will confirm it shortly.`
  }
  if (r.accountNumber) {
    return `Hello! To complete your payment for ${what} (${amount}), please transfer the exact amount to:\n\nBank: ${r.bankName ?? 'Wema Bank'}\nAccount number: ${r.accountNumber}\nAccount name: Walz Travels\n\nWe will confirm automatically as soon as the transfer arrives.`
  }
  return `Hello! Your payment request for ${what} (${amount}) is ready — we will follow up with the details.`
}

export function PaymentRequestDrawer({ open, onClose, conversationId, onSendMessage }: PaymentRequestDrawerProps) {
  const { insertDraft } = useComposerDraft()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  const [ctx, setCtx] = useState<ContextSlice | null>(null)
  const [ctxError, setCtxError] = useState(false)
  const [recent, setRecent] = useState<RequestDTO[]>([])

  // Form state — preserved across failures (never wiped by an API error).
  const [amount, setAmount] = useState('')
  const [provider, setProvider] = useState<ActionCentreProvider>('flutterwave')
  const [currency, setCurrency] = useState('NGN')
  const [purpose, setPurpose] = useState<PaymentPurpose>('visa_service')
  const [description, setDescription] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // PERSIST_FAILED means a live provider link may exist without a record —
  // retrying could mint a second one, so the Generate button is withdrawn.
  const [fatalError, setFatalError] = useState(false)
  const [result, setResult] = useState<RequestDTO | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  // One idempotency key per form-open, reused across retries.
  const idemRef = useRef<string>('')

  // Stale-response guard: only the freshest load may write state — a slow
  // response for conversation A must never paint over conversation B
  // (identity-confusion class).
  const loadSeqRef = useRef(0)
  const loadContext = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setCtxError(false)
    try {
      const [cRes, rRes] = await Promise.all([
        fetch(`/api/admin/inbox/conversations/${conversationId}/client-context`),
        fetch(`/api/admin/inbox/conversations/${conversationId}/payment-request`),
      ])
      if (seq !== loadSeqRef.current) return
      if (!cRes.ok) throw new Error(String(cRes.status))
      const cData = await cRes.json()
      if (seq !== loadSeqRef.current) return
      setCtx(cData?.context ?? null)
      if (rRes.ok) {
        const rData = await rRes.json()
        if (seq !== loadSeqRef.current) return
        setRecent(Array.isArray(rData?.requests) ? rData.requests : [])
      }
    } catch {
      if (seq === loadSeqRef.current) setCtxError(true)
    }
  }, [conversationId])

  // Open lifecycle: focus, key, fresh idempotency key, context load.
  useEffect(() => {
    if (!open) { setEntered(false); return }
    idemRef.current = crypto.randomUUID()
    setResult(null); setSubmitError(null); setFatalError(false); setSent(false); setCopied(false)
    setCtx(null); setRecent([])
    void loadContext()
    restoreRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null
    closeRef.current?.focus()
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => {
      cancelAnimationFrame(raf)
      restoreRef.current?.focus()
    }
  }, [open, loadContext])

  // Esc closes; Tab trapped inside the panel (aria-modal honesty).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )).filter(el => !el.matches(':disabled') && el.offsetParent !== null)
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (active == null || !panel.contains(active)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Keep currency valid for the chosen provider.
  useEffect(() => {
    const allowed = PROVIDER_CURRENCIES[provider]
    if (!allowed.includes(currency)) setCurrency(allowed[0])
  }, [provider, currency])

  if (!open) return null

  const identityOk = ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'

  async function handleGenerate() {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/admin/inbox/conversations/${conversationId}/payment-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          currency, purpose, provider,
          description: description.trim() || null,
          internalNote: internalNote.trim() || null,
          idempotencyKey: idemRef.current,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // An identical pending request already exists — adopt it instead of
        // dead-ending staff (they can copy/insert/send the existing link).
        if (data?.code === 'DUPLICATE_PENDING' && data?.existing) {
          setResult(data.existing as RequestDTO)
          setSubmitError(null)
          return
        }
        if (data?.code === 'PERSIST_FAILED') setFatalError(true)
        setSubmitError(data?.error ?? 'Payment link could not be generated. Retry.')
        return
      }
      setResult(data.request as RequestDTO)
    } catch {
      setSubmitError('Payment link could not be generated. Retry.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    const text = result.paymentUrl ?? buildPaymentMessage(result)
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) }
  }

  function handleInsert() {
    if (!result) return
    insertDraft(buildPaymentMessage(result))   // populates the composer — DOES NOT SEND
    onClose()
  }

  async function handleSendToClient() {
    if (!result || sending || sent) return
    setSending(true)
    setSubmitError(null)
    try {
      // Existing composer send path; resolves false on a failed send —
      // 'Sent to client' must never display for an undelivered message.
      const ok = await onSendMessage(buildPaymentMessage(result))
      if (ok) setSent(true)
      else setSubmitError('The message could not be sent. Try again.')
    } catch {
      setSubmitError('The message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  const inputCls = 'w-full min-h-[44px] px-3 py-2 rounded-lg border border-walz-border bg-white text-sm text-walz-deep-navy focus:outline-none focus:ring-2 focus:ring-walz-gold/60'
  const labelCls = 'block text-[10px] font-bold text-walz-muted-strong uppercase tracking-widest mb-1'

  return (
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.drawer }}>
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Request payment"
        className={`absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col
          motion-safe:transition-transform motion-safe:duration-200
          ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className="text-sm font-bold text-walz-deep-navy">Request payment</p>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -m-1.5 flex items-center justify-center rounded-lg text-walz-navy/60 hover:text-walz-navy hover:bg-walz-navy/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {/* Client (server-resolved, read-only) */}
          {ctxError ? (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">Could not load client context.</p>
              <button onClick={() => void loadContext()} className="min-h-[44px] px-4 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                Retry
              </button>
            </div>
          ) : !ctx ? (
            <>
              <span className="sr-only" role="status">Loading client</span>
              <div className="space-y-2 motion-safe:animate-pulse" aria-hidden="true">
                <div className="h-4 w-40 rounded bg-walz-navy/10" />
                <div className="h-3 w-28 rounded bg-walz-navy/10" />
              </div>
            </>
          ) : !identityOk ? (
            <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
              <p className="text-xs font-bold text-walz-deep-navy">Client identity required</p>
              <p className="text-xs text-walz-muted-strong mt-1">
                Verify the client through the Application Lookup before requesting a payment.
                Heuristic matches can never authorise a payment.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
              <p className={labelCls}>Client</p>
              <p className="text-sm font-semibold text-walz-deep-navy">{ctx.contact?.name ?? 'Client on file'}</p>
              {ctx.application && (
                <p className="text-xs text-walz-muted-strong mt-0.5">
                  {ctx.application.walzRef} · {ctx.application.applicationType}
                </p>
              )}
            </div>
          )}

          {/* Result state */}
          {result ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-walz-border p-3 space-y-1">
                <p className={labelCls}>Payment request ready</p>
                <p className="text-sm font-semibold text-walz-deep-navy">
                  {result.currency} {result.amount.toLocaleString()} · {PROVIDER_LABELS[result.provider as ActionCentreProvider] ?? result.provider}
                </p>
                {result.feeLabel && (
                  <p className="text-xs text-walz-muted-strong">Includes {result.feeLabel} processing fee</p>
                )}
                {result.paymentUrl ? (
                  <p className="text-xs text-walz-navy break-all">{result.paymentUrl}</p>
                ) : result.accountNumber ? (
                  <p className="text-xs text-walz-navy">
                    {result.bankName} · Account {result.accountNumber}
                  </p>
                ) : null}
                <p className="text-xs text-walz-muted-strong">Status: {statusLabel(result.status)}</p>
              </div>
              <p className="text-xs text-walz-muted-strong">
                Nothing has been sent to the client yet. Choose how to share it:
              </p>
              {submitError && (
                <p role="alert" className="text-xs text-red-700">{submitError}</p>
              )}
              <div className="space-y-2">
                <button onClick={() => void handleCopy()} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                  <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link'}
                </button>
                <button onClick={handleInsert} className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Insert into reply (does not send)
                </button>
                <button
                  onClick={() => void handleSendToClient()}
                  disabled={sending || sent}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy text-white text-xs font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" /> {sent ? 'Sent to client' : sending ? 'Sending…' : 'Send to client'}
                </button>
              </div>
            </div>
          ) : (
            /* Form state */
            <fieldset disabled={!identityOk || submitting} className="space-y-3 disabled:opacity-60">
              <div>
                <label htmlFor="pr-amount" className={labelCls}>Amount</label>
                <input id="pr-amount" inputMode="decimal" value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="450000"
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="pr-provider" className={labelCls}>Provider</label>
                  <select id="pr-provider" value={provider}
                    onChange={e => setProvider(e.target.value as ActionCentreProvider)}
                    className={inputCls}>
                    {ACTION_CENTRE_PROVIDERS.map(p => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pr-currency" className={labelCls}>Currency</label>
                  <select id="pr-currency" value={currency}
                    onChange={e => setCurrency(e.target.value)} className={inputCls}>
                    {PROVIDER_CURRENCIES[provider].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="pr-purpose" className={labelCls}>Purpose</label>
                <select id="pr-purpose" value={purpose}
                  onChange={e => setPurpose(e.target.value as PaymentPurpose)} className={inputCls}>
                  {PAYMENT_PURPOSES.map(p => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pr-description" className={labelCls}>Description (client-facing)</label>
                <input id="pr-description" value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="UK Visitor Visa Service" className={inputCls} />
              </div>
              <div>
                <label htmlFor="pr-note" className={labelCls}>Internal note (optional)</label>
                <input id="pr-note" value={internalNote}
                  onChange={e => setInternalNote(e.target.value)} className={inputCls} />
              </div>
              {submitError && (
                <p role="alert" className="text-xs text-red-700">{submitError}</p>
              )}
              {!fatalError && (
                <button
                  onClick={() => void handleGenerate()}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
                >
                  {submitting ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Generating…</>)
                    : submitError ? 'Retry' : 'Generate payment link'}
                </button>
              )}
              <p className="text-[10px] text-walz-muted-strong">
                Generating creates the link only — nothing is sent to the client until you choose to.
              </p>
            </fieldset>
          )}

          {/* Recent requests for this conversation */}
          {recent.length > 0 && (
            <div className="pt-2 border-t border-walz-border">
              <p className={labelCls}>Payments</p>
              <ul className="space-y-2">
                {recent.map(r => (
                  <li key={r.id} className="text-xs text-walz-deep-navy flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {r.description || (r.purpose ? PURPOSE_LABELS[r.purpose as PaymentPurpose] ?? r.purpose : r.txRef)}
                      <span className="text-walz-muted-strong"> · {r.currency} {r.amount.toLocaleString()} · {r.provider}</span>
                    </span>
                    <span className="flex-shrink-0 text-walz-muted-strong">{statusLabel(r.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
