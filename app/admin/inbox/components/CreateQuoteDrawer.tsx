'use client'

// CreateQuoteDrawer — INBOX UX-4.2 (Client Action Centre).
//
// Same interaction language as PaymentRequestDrawer: right sheet, scrim +
// Esc close, focus in on open / restore on close, Tab trapped inside
// (:disabled-aware — fieldset-inherited disabling is filtered correctly),
// safe-area padding, motion-safe slide, stale-response guard on load.
//
// SCOPE (this release): MANUAL line items only. Duffel flight search is
// production-operational but adding a full live-search panel here was
// deferred to keep this release reviewable in isolation — Hotelbeds
// hotel/activity search stays excluded regardless (test-environment base
// URLs, per the Phase 0 audit) so this drawer never risks sandbox rates
// reaching a client quote. Complex quotes still go through the full
// /admin/quotes/new wizard — this drawer's "Open in quote editor" link
// hands off there. Follow-up: UX-4.2b could add the flight-search panel.
//
// Commercial discipline mirrors Request Payment exactly:
//  - creation is SELECT -> PREPARE -> REVIEW -> GENERATED (draft) -> SHARE;
//  - 'Create quote' NEVER sends anything — it creates a draft only;
//  - 'Finalize for client' mints the real share token (PATCH action:'send',
//    suppressNotifications:true) — still does not message the client;
//  - Copy link / Insert into Reply (no send) / Send to client (explicit,
//    existing composer path) only after finalizing;
//  - one submission latch — a second click after success can never re-POST.

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Copy, MessageSquarePlus, Send, RefreshCw, Trash2, ExternalLink } from 'lucide-react'
import { Z_INDEX } from '@/lib/admin/chrome'
import { useComposerDraft } from '@/app/admin/inbox/ComposerDraftContext'
import { isValidAmountMajor } from '@/lib/action-centre/constants'

interface ContextSlice {
  resolution: 'VERIFIED' | 'LINKED' | 'HEURISTIC' | 'UNRESOLVED'
  contact: { name: string | null; email: string | null; phone: string | null } | null
}

interface QuoteListItem {
  id: string; reference: string; title: string; status: string
  totalMinor: number; currency: string; createdAt: string
}

interface DraftLineItem {
  key: string; type: string; title: string; description: string; priceMajor: string
}

const ITEM_TYPES = ['flight', 'hotel', 'activity', 'transfer', 'tour', 'package', 'custom'] as const
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'NGN'] as const

const STATUS_GLYPH: Record<string, string> = {
  draft: 'Draft', sent: '⏳ Sent', viewed: '👁 Viewed', accepted: '✓ Accepted',
  declined: '✗ Declined', changes_requested: 'Changes requested', expired: 'Expired',
  converted: 'Converted', cancelled: 'Cancelled', archived: 'Archived',
}
function statusLabel(s: string): string { return STATUS_GLYPH[s] ?? s }

export interface CreateQuoteDrawerProps {
  open: boolean
  onClose: () => void
  conversationId: number
  onSendMessage: (text: string) => Promise<boolean>
}

interface GeneratedQuote {
  id: string; reference: string; link: string; status: string
}

export function CreateQuoteDrawer({ open, onClose, conversationId, onSendMessage }: CreateQuoteDrawerProps) {
  const { insertDraft } = useComposerDraft()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [entered, setEntered] = useState(false)

  const [ctx, setCtx] = useState<ContextSlice | null>(null)
  const [ctxError, setCtxError] = useState(false)
  const [recent, setRecent] = useState<QuoteListItem[]>([])

  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>('GBP')
  const [validDays, setValidDays] = useState('14')
  const [items, setItems] = useState<DraftLineItem[]>([])
  const [itemType, setItemType] = useState<typeof ITEM_TYPES[number]>('custom')
  const [itemTitle, setItemTitle] = useState('')
  const [itemDesc, setItemDesc] = useState('')
  const [itemPrice, setItemPrice] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)  // latch — blocks a second POST
  const [quote, setQuote] = useState<GeneratedQuote | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const loadSeqRef = useRef(0)
  const loadContext = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setCtxError(false)
    try {
      const [cRes, qRes] = await Promise.all([
        fetch(`/api/admin/inbox/conversations/${conversationId}/client-context`),
        fetch(`/api/admin/inbox/conversations/${conversationId}/quote`),
      ])
      if (seq !== loadSeqRef.current) return
      if (!cRes.ok) throw new Error(String(cRes.status))
      const cData = await cRes.json()
      if (seq !== loadSeqRef.current) return
      setCtx(cData?.context ?? null)
      if (qRes.ok) {
        const qData = await qRes.json()
        if (seq !== loadSeqRef.current) return
        setRecent(Array.isArray(qData?.quotes) ? qData.quotes : [])
      }
    } catch {
      if (seq === loadSeqRef.current) setCtxError(true)
    }
  }, [conversationId])

  useEffect(() => {
    if (!open) { setEntered(false); return }
    setTitle(''); setItems([]); setItemTitle(''); setItemDesc(''); setItemPrice('')
    setSubmitError(null); setCreated(false); setQuote(null); setSent(false); setCopied(false)
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

  if (!open) return null

  const identityOk = ctx?.resolution === 'VERIFIED' || ctx?.resolution === 'LINKED'
  const estimatedTotal = items.reduce((sum, i) => sum + (Number(i.priceMajor) || 0), 0)

  function addItem() {
    if (!itemTitle.trim() || !isValidAmountMajor(Number(itemPrice))) return
    setItems(prev => [...prev, {
      key: crypto.randomUUID(), type: itemType, title: itemTitle.trim(),
      description: itemDesc.trim(), priceMajor: itemPrice,
    }])
    setItemTitle(''); setItemDesc(''); setItemPrice('')
  }
  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key))
  }

  async function handleCreate() {
    if (submitting || created) return
    if (!title.trim()) { setSubmitError('Enter a quote title.'); return }
    if (items.length === 0) { setSubmitError('Add at least one line item.'); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/admin/quotes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId, source: 'inbox_action_centre',
          title: title.trim(), currency, validDays: Number(validDays) || 14,
          items: items.map((i, idx) => {
            const minor = Math.round(Number(i.priceMajor) * 100)
            return {
              type: i.type, title: i.title, description: i.description || null,
              sortOrder: idx, sourceType: 'manual',
              costMinor: minor, markupMinor: 0, serviceFeeMinor: 0, sellingPriceMinor: minor,
              currency, clientVisible: true, showPriceToClient: true, metadata: {},
            }
          }),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error ?? 'The quote could not be created. Retry.')
        return
      }
      setQuote({ id: data.quote.id, reference: data.quote.reference, link: data.quote.link, status: data.quote.status })
      setCreated(true)
    } catch {
      setSubmitError('The quote could not be created. Retry.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFinalize() {
    if (!quote || finalizing) return
    setFinalizing(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', suppressNotifications: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSubmitError(data?.error ?? 'Could not finalize the quote. Retry.')
        return
      }
      setQuote(prev => prev ? { ...prev, link: data.quote.link, status: data.quote.status } : prev)
    } catch {
      setSubmitError('Could not finalize the quote. Retry.')
    } finally {
      setFinalizing(false)
    }
  }

  function buildQuoteMessage(): string {
    return `Hello! Here is your travel quote — ${title || 'Walz Travels proposal'} (Ref: ${quote?.reference}):\n${quote?.link}\n\nPlease review at your convenience — happy to adjust anything.`
  }

  async function handleCopy() {
    if (!quote) return
    try { await navigator.clipboard.writeText(quote.link); setCopied(true) } catch { setCopied(false) }
  }
  function handleInsert() {
    if (!quote) return
    insertDraft(buildQuoteMessage())   // fills the composer — DOES NOT SEND
    onClose()
  }
  async function handleSendToClient() {
    if (!quote || sending || sent) return
    setSending(true)
    setSubmitError(null)
    try {
      const ok = await onSendMessage(buildQuoteMessage())
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
  const isFinalized = quote && quote.status !== 'draft'

  return (
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.drawer }}>
      <div className="absolute inset-0 bg-walz-deep-navy/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create quote"
        className={`absolute inset-y-0 right-0 w-full sm:max-w-md bg-white shadow-2xl flex flex-col
          motion-safe:transition-transform motion-safe:duration-200
          ${entered ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-walz-border">
          <p className="text-sm font-bold text-walz-deep-navy">Create quote</p>
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
                Verify the client through the Application Lookup before creating a quote.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-walz-border bg-walz-off-white p-3">
              <p className={labelCls}>Client</p>
              <p className="text-sm font-semibold text-walz-deep-navy">{ctx.contact?.name ?? 'Client on file'}</p>
            </div>
          )}

          {quote ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-walz-border p-3 space-y-1">
                <p className={labelCls}>{isFinalized ? 'Quote ready to share' : 'Draft created'}</p>
                <p className="text-sm font-semibold text-walz-deep-navy">{quote.reference}</p>
                <p className="text-xs text-walz-navy break-all">{quote.link}</p>
                <p className="text-xs text-walz-muted-strong">Status: {statusLabel(quote.status)}</p>
              </div>
              {!isFinalized ? (
                <div className="space-y-2">
                  <p className="text-xs text-walz-muted-strong">
                    Preview link only — finalize to issue the client-facing share link.
                  </p>
                  <a href={quote.link} target="_blank" rel="noreferrer" className="text-xs text-walz-navy underline inline-flex items-center gap-1">
                    Preview (read-only) <ExternalLink className="w-3 h-3" />
                  </a>
                  {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}
                  <button
                    onClick={() => void handleFinalize()}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
                  >
                    {finalizing ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Finalizing…</>) : 'Finalize for client'}
                  </button>
                  <p className="text-[10px] text-walz-muted-strong">
                    Finalizing issues a new link; earlier links stop working. Nothing is sent to the client yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-walz-muted-strong">
                    Nothing has been sent to the client yet. Choose how to share it:
                  </p>
                  {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}
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
                  <a href={`/admin/quotes/${quote.id}`} target="_blank" rel="noreferrer" className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-walz-navy text-xs font-semibold hover:underline">
                    Open in quote editor <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            <fieldset disabled={!identityOk || submitting} className="space-y-3 disabled:opacity-60">
              <div>
                <label htmlFor="q-title" className={labelCls}>Quote title</label>
                <input id="q-title" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={ctx?.contact?.name ? `${ctx.contact.name} travel quote` : 'Travel quote'}
                  className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="q-currency" className={labelCls}>Currency</label>
                  <select id="q-currency" value={currency} onChange={e => setCurrency(e.target.value as typeof currency)} className={inputCls}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="q-valid" className={labelCls}>Valid for (days)</label>
                  <input id="q-valid" inputMode="numeric" value={validDays} onChange={e => setValidDays(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="pt-2 border-t border-walz-border">
                <p className={labelCls}>Line items</p>
                {items.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {items.map(i => (
                      <li key={i.key} className="flex items-center justify-between gap-2 text-xs text-walz-deep-navy">
                        <span className="min-w-0 truncate">{i.title} <span className="text-walz-muted-strong">· {currency} {Number(i.priceMajor).toLocaleString()}</span></span>
                        <button type="button" onClick={() => removeItem(i.key)} aria-label={`Remove ${i.title}`} className="flex-shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center text-walz-muted-strong hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="space-y-2 rounded-lg border border-dashed border-walz-border p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={itemType} onChange={e => setItemType(e.target.value as typeof itemType)} className={inputCls}>
                      {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input inputMode="decimal" value={itemPrice} onChange={e => setItemPrice(e.target.value)} placeholder={`Price (${currency})`} className={inputCls} />
                  </div>
                  <input value={itemTitle} onChange={e => setItemTitle(e.target.value)} placeholder="Item title" className={inputCls} />
                  <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="Description (optional)" className={inputCls} />
                  <button type="button" onClick={addItem} className="w-full min-h-[40px] rounded-lg bg-walz-navy/5 text-walz-navy text-xs font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors">
                    Add item
                  </button>
                </div>
              </div>

              {items.length > 0 && (
                <p className="text-xs text-walz-muted-strong">
                  Estimated total — server computes the final total: {currency} {estimatedTotal.toLocaleString()}
                </p>
              )}

              {submitError && <p role="alert" className="text-xs text-red-700">{submitError}</p>}

              <button
                onClick={() => void handleCreate()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all"
              >
                {submitting ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Creating…</>) : 'Create quote'}
              </button>
              <p className="text-[10px] text-walz-muted-strong">
                Creating saves a draft only — nothing is sent to the client until you finalize and choose to share it.
              </p>
            </fieldset>
          )}

          {recent.length > 0 && (
            <div className="pt-2 border-t border-walz-border">
              <p className={labelCls}>Quotes</p>
              <ul className="space-y-2">
                {recent.map(q => (
                  <li key={q.id} className="text-xs text-walz-deep-navy flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {q.title} <span className="text-walz-muted-strong">· {q.currency} {q.totalMinor / 100}</span>
                    </span>
                    <span className="flex-shrink-0 text-walz-muted-strong">{statusLabel(q.status)}</span>
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
