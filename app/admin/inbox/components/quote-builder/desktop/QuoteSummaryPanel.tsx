'use client'

// QUOTE BUILDER V1.2 (desktop) — sticky Quote Summary column (right).
//
// Pricing note: the AUTHORITATIVE total/margin is server-computed on the
// Quote once created. Before/without a fresh fetch of that (which this
// pure-UI pass may not add — no new fetch calls), this renders a
// best-effort CLIENT preview, the same way the original drawer's
// `estimatedTotal` did: Subtotal = (net + markup) for every live-attached
// item + the full price of every manual item; Service fee = the sum of
// live items' service fees (manual items have no separate fee field, so
// their price folds straight into Subtotal); Total = Subtotal + Service
// fee; Margin is computed from live items only (manual items carry no cost
// data, so a blended margin across both would be false precision) and
// labeled accordingly. Always labeled "Estimated" — never claimed as final.
//
// Button-mapping guardrail: the mockup shows "Save Draft" in the header and
// "[Save Draft] [Preview Quote] [Create Quote]" here, but the hook exposes
// exactly one creation action (handleCreate — already creates a draft, no
// separate save-vs-create persistence path). Reusing the EXACT existing
// state machine from CreateQuoteDrawer.tsx: no quote yet -> one "Create
// Quote" button; draft -> Preview link + "Finalize for client"; finalized
// -> Copy/Insert/Send/Open-in-editor, unchanged.
//
// V1.3 — live-attached items now support Remove / Edit pricing / Replace
// via the item-level endpoint (see useQuoteBuilderState.ts's
// removeAttachedItem/updateAttachedItemPricing), closing the V1.1/V1.2 gap
// noted above in earlier revisions of this file. Quote currency can also be
// changed after items exist via the dedicated recalculateCurrency action
// (never the plain setCurrency setter once items are present — that would
// silently relabel amounts without converting them), and a finalized quote
// can spin off an independent draft revision via createRevision.
//
// duplicateOf/profileGate are handled one level up in DesktopWorkspace.tsx
// as full-workspace overrides, so this panel only ever renders in the
// normal (no gate) state.

import { useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ChevronDown, ChevronUp, Copy, ExternalLink, FileText,
  Hotel, MessageSquarePlus, Plane, RefreshCw, Send, Sparkles, Stamp, Trash2, Car,
} from 'lucide-react'
import type { AttachedLiveItem, LiveServiceType, QuoteBuilderState, ServiceKey } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { fmtMinor, statusLabel, CURRENCIES } from '@/app/admin/inbox/components/quote-builder/useQuoteBuilderState'
import { inputCls, labelCls } from '@/app/admin/inbox/components/quote-builder/styles'

export interface QuoteSummaryPanelProps {
  state: QuoteBuilderState
}

const LIVE_ICON: Record<LiveServiceType, typeof Plane> = { flight: Plane, hotel: Hotel, activity: Activity, transfer: Car }

function manualItemServiceKey(type: string): ServiceKey {
  if (type === 'visa_service') return 'visa'
  if (type === 'custom') return 'walz_service'
  return 'manual'
}
function manualItemIcon(type: string): typeof Plane {
  if (type === 'visa_service') return Stamp
  if (type === 'custom') return Sparkles
  return FileText
}

export function QuoteSummaryPanel({ state }: QuoteSummaryPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  const {
    attachedLive, items, removeItem, selectService, estimatedTotal,
    title, setTitle, currency, setCurrency, validDays, setValidDays,
    submitting, submitError, quote, finalizing, copied, sending, sent,
    handleCreate, handleFinalize, handleCopy, handleInsert, handleSendToClient,
    isFinalized, recent,
    removeAttachedItem, updateAttachedItemPricing, recalculateCurrency, createRevision,
    liveBusy, liveError,
  } = state

  // V1.3 — always-fresh mirror of state.liveError, so an async handler that
  // `await`s a hook action (recalculateCurrency, createRevision) can check
  // the OUTCOME afterwards without reading a stale value captured by its
  // own closure at click-time (the `state` prop only reflects the render
  // that created this closure — plain `state.liveError` after an `await`
  // would still be whatever it was before the call started).
  const liveErrorRef = useRef(liveError)
  liveErrorRef.current = liveError

  // V1.3 — inline "Edit pricing" for one attached item at a time. Plain
  // local UI state (per this file's own established convention: the shared
  // hook only owns business/network state).
  const [pricingEditKey, setPricingEditKey] = useState<string | null>(null)
  const [pricingEditMarkup, setPricingEditMarkup] = useState('')
  const [pricingEditFee, setPricingEditFee] = useState('')
  const [pricingEditValidationError, setPricingEditValidationError] = useState<string | null>(null)

  function beginPricingEdit(item: AttachedLiveItem) {
    setPricingEditKey(item.key)
    setPricingEditMarkup(String(item.markupMinor))
    setPricingEditFee(String(item.serviceFeeMinor))
    setPricingEditValidationError(null)
  }
  function cancelPricingEdit() { setPricingEditKey(null); setPricingEditValidationError(null) }
  async function savePricingEdit(key: string) {
    const markupInput = pricingEditMarkup.trim()
    const feeInput = pricingEditFee.trim()
    const markupMinor = Math.round(Number(markupInput))
    const serviceFeeMinor = Math.round(Number(feeInput))
    if (
      markupInput === '' || feeInput === '' ||
      !Number.isFinite(markupMinor) || !Number.isFinite(serviceFeeMinor) ||
      markupMinor < 0 || serviceFeeMinor < 0
    ) {
      setPricingEditValidationError('Markup and service fee must be non-negative numbers.')
      return
    }
    setPricingEditValidationError(null)
    await updateAttachedItemPricing(key, markupMinor, serviceFeeMinor)
    if (!liveErrorRef.current) setPricingEditKey(null)
  }
  async function replaceItem(item: AttachedLiveItem) {
    await removeAttachedItem(item.key)
    if (!liveErrorRef.current) selectService(item.type)
  }

  // V1.3 — currency change confirmation once items exist. `pendingCurrency`
  // is the staff's dropdown selection awaiting confirmation; the actual
  // `currency` state never changes until Recalculate succeeds.
  const [pendingCurrency, setPendingCurrency] = useState<typeof currency | null>(null)
  function handleCurrencyChange(next: typeof currency) {
    if (next === currency) return
    if (!hasAnyItems) { setCurrency(next); return }
    setPendingCurrency(next)
  }
  function cancelCurrencyChange() { setPendingCurrency(null) }
  async function confirmCurrencyChange() {
    if (!pendingCurrency) return
    await recalculateCurrency(pendingCurrency)
    if (!liveErrorRef.current) setPendingCurrency(null)
  }

  // V1.3 — Create Revision success feedback (finalized-quote branch only).
  const [revisionCreated, setRevisionCreated] = useState<{ id: string; reference: string } | null>(null)
  const [revisionFailed, setRevisionFailed] = useState(false)
  async function handleCreateRevision() {
    setRevisionCreated(null)
    setRevisionFailed(false)
    const revision = await createRevision()
    if (revision) {
      setRevisionCreated(revision)
      // Matches quotes/[id]/page.tsx's handleDuplicate: same-origin admin
      // navigation, new tab, no `noreferrer` needed.
      window.open(`/admin/quotes/${revision.id}`, '_blank')
    } else {
      setRevisionFailed(true)
    }
  }

  // V1.2.1 P1 fix — quote.status is the SERVER field, and the finalize
  // action (handleFinalize -> PATCH {action:'send', suppressNotifications:
  // true}) sets it to 'sent' the moment a share link is minted, regardless
  // of whether anything was ever actually messaged to the client (see
  // app/api/admin/quotes/[id]/route.ts). Finalize != Send is still true in
  // the actual architecture — this app already tracks the real outcome of
  // an explicit send via the local `sent` flag (only true after
  // handleSendToClient's onSendMessage call succeeds). Rendering
  // statusLabel(quote.status) directly produced "Status: Sent" sitting
  // right above "Nothing has been sent to the client yet." — a truthful
  // label derived from local state instead of the overloaded server field.
  const deliveryStatusLabel = !isFinalized ? statusLabel(quote?.status ?? 'draft') : sent ? 'Sent to client' : 'Ready to share'

  const liveCost = attachedLive.reduce((sum, i) => sum + i.costMinor, 0) / 100
  const liveMarkup = attachedLive.reduce((sum, i) => sum + i.markupMinor, 0) / 100
  const liveServiceFee = attachedLive.reduce((sum, i) => sum + i.serviceFeeMinor, 0) / 100
  const liveSelling = attachedLive.reduce((sum, i) => sum + i.sellingPriceMinor, 0) / 100
  const subtotal = liveCost + liveMarkup + estimatedTotal
  const total = subtotal + liveServiceFee
  const liveGrossProfit = liveSelling - liveCost
  const marginPercent = liveSelling > 0 ? Math.round((liveGrossProfit / liveSelling) * 1000) / 10 : 0
  const hasAnyItems = attachedLive.length > 0 || items.length > 0

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-bold text-walz-deep-navy uppercase tracking-wide">Quote Summary</h2>

      {!quote && (
        <div className="space-y-2">
          <div>
            <label className={labelCls} htmlFor="dw-q-title">Quote title</label>
            <input
              id="dw-q-title" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Travel quote" className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="dw-q-valid">Valid (days)</label>
            <input id="dw-q-valid" inputMode="numeric" value={validDays} onChange={e => setValidDays(e.target.value)} className={inputCls} />
          </div>
        </div>
      )}

      {/* ── Quote currency ─────────────────────────────────────────── */}
      {/* V1.3 — the currency control stays visible for the life of the
          quote (draft or finalized), but its behavior differs: no items yet
          -> plain setCurrency; items exist and still a draft -> confirm +
          recalculateCurrency (the only sanctioned way to change currency
          once items exist — a direct setCurrency there would silently
          relabel amounts); finalized -> read-only, Create Revision is the
          sanctioned path instead. */}
      <div>
        <label className={labelCls} htmlFor="dw-q-currency">Currency</label>
        {isFinalized ? (
          <p className={`${inputCls} flex items-center bg-walz-off-white text-walz-muted-strong`}>{currency}</p>
        ) : (
          <select
            id="dw-q-currency"
            value={pendingCurrency ?? currency}
            onChange={e => handleCurrencyChange(e.target.value as typeof currency)}
            disabled={liveBusy}
            className={inputCls}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {pendingCurrency && (
          <div role="alertdialog" aria-label="Confirm currency change" className="mt-2 rounded-lg border border-walz-gold bg-walz-off-white p-3 space-y-1.5 text-xs">
            <p className="font-semibold text-walz-deep-navy">Change quote currency?</p>
            <p className="font-mono text-walz-deep-navy">{currency} → {pendingCurrency}</p>
            <p className="text-walz-muted-strong">Existing quote items will be recalculated using current exchange rates.</p>
            {liveError && <p role="alert" className="text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {liveError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button" onClick={cancelCurrencyChange} disabled={liveBusy}
                className="flex-1 min-h-[36px] rounded-lg border border-walz-border text-walz-navy text-xs font-semibold hover:bg-walz-navy/5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                Cancel
              </button>
              <button
                type="button" onClick={() => void confirmCurrencyChange()} disabled={liveBusy}
                className="flex-1 min-h-[36px] flex items-center justify-center gap-1 rounded-lg bg-walz-gold text-walz-deep-navy text-xs font-bold hover:brightness-95 transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                {liveBusy ? (<><RefreshCw className="w-3 h-3 motion-safe:animate-spin" /> Recalculating…</>) : `Recalculate in ${pendingCurrency}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Line items ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {!hasAnyItems && (
          <p className="text-xs text-walz-muted-strong">No items yet — select a service on the left to search or add one.</p>
        )}

        {liveError && !pendingCurrency && !revisionFailed && (
          <p role="alert" className="text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {liveError}</p>
        )}

        {attachedLive.map(item => {
          const Icon = LIVE_ICON[item.type]
          const isOpen = expanded.has(item.key)
          const isEditingPrice = pricingEditKey === item.key
          return (
            <div key={item.key} className="rounded-lg border border-walz-border p-2">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-walz-muted-strong flex-shrink-0" />
                <button type="button" onClick={() => toggle(item.key)} className="min-w-0 flex-1 flex items-center justify-between gap-2 text-left focus:outline-none">
                  <span className="text-xs font-semibold text-walz-deep-navy truncate">{item.title}</span>
                  <span className="font-mono text-xs text-walz-deep-navy flex-shrink-0">{fmtMinor(item.sellingPriceMinor, item.currency)}</span>
                </button>
                {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-walz-muted-strong flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-walz-muted-strong flex-shrink-0" />}
              </div>
              {isOpen && (
                <div className="mt-1.5 pl-5 space-y-1 text-[11px] text-walz-muted-strong">
                  <div className="flex justify-between"><span>Net cost</span><span className="font-mono">{fmtMinor(item.costMinor, item.currency)}</span></div>

                  {isEditingPrice ? (
                    <div className="space-y-1.5 rounded-lg border border-walz-border bg-walz-off-white p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls} htmlFor={`dw-ep-markup-${item.key}`}>Markup (minor units)</label>
                          <input
                            id={`dw-ep-markup-${item.key}`} type="number" min={0} inputMode="numeric"
                            value={pricingEditMarkup} onChange={e => setPricingEditMarkup(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className={labelCls} htmlFor={`dw-ep-fee-${item.key}`}>Service fee (minor units)</label>
                          <input
                            id={`dw-ep-fee-${item.key}`} type="number" min={0} inputMode="numeric"
                            value={pricingEditFee} onChange={e => setPricingEditFee(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                      </div>
                      {pricingEditValidationError && (
                        <p role="alert" className="text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {pricingEditValidationError}</p>
                      )}
                      <div className="flex gap-1.5">
                        <button
                          type="button" onClick={cancelPricingEdit} disabled={liveBusy}
                          className="flex-1 min-h-[28px] rounded border border-walz-border text-walz-navy text-[11px] font-semibold hover:bg-walz-navy/5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
                        >
                          Cancel
                        </button>
                        <button
                          type="button" onClick={() => void savePricingEdit(item.key)} disabled={liveBusy}
                          className="flex-1 min-h-[28px] rounded bg-walz-gold text-walz-deep-navy text-[11px] font-bold hover:brightness-95 transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
                        >
                          {liveBusy ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between"><span>Markup</span><span className="font-mono">{fmtMinor(item.markupMinor, item.currency)}</span></div>
                      <div className="flex justify-between"><span>Service fee</span><span className="font-mono">{fmtMinor(item.serviceFeeMinor, item.currency)}</span></div>
                    </>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-green-700 text-[10px] font-semibold">Added</span>
                    <button type="button" onClick={() => selectService(item.type)} className="text-walz-navy underline focus:outline-none">
                      Search more {item.type}
                    </button>
                  </div>

                  {!isFinalized && !isEditingPrice && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button" onClick={() => beginPricingEdit(item)} disabled={liveBusy}
                        className="text-walz-navy underline focus:outline-none disabled:opacity-60 focus:ring-2 focus:ring-walz-gold/60 rounded"
                      >
                        Edit pricing
                      </button>
                      <button
                        type="button" onClick={() => void replaceItem(item)} disabled={liveBusy}
                        className="text-walz-navy underline focus:outline-none disabled:opacity-60 focus:ring-2 focus:ring-walz-gold/60 rounded"
                      >
                        Replace
                      </button>
                      <button
                        type="button" onClick={() => void removeAttachedItem(item.key)} disabled={liveBusy}
                        aria-label={`Remove ${item.title}`}
                        className="ml-auto flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center text-walz-muted-strong hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 rounded disabled:opacity-60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {items.map(item => {
          const Icon = manualItemIcon(item.type)
          const isOpen = expanded.has(item.key)
          return (
            <div key={item.key} className="rounded-lg border border-dashed border-walz-border p-2">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-walz-muted-strong flex-shrink-0" />
                <button type="button" onClick={() => toggle(item.key)} className="min-w-0 flex-1 flex items-center justify-between gap-2 text-left focus:outline-none">
                  <span className="text-xs font-semibold text-walz-deep-navy truncate">{item.title}</span>
                  <span className="font-mono text-xs text-walz-deep-navy flex-shrink-0">{currency} {Number(item.priceMajor).toLocaleString()}</span>
                </button>
                <button
                  type="button" onClick={() => removeItem(item.key)} aria-label={`Remove ${item.title}`}
                  className="flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center text-walz-muted-strong hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-walz-gold/60 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {isOpen && (
                <div className="mt-1.5 pl-5 space-y-0.5 text-[11px] text-walz-muted-strong">
                  {item.description && <p>{item.description}</p>}
                  <button type="button" onClick={() => selectService(manualItemServiceKey(item.type))} className="text-walz-navy underline focus:outline-none">
                    Add another
                  </button>
                </div>
              )}
              {!isOpen && (
                <button type="button" onClick={() => toggle(item.key)} className="pl-5 text-[10px] text-walz-muted-strong underline focus:outline-none">
                  details
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Pricing breakdown ──────────────────────────────────────── */}
      {hasAnyItems && (
        <div className="rounded-xl border border-walz-border bg-walz-off-white p-3 space-y-1 text-xs">
          <div className="flex justify-between text-walz-deep-navy"><span>Subtotal</span><span className="font-mono">{currency} {subtotal.toLocaleString()}</span></div>
          <div className="flex justify-between text-walz-muted-strong"><span>Service fee</span><span className="font-mono">{currency} {liveServiceFee.toLocaleString()}</span></div>
          <div className="flex justify-between font-bold text-walz-deep-navy border-t border-walz-border pt-1"><span>Total (estimated)</span><span className="font-mono">{currency} {total.toLocaleString()}</span></div>
          {liveSelling > 0 && (
            <div className="flex justify-between text-walz-muted-strong"><span>Margin (live items)</span><span className="font-mono">{marginPercent}%</span></div>
          )}
          <p className="text-[10px] text-walz-muted-strong pt-1">Estimated total — server computes the final total.</p>
        </div>
      )}

      {/* ── Quote lifecycle actions ────────────────────────────────── */}
      {submitError && <p role="alert" className="text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {submitError}</p>}

      {!quote ? (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={submitting}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
          >
            {submitting ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Creating…</>) : 'Create Quote'}
          </button>
          <p className="text-[10px] text-walz-muted-strong">
            Creating saves a draft only — nothing is sent to the client until you finalize and choose to share it.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-walz-border p-3 space-y-1">
            <p className={labelCls}>{isFinalized ? 'Quote ready to share' : 'Draft created'}</p>
            <p className="text-sm font-semibold text-walz-deep-navy">{quote.reference}</p>
            <p className="text-xs text-walz-muted-strong">Status: {deliveryStatusLabel}</p>
          </div>
          {!isFinalized ? (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">Preview link only — finalize to issue the client-facing share link.</p>
              <a href={quote.link} target="_blank" rel="noreferrer" className="text-xs text-walz-navy underline inline-flex items-center gap-1">
                Preview (read-only) <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => void handleFinalize()}
                disabled={finalizing}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-gold text-walz-deep-navy text-sm font-bold hover:brightness-95 transition-all disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                {finalizing ? (<><RefreshCw className="w-4 h-4 motion-safe:animate-spin" /> Finalizing…</>) : 'Finalize for client'}
              </button>
              <p className="text-[10px] text-walz-muted-strong">Finalizing issues a new link; earlier links stop working. Nothing is sent to the client yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-walz-muted-strong">Nothing has been sent to the client yet. Choose how to share it:</p>
              <a href={quote.link} target="_blank" rel="noreferrer" className="text-xs text-walz-navy underline inline-flex items-center gap-1">
                Preview <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button" onClick={() => void handleCopy()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button" onClick={handleInsert}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" /> Insert into reply (does not send)
              </button>
              <button
                type="button" onClick={() => void handleSendToClient()} disabled={sending || sent}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy text-white text-sm font-semibold hover:bg-walz-deep-navy transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
              >
                <Send className="w-3.5 h-3.5" /> {sent ? 'Sent to client' : sending ? 'Sending…' : 'Send to client'}
              </button>
              <a href={`/admin/quotes/${quote.id}`} target="_blank" rel="noreferrer" className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg text-walz-navy text-sm font-semibold hover:underline">
                Open in quote editor <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {/* V1.3 — a finalized/sent quote needs commercial changes ->
                  spin off an independent draft revision (never mutate the
                  finalized quote itself). */}
              <div className="pt-2 border-t border-walz-border space-y-1.5">
                <button
                  type="button" onClick={() => void handleCreateRevision()} disabled={liveBusy}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-walz-navy/5 text-walz-navy text-sm font-semibold border border-walz-border hover:bg-walz-navy/10 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-walz-gold/60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${liveBusy ? 'motion-safe:animate-spin' : ''}`} /> {liveBusy ? 'Creating revision…' : 'Create Revision'}
                </button>
                <p className="text-[10px] text-walz-muted-strong">
                  Creates a new, independent draft quote with the same items — nothing is sent to the client.
                </p>
                {revisionCreated && (
                  <p role="status" className="text-xs text-green-700">Revision {revisionCreated.reference} created.</p>
                )}
                {revisionFailed && liveError && (
                  <p role="alert" className="text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {liveError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <div className="pt-2 border-t border-walz-border">
          <p className={labelCls}>Quotes</p>
          <ul className="space-y-2">
            {recent.map(q => (
              <li key={q.id} className="text-xs text-walz-deep-navy flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">{q.title} <span className="text-walz-muted-strong">· {q.currency} {(q.totalMinor / 100).toLocaleString()}</span></span>
                <span className="flex-shrink-0 text-walz-muted-strong">{statusLabel(q.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
